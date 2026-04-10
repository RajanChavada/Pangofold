const GOOGLE_DOC_REGEX = /\/document\/d\/([a-zA-Z0-9_-]+)/;

export function extractGoogleDocId(url: string): string | null {
  const match = url.match(GOOGLE_DOC_REGEX);
  return match ? match[1] : null;
}

/** Stable URL for upserts and unique index on (owner_id, source_doc_url). */
export function canonicalGoogleDocUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const id = extractGoogleDocId(raw);
  if (id) return `https://docs.google.com/document/d/${id}/edit`;
  return raw;
}
