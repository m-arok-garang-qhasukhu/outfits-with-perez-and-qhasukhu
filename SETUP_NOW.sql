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
