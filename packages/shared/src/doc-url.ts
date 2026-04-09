const GOOGLE_DOC_REGEX = /\/document\/d\/([a-zA-Z0-9_-]+)/;

export function extractGoogleDocId(url: string): string | null {
  const match = url.match(GOOGLE_DOC_REGEX);
  return match ? match[1] : null;
}
