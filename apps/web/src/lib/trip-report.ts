import type {
  Trip,
  JournalEntry,
  JournalSpendingCategory,
  ItineraryItem,
  TripReportPayload,
  PersonTripStats,
  SuperlativeId,
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

/** Stable display key for leaderboard rows (guest logs, collaborators, legacy author-only). */
export function personDisplayKey(e: JournalEntry): string {
  const n = e.loggedByName?.trim();
  if (n) return n;
  if (e.authorId) return `Member ${e.authorId.slice(0, 8)}`;
  return "Guest";
}

/**
 * Spend share attributed to the person who logged the entry (equal / group_split).
 * "Full amount" bills are attributed to paid_by_name when set, else the logger.
 */
function attributedShareCents(e: JournalEntry): number {
  if (e.amountCents == null) return 0;
  const mode = e.splitMode ?? "equal";
  const split = Math.max(1, e.splitBetween ?? 1);
  if (mode === "full_amount") {
    return e.amountCents;
  }
  return Math.round(e.amountCents / split);
}

/** Who paid the tab (for High Roller). */
function payerKey(e: JournalEntry): string {
  const paid = e.paidByName?.trim();
  if (paid) return paid;
  return personDisplayKey(e);
}

function payerSpendCents(e: JournalEntry): number {
  if (e.amountCents == null) return 0;
  const mode = e.splitMode ?? "equal";
  if (mode === "full_amount") return e.amountCents;
  const split = Math.max(1, e.splitBetween ?? 1);
  return Math.round(e.amountCents / split);
}

function historianScore(e: JournalEntry): number {
  const noteLen = (e.note ?? "").trim().length;
  const photos = e.photos?.length ?? 0;
  return noteLen + photos * 120;
}

function pickTopName(scores: Map<string, number>): string | null {
  const ranked = [...scores.entries()].filter(([, s]) => s > 0);
  if (ranked.length === 0) return null;
  ranked.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return ranked[0]![0];
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
  rated.sort(
    (a, b) =>
      (b.rating ?? 0) - (a.rating ?? 0) ||
      new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime(),
  );
  const bestRated =
    rated.length > 0
      ? { entryId: rated[0]!.id, title: rated[0]!.title, rating: rated[0]!.rating ?? 0 }
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

  // --- Per-person stats & superlatives (deterministic tie-break: lexicographic name) ---
  const statsMap = new Map<string, PersonTripStats>();
  const foodieScores = new Map<string, number>();
  const highRollerScores = new Map<string, number>();
  const historianScores = new Map<string, number>();
  const navigatorScores = new Map<string, number>();

  function bump(name: string, fn: (s: PersonTripStats) => void) {
    let row = statsMap.get(name);
    if (!row) {
      row = {
        name,
        attributedSpendCents: 0,
        logCount: 0,
        photoCount: 0,
        foodLogCount: 0,
      };
      statsMap.set(name, row);
    }
    fn(row);
  }

  function isFoodLog(e: JournalEntry): boolean {
    if (e.category === "food") return true;
    if (e.itineraryItemId) {
      const linked = itemById.get(e.itineraryItemId);
      return categoryFromItem(linked?.category) === "food";
    }
    return false;
  }

  for (const e of entries) {
    const who = personDisplayKey(e);
    bump(who, (s) => {
      s.logCount += 1;
      s.photoCount += e.photos?.length ?? 0;
      s.attributedSpendCents += attributedShareCents(e);
      if (isFoodLog(e)) s.foodLogCount += 1;
    });

    if (isFoodLog(e)) {
      foodieScores.set(who, (foodieScores.get(who) ?? 0) + 1);
    }

    const payer = payerKey(e);
    highRollerScores.set(payer, (highRollerScores.get(payer) ?? 0) + payerSpendCents(e));

    historianScores.set(who, (historianScores.get(who) ?? 0) + historianScore(e));

    const navCat = e.category;
    const linkedItem = e.itineraryItemId ? itemById.get(e.itineraryItemId) : undefined;
    const isActivity =
      navCat === "activities" || categoryFromItem(linkedItem?.category) === "activities";
    if (isActivity) {
      navigatorScores.set(who, (navigatorScores.get(who) ?? 0) + 1);
    }
  }

  const perPerson = [...statsMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const superlatives: Record<SuperlativeId, string | null> = {
    foodie: pickTopName(foodieScores),
    highRoller: pickTopName(highRollerScores),
    historian: pickTopName(historianScores),
    navigator: pickTopName(navigatorScores),
  };

  return {
    generatedAt: new Date().toISOString(),
    spendByCategory,
    totalSpendCents,
    bestRated,
    mostExpensiveDay,
    unvisitedItems,
    topPhotoPaths,
    perPerson,
    superlatives,
  };
}
