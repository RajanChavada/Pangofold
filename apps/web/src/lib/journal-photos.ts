import type { DayItinerary, JournalEntry } from "@pangofold/shared";

/** Entries tied to this day’s itinerary items, or logged on the same calendar day as `day.date`. */
export function journalEntriesForDay(entries: JournalEntry[], day: DayItinerary): JournalEntry[] {
  const itemIds = new Set(day.items.map((i) => i.id));
  const d = day.date;
  return entries.filter((e) => {
    if (e.itineraryItemId && itemIds.has(e.itineraryItemId)) return true;
    if (d && e.loggedAt?.slice(0, 10) === d) return true;
    return false;
  });
}

export function collectPhotosFromEntries(
  entries: JournalEntry[],
): Array<{ url: string; photoId: string; entryId: string }> {
  const out: Array<{ url: string; photoId: string; entryId: string }> = [];
  for (const e of entries) {
    for (const p of e.photos ?? []) {
      if (p.publicUrl) out.push({ url: p.publicUrl, photoId: p.id, entryId: e.id });
    }
  }
  return out;
}
