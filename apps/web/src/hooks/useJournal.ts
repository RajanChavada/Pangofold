import { useEffect, useState, useCallback } from "react";
import type {
  JournalEntry,
  JournalPhoto,
  JournalSpendingCategory,
  JournalSplitMode,
} from "@pangofold/shared";
import { supabase } from "../lib/supabase";

function snakeToCamel<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}

async function signPhotoPaths(paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const p of paths) {
    const { data, error } = await supabase.storage.from("journal-photos").createSignedUrl(p, 3600);
    if (!error && data?.signedUrl) map.set(p, data.signedUrl);
  }
  return map;
}

export function useJournal(tripId: string | undefined) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tripId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: rows, error: qErr } = await supabase
        .from("journal_entries")
        .select("*, journal_photos(*)")
        .eq("trip_id", tripId)
        .order("logged_at", { ascending: false });

      if (qErr) throw qErr;

      const paths: string[] = [];
      const mapped: JournalEntry[] = [];

      for (const raw of rows || []) {
        const { journal_photos: photosRaw, ...rest } = raw as Record<string, unknown>;
        const entry = snakeToCamel(rest as Record<string, unknown>) as unknown as JournalEntry;
        const photoRows = (photosRaw as Record<string, unknown>[]) || [];
        const photos: JournalPhoto[] = [];
        for (const pr of photoRows.sort(
          (a, b) => (a.sort_order as number) - (b.sort_order as number),
        )) {
          const ph = snakeToCamel(pr as Record<string, unknown>) as unknown as JournalPhoto;
          paths.push(ph.storagePath);
          photos.push(ph);
        }
        entry.photos = photos;
        mapped.push(entry);
      }

      const urlMap = await signPhotoPaths(paths);
      for (const e of mapped) {
        e.photos = (e.photos || []).map((p: JournalPhoto) => ({
          ...p,
          publicUrl: urlMap.get(p.storagePath) ?? null,
        }));
      }

      setEntries(mapped);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load journal");
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!tripId) return;
    const ch = supabase
      .channel(`journal-${tripId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "journal_entries", filter: `trip_id=eq.${tripId}` },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [tripId, load]);

  const createEntry = useCallback(
    async (input: {
      itineraryItemId?: string | null;
      title: string;
      note?: string;
      rating?: number | null;
      amountCents?: number | null;
      currency?: string;
      category?: JournalSpendingCategory | null;
      splitBetween?: number;
      splitMode?: JournalSplitMode;
      loggedByName?: string;
      paidByName?: string | null;
      lat?: number | null;
      lng?: number | null;
      files?: File[];
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !tripId) throw new Error("Not signed in");

      const split = input.splitBetween ?? 1;
      const mode: JournalSplitMode = input.splitMode ?? "equal";
      const display =
        input.loggedByName?.trim() ||
        (user.email?.split("@")[0] ?? "").trim() ||
        "Traveler";

      const { data: inserted, error: insErr } = await supabase
        .from("journal_entries")
        .insert({
          trip_id: tripId,
          author_id: user.id,
          logged_by_name: display.slice(0, 120),
          paid_by_name: input.paidByName?.trim()?.slice(0, 120) ?? null,
          split_mode: mode,
          itinerary_item_id: input.itineraryItemId ?? null,
          title: input.title,
          note: input.note ?? null,
          rating: input.rating ?? null,
          amount_cents: input.amountCents ?? null,
          currency: input.currency ?? "USD",
          category: input.category ?? null,
          split_between: split,
          lat: input.lat ?? null,
          lng: input.lng ?? null,
        })
        .select()
        .single();

      if (insErr) throw insErr;

      const entryId = inserted.id as string;
      const files = input.files || [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${tripId}/${entryId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("journal-photos").upload(path, file, {
          upsert: false,
        });
        if (upErr) throw upErr;
        await supabase.from("journal_photos").insert({
          entry_id: entryId,
          storage_path: path,
          sort_order: i,
        });
      }

      await load();
      return entryId;
    },
    [tripId, load],
  );

  return { entries, loading, error, refetch: load, createEntry };
}
