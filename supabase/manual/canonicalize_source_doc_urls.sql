-- One-off helper: normalize Google Doc URLs so (owner_id, source_doc_url) dedupes reliably.
-- Run in SQL editor after backup. Review duplicates before merging rows manually.

-- Preview: doc id extracted from current source_doc_url
-- select id, owner_id, source_doc_url,
--   (substring(source_doc_url from '/document/d/([a-zA-Z0-9_-]+)')) as doc_id
-- from trips where source_doc_url is not null;

-- Example update (uncomment and adjust): set every trip to canonical /edit URL
-- update trips t
-- set source_doc_url = 'https://docs.google.com/document/d/' || sub.cid || '/edit'
-- from (
--   select id,
--     (substring(source_doc_url from '/document/d/([a-zA-Z0-9_-]+)')) as cid
--   from trips
--   where source_doc_url ~ '/document/d/[a-zA-Z0-9_-]+'
-- ) sub
-- where t.id = sub.id;

-- After normalization, find duplicate (owner_id, doc_id) groups:
-- select owner_id,
--   substring(source_doc_url from '/document/d/([a-zA-Z0-9_-]+)') as doc_id,
--   count(*) as n,
--   array_agg(id) as trip_ids
-- from trips
-- where source_doc_url is not null
-- group by 1, 2
-- having count(*) > 1;
