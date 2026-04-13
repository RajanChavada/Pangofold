-- Guests (anon) cannot SELECT daily_logs under RLS — list rows via member token (same pattern as guest_get_daily_log)

create or replace function public.guest_list_my_daily_logs(p_token uuid)
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
  activity_highlight text,
  created_at timestamptz,
  updated_at timestamptz
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
    d.activity_highlight,
    d.created_at,
    d.updated_at
  from daily_logs d
  join trip_members m on m.id = d.member_id
  join trips t on t.id = d.trip_id
  where m.local_storage_token = p_token
    and t.collaboration_enabled = true
    and t.collaborate_token is not null
  order by d.log_date asc;
$$;

grant execute on function public.guest_list_my_daily_logs(uuid) to anon, authenticated;
