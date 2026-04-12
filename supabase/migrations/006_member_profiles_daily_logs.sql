-- Member profiles, daily logs, onboarding prompts, and receipt flags
-- Phase 1: trip_members profile columns + nullable user_id for guests
-- Phase 2: daily_logs table
-- Phase 3: trips onboarding_prompts + daily_log_prompt
-- Phase 4: journal_photos is_receipt flag

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. trip_members — make user_id nullable (guests have no auth session),
--    add profile fields, and add local_storage_token for guest identity
-- ──────────────────────────────────────────────────────────────────────────────

-- Drop the NOT NULL constraint and foreign key, re-add as nullable FK
alter table trip_members
  drop constraint if exists trip_members_user_id_fkey;

alter table trip_members
  alter column user_id drop not null;

alter table trip_members
  add constraint trip_members_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

-- Drop the unique(trip_id, user_id) constraint — can't have multiple NULLs
-- with this constraint on some DB engines, and guests won't have user_id
alter table trip_members
  drop constraint if exists trip_members_trip_id_user_id_key;

-- Re-add unique only for non-null user_id pairs (partial index)
create unique index if not exists idx_trip_members_trip_user_unique
  on trip_members (trip_id, user_id)
  where user_id is not null;

-- Profile fields
alter table trip_members
  add column if not exists display_name text,
  add column if not exists avatar_url text,
  add column if not exists bio_blurb text check (bio_blurb is null or char_length(bio_blurb) <= 280),
  add column if not exists fun_fact text check (fun_fact is null or char_length(fun_fact) <= 280),
  add column if not exists onboarding_prompt_answer text check (onboarding_prompt_answer is null or char_length(onboarding_prompt_answer) <= 140),
  add column if not exists onboarding_completed boolean not null default false,
  -- UUID stored in the guest's localStorage — acts as their session token for this trip
  add column if not exists local_storage_token uuid not null default gen_random_uuid();

-- Unique token index — used to look up identity from localStorage
create unique index if not exists idx_trip_members_token
  on trip_members (local_storage_token);

-- Invited editors (pre-feature) already belong to the trip — show them in "Who are you?"
update trip_members set onboarding_completed = true where user_id is not null;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. daily_logs — one row per member per day
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists daily_logs (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  member_id uuid not null references trip_members (id) on delete cascade,
  log_date date not null,
  steps_count integer,
  mood_score smallint check (mood_score is null or (mood_score between 1 and 5)),
  best_food_text text,
  best_food_photo_url text,
  worst_food_text text,
  funniest_moment text check (funniest_moment is null or char_length(funniest_moment) <= 280),
  custom_prompt_answer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, member_id, log_date)
);

create index if not exists idx_daily_logs_trip on daily_logs (trip_id);
create index if not exists idx_daily_logs_member on daily_logs (member_id);
create index if not exists idx_daily_logs_date on daily_logs (log_date);

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. trips — onboarding prompts + custom daily log prompt
-- ──────────────────────────────────────────────────────────────────────────────

alter table trips
  add column if not exists onboarding_prompts jsonb not null default '{
    "prompt_1": "What are you most excited about?",
    "prompt_2": "What is your one must-eat on this trip?",
    "fun_fact": "Most likely to _____ on this trip?"
  }'::jsonb,
  add column if not exists daily_log_prompt text;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. journal_photos — receipt flag
-- ──────────────────────────────────────────────────────────────────────────────

alter table journal_photos
  add column if not exists is_receipt boolean not null default false;

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. RLS for daily_logs
-- ──────────────────────────────────────────────────────────────────────────────

alter table daily_logs enable row level security;

-- Trip owner can read all daily_logs for their trip (needed for Wrapped generation)
create policy "Daily logs readable by trip owner"
  on daily_logs for select
  using (
    exists (
      select 1 from trips t
      where t.id = daily_logs.trip_id
      and t.owner_id = auth.uid()
    )
  );

-- Members with an auth session can read their own rows
create policy "Daily logs readable by authenticated member"
  on daily_logs for select
  using (
    exists (
      select 1 from trip_members m
      where m.id = daily_logs.member_id
      and m.user_id = auth.uid()
    )
  );

-- Trip owner can insert/update any daily_log (for testing / admin)
create policy "Daily logs insertable by trip owner"
  on daily_logs for insert
  with check (
    exists (
      select 1 from trips t
      where t.id = daily_logs.trip_id
      and t.owner_id = auth.uid()
    )
  );

-- Authenticated member inserts/updates their own rows
create policy "Daily logs insertable by authenticated member"
  on daily_logs for insert
  with check (
    exists (
      select 1 from trip_members m
      where m.id = daily_logs.member_id
      and m.user_id = auth.uid()
    )
  );

