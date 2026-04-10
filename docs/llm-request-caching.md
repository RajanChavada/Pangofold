# LLM request optimization (parse pipeline)

## Goals

- Never call the model when the **inputs are unchanged** and you already have a stored result.
- Treat **`trips.raw_doc_text`** (and/or structured snapshot) as the **source of truth** after a successful parse.
- Keep **Places** and **enrichment** on the Edge Function side: dedupe by `google_place_id` in `places` (already implemented).

## Current behavior

- **`fetch-doc`**: Google Docs API — no LLM; only network + deterministic `preParseStructured`.
- **`parse-trip`**: One LLM call per invocation; output is persisted to Postgres. Re-parse of the **same doc URL** upserts the same trip (same `trip_id`) but **re-runs the LLM** every time.

## Recommended layers (in order)

### 1. Document revision / content hash (highest leverage)

- On each parse, compute `sha256(normalized_text)` (or hash of `structured` + title + links).
- Store on `trips`: e.g. `last_parse_content_hash text` (migration).
- Before calling the LLM in `parse-trip`, if `incoming_hash === trips.last_parse_content_hash` for that upsert row, **skip LLM** and return `{ tripId, skipped: true }` or reload existing graph (if you still need to refresh non-LLM fields only).

### 2. Optional parse artifact table

- `trip_parse_runs(trip_id, content_hash, model, parsed_jsonb, created_at)` for audit and **A/B** prompts; optional dedupe: unique `(trip_id, content_hash)`.

### 3. Places / Maps (already mostly cached)

- **`places.google_place_id` unique** + reuse rows; **`enrich-places`** only fills missing `place_id` on items.
- **`fetch-doc` `mapsResolved`**: computed every fetch — cheap vs LLM; could cache by **short URL string** in KV/DB later if needed.

### 4. Rate limits & batching

- Cap `max_tokens` / temperature already set; add **per-user** daily parse budget in Edge Function (env or DB counter) if abuse is a concern.

### 5. When to invalidate cache

- User edits the Google Doc → content hash changes → new LLM parse.
- You change **prompt / model** → bump a **`PARSER_VERSION`** env and include in hash or force re-parse.

## Implementation order

1. Add `last_parse_content_hash` + skip path in **`parse-trip`** (smallest change, biggest savings).
2. Add optional **`trip_parse_runs`** if you want history and easier debugging.
3. Tune hashing: include `MODEL` name in hash bucket if you run multiple models.

## Operational checklist (Vercel / Supabase)

- **`VITE_SUPABASE_ANON_KEY`**: no trailing newline (breaks Realtime `apikey=...%0A`); trim in client is defensive — fix env at source.
- **Edge secrets**: `GOOGLE_MAPS_API_KEY` only on **`enrich-places`**; restrict key to Places API + IP / Supabase egress as allowed by Google.
