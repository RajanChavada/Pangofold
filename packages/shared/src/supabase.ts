import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Trim keys/URL — pasted env vars often include a trailing newline (%0A), which breaks Realtime WebSockets. */
export function createSupabaseClient(
  url: string,
  anonKey: string,
): SupabaseClient {
  const cleanUrl = url.trim();
  const cleanKey = anonKey.trim().replace(/\r?\n/g, "");
  return createClient(cleanUrl, cleanKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}
