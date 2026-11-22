-- P&Q V25: expose approved reviews through a safe public projection
-- and move full review moderation reads/writes behind admin-checked RPCs.
-- Apply only to the P&Q development/staging Supabase project first.

begin;

-- The public site receives only fields needed to display approved reviews.
-- The view owner is postgres; its query deliberately filters to approved rows.
create or replace view public.public_product_reviews
with (security_barrier = true)
as
select
  pr.product_id,
  pr.reviewer_name,
  pr.rating,
  pr.review_text,
  pr.created_at,
  p.name as product_name,
  tr.garment_type as tailoring_garment_type
from public.product_reviews as pr
left join public.products as p
  on p.id = pr.product_id
left join public.tailoring_requests as tr
  on tr.id = pr.tailoring_request_id
where pr.is_approved = true;

alter view public.public_product_reviews owner to postgres;
revoke all on public.public_product_reviews from public, anon, authenticated;
grant select on public.public_product_reviews to anon, authenticated;

-- Remove direct access to the source table from browser roles. The existing
-- RLS policies remain as defense in depth, but browser access now goes through
-- the safe view or the admin-checked functions below.
revoke all on table public.product_reviews from public, anon, authenticated;

create or replace function public.admin_list_product_reviews()
returns table (
  review_id uuid,
  reviewer_name text,
  rating integer,
  review_text text,
  is_approved boolean,
  created_at timestamptz,
  product_name text,
  tailoring_garment_type text,
  tailoring_reference_code text
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null
     or not exists (
       select 1
       from public.admin_users as a
       where a.user_id = auth.uid()
     ) then
    raise exception using errcode = '42501', message = 'Not authorized to view reviews.';
  end if;

  return query
  select
    pr.id,
    pr.reviewer_name,
    pr.rating,
    pr.review_text,
    pr.is_approved,
    pr.created_at,
    p.name,
    tr.garment_type,
    tr.reference_code
  from public.product_reviews as pr
  left join public.products as p
    on p.id = pr.product_id
  left join public.tailoring_requests as tr
    on tr.id = pr.tailoring_request_id
  order by pr.created_at desc
  limit 150;
end;
$function$;

create or replace function public.admin_set_product_review_approval(
  p_review_id uuid,
  p_is_approved boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_updated integer;
begin
  if auth.uid() is null
     or not exists (
       select 1
       from public.admin_users as a
       where a.user_id = auth.uid()
     ) then
    raise exception using errcode = '42501', message = 'Not authorized to moderate reviews.';
  end if;

  update public.product_reviews
     set is_approved = p_is_approved,
         updated_at = now()
   where id = p_review_id;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'Review not found.';
  end if;
end;
$function$;

create or replace function public.admin_review_pending_count()
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count bigint;
begin
  if auth.uid() is null
     or not exists (
       select 1
       from public.admin_users as a
       where a.user_id = auth.uid()
     ) then
    raise exception using errcode = '42501', message = 'Not authorized to view review statistics.';
  end if;

  select count(*)
    into v_count
    from public.product_reviews
   where is_approved = false;

  return v_count;
end;
$function$;

revoke all on function public.admin_list_product_reviews() from public, anon;
revoke all on function public.admin_set_product_review_approval(uuid, boolean) from public, anon;
revoke all on function public.admin_review_pending_count() from public, anon;

grant execute on function public.admin_list_product_reviews() to authenticated;
grant execute on function public.admin_set_product_review_approval(uuid, boolean) to authenticated;
grant execute on function public.admin_review_pending_count() to authenticated;

comment on view public.public_product_reviews is
  'Public display projection of approved product and tailoring reviews; excludes customer and order relationship identifiers.';

notify pgrst, 'reload schema';

commit;
