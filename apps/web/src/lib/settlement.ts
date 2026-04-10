import type { JournalEntry, SettlementTransfer } from "@pangofold/shared";

function personDisplayKey(e: JournalEntry): string {
  const n = e.loggedByName?.trim();
  if (n) return n;
  if (e.authorId) return `Member ${e.authorId.slice(0, 8)}`;
  return "Guest";
}

function payerKey(e: JournalEntry): string {
  const paid = e.paidByName?.trim();
  if (paid) return paid;
  return personDisplayKey(e);
}

/** Build roster of names appearing in entries (loggers + payers). */
export function buildSettlementRoster(entries: JournalEntry[]): string[] {
  const s = new Set<string>();
  for (const e of entries) {
    s.add(personDisplayKey(e));
    if (e.paidByName?.trim()) s.add(e.paidByName.trim());
  }
  return [...s].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

/**
 * Net balances then greedy min-cash-flow settlement (Splitwise-style).
 * Equal / group_split: each person owes amount/splitBetween except payer fronts the bill.
 */
export function computeSettlement(entries: JournalEntry[]): SettlementTransfer[] {
  const roster = buildSettlementRoster(entries);
  if (roster.length === 0) return [];

  const balance = new Map<string, number>();
  for (const n of roster) balance.set(n, 0);

  const ensure = (name: string) => {
    if (!balance.has(name)) balance.set(name, 0);
  };

  for (const e of entries) {
    if (e.amountCents == null || e.amountCents <= 0) continue;
    const mode = e.splitMode ?? "equal";
    const n = Math.max(1, e.splitBetween ?? 1);
    const amount = e.amountCents;
    const share = Math.round(amount / n);
    const payer = payerKey(e);

    if (mode === "full_amount") {
      ensure(payer);
      balance.set(payer, (balance.get(payer) ?? 0) + amount);
      continue;
    }

    ensure(payer);
    balance.set(payer, (balance.get(payer) ?? 0) + amount);
    balance.set(payer, (balance.get(payer) ?? 0) - share);

    const others = roster.filter((x) => x !== payer).sort();
    let need = n - 1;
    let i = 0;
    while (need > 0) {
      const name = i < others.length ? others[i]! : `Group (+${need})`;
      ensure(name);
      balance.set(name, (balance.get(name) ?? 0) - share);
      need--;
      i++;
    }
  }

  const creditors: { name: string; c: number }[] = [];
  const debtors: { name: string; d: number }[] = [];
  for (const [name, b] of balance) {
    if (b > 1) creditors.push({ name, c: b });
    else if (b < -1) debtors.push({ name, d: -b });
  }
  creditors.sort((a, b) => b.c - a.c);
  debtors.sort((a, b) => b.d - a.d);

  const out: SettlementTransfer[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const pay = Math.min(creditors[ci]!.c, debtors[di]!.d);
    if (pay > 0) {
      out.push({
        from: debtors[di]!.name,
        to: creditors[ci]!.name,
        amountCents: Math.round(pay),
      });
    }
    creditors[ci]!.c -= pay;
    debtors[di]!.d -= pay;
    if (creditors[ci]!.c < 1) ci++;
    if (debtors[di]!.d < 1) di++;
  }

  return out;
}
