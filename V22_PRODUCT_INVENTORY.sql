-- P&Q Inventory V1
-- Existing products remain untracked until the admin enters real stock counts.
-- A NULL stock_quantity means "not tracked"; zero means "out of stock".
begin;

alter table public.products
  add column if not exists stock_quantity integer,
  add column if not exists low_stock_threshold integer not null default 3;

alter table public.products
  drop constraint if exists products_stock_quantity_nonnegative,
  add constraint products_stock_quantity_nonnegative
    check (stock_quantity is null or stock_quantity >= 0),
  drop constraint if exists products_low_stock_threshold_nonnegative,
  add constraint products_low_stock_threshold_nonnegative
    check (low_stock_threshold >= 0);

create index if not exists products_stock_quantity_idx
  on public.products(stock_quantity)
  where stock_quantity is not null;

-- Preserve the existing secure order workflow and add atomic stock deduction.
-- The UPDATE condition prevents two simultaneous orders from overselling tracked stock.
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

  -- Validate every line and calculate the total using database prices.
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
    if v_product.stock_quantity is not null and v_product.stock_quantity < v_qty then
      raise exception 'Not enough stock for % (only % remaining). Please update your bag.',
        v_product.name, v_product.stock_quantity;
    end if;
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
    v_qty:=(v_item->>'quantity')::integer;
    v_size:=coalesce(v_item->>'size','');

    -- Atomic conditional deduction. NULL quantities are intentionally untracked.
    update public.products
       set stock_quantity = case
         when stock_quantity is null then null
         else stock_quantity - v_qty
       end
     where id=(v_item->>'product_id')::uuid
       and available=true
       and (stock_quantity is null or stock_quantity>=v_qty)
     returning * into v_product;

    if not found then
      raise exception 'Stock changed while your order was being placed. Please refresh your bag and try again.';
    end if;

    insert into public.order_items(order_id,product_id,product_name,unit_price_kes,quantity,size)
    values(v_order_id,v_product.id,v_product.name,v_product.price_kes,v_qty,v_size);
  end loop;

  return jsonb_build_object('order_id',v_order_id,'total_kes',v_total);
end;
$$;

revoke all on function public.create_customer_order(text,text,text,text,jsonb) from public,anon;
grant execute on function public.create_customer_order(text,text,text,text,jsonb) to authenticated;

commit;
