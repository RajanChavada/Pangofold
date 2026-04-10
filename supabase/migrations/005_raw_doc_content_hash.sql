-- Skip expensive re-parse when Google Doc text is unchanged (hash compare)
alter table trips
  add column if not exists raw_doc_content_hash text;
