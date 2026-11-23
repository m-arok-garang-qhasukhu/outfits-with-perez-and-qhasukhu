-- P&Q DEVELOPMENT DATABASE — CONSOLIDATED FRESH INSTALL
-- Target ONLY: P&Q Development project (eoaegoqgrdmwrvxjgbto).
-- NEVER run on production (axciggoyljregnvlxvxf).
-- Fresh-install script only; it intentionally aborts if core tables exist.
-- No customer/order/product records or admin memberships are created.
DO $guard$
BEGIN
 IF to_regclass('public.products') IS NOT NULL OR to_regclass('public.orders') IS NOT NULL
 OR to_regclass('public.admin_users') IS NOT NULL OR to_regclass('public.tailoring_requests') IS NOT NULL THEN
  RAISE EXCEPTION 'P&Q fresh-install safety check failed: core tables already exist. Stop; do not run on a non-empty database.';
 END IF;
END $guard$;


-- ===== SOURCE: schema.sql =====

-- OUTFiTS WITH PEREZ & QHASUKHU
-- Production-ready database foundation for Supabase/Postgres.
-- Run this in the Supabase SQL editor after creating your project.

create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text default '',
  price_kes integer not null check (price_kes >= 0),
  category text not null check (category in ('Men','Women','Accessories')),
  sizes text[] default '{}',
  image_url text default '',
  available boolean not null default true,
  is_new boolean not null default false,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  phone text not null,
  delivery_address text default '',
  notes text default '',
  status text not null default 'pending'
    check (status in ('pending','confirmed','paid','processing','ready','out_for_delivery','delivered','cancelled')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid','pending','paid','failed','refunded')),
  payment_method text default 'M-Pesa',
  total_kes integer not null default 0 check (total_kes >= 0),
  mpesa_receipt text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  unit_price_kes integer not null check (unit_price_kes >= 0),
  quantity integer not null check (quantity > 0),
  size text default ''
);

create index if not exists products_category_idx on public.products(category);
create index if not exists products_created_at_idx on public.products(created_at desc);
create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists orders_status_idx on public.orders(status);

-- Keep updated_at current.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at before update on public.orders
for each row execute function public.set_updated_at();

-- Row Level Security.
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Public customers can read available products.
drop policy if exists "Public can view available products" on public.products;
create policy "Public can view available products"
on public.products for select
using (available = true);

-- IMPORTANT:
-- Admin write access will be added after Auth is configured.
-- Do NOT expose service-role keys in browser JavaScript.
-- Orders should be created through a protected server/edge function
-- after customer details are validated.


-- ===== SOURCE: schema_v5.sql =====

-- V5 additions: authenticated admin control + image storage policy helpers.
-- Run after schema.sql.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

create policy "admins can read own admin record"
on public.admin_users for select to authenticated
using (user_id = auth.uid());

-- Product management is restricted to users explicitly listed in admin_users.
create policy "admins can insert products"
on public.products for insert to authenticated
with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

create policy "admins can update products"
on public.products for update to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

create policy "admins can delete products"
on public.products for delete to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

-- Optional: create a public bucket for catalog images. If your project already
-- has a bucket named product-images, keep it and skip the insert below.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "public can view product images"
on storage.objects for select
using (bucket_id = 'product-images');

create policy "admins can upload product images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and exists (select 1 from public.admin_users a where a.user_id = auth.uid())
);

create policy "admins can update product images"
on storage.objects for update to authenticated
using (
  bucket_id = 'product-images'
  and exists (select 1 from public.admin_users a where a.user_id = auth.uid())
)
with check (
  bucket_id = 'product-images'
  and exists (select 1 from public.admin_users a where a.user_id = auth.uid())
);

create policy "admins can delete product images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'product-images'
  and exists (select 1 from public.admin_users a where a.user_id = auth.uid())
);

-- After creating your first Auth user, make that user an admin by replacing
-- YOUR_USER_UUID with the user's Auth UUID:
-- insert into public.admin_users (user_id) values ('YOUR_USER_UUID');


-- ===== SOURCE: MIGRATE_CATEGORIES.sql =====

-- Run this once in Supabase SQL Editor to support the expanded storefront categories.
-- Existing Men/Women categories are retained so current records remain valid.
alter table public.products drop constraint if exists products_category_check;
alter table public.products add constraint products_category_check
  check (category in ('Men','Women','Accessories','Church & Clergy','Official Wear','Custom Tailoring'));


