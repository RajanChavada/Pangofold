-- Enums
create type item_category as enum ('food', 'activity', 'transport', 'accommodation', 'other');
create type food_type as enum ('restaurant', 'cafe', 'street', 'bakery', 'bar');

-- Trips
create table trips (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  cover_image_url text,
  start_date date,
  end_date date,
  source_doc_url text,
  owner_id uuid references auth.users(id) on delete cascade not null,
  share_slug text unique default encode(gen_random_bytes(6), 'hex'),
  raw_doc_text text,
  created_at timestamptz default now() not null
);

-- Destinations
create table destinations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete cascade not null,
  name text not null,
  duration text,
  hotel_name text,
  hotel_address text,
  hotel_link text,
  sort_order int default 0 not null
);

-- Day itineraries
create table day_itineraries (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid references destinations(id) on delete cascade not null,
  day_number int not null,
  date date
);

-- Itinerary items
create table itinerary_items (
  id uuid primary key default gen_random_uuid(),
  day_id uuid references day_itineraries(id) on delete cascade not null,
  time text,
  title text not null,
  description text,
  category item_category default 'other' not null,
  location text,
  link text,
  cost text,
  is_checked boolean default false not null,
  sort_order int default 0 not null
);

-- Food spots
create table food_spots (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid references destinations(id) on delete cascade not null,
  name text not null,
  type food_type default 'restaurant' not null,
  notes text,
  link text,
  price_range text,
  sort_order int default 0 not null
);

-- Activities
create table activities (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid references destinations(id) on delete cascade not null,
  name text not null,
  notes text,
  cost text,
  link text,
  location text,
  sort_order int default 0 not null
);

-- RLS Policies
alter table trips enable row level security;
alter table destinations enable row level security;
alter table day_itineraries enable row level security;
alter table itinerary_items enable row level security;
alter table food_spots enable row level security;
alter table activities enable row level security;

-- Owner can do everything
create policy "Owner full access" on trips
  for all using (auth.uid() = owner_id);

create policy "Owner full access" on destinations
  for all using (
    trip_id in (select id from trips where owner_id = auth.uid())
  );

create policy "Owner full access" on day_itineraries
  for all using (
    destination_id in (
      select d.id from destinations d
      join trips t on t.id = d.trip_id
      where t.owner_id = auth.uid()
    )
  );

create policy "Owner full access" on itinerary_items
  for all using (
    day_id in (
      select di.id from day_itineraries di
      join destinations d on d.id = di.destination_id
      join trips t on t.id = d.trip_id
      where t.owner_id = auth.uid()
    )
  );

create policy "Owner full access" on food_spots
  for all using (
    destination_id in (
      select d.id from destinations d
      join trips t on t.id = d.trip_id
      where t.owner_id = auth.uid()
    )
  );

create policy "Owner full access" on activities
  for all using (
    destination_id in (
      select d.id from destinations d
      join trips t on t.id = d.trip_id
      where t.owner_id = auth.uid()
    )
  );

-- Public read via share slug (for anon users)
create policy "Public read via share slug" on trips
  for select using (true);

create policy "Public read via shared trip" on destinations
  for select using (true);

create policy "Public read via shared trip" on day_itineraries
  for select using (true);

create policy "Public read via shared trip" on itinerary_items
  for select using (true);

create policy "Public read via shared trip" on food_spots
  for select using (true);

create policy "Public read via shared trip" on activities
  for select using (true);

-- Indexes
create index idx_trips_owner on trips(owner_id);
create index idx_trips_share_slug on trips(share_slug);
create index idx_destinations_trip on destinations(trip_id);
create index idx_day_itineraries_dest on day_itineraries(destination_id);
create index idx_itinerary_items_day on itinerary_items(day_id);
create index idx_food_spots_dest on food_spots(destination_id);
create index idx_activities_dest on activities(destination_id);
