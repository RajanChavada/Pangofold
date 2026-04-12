-- Guest checklist toggle (anon has no UPDATE on itinerary_items under RLS)
-- Unified guest_upsert_daily_log with optional itinerary/activity + photo URL(s) JSON in best_food_photo_url

-- ── Itinerary: authenticated trip members can toggle checklist ─────────────────
drop policy if exists "Trip members can update itinerary checklist" on itinerary_items;
create policy "Trip members can update itinerary checklist"
  on itinerary_items for update
  using (
    exists (
      select 1 from day_itineraries di
      join destinations d on d.id = di.destination_id
      join trip_members m on m.trip_id = d.trip_id
      where di.id = itinerary_items.day_id
        and m.user_id is not null
        and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from day_itineraries di
      join destinations d on d.id = di.destination_id
      join trip_members m on m.trip_id = d.trip_id
      where di.id = itinerary_items.day_id
        and m.user_id is not null
        and m.user_id = auth.uid()
    )
  );

-- ── Guest: toggle is_checked via member token ─────────────────────────────────
create or replace function public.guest_toggle_itinerary_item_checked(
  p_token uuid,
  p_item_id uuid,
  p_checked boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update itinerary_items ii
  set is_checked = p_checked
  from day_itineraries di
  join destinations d on d.id = di.destination_id
  join trip_members m on m.trip_id = d.trip_id
  join trips t on t.id = d.trip_id
  where ii.id = p_item_id
    and ii.day_id = di.id
    and m.local_storage_token = p_token
    and t.collaboration_enabled = true
    and t.collaborate_token is not null;

  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'invalid_token_or_item';
  end if;
end;
$$;

grant execute on function public.guest_toggle_itinerary_item_checked(uuid, uuid, boolean) to anon, authenticated;

-- ── Ensure daily_logs columns + validate trigger (same as 007; idempotent) ───
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

-- Replace guest upsert with one signature (optional tail args have defaults in Postgres)
drop function if exists public.guest_upsert_daily_log(uuid, date, integer, smallint, text, text, text, text);
drop function if exists public.guest_upsert_daily_log(uuid, date, integer, smallint, text, text, text, text, uuid, text);

create or replace function public.guest_upsert_daily_log(
  p_token uuid,
  p_log_date date,
  p_steps_count integer,
  p_mood_score smallint,
  p_best_food_text text,
  p_worst_food_text text,
  p_funniest_moment text,
  p_custom_prompt_answer text,
  p_linked_itinerary_item_id uuid default null,
  p_activity_highlight text default null,
  p_best_food_photo_url text default null
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
    best_food_photo_url,
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
    nullif(trim(p_best_food_photo_url), ''),
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
    best_food_photo_url = excluded.best_food_photo_url,
    updated_at = now();
end;
$$;

grant execute on function public.guest_upsert_daily_log(uuid, date, integer, smallint, text, text, text, text, uuid, text, text) to anon, authenticated;
