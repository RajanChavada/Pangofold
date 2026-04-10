import { useEffect, useState, useCallback, useMemo } from "react";
import type {
  Trip,
  Destination,
  DayItinerary,
  ItineraryItem,
  FoodSpot,
  Activity,
  Place,
} from "@pangofold/shared";
import { supabase } from "../lib/supabase";

interface UseTripResult {
  trip: Trip | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  toggleItemChecked: (itemId: string, checked: boolean) => Promise<void>;
  updateTripMeta: (patch: { phase?: Trip["phase"]; defaultSplitCount?: number }) => Promise<void>;
}

function snakeToCamel<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}

function mapPlaceRow(row: Record<string, unknown>): Place {
  const p = snakeToCamel(row) as Record<string, unknown>;
  return {
    id: String(p.id),
    googlePlaceId: (p.googlePlaceId as string) ?? null,
    displayName: String(p.displayName ?? ""),
    formattedAddress: (p.formattedAddress as string) ?? null,
    lat: (p.lat as number) ?? null,
    lng: (p.lng as number) ?? null,
    rating: p.rating != null ? Number(p.rating) : null,
    photoRefs: (p.photoRefs as string[]) ?? null,
  };
}

export function useTrip(tripId: string | undefined): UseTripResult {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrip = useCallback(async () => {
    if (!tripId) return;
    setLoading(true);
    setError(null);

    try {
      const { data: tripRow, error: tripErr } = await supabase
        .from("trips")
        .select("*")
        .eq("id", tripId)
        .single();

      if (tripErr) throw tripErr;

      const { data: dests } = await supabase
        .from("destinations")
        .select("*")
        .eq("trip_id", tripId)
        .order("sort_order");

      const placeIds = new Set<string>();
      const destinations: Destination[] = [];

      for (const dest of dests || []) {
        const { data: dayRows } = await supabase
          .from("day_itineraries")
          .select("*")
          .eq("destination_id", dest.id)
          .order("day_number");

        const days: DayItinerary[] = [];
        for (const day of dayRows || []) {
          const { data: items } = await supabase
            .from("itinerary_items")
            .select("*")
            .eq("day_id", day.id)
            .order("sort_order");

          days.push({
            ...(snakeToCamel(day) as unknown as DayItinerary),
            items: (items || []).map((i) => {
              const row = snakeToCamel(i) as unknown as ItineraryItem;
              if (row.placeId) placeIds.add(row.placeId);
              return row;
            }),
          });
        }

        const { data: foodRows } = await supabase
          .from("food_spots")
          .select("*")
          .eq("destination_id", dest.id)
          .order("sort_order");

        for (const f of foodRows || []) {
          const r = snakeToCamel(f) as unknown as FoodSpot;
          if (r.placeId) placeIds.add(r.placeId);
        }

        const { data: actRows } = await supabase
          .from("activities")
          .select("*")
          .eq("destination_id", dest.id)
          .order("sort_order");

        for (const a of actRows || []) {
          const r = snakeToCamel(a) as unknown as Activity;
          if (r.placeId) placeIds.add(r.placeId);
        }

        destinations.push({
          ...(snakeToCamel(dest) as unknown as Destination),
          hotel: dest.hotel_name
            ? { name: dest.hotel_name, address: dest.hotel_address, link: dest.hotel_link }
            : undefined,
          days,
          foodSpots: (foodRows || []).map((f) => snakeToCamel(f) as unknown as FoodSpot),
          activities: (actRows || []).map((a) => snakeToCamel(a) as unknown as Activity),
        });
      }

      const placesMap: Record<string, Place> = {};
      if (placeIds.size > 0) {
        const { data: placeRows } = await supabase
          .from("places")
          .select("*")
          .in("id", [...placeIds]);

        for (const pr of placeRows || []) {
          const pl = mapPlaceRow(pr as unknown as Record<string, unknown>);
          placesMap[pl.id] = pl;
        }
      }

      for (const d of destinations) {
        d.foodSpots = d.foodSpots.map((f) => ({
          ...f,
          place: f.placeId ? placesMap[f.placeId] ?? null : null,
        }));
        d.activities = d.activities.map((a) => ({
          ...a,
          place: a.placeId ? placesMap[a.placeId] ?? null : null,
        }));
        d.days = d.days.map((day) => ({
          ...day,
          items: day.items.map((it) => ({
            ...it,
            place: it.placeId ? placesMap[it.placeId] ?? null : null,
          })),
        }));
      }

      const tr = snakeToCamel(tripRow) as unknown as Trip;

      setTrip({
        ...tr,
        destinations,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trip");
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    fetchTrip();
  }, [fetchTrip]);

  const toggleItemChecked = useCallback(async (itemId: string, checked: boolean) => {
    await supabase
      .from("itinerary_items")
      .update({ is_checked: checked })
      .eq("id", itemId);

    setTrip((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        destinations: prev.destinations.map((d) => ({
          ...d,
          days: d.days.map((day) => ({
            ...day,
            items: day.items.map((item) =>
              item.id === itemId ? { ...item, isChecked: checked } : item,
            ),
          })),
        })),
      };
    });
  }, []);

  const updateTripMeta = useCallback(
    async (patch: { phase?: Trip["phase"]; defaultSplitCount?: number }) => {
      if (!tripId) return;
      const row: Record<string, unknown> = {};
      if (patch.phase !== undefined) row.phase = patch.phase;
      if (patch.defaultSplitCount !== undefined) row.default_split_count = patch.defaultSplitCount;
      if (Object.keys(row).length === 0) return;
      await supabase.from("trips").update(row).eq("id", tripId);
      setTrip((prev) => (prev ? { ...prev, ...patch } : prev));
    },
    [tripId],
  );

  return { trip, loading, error, refetch: fetchTrip, toggleItemChecked, updateTripMeta };
}

export function useTripBySlug(slug: string | undefined): UseTripResult {
  const [tripId, setTripId] = useState<string | undefined>();
  const [slugLoading, setSlugLoading] = useState(true);
  const [slugError, setSlugError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset loading before slug→id fetch
    setSlugLoading(true);
    supabase
      .from("trips")
      .select("id")
      .eq("share_slug", slug)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setSlugError("Trip not found");
        } else {
          setTripId(data.id);
        }
        setSlugLoading(false);
      });
  }, [slug]);

  const result = useTrip(tripId);
  return {
    ...result,
    loading: slugLoading || result.loading,
    error: slugError || result.error,
  };
}

/** Detect overlapping scheduled items on the same day (requires time_minutes from parse). */
export function useScheduleConflicts(dest: Destination | undefined, day: DayItinerary | undefined) {
  return useMemo(() => {
    if (!dest || !day?.items?.length) return [];
    const withTime = day.items
      .filter((i) => i.timeMinutes != null && i.category !== "transport")
      .sort((a, b) => (a.timeMinutes ?? 0) - (b.timeMinutes ?? 0));
    const conflicts: { a: ItineraryItem; b: ItineraryItem }[] = [];
    for (let i = 0; i < withTime.length - 1; i++) {
      const cur = withTime[i];
      const next = withTime[i + 1];
      const c = cur.timeMinutes ?? 0;
      const n = next.timeMinutes ?? 0;
      if (n - c < 30 && n >= c) {
        conflicts.push({ a: cur, b: next });
      }
    }
    return conflicts;
  }, [dest, day]);
}
