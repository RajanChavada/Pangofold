-- Optional link from a daily log to a plan stop + activity highlight text

alter table daily_logs
  add column if not exists linked_itinerary_item_id uuid references itinerary_items (id) on delete set null,
  add column if not exists activity_highlight text check (activity_highlight is null or char_length(activity_highlight) <= 500);

create index if not exists idx_daily_logs_linked_item on daily_logs (linked_itinerary_item_id);

create or replace function public.daily_logs_validate_itinerary_link()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.linked_itinerary_item_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from itinerary_items ii
    join day_itineraries di on di.id = ii.day_id
    join destinations d on d.id = di.destination_id
    where ii.id = new.linked_itinerary_item_id
      and d.trip_id = new.trip_id
  ) then
    raise exception 'linked_itinerary_item must belong to the same trip';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_daily_logs_itinerary on daily_logs;
create trigger trg_daily_logs_itinerary
  before insert or update on daily_logs
  for each row execute function public.daily_logs_validate_itinerary_link();

-- Guest RPC: return new columns
create or replace function public.guest_get_daily_log(p_token uuid, p_log_date date)
returns table (
  id uuid,
  trip_id uuid,
  member_id uuid,
  log_date date,
  steps_count integer,
  mood_score smallint,
  best_food_text text,
  best_food_photo_url text,
  worst_food_text text,
  funniest_moment text,
  custom_prompt_answer text,
  linked_itinerary_item_id uuid,
  activity_highlight text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id,
    d.trip_id,
    d.member_id,
    d.log_date,
    d.steps_count,
    d.mood_score,
    d.best_food_text,
    d.best_food_photo_url,
    d.worst_food_text,
    d.funniest_moment,
    d.custom_prompt_answer,
    d.linked_itinerary_item_id,
    d.activity_highlight
  from daily_logs d
  join trip_members m on m.id = d.member_id
  join trips t on t.id = d.trip_id
  where m.local_storage_token = p_token
    and d.log_date = p_log_date
    and t.collaboration_enabled = true
  limit 1;
$$;

-- Replace guest upsert with extended signature
drop function if exists public.guest_upsert_daily_log(uuid, date, integer, smallint, text, text, text, text);

create or replace function public.guest_upsert_daily_log(
  p_token uuid,
  p_log_date date,
  p_steps_count integer,
  p_mood_score smallint,
  p_best_food_text text,
  p_worst_food_text text,
  p_funniest_moment text,
  p_custom_prompt_answer text,
  p_linked_itinerary_item_id uuid,
  p_activity_highlight text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mid uuid;
  v_tid uuid;
begin
  select m.id, m.trip_id into v_mid, v_tid
  from trip_members m
  join trips t on t.id = m.trip_id
  where m.local_storage_token = p_token
    and t.collaboration_enabled = true
    and t.collaborate_token is not null
  limit 1;

  if v_mid is null then
    raise exception 'invalid_member_token';
  end if;

  insert into daily_logs (
    trip_id,
    member_id,
    log_date,
    steps_count,
    mood_score,
    best_food_text,
    worst_food_text,
    funniest_moment,
    custom_prompt_answer,
    linked_itinerary_item_id,
    activity_highlight,
    updated_at
  )
  values (
    v_tid,
    v_mid,
    p_log_date,
    p_steps_count,
    p_mood_score,
    nullif(trim(p_best_food_text), ''),
    nullif(trim(p_worst_food_text), ''),
    nullif(trim(p_funniest_moment), ''),
    nullif(trim(p_custom_prompt_answer), ''),
    p_linked_itinerary_item_id,
    nullif(trim(p_activity_highlight), ''),
    now()
  )
  on conflict (trip_id, member_id, log_date)
  do update set
    steps_count = excluded.steps_count,
    mood_score = excluded.mood_score,
    best_food_text = excluded.best_food_text,
    worst_food_text = excluded.worst_food_text,
    funniest_moment = excluded.funniest_moment,
    custom_prompt_answer = excluded.custom_prompt_answer,
    linked_itinerary_item_id = excluded.linked_itinerary_item_id,
    activity_highlight = excluded.activity_highlight,
    updated_at = now();
end;
$$;

grant execute on function public.guest_upsert_daily_log(uuid, date, integer, smallint, text, text, text, text, uuid, text) to anon, authenticated;
