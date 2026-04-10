import { useEffect, useState, useCallback } from "react";
import type { Trip, Destination, DayItinerary, ItineraryItem, FoodSpot, Activity } from "@pangofold/shared";
import { supabase } from "../lib/supabase";

interface UseTripResult {
  trip: Trip | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  toggleItemChecked: (itemId: string, checked: boolean) => Promise<void>;
}

function snakeToCamel<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = value;
  }
  return result;
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
            items: (items || []).map((i) => snakeToCamel(i) as unknown as ItineraryItem),
          });
        }

        const { data: foodRows } = await supabase
          .from("food_spots")
          .select("*")
          .eq("destination_id", dest.id)
          .order("sort_order");

        const { data: actRows } = await supabase
          .from("activities")
          .select("*")
          .eq("destination_id", dest.id)
          .order("sort_order");

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

      setTrip({
        ...(snakeToCamel(tripRow) as unknown as Trip),
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

  return { trip, loading, error, refetch: fetchTrip, toggleItemChecked };
}

export function useTripBySlug(slug: string | undefined): UseTripResult {
  const [tripId, setTripId] = useState<string | undefined>();
  const [slugLoading, setSlugLoading] = useState(true);
  const [slugError, setSlugError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
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
