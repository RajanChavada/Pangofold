-- Pangofold expansion: upsert key, places, journal, members, reports, structured costs

-- Enums
create type trip_phase as enum ('planning', 'active', 'completed');
create type item_cost_unit as enum ('per_person', 'total', 'unknown');
create type journal_spending_category as enum ('food', 'transport', 'activities', 'accommodation', 'other');
create type trip_member_role as enum ('viewer', 'editor');

-- Existing rows may duplicate (owner_id, source_doc_url) from before upsert logic — remove dupes first.
-- Keep the newest trip per key (latest created_at); cascades remove child rows on deleted trips.
delete from trips t
where t.id in (
  select id from (
    select id,
      row_number() over (
        partition by owner_id, source_doc_url
        order by created_at desc nulls last, id desc
      ) as rn
    from trips
    where source_doc_url is not null
  ) sub
  where sub.rn > 1
);

-- One trip per owner per Google Doc URL (re-parse updates in place)
create unique index if not exists idx_trips_owner_source_doc
  on trips (owner_id, source_doc_url)
  where source_doc_url is not null;

alter table trips
  add column if not exists phase trip_phase not null default 'planning',
  add column if not exists default_split_count int not null default 1
    check (default_split_count >= 1);

-- Resolved place cache (Google Places / geocoding)
create table if not exists places (
  id uuid primary key default gen_random_uuid(),
  google_place_id text unique,
  display_name text not null,
  formatted_address text,
  lat double precision,
  lng double precision,
  rating numeric(4, 2),
  hours_json jsonb,
  photo_refs text[],
  raw_query text,
  created_at timestamptz not null default now()
);

create index if not exists idx_places_google on places (google_place_id);

alter table itinerary_items
  add column if not exists place_id uuid references places (id) on delete set null,
  add column if not exists cost_amount numeric,
  add column if not exists cost_unit item_cost_unit not null default 'unknown',
  add column if not exists time_minutes int;

alter table food_spots
  add column if not exists place_id uuid references places (id) on delete set null;

alter table activities
  add column if not exists place_id uuid references places (id) on delete set null;

-- Journal
create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  itinerary_item_id uuid references itinerary_items (id) on delete set null,
  place_id uuid references places (id) on delete set null,
  title text not null,
  note text,
  rating smallint,
  amount_cents bigint,
  currency text not null default 'USD',
  category journal_spending_category,
  split_between int not null default 1 check (split_between >= 1),
  logged_at timestamptz not null default now(),
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now(),
  constraint journal_rating_range check (rating is null or (rating >= 1 and rating <= 5))
);

create index if not exists idx_journal_trip on journal_entries (trip_id);
create index if not exists idx_journal_author on journal_entries (author_id);
create index if not exists idx_journal_logged on journal_entries (logged_at);

create table if not exists journal_photos (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references journal_entries (id) on delete cascade,
  storage_path text not null,
  sort_order int not null default 0,
  caption text
);

create index if not exists idx_journal_photos_entry on journal_photos (entry_id);

-- Group collaboration
create table if not exists trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role trip_member_role not null default 'editor',
  invited_email text,
  created_at timestamptz not null default now(),
  unique (trip_id, user_id)
);

create index if not exists idx_trip_members_trip on trip_members (trip_id);
create index if not exists idx_trip_members_user on trip_members (user_id);

