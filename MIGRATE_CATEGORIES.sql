-- Run this once in Supabase SQL Editor to support the expanded storefront categories.
-- Existing Men/Women categories are retained so current records remain valid.
alter table public.products drop constraint if exists products_category_check;
alter table public.products add constraint products_category_check
  check (category in ('Men','Women','Accessories','Church & Clergy','Official Wear','Custom Tailoring'));
