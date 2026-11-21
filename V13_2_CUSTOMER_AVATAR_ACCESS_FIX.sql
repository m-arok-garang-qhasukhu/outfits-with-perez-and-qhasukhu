-- V13.2: Repair private customer-avatar read access.
-- Customers may sign a URL only for their own <auth.uid()>/avatar object.
-- Verified admins may sign URLs for customer avatars across the store.
-- The bucket remains PRIVATE; this does not grant customer-to-customer access.

update storage.buckets
set public = false,
    file_size_limit = 3145728,
    allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'customer-avatars';

drop policy if exists "P&Q customers read own profile photo" on storage.objects;
create policy "P&Q customers read own profile photo"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'customer-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "P&Q admins read customer profile photos" on storage.objects;
create policy "P&Q admins read customer profile photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'customer-avatars'
  and exists (
    select 1
    from public.admin_users a
    where a.user_id = (select auth.uid())
  )
);
