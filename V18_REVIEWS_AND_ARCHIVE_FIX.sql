-- P&Q V18: reliable archive controls and verified delivered-order reviews.
begin;
alter table public.product_reviews add column if not exists order_item_id uuid references public.order_items(id) on delete cascade;
create unique index if not exists product_reviews_one_per_order_item_idx
  on public.product_reviews(order_item_id) where order_item_id is not null;
create or replace function public.submit_verified_product_review(
  p_order_item_id uuid,
  p_rating integer,
  p_review_text text
) returns uuid
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_product_id uuid;
  v_reviewer_name text;
  v_review_id uuid;
begin
  if v_user_id is null then raise exception 'Please sign in to submit a review.'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'Choose a rating from 1 to 5 stars.'; end if;
  if char_length(trim(coalesce(p_review_text,''))) not between 5 and 1200 then raise exception 'Review must be between 5 and 1,200 characters.'; end if;
  select oi.product_id,o.customer_name into v_product_id,v_reviewer_name
  from public.order_items oi
  join public.orders o on o.id=oi.order_id
  where oi.id=p_order_item_id and o.user_id=v_user_id and o.status='delivered';
  if not found or v_product_id is null then
    raise exception 'A review can only be submitted for a product in your own delivered order.';
  end if;
  insert into public.product_reviews(order_item_id,product_id,reviewer_name,rating,review_text,is_approved)
  values(p_order_item_id,v_product_id,coalesce(nullif(trim(v_reviewer_name),''),'Verified customer'),p_rating,trim(p_review_text),false)
  on conflict (order_item_id) where order_item_id is not null do nothing
  returning id into v_review_id;
  if v_review_id is null then raise exception 'A review has already been submitted for this purchased item.'; end if;
  return v_review_id;
end;
$$;
revoke all on function public.submit_verified_product_review(uuid,integer,text) from public,anon;
grant execute on function public.submit_verified_product_review(uuid,integer,text) to authenticated;
commit;