-- Post-trip report snapshots
create table if not exists trip_reports (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_trip_reports_trip on trip_reports (trip_id);

-- RLS: places — public read (place metadata); writes via service role in Edge Functions
alter table places enable row level security;

create policy "Places are readable by anyone"
  on places for select
  using (true);

-- Journal: owner or trip member
alter table journal_entries enable row level security;
alter table journal_photos enable row level security;

create policy "Journal select for owner and members"
  on journal_entries for select
  using (
    exists (select 1 from trips t where t.id = journal_entries.trip_id and t.owner_id = auth.uid())
    or exists (
      select 1 from trip_members m
      where m.trip_id = journal_entries.trip_id and m.user_id = auth.uid()
    )
  );

create policy "Journal insert for owner and editors"
  on journal_entries for insert
  with check (
    author_id = auth.uid()
    and (
      exists (select 1 from trips t where t.id = journal_entries.trip_id and t.owner_id = auth.uid())
      or exists (
        select 1 from trip_members m
        where m.trip_id = journal_entries.trip_id and m.user_id = auth.uid() and m.role = 'editor'
      )
    )
  );

create policy "Journal update for owner and editors"
  on journal_entries for update
  using (
    exists (select 1 from trips t where t.id = journal_entries.trip_id and t.owner_id = auth.uid())
    or exists (
      select 1 from trip_members m
      where m.trip_id = journal_entries.trip_id and m.user_id = auth.uid() and m.role = 'editor'
    )
  );

create policy "Journal delete for owner and editors"
  on journal_entries for delete
  using (
    exists (select 1 from trips t where t.id = journal_entries.trip_id and t.owner_id = auth.uid())
    or exists (
      select 1 from trip_members m
      where m.trip_id = journal_entries.trip_id and m.user_id = auth.uid() and m.role = 'editor'
    )
  );

create policy "Journal photos select"
  on journal_photos for select
  using (
    exists (
      select 1 from journal_entries e
      where e.id = journal_photos.entry_id
      and (
        exists (select 1 from trips t where t.id = e.trip_id and t.owner_id = auth.uid())
        or exists (select 1 from trip_members m where m.trip_id = e.trip_id and m.user_id = auth.uid())
      )
    )
  );

create policy "Journal photos insert"
  on journal_photos for insert
  with check (
    exists (
      select 1 from journal_entries e
      where e.id = journal_photos.entry_id
      and (
        exists (select 1 from trips t where t.id = e.trip_id and t.owner_id = auth.uid())
        or exists (
          select 1 from trip_members m
          where m.trip_id = e.trip_id and m.user_id = auth.uid() and m.role = 'editor'
        )
      )
    )
  );

create policy "Journal photos delete"
  on journal_photos for delete
  using (
    exists (
      select 1 from journal_entries e
      where e.id = journal_photos.entry_id
      and (
        exists (select 1 from trips t where t.id = e.trip_id and t.owner_id = auth.uid())
        or exists (
          select 1 from trip_members m
          where m.trip_id = e.trip_id and m.user_id = auth.uid() and m.role = 'editor'
        )
      )
    )
  );

-- Trip members
alter table trip_members enable row level security;

create policy "Trip members visible to owner and members"
  on trip_members for select
  using (
    exists (select 1 from trips t where t.id = trip_members.trip_id and t.owner_id = auth.uid())
    or user_id = auth.uid()
  );

create policy "Trip owner manages members"
  on trip_members for insert
  with check (
    exists (select 1 from trips t where t.id = trip_members.trip_id and t.owner_id = auth.uid())
  );

create policy "Trip owner updates members"
  on trip_members for update
  using (
    exists (select 1 from trips t where t.id = trip_members.trip_id and t.owner_id = auth.uid())
  );

create policy "Trip owner removes members"
  on trip_members for delete
  using (
    exists (select 1 from trips t where t.id = trip_members.trip_id and t.owner_id = auth.uid())
  );

-- Trip reports: owner + members read; owner generates (insert) — use owner-only insert for simplicity
alter table trip_reports enable row level security;

create policy "Trip reports read owner and members"
  on trip_reports for select
  using (
    exists (select 1 from trips t where t.id = trip_reports.trip_id and t.owner_id = auth.uid())
    or exists (select 1 from trip_members m where m.trip_id = trip_reports.trip_id and m.user_id = auth.uid())
  );

create policy "Trip reports insert owner"
  on trip_reports for insert
  with check (
    exists (select 1 from trips t where t.id = trip_reports.trip_id and t.owner_id = auth.uid())
  );

-- Storage bucket for journal photos
insert into storage.buckets (id, name, public)
values ('journal-photos', 'journal-photos', false)
on conflict (id) do nothing;

-- Storage policies: path = {trip_id}/{entry_id}/{filename}
create policy "Journal photos upload for trip owner and editors"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'journal-photos'
    and exists (
      select 1 from trips t
      where t.id::text = split_part(name, '/', 1)
      and (
        t.owner_id = auth.uid()
        or exists (
          select 1 from trip_members m
          where m.trip_id = t.id and m.user_id = auth.uid() and m.role = 'editor'
        )
      )
    )
  );

create policy "Journal photos read for owner and members"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'journal-photos'
    and exists (
      select 1 from trips t
      where t.id::text = split_part(name, '/', 1)
      and (
        t.owner_id = auth.uid()
        or exists (select 1 from trip_members m where m.trip_id = t.id and m.user_id = auth.uid())
      )
    )
  );

create policy "Journal photos delete for owner and editors"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'journal-photos'
    and exists (
      select 1 from trips t
      where t.id::text = split_part(name, '/', 1)
      and (
        t.owner_id = auth.uid()
        or exists (
          select 1 from trip_members m
          where m.trip_id = t.id and m.user_id = auth.uid() and m.role = 'editor'
        )
      )
    )
  );

-- Enable Realtime for journal_entries in Supabase Dashboard → Database → Replication, or:
-- alter publication supabase_realtime add table journal_entries;
