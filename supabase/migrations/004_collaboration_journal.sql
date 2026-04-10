-- Collaboration tokens, guest journal fields, trip cover storage, journal read for collab trips

-- Trips: share link secret + toggle
alter table trips
  add column if not exists collaborate_token text unique,
  add column if not exists collaboration_enabled boolean not null default false;

create index if not exists idx_trips_collaborate_token on trips (collaborate_token) where collaborate_token is not null;

-- Journal: guest-friendly attribution (author_id null for Edge-inserted guest logs)
alter table journal_entries
  add column if not exists logged_by_name text,
  add column if not exists paid_by_name text,
  add column if not exists split_mode text not null default 'equal'
    check (split_mode in ('equal', 'full_amount', 'group_split'));

-- Allow null author_id for guest rows (FK recreated)
alter table journal_entries drop constraint if exists journal_entries_author_id_fkey;

alter table journal_entries
  alter column author_id drop not null;

alter table journal_entries
  add constraint journal_entries_author_id_fkey
  foreign key (author_id) references auth.users (id) on delete set null;

alter table journal_entries drop constraint if exists journal_entries_author_or_name;
alter table journal_entries
  add constraint journal_entries_author_or_name check (
    author_id is not null
    or (logged_by_name is not null and length(trim(logged_by_name)) > 0)
  );

-- Anyone can read journals for trips where collaboration is enabled (link is the gate for sharing)
create policy "Journal select for collaboration trips"
  on journal_entries for select
  using (
    exists (
      select 1 from trips t
      where t.id = journal_entries.trip_id
      and t.collaboration_enabled = true
      and t.collaborate_token is not null
    )
  );

-- Guest/anonymous readers need photo rows when journal is visible on collab trips
create policy "Journal photos select for collaboration trips"
  on journal_photos for select
  using (
    exists (
      select 1 from journal_entries e
      join trips t on t.id = e.trip_id
      where e.id = journal_photos.entry_id
      and t.collaboration_enabled = true
      and t.collaborate_token is not null
    )
  );

-- Trip covers bucket (public read for hero images)
insert into storage.buckets (id, name, public)
values ('trip-covers', 'trip-covers', true)
on conflict (id) do nothing;

create policy "Trip cover upload for owner"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'trip-covers'
    and exists (
      select 1 from trips t
      where t.id::text = split_part(name, '/', 1)
      and t.owner_id = auth.uid()
    )
  );

create policy "Trip cover read"
  on storage.objects for select
  using (bucket_id = 'trip-covers');

create policy "Trip cover delete for owner"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'trip-covers'
    and exists (
      select 1 from trips t
      where t.id::text = split_part(name, '/', 1)
      and t.owner_id = auth.uid()
    )
  );

-- Allow anyone to read journal-photos objects for trips with collaboration enabled (link gates writes)
create policy "Journal photos read for collaboration trips"
  on storage.objects for select
  using (
    bucket_id = 'journal-photos'
    and exists (
      select 1 from trips t
      where t.id::text = split_part(name, '/', 1)
      and t.collaboration_enabled = true
      and t.collaborate_token is not null
    )
  );

-- Owner-only: fetch collaboration token/settings without exposing them via public trips SELECT
create or replace function public.trip_collab_settings_for_owner(p_trip_id uuid)
returns table (collaboration_enabled boolean, collaborate_token text)
language sql
security definer
set search_path = public
stable
as $$
  select t.collaboration_enabled, t.collaborate_token
  from trips t
  where t.id = p_trip_id and t.owner_id = auth.uid();
$$;

grant execute on function public.trip_collab_settings_for_owner(uuid) to authenticated;

-- Validate collab link without exposing the stored token to clients listing trips
create or replace function public.verify_trip_collab_token(p_trip_id uuid, p_token text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from trips t
    where t.id = p_trip_id
    and t.collaboration_enabled = true
    and t.collaborate_token is not null
    and t.collaborate_token = p_token
  );
$$;

grant execute on function public.verify_trip_collab_token(uuid, text) to anon, authenticated;
