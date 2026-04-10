-- Run in Supabase SQL Editor if migration 002 failed on idx_trips_owner_source_doc
-- because duplicate (owner_id, source_doc_url) rows already existed.
-- Safe to run multiple times (no dupes => delete affects 0 rows).

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

create unique index if not exists idx_trips_owner_source_doc
  on trips (owner_id, source_doc_url)
  where source_doc_url is not null;