-- ===== SOURCE: MIGRATION_V11_ORDERS_REVIEWS.sql =====

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


-- ===== SOURCE: V12_SECURE_TRACKING_MIGRATION.sql =====

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


-- ===== SOURCE: V13_MIGRATION.sql =====

-- P&Q V13 migration. Apply AFTER the V12 secure tracking migration.
-- Adds verified reviews, tailoring requests and customer cancellation requests.
-- Existing orders remain untouched and unassigned.
begin;

-- Cancellation request workflow: payment status remains independent.
alter table public.orders add column if not exists cancellation_status text not null default 'none';
alter table public.orders add column if not exists cancellation_reason text;
alter table public.orders add column if not exists cancellation_requested_at timestamptz;
alter table public.orders add column if not exists cancellation_reviewed_at timestamptz;
alter table public.orders add column if not exists cancellation_admin_note text;
alter table public.orders drop constraint if exists orders_cancellation_status_v13_check;
alter table public.orders add constraint orders_cancellation_status_v13_check
 check (cancellation_status in ('none','requested','approved','rejected','withdrawn'));

-- Verified reviews are tied to an owned order line; one review per order line.
alter table public.product_reviews add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.product_reviews add column if not exists order_item_id uuid references public.order_items(id) on delete set null;
alter table public.product_reviews add column if not exists updated_at timestamptz not null default now();
create unique index if not exists product_reviews_order_item_unique_v13
 on public.product_reviews(order_item_id) where order_item_id is not null;
create index if not exists product_reviews_user_idx_v13 on public.product_reviews(user_id,created_at desc);

-- Customer-tailoring requests are separate from ordinary product orders.
create table if not exists public.tailoring_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 reference_code text not null unique,
 garment_type text not null check (char_length(trim(garment_type)) between 2 and 100),
 fabric text not null default '',
 colour text not null default '',
 style_preferences text not null default '',
 measurements text not null default '',
 reference_image_url text not null default '',
 special_instructions text not null default '',
 desired_completion_date date,
 country text not null default 'Kenya',
 status text not null default 'submitted' check (status in ('submitted','under_review','awaiting_measurements','quoted','approved','deposit_pending','in_progress','ready','completed','declined')),
 deposit_percent integer not null default 30 check (deposit_percent=30),
 balance_percent integer not null default 70 check (balance_percent=70),
 deposit_status text not null default 'unpaid' check (deposit_status in ('unpaid','pending','paid')),
 admin_note text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists tailoring_requests_user_created_v13 on public.tailoring_requests(user_id,created_at desc);
create index if not exists tailoring_requests_status_created_v13 on public.tailoring_requests(status,created_at desc);

alter table public.tailoring_requests enable row level security;
drop policy if exists "V13 customer read own tailoring requests" on public.tailoring_requests;
create policy "V13 customer read own tailoring requests" on public.tailoring_requests
 for select to authenticated using (user_id=auth.uid());
drop policy if exists "V13 admin manage tailoring requests" on public.tailoring_requests;
create policy "V13 admin manage tailoring requests" on public.tailoring_requests
 for all to authenticated
 using (exists(select 1 from public.admin_users a where a.user_id=auth.uid()))
 with check (exists(select 1 from public.admin_users a where a.user_id=auth.uid()));

-- Private reference-image bucket. Only owner/admin can upload/read.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('tailoring-references','tailoring-references',false,6291456,array['image/jpeg','image/png','image/webp'])
 on conflict (id) do update set public=false,file_size_limit=6291456,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists "V13 owners upload tailoring references" on storage.objects;
