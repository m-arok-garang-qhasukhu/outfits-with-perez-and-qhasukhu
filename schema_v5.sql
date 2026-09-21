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
