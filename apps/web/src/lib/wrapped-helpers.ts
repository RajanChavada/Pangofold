import type { JournalEntry, JournalSpendingCategory, ItineraryItem, PersonTripStats } from "@pangofold/shared";
import { personDisplayKey } from "./trip-report";

function categoryFromItem(cat: string | undefined): JournalSpendingCategory | "uncategorized" | "other" {
  const c = (cat || "").toLowerCase();
  if (c === "food") return "food";
  if (c === "transport") return "transport";
  if (c === "activity") return "activities";
  if (c === "accommodation") return "accommodation";
  return "other";
}

/** Best hero image URL for a traveler (first journal photo we can show). */
export function heroPhotoForPerson(entries: JournalEntry[], personName: string): string | null {
  for (const e of entries) {
    if (personDisplayKey(e) !== personName) continue;
    for (const p of e.photos || []) {
      if (p.publicUrl) return p.publicUrl;
    }
  }
  return null;
}

/** Dominant spend category for this person's logs (by raw entry amounts). */
export function topSpendCategoryForPerson(
  entries: JournalEntry[],
  personName: string,
  itemById: Map<string, ItineraryItem>,
): string | null {
  const catTotals = new Map<string, number>();
  for (const e of entries) {
    if (personDisplayKey(e) !== personName) continue;
    if (e.amountCents == null || e.amountCents <= 0) continue;
    let cat = (e.category as string) || "other";
    if (!e.category && e.itineraryItemId) {
      const linked = itemById.get(e.itineraryItemId);
      cat = linked ? categoryFromItem(linked.category) : "other";
    }
    catTotals.set(cat, (catTotals.get(cat) ?? 0) + e.amountCents);
  }
  let best: { k: string; v: number } | null = null;
  for (const [k, v] of catTotals) {
    if (!best || v > best.v) best = { k, v };
  }
  if (!best || best.v <= 0) return null;
  const label =
    best.k === "activities"
      ? "Activities"
      : best.k === "accommodation"
        ? "Stay"
        : best.k.charAt(0).toUpperCase() + best.k.slice(1);
  return label;
}

export function collectItemMap(trip: { destinations: { days: { items: ItineraryItem[] }[] }[] }): Map<string, ItineraryItem> {
  const m = new Map<string, ItineraryItem>();
  for (const d of trip.destinations) {
    for (const day of d.days) {
      for (const it of day.items) m.set(it.id, it);
    }
  }
  return m;
}

/** Pick diverse journal photos for a collage (up to n). */
export function journalPhotoUrls(entries: JournalEntry[], max = 6): string[] {
  const out: string[] = [];
  for (const e of entries) {
    for (const p of e.photos || []) {
      if (p.publicUrl && out.length < max) out.push(p.publicUrl);
    }
    if (out.length >= max) break;
  }
  return out;
}

export function personSuperlatives(
  name: string,
  superlatives: Record<string, string | null>,
): string[] {
  const labels: Record<string, string> = {
    foodie: "The Foodie",
    highRoller: "High Roller",
    historian: "The Historian",
    navigator: "The Navigator",
  };
  const wins: string[] = [];
  for (const [id, winner] of Object.entries(superlatives)) {
    if (winner === name) wins.push(labels[id] ?? id);
  }
  return wins;
}
