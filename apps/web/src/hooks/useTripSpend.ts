import { useMemo } from "react";
import type { JournalEntry } from "@pangofold/shared";

/** Running totals from journal amounts (logged_at date for day scope). */
export function useTripSpend(entries: JournalEntry[], dayDate: string | undefined) {
  return useMemo(() => {
    let tripTotalCents = 0;
    let dayTotalCents = 0;
    const dayKey = dayDate?.trim();
    for (const e of entries) {
      if (e.amountCents == null) continue;
      tripTotalCents += e.amountCents;
      if (dayKey && e.loggedAt?.slice(0, 10) === dayKey) {
        dayTotalCents += e.amountCents;
      }
    }
    return { tripTotalCents, dayTotalCents };
  }, [entries, dayDate]);
}
