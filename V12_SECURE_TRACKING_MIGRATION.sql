-- V12 SECURE CUSTOMER ACCOUNTS + PRIVATE ORDER TRACKING
-- Apply ONCE in Supabase SQL Editor after V11 has been applied.
-- This migration deliberately leaves existing orders unassigned (user_id NULL).
-- Existing legacy orders remain visible to admins only.

begin;

alter table public.orders
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists orders_user_created_idx
  on public.orders(user_id, created_at desc);

-- Replace prior order/order_item policies so no older permissive policy can
-- accidentally grant customers access to another customer's records.
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname='public' and tablename in ('orders','order_items')
  loop
    execute format('drop policy if exists %I on %I.%I',p.policyname,p.schemaname,p.tablename);
  end loop;
end $$;

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "V12 admins read all orders"
on public.orders for select to authenticated
using (exists (select 1 from public.admin_users a where a.user_id=auth.uid()));

create policy "V12 customers read own orders"
on public.orders for select to authenticated
using (user_id=auth.uid());

create policy "V12 admins update orders"
on public.orders for update to authenticated
using (exists (select 1 from public.admin_users a where a.user_id=auth.uid()))
with check (exists (select 1 from public.admin_users a where a.user_id=auth.uid()));

create policy "V12 admins read all order items"
on public.order_items for select to authenticated
using (exists (select 1 from public.admin_users a where a.user_id=auth.uid()));

create policy "V12 customers read own order items"
on public.order_items for select to authenticated
using (exists (
  select 1 from public.orders o
  where o.id=order_items.order_id and o.user_id=auth.uid()
));

-- Add the agreed customer-facing progress stages while retaining old paid status
-- for legacy compatibility.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid='public.orders'::regclass and contype='c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.orders drop constraint %I',c.conname);
  end loop;
end $$;

alter table public.orders add constraint orders_status_v12_check
check (status in ('pending','confirmed','awaiting_payment','in_progress','processing','ready','out_for_delivery','delivered','cancelled','paid'));

-- Customer order creation requires a real authenticated account. Prices are
-- re-read from products; client-submitted prices are never accepted.
create or replace function public.create_customer_order(
  p_customer_name text,
  p_phone text,
  p_delivery_address text,
  p_notes text,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_order_id uuid;
  v_total integer := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_qty integer;
  v_size text;
begin
  if v_user_id is null then raise exception 'Please sign in before placing an order.'; end if;
  if char_length(trim(coalesce(p_customer_name,''))) not between 2 and 120 then raise exception 'Please enter your full name.'; end if;
  if char_length(trim(coalesce(p_phone,''))) not between 7 and 30 then raise exception 'Please enter a valid phone number.'; end if;
  if char_length(trim(coalesce(p_delivery_address,''))) not between 3 and 500 then raise exception 'Please enter a delivery address or town.'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>50 then raise exception 'Your bag is empty or contains too many items.'; end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    begin v_qty := (v_item->>'quantity')::integer;
    exception when others then raise exception 'Invalid item quantity.'; end;
    if v_qty<1 or v_qty>25 then raise exception 'Invalid item quantity.'; end if;
    begin
      select * into v_product from public.products
      where id=(v_item->>'product_id')::uuid and available=true;
    exception when invalid_text_representation then
      raise exception 'Invalid product in your bag.';
    end;
    if not found then raise exception 'One of the selected products is unavailable. Please refresh your bag.'; end if;
    v_size:=coalesce(v_item->>'size','');
    if cardinality(coalesce(v_product.sizes,array[]::text[]))>0
       and v_size<>'' and not (v_size=any(v_product.sizes)) then
      raise exception 'A selected size is no longer available.';
    end if;
    v_total:=v_total+v_product.price_kes*v_qty;
  end loop;
  if v_total>100000000 then raise exception 'Order total is too high. Please contact the store.'; end if;

  insert into public.orders(user_id,customer_name,phone,delivery_address,notes,status,payment_status,payment_method,total_kes)
  values(v_user_id,trim(p_customer_name),trim(p_phone),trim(p_delivery_address),left(coalesce(p_notes,''),1000),'pending','unpaid','WhatsApp coordination',v_total)
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty:=(v_item->>'quantity')::integer;v_size:=coalesce(v_item->>'size','');
    select * into v_product from public.products where id=(v_item->>'product_id')::uuid and available=true;
    insert into public.order_items(order_id,product_id,product_name,unit_price_kes,quantity,size)
    values(v_order_id,v_product.id,v_product.name,v_product.price_kes,v_qty,v_size);
  end loop;
  return jsonb_build_object('order_id',v_order_id,'total_kes',v_total);
end;
$$;

revoke all on function public.create_customer_order(text,text,text,text,jsonb) from public,anon;
grant execute on function public.create_customer_order(text,text,text,text,jsonb) to authenticated;

-- Disable the old guest checkout function from V11. It must not be callable
-- anonymously after customer-account checkout is enabled.
revoke all on function public.create_store_order(text,text,text,text,jsonb) from public,anon,authenticated;

commit;

-- IMPORTANT:
-- 1. Existing orders are intentionally left with user_id NULL. Do not assign
--    them to a customer without independently verifying ownership.
-- 2. Customer clients can SELECT their own orders/items only. There are no
--    customer INSERT/UPDATE/DELETE policies on orders or order_items.
-- 3. Admin membership continues to be controlled by public.admin_users.
-- 4. WhatsApp message sending is not automatic in this static-site release.
--    Admins can send status-change messages using the prepared WhatsApp link
--    in the admin dashboard. Automated WhatsApp requires an approved provider
--    and server-side credentials.
