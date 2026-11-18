-- P&Q V17: archive delivered tailoring requests without deleting customer history.
begin;
alter table public.tailoring_requests
  add column if not exists archived_at timestamptz;
create index if not exists tailoring_requests_active_created_idx
  on public.tailoring_requests (created_at desc)
  where archived_at is null;
create or replace function public.archive_own_delivered_tailoring_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reference text;
begin
  if auth.uid() is null then
    raise exception 'Please sign in to archive a tailoring request.';
  end if;
  update public.tailoring_requests
     set archived_at = now(), updated_at = now()
   where id = p_request_id
     and user_id = auth.uid()
     and status = 'delivered'
     and archived_at is null
  returning reference_code into v_reference;
  if v_reference is null then
    raise exception 'Only your delivered, active tailoring requests can be archived.';
  end if;
  return jsonb_build_object('reference_code', v_reference, 'archived', true);
end;
$$;
revoke all on function public.archive_own_delivered_tailoring_request(uuid) from public;
grant execute on function public.archive_own_delivered_tailoring_request(uuid) to authenticated;
comment on column public.tailoring_requests.archived_at is 'Archive timestamp; records remain stored and can be reviewed by the customer and admins.';
commit;
