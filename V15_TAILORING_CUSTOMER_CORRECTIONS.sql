-- P&Q V15: secure customer corrections for existing tailoring requests.
-- Apply in Supabase SQL Editor after V14.
begin;
alter table public.tailoring_requests add column if not exists customer_updated_at timestamptz;
create or replace function public.update_customer_tailoring_request(
 p_request_id uuid,p_garment_type text,p_fabric text,p_colour text,p_style_preferences text,
 p_measurements text,p_reference_image_url text,p_special_instructions text,
 p_desired_completion_date date,p_country text,p_customer_name text,p_customer_phone text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user_id uuid:=auth.uid();v_old_image text;v_reference text;
begin
 if v_user_id is null then raise exception 'Please sign in before editing a tailoring request.'; end if;
 if char_length(trim(coalesce(p_customer_name,''))) not between 2 and 120 then raise exception 'Please enter your full name.'; end if;
 if char_length(trim(coalesce(p_customer_phone,''))) not between 7 and 30 then raise exception 'Please enter a valid phone number.'; end if;
 if char_length(trim(coalesce(p_garment_type,''))) not between 2 and 100 then raise exception 'Please specify the garment type.'; end if;
 if char_length(coalesce(p_fabric,''))>160 or char_length(coalesce(p_colour,''))>100 or char_length(coalesce(p_style_preferences,''))>2000 or char_length(coalesce(p_measurements,''))>4000 or char_length(coalesce(p_special_instructions,''))>2000 then raise exception 'One or more fields exceed the allowed length.'; end if;
 if p_desired_completion_date is not null and p_desired_completion_date<current_date then raise exception 'The desired completion date must be today or later.'; end if;
 if coalesce(p_reference_image_url,'')<>'' and (storage.foldername(p_reference_image_url))[1]<>v_user_id::text then raise exception 'The reference image must belong to your account.'; end if;
 select reference_image_url,reference_code into v_old_image,v_reference from public.tailoring_requests where id=p_request_id and user_id=v_user_id and status in ('submitted','under_review','awaiting_measurements') for update;
 if not found then raise exception 'This request cannot be edited. Please contact the store if it is already being processed.'; end if;
 update public.tailoring_requests set garment_type=trim(p_garment_type),fabric=coalesce(p_fabric,''),colour=coalesce(p_colour,''),style_preferences=coalesce(p_style_preferences,''),measurements=coalesce(p_measurements,''),reference_image_url=coalesce(p_reference_image_url,''),special_instructions=coalesce(p_special_instructions,''),desired_completion_date=p_desired_completion_date,country=left(coalesce(p_country,'Kenya'),80),customer_name=trim(p_customer_name),customer_phone=trim(p_customer_phone),customer_updated_at=now(),updated_at=now() where id=p_request_id and user_id=v_user_id;
 return jsonb_build_object('id',p_request_id,'reference_code',v_reference,'old_reference_image_url',coalesce(v_old_image,''));
end; $$;
revoke all on function public.update_customer_tailoring_request(uuid,text,text,text,text,text,text,text,date,text,text,text) from public,anon;
grant execute on function public.update_customer_tailoring_request(uuid,text,text,text,text,text,text,text,date,text,text,text) to authenticated;
drop policy if exists "V15 owners delete own tailoring references" on storage.objects;
create policy "V15 owners delete own tailoring references" on storage.objects for delete to authenticated using (bucket_id='tailoring-references' and (storage.foldername(name))[1]=auth.uid()::text);
commit;