create policy "Daily logs updatable by trip owner"
  on daily_logs for update
  using (
    exists (
      select 1 from trips t
      where t.id = daily_logs.trip_id
      and t.owner_id = auth.uid()
    )
  );

create policy "Daily logs updatable by authenticated member"
  on daily_logs for update
  using (
    exists (
      select 1 from trip_members m
      where m.id = daily_logs.member_id
      and m.user_id = auth.uid()
    )
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. RLS updates for trip_members — allow anon/guest reads via collab trips
--    and allow guests to insert their own new member row
-- ──────────────────────────────────────────────────────────────────────────────

-- Drop old overly-restrictive policies that relied on user_id = auth.uid()
drop policy if exists "Trip members visible to owner and members" on trip_members;
drop policy if exists "Trip owner manages members" on trip_members;

-- Anyone can read trip_members for collaboration-enabled trips (guests need to see the list)
create policy "Trip members readable for collab trips"
  on trip_members for select
  using (
    exists (
      select 1 from trips t
      where t.id = trip_members.trip_id
      and (
        t.owner_id = auth.uid()
        or t.collaboration_enabled = true
      )
    )
    or (user_id is not null and user_id = auth.uid())
  );

-- Guests (anon) can insert a new member row for a collab-enabled trip
create policy "Guest can join collab trip"
  on trip_members for insert
  with check (
    exists (
      select 1 from trips t
      where t.id = trip_members.trip_id
      and t.collaboration_enabled = true
      and t.collaborate_token is not null
    )
  );

-- Owner can still insert members (original owner-manages policy)
create policy "Trip owner manages members"
  on trip_members for insert
  with check (
    exists (select 1 from trips t where t.id = trip_members.trip_id and t.owner_id = auth.uid())
  );

-- Members can update their own profile fields (display_name, avatar_url, bio_blurb, etc.)
create policy "Member updates own profile"
  on trip_members for update
  using (
    (user_id is not null and user_id = auth.uid())
    or exists (select 1 from trips t where t.id = trip_members.trip_id and t.owner_id = auth.uid())
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- 7. RPC: look up a trip_member by their local_storage_token (guest identity)
--    Returns the member row for any collab-enabled trip that matches the token.
-- ──────────────────────────────────────────────────────────────────────────────

create or replace function public.resolve_member_token(p_token uuid)
returns table (
  id uuid,
  trip_id uuid,
  display_name text,
  avatar_url text,
  bio_blurb text,
  fun_fact text,
  onboarding_prompt_answer text,
  onboarding_completed boolean,
  local_storage_token uuid,
  user_id uuid,
  role trip_member_role
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.trip_id,
    m.display_name,
    m.avatar_url,
    m.bio_blurb,
    m.fun_fact,
    m.onboarding_prompt_answer,
    m.onboarding_completed,
    m.local_storage_token,
    m.user_id,
    m.role
  from trip_members m
  join trips t on t.id = m.trip_id
  where m.local_storage_token = p_token
  and t.collaboration_enabled = true
  limit 1;
$$;

grant execute on function public.resolve_member_token(uuid) to anon, authenticated;

-- Guest daily_logs read/write via member token (anon has no auth.uid())
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
  custom_prompt_answer text
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
    d.custom_prompt_answer
  from daily_logs d
  join trip_members m on m.id = d.member_id
  join trips t on t.id = d.trip_id
  where m.local_storage_token = p_token
    and d.log_date = p_log_date
    and t.collaboration_enabled = true
  limit 1;
$$;

grant execute on function public.guest_get_daily_log(uuid, date) to anon, authenticated;

create or replace function public.guest_upsert_daily_log(
  p_token uuid,
  p_log_date date,
  p_steps_count integer,
  p_mood_score smallint,
  p_best_food_text text,
  p_worst_food_text text,
  p_funniest_moment text,
  p_custom_prompt_answer text
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
    updated_at = now();
end;
$$;

grant execute on function public.guest_upsert_daily_log(uuid, date, integer, smallint, text, text, text, text) to anon, authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- 8. Storage bucket for member avatars (public read so avatars show everywhere)
-- ──────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('member-avatars', 'member-avatars', true)
on conflict (id) do nothing;

create policy "Member avatar upload"
  on storage.objects for insert
  with check (bucket_id = 'member-avatars');

create policy "Member avatar read"
  on storage.objects for select
  using (bucket_id = 'member-avatars');

create policy "Member avatar delete"
  on storage.objects for delete
  using (bucket_id = 'member-avatars');
