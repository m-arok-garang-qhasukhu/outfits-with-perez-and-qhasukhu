-- P&Q V21: let customers securely see the status of their own submitted reviews.
-- Product reviews are tied to the customer's delivered order through order_items/orders.
-- Tailoring reviews are tied directly to the customer's tailoring_requests row.
begin;

create or replace function public.get_my_review_statuses()
returns table (
  review_id uuid,
  review_type text,
  order_item_id uuid,
  tailoring_request_id uuid,
  rating integer,
  review_text text,
  is_approved boolean,
  created_at timestamptz,
  subject text
)
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  select own_reviews.review_id,
         own_reviews.review_type,
         own_reviews.order_item_id,
         own_reviews.tailoring_request_id,
         own_reviews.rating,
         own_reviews.review_text,
         own_reviews.is_approved,
         own_reviews.created_at,
         own_reviews.subject
    from (
      select pr.id as review_id,
             'product'::text as review_type,
             pr.order_item_id,
             null::uuid as tailoring_request_id,
             pr.rating,
             pr.review_text,
             pr.is_approved,
             pr.created_at,
             coalesce(nullif(oi.product_name,''),'Purchased product') as subject
        from public.product_reviews pr
        join public.order_items oi on oi.id=pr.order_item_id
        join public.orders o on o.id=oi.order_id
       where o.user_id=auth.uid()
         and pr.order_item_id is not null

      union all

      select pr.id as review_id,
             'tailoring'::text as review_type,
             null::uuid as order_item_id,
             pr.tailoring_request_id,
             pr.rating,
             pr.review_text,
             pr.is_approved,
             pr.created_at,
             coalesce(nullif(tr.garment_type,''),'Custom tailoring') as subject
        from public.product_reviews pr
        join public.tailoring_requests tr on tr.id=pr.tailoring_request_id
       where tr.user_id=auth.uid()
         and pr.tailoring_request_id is not null
    ) as own_reviews
   order by own_reviews.created_at desc;
$function$;

revoke all on function public.get_my_review_statuses() from public,anon;
grant execute on function public.get_my_review_statuses() to authenticated;

comment on function public.get_my_review_statuses() is
  'Returns only the signed-in customer''s own product and tailoring review statuses.';

commit;