create policy "V13 owners upload tailoring references" on storage.objects for insert to authenticated
 with check (bucket_id='tailoring-references' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "V13 owners read tailoring references" on storage.objects;
create policy "V13 owners read tailoring references" on storage.objects for select to authenticated
 using (bucket_id='tailoring-references' and ((storage.foldername(name))[1]=auth.uid()::text or exists(select 1 from public.admin_users a where a.user_id=auth.uid())));
drop policy if exists "V13 admins manage tailoring references" on storage.objects;
create policy "V13 admins manage tailoring references" on storage.objects for delete to authenticated
 using (bucket_id='tailoring-references' and exists(select 1 from public.admin_users a where a.user_id=auth.uid()));

create or replace function public.submit_tailoring_request(
 p_garment_type text,p_fabric text,p_colour text,p_style_preferences text,
 p_measurements text,p_reference_image_url text,p_special_instructions text,
 p_desired_completion_date date,p_country text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_ref text;
begin
 if auth.uid() is null then raise exception 'Please sign in to submit a tailoring request.'; end if;
 if char_length(trim(coalesce(p_garment_type,''))) not between 2 and 100 then raise exception 'Please specify the garment type.'; end if;
 if p_desired_completion_date is not null and p_desired_completion_date < current_date then raise exception 'The desired completion date must be in the future.'; end if;
 if char_length(coalesce(p_measurements,''))>4000 or char_length(coalesce(p_special_instructions,''))>2000 then raise exception 'Please shorten the measurements or instructions.'; end if;
 v_ref := 'PQ-T-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
 insert into public.tailoring_requests(user_id,reference_code,garment_type,fabric,colour,style_preferences,measurements,reference_image_url,special_instructions,desired_completion_date,country)
 values(auth.uid(),v_ref,trim(p_garment_type),left(coalesce(p_fabric,''),160),left(coalesce(p_colour,''),100),left(coalesce(p_style_preferences,''),2000),left(coalesce(p_measurements,''),4000),left(coalesce(p_reference_image_url,''),1000),left(coalesce(p_special_instructions,''),2000),p_desired_completion_date,left(coalesce(p_country,'Kenya'),80))
 returning id into v_id;
 return jsonb_build_object('id',v_id,'reference_code',v_ref);
end; $$;
revoke all on function public.submit_tailoring_request(text,text,text,text,text,text,text,date,text) from public,anon;
grant execute on function public.submit_tailoring_request(text,text,text,text,text,text,text,date,text) to authenticated;

create or replace function public.request_order_cancellation(p_order_id uuid,p_reason text)
 returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_status text; v_user uuid; v_cancel text;
begin
 if auth.uid() is null then raise exception 'Please sign in.'; end if;
 if char_length(trim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'Please provide a reason (at least 5 characters).'; end if;
 select status,user_id,cancellation_status into v_status,v_user,v_cancel from public.orders where id=p_order_id for update;
 if not found or v_user is distinct from auth.uid() then raise exception 'Order not found.'; end if;
 if v_status not in ('pending','confirmed','awaiting_payment') then raise exception 'This order needs direct support review. Please contact us.'; end if;
 if v_cancel='requested' then raise exception 'A cancellation request is already pending.'; end if;
 if v_status in ('delivered','cancelled') then raise exception 'This order can no longer be cancelled online.'; end if;
 update public.orders set cancellation_status='requested',cancellation_reason=left(trim(p_reason),1000),cancellation_requested_at=now(),cancellation_reviewed_at=null,cancellation_admin_note=null where id=p_order_id;
end; $$;
revoke all on function public.request_order_cancellation(uuid,text) from public,anon;
grant execute on function public.request_order_cancellation(uuid,text) to authenticated;

create or replace function public.withdraw_order_cancellation(p_order_id uuid)
 returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'Please sign in.'; end if;
 update public.orders set cancellation_status='withdrawn',cancellation_reviewed_at=now()
 where id=p_order_id and user_id=auth.uid() and cancellation_status='requested';
 if not found then raise exception 'No pending cancellation request could be withdrawn.'; end if;
end; $$;
revoke all on function public.withdraw_order_cancellation(uuid) from public,anon;
grant execute on function public.withdraw_order_cancellation(uuid) to authenticated;

-- Customer review submission is verified against an order line owned by auth.uid().
-- Remove the older unverified public submission endpoint.
revoke all on function public.submit_product_review(uuid,text,integer,text) from public,anon,authenticated;
create or replace function public.submit_verified_product_review(p_order_item_id uuid,p_rating integer,p_review_text text)
 returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_product uuid; v_order uuid; v_name text;
begin
 if auth.uid() is null then raise exception 'Please sign in to leave a review.'; end if;
 if p_rating not between 1 and 5 then raise exception 'Rating must be between 1 and 5.'; end if;
 if char_length(trim(coalesce(p_review_text,''))) not between 5 and 1200 then raise exception 'Review must be 5 to 1200 characters.'; end if;
 select oi.product_id,oi.order_id,oi.product_name into v_product,v_order,v_name
 from public.order_items oi join public.orders o on o.id=oi.order_id
 where oi.id=p_order_item_id and o.user_id=auth.uid() and o.status='delivered';
 if not found or v_product is null then raise exception 'A delivered purchase is required before reviewing this item.'; end if;
 if exists(select 1 from public.product_reviews where order_item_id=p_order_item_id) then raise exception 'A review has already been submitted for this purchase.'; end if;
 insert into public.product_reviews(product_id,reviewer_name,rating,review_text,is_approved,user_id,order_item_id)
 values(v_product,coalesce(nullif(left(auth.jwt()->'user_metadata'->>'full_name',80),''),'Verified customer'),p_rating,trim(p_review_text),false,auth.uid(),p_order_item_id)
 returning id into v_id;
 return v_id;
end; $$;
revoke all on function public.submit_verified_product_review(uuid,integer,text) from public,anon;
grant execute on function public.submit_verified_product_review(uuid,integer,text) to authenticated;

-- Public reads only approved reviews; admin moderation remains protected by admin_users.
alter table public.product_reviews enable row level security;
drop policy if exists "Public can read approved reviews" on public.product_reviews;
drop policy if exists "Admins can manage reviews" on public.product_reviews;
drop policy if exists "V13 public read approved reviews" on public.product_reviews;
drop policy if exists "V13 admins manage reviews" on public.product_reviews;
create policy "V13 public read approved reviews" on public.product_reviews for select
 using (is_approved=true);
create policy "V13 admins manage reviews" on public.product_reviews for all to authenticated
 using (exists(select 1 from public.admin_users a where a.user_id=auth.uid()))
 with check (exists(select 1 from public.admin_users a where a.user_id=auth.uid()));

commit;


-- ===== SOURCE: V13_TAILORING_PROFILE_LINK.sql =====

-- V13: Link tailoring requests to the authenticated customer account.
-- This allows the admin dashboard to resolve the correct private profile photo.
-- Existing requests are intentionally left unassigned; do not match customers by email.

alter table public.tailoring_requests
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists tailoring_requests_user_id_created_at_idx
  on public.tailoring_requests(user_id, created_at desc);

create or replace function public.assign_tailoring_request_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Always derive ownership from the authenticated session, never from form input.
  new.user_id := auth.uid();
  return new;
end;
$$;

drop trigger if exists set_tailoring_request_owner on public.tailoring_requests;

create trigger set_tailoring_request_owner
before insert on public.tailoring_requests
for each row
execute function public.assign_tailoring_request_owner();

comment on column public.tailoring_requests.user_id is
  'Authenticated account that submitted this tailoring request; used for admin-only profile photo display.';


-- ===== SOURCE: V14_TAILORING_CUSTOMER_CONTACTS.sql =====

-- V14: Store customer contact snapshots with tailoring requests.
-- Apply in the Supabase SQL Editor after the V13 secure tracking migration.
begin;

alter table public.tailoring_requests
  add column if not exists customer_name text,
  add column if not exists customer_email text,
  add column if not exists customer_phone text;

create or replace function public.submit_tailoring_request_with_contact(
  p_garment_type text,
  p_fabric text,
  p_colour text,
  p_style_preferences text,
  p_measurements text,
  p_reference_image_url text,
  p_special_instructions text,
  p_desired_completion_date date,
  p_country text,
  p_customer_name text,
  p_customer_phone text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := auth.jwt()->>'email';
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Please sign in before submitting a tailoring request.';
  end if;
  if char_length(trim(coalesce(p_customer_name,''))) not between 2 and 120 then
    raise exception 'Please enter your full name.';
  end if;
  if char_length(trim(coalesce(p_customer_phone,''))) not between 7 and 30 then
    raise exception 'Please enter a valid phone number, including country code where possible.';
  end if;
  if char_length(trim(coalesce(v_email,''))) not between 3 and 254 then
    raise exception 'Your account email could not be verified. Please sign in again.';
  end if;

  v_result := public.submit_tailoring_request(
    p_garment_type,
    p_fabric,
    p_colour,
    p_style_preferences,
    p_measurements,
    p_reference_image_url,
    p_special_instructions,
    p_desired_completion_date,
    p_country
  );

  update public.tailoring_requests
  set customer_name=trim(p_customer_name),
      customer_email=lower(trim(v_email)),
      customer_phone=trim(p_customer_phone)
  where user_id=v_user_id
    and reference_code=v_result->>'reference_code';

  if not found then
    raise exception 'The tailoring request was created but its contact details could not be saved. Please contact the store with your request reference.';
  end if;

  return v_result;
end;
$$;

revoke all on function public.submit_tailoring_request_with_contact(text,text,text,text,text,text,text,date,text,text,text) from public,anon;
grant execute on function public.submit_tailoring_request_with_contact(text,text,text,text,text,text,text,date,text,text,text) to authenticated;

commit;


-- ===== SOURCE: V15_TAILORING_CUSTOMER_CORRECTIONS.sql =====

-- P&Q V15: secure customer corrections for existing tailoring requests.
-- Apply in Supabase SQL Editor after V14.
begin;
alter table public.tailoring_requests add column if not exists customer_updated_at timestamptz;
create or replace function public.update_customer_tailoring_request(
 p_request_id uuid,p_garment_type text,p_fabric text,p_colour text,p_style_preferences text,
 p_measurements text,p_reference_image_url text,p_special_instructions text,
 p_desired_completion_date date,p_country text,p_customer_name text,p_customer_phone text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user_id uuid:=auth.uid();v_old_image text;v_reference text;
begin
 if v_user_id is null then raise exception 'Please sign in before editing a tailoring request.'; end if;
 if char_length(trim(coalesce(p_customer_name,''))) not between 2 and 120 then raise exception 'Please enter your full name.'; end if;
 if char_length(trim(coalesce(p_customer_phone,''))) not between 7 and 30 then raise exception 'Please enter a valid phone number.'; end if;
 if char_length(trim(coalesce(p_garment_type,''))) not between 2 and 100 then raise exception 'Please specify the garment type.'; end if;
 if char_length(coalesce(p_fabric,''))>160 or char_length(coalesce(p_colour,''))>100 or char_length(coalesce(p_style_preferences,''))>2000 or char_length(coalesce(p_measurements,''))>4000 or char_length(coalesce(p_special_instructions,''))>2000 then raise exception 'One or more fields exceed the allowed length.'; end if;
 if p_desired_completion_date is not null and p_desired_completion_date<current_date then raise exception 'The desired completion date must be today or later.'; end if;
 if coalesce(p_reference_image_url,'')<>'' and (storage.foldername(p_reference_image_url))[1]<>v_user_id::text then raise exception 'The reference image must belong to your account.'; end if;
 select reference_image_url,reference_code into v_old_image,v_reference from public.tailoring_requests where id=p_request_id and user_id=v_user_id and status in ('submitted','under_review','awaiting_measurements') for update;
 if not found then raise exception 'This request cannot be edited. Please contact the store if it is already being processed.'; end if;
 update public.tailoring_requests set garment_type=trim(p_garment_type),fabric=coalesce(p_fabric,''),colour=coalesce(p_colour,''),style_preferences=coalesce(p_style_preferences,''),measurements=coalesce(p_measurements,''),reference_image_url=coalesce(p_reference_image_url,''),special_instructions=coalesce(p_special_instructions,''),desired_completion_date=p_desired_completion_date,country=left(coalesce(p_country,'Kenya'),80),customer_name=trim(p_customer_name),customer_phone=trim(p_customer_phone),customer_updated_at=now(),updated_at=now() where id=p_request_id and user_id=v_user_id;
 return jsonb_build_object('id',p_request_id,'reference_code',v_reference,'old_reference_image_url',coalesce(v_old_image,''));
end; $$;
revoke all on function public.update_customer_tailoring_request(uuid,text,text,text,text,text,text,text,date,text,text,text) from public,anon;
grant execute on function public.update_customer_tailoring_request(uuid,text,text,text,text,text,text,text,date,text,text,text) to authenticated;
drop policy if exists "V15 owners delete own tailoring references" on storage.objects;
create policy "V15 owners delete own tailoring references" on storage.objects for delete to authenticated using (bucket_id='tailoring-references' and (storage.foldername(name))[1]=auth.uid()::text);
commit;
