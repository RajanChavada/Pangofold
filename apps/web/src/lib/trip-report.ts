import type {
  Trip,
  JournalEntry,
  JournalSpendingCategory,
  ItineraryItem,
  TripReportPayload,
} from "@pangofold/shared";

function categoryFromItem(cat: string | undefined): JournalSpendingCategory | "uncategorized" {
  const c = (cat || "").toLowerCase();
  if (c === "food") return "food";
  if (c === "transport") return "transport";
  if (c === "activity") return "activities";
  if (c === "accommodation") return "accommodation";
  return "uncategorized";
}

function collectItems(trip: Trip): ItineraryItem[] {
  const items: ItineraryItem[] = [];
  for (const d of trip.destinations) {
    for (const day of d.days) {
      items.push(...day.items);
    }
  }
  return items;
}

export function buildTripReportPayload(trip: Trip, entries: JournalEntry[]): TripReportPayload {
  const spendByCategory: Record<JournalSpendingCategory | "uncategorized", number> = {
    food: 0,
    transport: 0,
    activities: 0,
    accommodation: 0,
    other: 0,
    uncategorized: 0,
  };

  let totalSpendCents = 0;

  const allItems = collectItems(trip);
  const itemById = new Map(allItems.map((i) => [i.id, i]));

  for (const e of entries) {
    if (e.amountCents == null) continue;
    totalSpendCents += e.amountCents;

    let cat: JournalSpendingCategory | "uncategorized" = e.category ?? "uncategorized";
    if (!e.category && e.itineraryItemId) {
      const linked = itemById.get(e.itineraryItemId);
      cat = categoryFromItem(linked?.category);
    }
    if (cat === "uncategorized") spendByCategory.uncategorized += e.amountCents;
    else spendByCategory[cat] += e.amountCents;
  }

  const rated = entries.filter((e) => e.rating != null && e.rating >= 1);
  rated.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime());
  const bestRated =
    rated.length > 0
      ? { entryId: rated[0].id, title: rated[0].title, rating: rated[0].rating ?? 0 }
      : null;

  const byDay = new Map<string, number>();
  for (const e of entries) {
    if (e.amountCents == null) continue;
    const d = new Date(e.loggedAt);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    byDay.set(key, (byDay.get(key) ?? 0) + e.amountCents);
  }
  let mostExpensiveDay: { date: string; cents: number } | null = null;
  for (const [date, cents] of byDay) {
    if (!mostExpensiveDay || cents > mostExpensiveDay.cents) {
      mostExpensiveDay = { date, cents };
    }
  }

  const loggedItemIds = new Set(
    entries.map((e) => e.itineraryItemId).filter((x): x is string => !!x),
  );
  const tripEnded =
    trip.phase === "completed" ||
    (trip.endDate ? new Date(trip.endDate + "T23:59:59") < new Date() : false);

  const unvisitedItems: { id: string; title: string }[] = [];
  if (tripEnded) {
    for (const item of allItems) {
      if (item.isChecked) continue;
      if (loggedItemIds.has(item.id)) continue;
      unvisitedItems.push({ id: item.id, title: item.title });
    }
  }

  const topPhotoPaths: string[] = [];
  for (const e of entries) {
    for (const p of e.photos || []) {
      if (topPhotoPaths.length >= 9) break;
      topPhotoPaths.push(p.storagePath);
    }
    if (topPhotoPaths.length >= 9) break;
  }

  return {
    generatedAt: new Date().toISOString(),
    spendByCategory,
    totalSpendCents,
    bestRated,
    mostExpensiveDay,
    unvisitedItems,
    topPhotoPaths,
  };
}
