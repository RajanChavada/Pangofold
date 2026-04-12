import { supabase } from "./supabase";

/** Parse stored `best_food_photo_url`: one URL, or JSON array of URLs. */
export function parseCheckInPhotoUrls(raw: string | null | undefined): string[] {
  if (!raw || !String(raw).trim()) return [];
  const t = String(raw).trim();
  if (t.startsWith("[")) {
    try {
      const a = JSON.parse(t) as unknown;
      if (Array.isArray(a)) return a.filter((x): x is string => typeof x === "string" && x.length > 0);
    } catch {
      return [];
    }
  }
  return [t];
}

/** Store in `best_food_photo_url`: single URL as plain text; multiple as JSON array. */
export function serializeCheckInPhotoUrls(urls: string[]): string | null {
  const u = urls.map((x) => x.trim()).filter(Boolean);
  if (u.length === 0) return null;
  if (u.length === 1) return u[0];
  return JSON.stringify(u);
}

/** Upload one check-in image (public `member-avatars` bucket). */
export async function uploadDailyCheckInPhoto(
  tripId: string,
  memberId: string,
  logDate: string,
  file: File,
  index: number,
): Promise<string | null> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const safeExt = ext.length > 8 ? "jpg" : ext;
  const path = `${tripId}/daily-checkin/${memberId}/${logDate}/${index}.${safeExt}`;
  const { error } = await supabase.storage.from("member-avatars").upload(path, file, {
    upsert: true,
    contentType: file.type || "image/jpeg",
  });
  if (error) {
    console.error("daily check-in photo upload", error);
    return null;
  }
  const { data } = supabase.storage.from("member-avatars").getPublicUrl(path);
  return data.publicUrl ?? null;
}
