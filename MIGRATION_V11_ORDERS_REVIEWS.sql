-- V11: Website order submission + moderated product reviews.
-- Run ONCE in Supabase SQL Editor AFTER the existing V10 setup.
-- Does not recreate existing tables or change product records.

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  reviewer_name text not null check (char_length(trim(reviewer_name)) between 2 and 80),
  rating integer not null check (rating between 1 and 5),
  review_text text not null check (char_length(trim(review_text)) between 5 and 1200),
  is_approved boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists product_reviews_product_approved_idx on public.product_reviews(product_id,is_approved,created_at desc);
alter table public.product_reviews enable row level security;
drop policy if exists "Public can read approved reviews" on public.product_reviews;
create policy "Public can read approved reviews" on public.product_reviews for select using (is_approved = true);
drop policy if exists "Admins can manage reviews" on public.product_reviews;
create policy "Admins can manage reviews" on public.product_reviews for all to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));
-- Public review submissions are created by a narrowly scoped function, not direct table inserts.

-- Orders can only be read/updated by an authenticated admin. Anonymous customers submit through RPC.
drop policy if exists "Admins can view orders" on public.orders;
create policy "Admins can view orders" on public.orders for select to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));
drop policy if exists "Admins can update orders" on public.orders;
create policy "Admins can update orders" on public.orders for update to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));
drop policy if exists "Admins can view order items" on public.order_items;
create policy "Admins can view order items" on public.order_items for select to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

create or replace function public.create_store_order(
  p_customer_name text,
  p_phone text,
  p_delivery_address text,
  p_notes text,
  p_items jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_total integer := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_qty integer;
  v_size text;
begin
  if char_length(trim(coalesce(p_customer_name,''))) not between 2 and 120 then raise exception 'Please enter your full name.'; end if;
  if char_length(trim(coalesce(p_phone,''))) not between 7 and 30 then raise exception 'Please enter a valid phone number.'; end if;
  if char_length(trim(coalesce(p_delivery_address,''))) not between 3 and 500 then raise exception 'Please enter a delivery address or town.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50 then raise exception 'Your bag is empty or contains too many items.'; end if;
  -- Validate each line and calculate prices from the database, never from browser-submitted prices.
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty < 1 or v_qty > 25 then raise exception 'Invalid item quantity.'; end if;
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid and available = true;
    if not found then raise exception 'One of the selected products is unavailable. Please refresh your bag.'; end if;
    v_size := coalesce(v_item->>'size','');
    if cardinality(coalesce(v_product.sizes, array[]::text[])) > 0 and v_size <> '' and not (v_size = any(v_product.sizes)) then raise exception 'A selected size is no longer available.'; end if;
    v_total := v_total + v_product.price_kes * v_qty;
  end loop;
  if v_total > 100000000 then raise exception 'Order total is too high. Please contact the store.'; end if;
  insert into public.orders(customer_name,phone,delivery_address,notes,status,payment_status,payment_method,total_kes)
  values(trim(p_customer_name),trim(p_phone),trim(p_delivery_address),left(coalesce(p_notes,''),1000),'pending','unpaid','WhatsApp coordination',v_total)
  returning id into v_order_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer; v_size := coalesce(v_item->>'size','');
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid and available = true;
    insert into public.order_items(order_id,product_id,product_name,unit_price_kes,quantity,size)
    values(v_order_id,v_product.id,v_product.name,v_product.price_kes,v_qty,v_size);
  end loop;
  return jsonb_build_object('order_id',v_order_id,'total_kes',v_total);
end;
$$;
revoke all on function public.create_store_order(text,text,text,text,jsonb) from public;
grant execute on function public.create_store_order(text,text,text,text,jsonb) to anon, authenticated;

create or replace function public.submit_product_review(
  p_product_id uuid, p_reviewer_name text, p_rating integer, p_review_text text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
  if char_length(trim(coalesce(p_reviewer_name,''))) not between 2 and 80 then raise exception 'Please enter a name.'; end if;
  if p_rating not between 1 and 5 then raise exception 'Rating must be between 1 and 5.'; end if;
  if char_length(trim(coalesce(p_review_text,''))) not between 5 and 1200 then raise exception 'Review must be 5 to 1200 characters.'; end if;
  if not exists(select 1 from public.products where id=p_product_id and available=true) then raise exception 'Product not found.'; end if;
  insert into public.product_reviews(product_id,reviewer_name,rating,review_text,is_approved)
  values(p_product_id,trim(p_reviewer_name),p_rating,trim(p_review_text),false) returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.submit_product_review(uuid,text,integer,text) from public;
grant execute on function public.submit_product_review(uuid,text,integer,text) to anon,authenticated;

-- Important: order submission is public by design, but direct SELECT access is not.
-- Keep service-role/secret keys out of browser files. Review submissions remain hidden until an admin approves them.
