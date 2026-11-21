-- V13: Link tailoring requests to the authenticated customer account.
-- This allows the admin dashboard to resolve the correct private profile photo.
-- Existing requests are intentionally left unassigned; do not match customers by email.

alter table public.tailoring_requests
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists tailoring_requests_user_id_created_at_idx
  on public.tailoring_requests(user_id, created_at desc);

create or replace function public.assign_tailoring_request_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Always derive ownership from the authenticated session, never from form input.
  new.user_id := auth.uid();
  return new;
end;
$$;

drop trigger if exists set_tailoring_request_owner on public.tailoring_requests;

create trigger set_tailoring_request_owner
before insert on public.tailoring_requests
for each row
execute function public.assign_tailoring_request_owner();

comment on column public.tailoring_requests.user_id is
  'Authenticated account that submitted this tailoring request; used for admin-only profile photo display.';
