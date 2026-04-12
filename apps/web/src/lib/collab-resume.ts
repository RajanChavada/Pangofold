const RESUME_KEY = "pf_resume_collab_href";

/** Remember a verified collaborate invite URL so guests can return after leaving the site. */
export function rememberCollabInviteUrl(href: string): void {
  try {
    const u = new URL(href);
    if (u.origin !== window.location.origin) return;
    if (!u.pathname.includes("/trip/") || !u.pathname.endsWith("/collab")) return;
    if (!u.searchParams.get("token")) return;
    sessionStorage.setItem(RESUME_KEY, href);
  } catch {
    /* ignore */
  }
}

/** Same-origin path + query for React Router, or null if invalid / missing. */
export function getSafeCollabResumePath(): string | null {
  try {
    const raw = sessionStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    const u = new URL(raw);
    if (u.origin !== window.location.origin) return null;
    if (!u.pathname.includes("/trip/") || !u.pathname.endsWith("/collab")) return null;
    if (!u.searchParams.get("token")) return null;
    return `${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

export function clearCollabResume(): void {
  try {
    sessionStorage.removeItem(RESUME_KEY);
  } catch {
    /* ignore */
  }
}

const OAUTH_RESUME_KEY = "pf_oauth_resume_path";
const OAUTH_RESUME_TTL_MS = 20 * 60 * 1000;

/** Before OAuth redirect, stash current trip path so we can return after Google sign-in. */
export function stashPathBeforeOAuth(pathWithQuery: string): void {
  if (!pathWithQuery.startsWith("/trip/")) return;
  try {
    sessionStorage.setItem(
      OAUTH_RESUME_KEY,
      JSON.stringify({ path: pathWithQuery, at: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

export function takeStashedOAuthPath(): string | null {
  try {
    const raw = sessionStorage.getItem(OAUTH_RESUME_KEY);
    sessionStorage.removeItem(OAUTH_RESUME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { path?: string; at?: number };
    const p = parsed.path;
    if (typeof p !== "string" || !p.startsWith("/trip/")) return null;
    if (typeof parsed.at !== "number" || Date.now() - parsed.at > OAUTH_RESUME_TTL_MS) return null;
    return p;
  } catch {
    return null;
  }
}
