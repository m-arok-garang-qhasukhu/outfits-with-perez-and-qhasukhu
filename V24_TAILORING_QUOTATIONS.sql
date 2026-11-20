-- P&Q V24: store the agreed tailoring quotation amount.
-- Apply in the Supabase SQL Editor after V23.
begin;

alter table public.tailoring_requests
  add column if not exists quoted_amount_kes numeric(12,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tailoring_requests_quoted_amount_kes_nonnegative'
      and conrelid = 'public.tailoring_requests'::regclass
  ) then
    alter table public.tailoring_requests
      add constraint tailoring_requests_quoted_amount_kes_nonnegative
      check (quoted_amount_kes is null or quoted_amount_kes >= 0);
  end if;
end $$;

comment on column public.tailoring_requests.quoted_amount_kes is
  'Admin-entered agreed tailoring quotation in Kenyan shillings; null means no quotation has been entered.';

commit;
