-- P&Q V20: independent customer tailoring archives and verified tailoring reviews.
begin;

-- Keep admin archive history in archived_at; customer actions use a separate field.
alter table public.tailoring_requests
  add column if not exists customer_archived_at timestamptz;

create index if not exists tailoring_customer_active_user_created_v20
  on public.tailoring_requests(user_id, created_at desc)
  where customer_archived_at is null;

-- Preserve the existing RPC names used by the customer account page, but isolate
-- their writes to customer_archived_at. Admin archived_at values are never touched.
create or replace function public.archive_own_delivered_tailoring_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare v_reference text;
begin
  if auth.uid() is null then
    raise exception 'Please sign in to archive a tailoring request.';
  end if;
  update public.tailoring_requests
     set customer_archived_at=now(), updated_at=now()
   where id=p_request_id
     and user_id=auth.uid()
     and status='completed'
     and customer_archived_at is null
  returning reference_code into v_reference;
  if v_reference is null then
    raise exception 'Only your completed tailoring requests can be archived.';
  end if;
  return jsonb_build_object('reference_code',v_reference,'archived',true);
end;
$function$;

create or replace function public.restore_own_archived_tailoring_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Please sign in to restore a tailoring request.';
  end if;
  update public.tailoring_requests
     set customer_archived_at=null, updated_at=now()
   where id=p_request_id
     and user_id=auth.uid()
     and customer_archived_at is not null;
  if not found then
    raise exception 'Customer-archived tailoring request not found.';
  end if;
end;
$$;

revoke all on function public.archive_own_delivered_tailoring_request(uuid) from public,anon;
revoke all on function public.restore_own_archived_tailoring_request(uuid) from public,anon;
grant execute on function public.archive_own_delivered_tailoring_request(uuid) to authenticated;
grant execute on function public.restore_own_archived_tailoring_request(uuid) to authenticated;

comment on column public.tailoring_requests.archived_at is
  'Admin archive timestamp. Customer archive actions must not modify this field.';
comment on column public.tailoring_requests.customer_archived_at is
  'Customer-owned archive timestamp, independent of the admin archive.';

-- A review can belong to exactly one verified purchase type.
alter table public.product_reviews
  alter column product_id drop not null;

alter table public.product_reviews
  add column if not exists tailoring_request_id uuid
  references public.tailoring_requests(id) on delete cascade;

alter table public.product_reviews
  drop constraint if exists product_reviews_exactly_one_subject_v20;

alter table public.product_reviews
  add constraint product_reviews_exactly_one_subject_v20
  check (
    (product_id is not null and tailoring_request_id is null)
    or
    (product_id is null and tailoring_request_id is not null)
  );

create unique index if not exists product_reviews_one_per_tailoring_request_v20
  on public.product_reviews(tailoring_request_id)
  where tailoring_request_id is not null;

create index if not exists product_reviews_tailoring_approved_v20
  on public.product_reviews(tailoring_request_id, is_approved, created_at desc)
  where tailoring_request_id is not null;

create or replace function public.submit_verified_tailoring_review(
  p_tailoring_request_id uuid,
  p_rating integer,
  p_review_text text
) returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_reviewer_name text;
  v_review_id uuid;
begin
  if v_user_id is null then
    raise exception 'Please sign in to submit a review.';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Choose a rating from 1 to 5 stars.';
  end if;
  if char_length(trim(coalesce(p_review_text,''))) not between 5 and 1200 then
    raise exception 'Review must be between 5 and 1,200 characters.';
  end if;

  select customer_name
    into v_reviewer_name
    from public.tailoring_requests
   where id=p_tailoring_request_id
     and user_id=v_user_id
     and status='completed';

  if not found then
    raise exception 'A review can only be submitted for your own completed tailoring request.';
  end if;

  insert into public.product_reviews(
    product_id, tailoring_request_id, reviewer_name, rating,
    review_text, is_approved, user_id
  )
  values(
    null, p_tailoring_request_id,
    left(coalesce(nullif(trim(v_reviewer_name),''),'Verified customer'),80),
    p_rating, trim(p_review_text), false, v_user_id
  )
  on conflict (tailoring_request_id)
    where tailoring_request_id is not null
    do nothing
  returning id into v_review_id;

  if v_review_id is null then
    raise exception 'A review has already been submitted for this tailoring request.';
  end if;
  return v_review_id;
end;
$function$;

revoke all on function public.submit_verified_tailoring_review(uuid,integer,text) from public,anon;
grant execute on function public.submit_verified_tailoring_review(uuid,integer,text) to authenticated;

commit;
