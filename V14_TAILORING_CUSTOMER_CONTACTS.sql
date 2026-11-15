-- V14: Store customer contact snapshots with tailoring requests.
-- Apply in the Supabase SQL Editor after the V13 secure tracking migration.
begin;

alter table public.tailoring_requests
  add column if not exists customer_name text,
  add column if not exists customer_email text,
  add column if not exists customer_phone text;

create or replace function public.submit_tailoring_request_with_contact(
  p_garment_type text,
  p_fabric text,
  p_colour text,
  p_style_preferences text,
  p_measurements text,
  p_reference_image_url text,
  p_special_instructions text,
  p_desired_completion_date date,
  p_country text,
  p_customer_name text,
  p_customer_phone text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := auth.jwt()->>'email';
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Please sign in before submitting a tailoring request.';
  end if;
  if char_length(trim(coalesce(p_customer_name,''))) not between 2 and 120 then
    raise exception 'Please enter your full name.';
  end if;
  if char_length(trim(coalesce(p_customer_phone,''))) not between 7 and 30 then
    raise exception 'Please enter a valid phone number, including country code where possible.';
  end if;
  if char_length(trim(coalesce(v_email,''))) not between 3 and 254 then
    raise exception 'Your account email could not be verified. Please sign in again.';
  end if;

  v_result := public.submit_tailoring_request(
    p_garment_type,
    p_fabric,
    p_colour,
    p_style_preferences,
    p_measurements,
    p_reference_image_url,
    p_special_instructions,
    p_desired_completion_date,
    p_country
  );

  update public.tailoring_requests
  set customer_name=trim(p_customer_name),
      customer_email=lower(trim(v_email)),
      customer_phone=trim(p_customer_phone)
  where user_id=v_user_id
    and reference_code=v_result->>'reference_code';

  if not found then
    raise exception 'The tailoring request was created but its contact details could not be saved. Please contact the store with your request reference.';
  end if;

  return v_result;
end;
$$;

revoke all on function public.submit_tailoring_request_with_contact(text,text,text,text,text,text,text,date,text,text,text) from public,anon;
grant execute on function public.submit_tailoring_request_with_contact(text,text,text,text,text,text,text,date,text,text,text) to authenticated;

commit;
