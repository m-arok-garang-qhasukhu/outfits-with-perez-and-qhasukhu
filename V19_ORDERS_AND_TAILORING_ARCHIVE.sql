-- P&Q V19: reversible archiving for ordinary orders and tailoring requests.
begin;

alter table public.orders
  add column if not exists archived_at timestamptz;

create index if not exists orders_active_user_created_v19
  on public.orders(user_id, created_at desc)
  where archived_at is null;

create or replace function public.archive_own_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Please sign in to archive an order.';
  end if;
  update public.orders
     set archived_at=now()
   where id=p_order_id
     and user_id=auth.uid()
     and status in ('delivered','cancelled')
     and archived_at is null;
  if not found then
    raise exception 'Only your delivered or cancelled active orders can be archived.';
  end if;
end;
$$;

create or replace function public.restore_own_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Please sign in to restore an order.';
  end if;
  update public.orders
     set archived_at=null
   where id=p_order_id
     and user_id=auth.uid()
     and archived_at is not null;
  if not found then
    raise exception 'Archived order not found.';
  end if;
end;
$$;

create or replace function public.archive_own_delivered_tailoring_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare v_reference text;
begin
  if auth.uid() is null then raise exception 'Please sign in to archive a tailoring request.'; end if;
  update public.tailoring_requests set archived_at=now(), updated_at=now()
   where id=p_request_id and user_id=auth.uid() and status in ('completed','delivered') and archived_at is null
   returning reference_code into v_reference;
  if v_reference is null then raise exception 'Only your completed or delivered active tailoring requests can be archived.'; end if;
  return jsonb_build_object('reference_code',v_reference,'archived',true);
end;
$function$;
revoke all on function public.archive_own_delivered_tailoring_request(uuid) from public,anon;
grant execute on function public.archive_own_delivered_tailoring_request(uuid) to authenticated;

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
     set archived_at=null, updated_at=now()
   where id=p_request_id
     and user_id=auth.uid()
     and archived_at is not null;
  if not found then
    raise exception 'Archived tailoring request not found.';
  end if;
end;
$$;

revoke all on function public.archive_own_order(uuid) from public,anon;
revoke all on function public.restore_own_order(uuid) from public,anon;
revoke all on function public.restore_own_archived_tailoring_request(uuid) from public,anon;
grant execute on function public.archive_own_order(uuid) to authenticated;
grant execute on function public.restore_own_order(uuid) to authenticated;
grant execute on function public.restore_own_archived_tailoring_request(uuid) to authenticated;

comment on column public.orders.archived_at is
  'Archive timestamp. Orders remain stored and can be restored by their owner or an admin.';

commit;
