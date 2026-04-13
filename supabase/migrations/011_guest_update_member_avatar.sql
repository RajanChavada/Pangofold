-- Guests (anon) cannot UPDATE trip_members under RLS — allow avatar URL update via token

create or replace function public.guest_update_member_avatar(
  p_token uuid,
  p_avatar_url text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update trip_members m
  set avatar_url = nullif(trim(p_avatar_url), '')
  from trips t
  where m.local_storage_token = p_token
    and t.id = m.trip_id
    and t.collaboration_enabled = true
    and t.collaborate_token is not null
  returning m.id into v_id;

  if v_id is null then
    raise exception 'invalid_member_token';
  end if;
end;
$$;

grant execute on function public.guest_update_member_avatar(uuid, text) to anon, authenticated;
