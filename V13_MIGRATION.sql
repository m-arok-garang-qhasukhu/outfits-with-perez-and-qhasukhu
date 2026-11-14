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
