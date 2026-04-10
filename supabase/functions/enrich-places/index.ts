import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version, prefer",
  "Access-Control-Max-Age": "86400",
};

const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY") ?? "";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: { tripId?: string; userId?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { tripId, userId } = body;
    if (!tripId || !userId) {
      return new Response(JSON.stringify({ error: "Missing tripId or userId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!GOOGLE_MAPS_API_KEY) {
      return new Response(JSON.stringify({ error: "GOOGLE_MAPS_API_KEY not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user || user.id !== userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: trip, error: tripErr } = await supabase
      .from("trips")
      .select("id, owner_id, title")
      .eq("id", tripId)
      .single();

    if (tripErr || !trip) {
      return new Response(JSON.stringify({ error: "Trip not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isOwner = trip.owner_id === user.id;
    const { data: memberRow } = await supabase
      .from("trip_members")
      .select("id")
      .eq("trip_id", tripId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!isOwner && !memberRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: destinations } = await supabase
      .from("destinations")
      .select("id, name")
      .eq("trip_id", tripId);

    let enriched = 0;

    for (const dest of destinations || []) {
      const ctx = `${dest.name}`;

      const { data: days } = await supabase
        .from("day_itineraries")
        .select("id")
        .eq("destination_id", dest.id);

      for (const day of days || []) {
        const { data: items } = await supabase
          .from("itinerary_items")
          .select("id, title, location, link, place_id")
          .eq("day_id", day.id);

        for (const item of items || []) {
          if (item.place_id) continue;
          const q = buildQuery(item.title, item.location, ctx);
          if (!q) continue;
          const placeId = await findOrCreatePlace(supabase, q);
          if (placeId) {
            await supabase.from("itinerary_items").update({ place_id: placeId }).eq("id", item.id);
            enriched++;
          }
          await delay(120);
        }
      }

      const { data: foods } = await supabase
        .from("food_spots")
        .select("id, name, link, place_id")
        .eq("destination_id", dest.id);

      for (const f of foods || []) {
        if (f.place_id) continue;
        const q = buildQuery(f.name, null, ctx);
        if (!q) continue;
        const placeId = await findOrCreatePlace(supabase, q);
        if (placeId) {
          await supabase.from("food_spots").update({ place_id: placeId }).eq("id", f.id);
          enriched++;
        }
        await delay(120);
      }

      const { data: acts } = await supabase
        .from("activities")
        .select("id, name, location, link, place_id")
        .eq("destination_id", dest.id);

      for (const a of acts || []) {
        if (a.place_id) continue;
        const q = buildQuery(a.name, a.location, ctx);
        if (!q) continue;
        const placeId = await findOrCreatePlace(supabase, q);
        if (placeId) {
          await supabase.from("activities").update({ place_id: placeId }).eq("id", a.id);
          enriched++;
        }
        await delay(120);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, enriched }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function buildQuery(title: string, location: string | null, destName: string): string | null {
  const t = (title || "").trim();
  if (t.length < 2) return null;
  const loc = (location || "").trim();
  return loc ? `${t} ${loc}` : `${t} ${destName}`;
}

async function delay(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

interface PlaceRow {
  id: string;
  google_place_id: string | null;
}

async function findOrCreatePlace(
  supabase: ReturnType<typeof createClient>,
  query: string,
): Promise<string | null> {
  const findUrl =
    `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id,name,formatted_address,geometry,rating,opening_hours,photos&key=${GOOGLE_MAPS_API_KEY}`;

  const findRes = await fetch(findUrl);
  const findJson = await findRes.json();
  const cand = findJson.candidates?.[0];
  if (!cand?.place_id) return null;

  const { data: existing } = await supabase
    .from("places")
    .select("id, google_place_id")
    .eq("google_place_id", cand.place_id)
    .maybeSingle();

  if (existing) return (existing as PlaceRow).id;

  const detUrl =
    `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(cand.place_id)}&fields=name,formatted_address,geometry,rating,opening_hours,photos&key=${GOOGLE_MAPS_API_KEY}`;
  const detRes = await fetch(detUrl);
  const detJson = await detRes.json();
  const r = detJson.result;
  if (!r) return null;

  const lat = r.geometry?.location?.lat ?? null;
  const lng = r.geometry?.location?.lng ?? null;
  const photoRefs = Array.isArray(r.photos)
    ? r.photos.slice(0, 3).map((p: { photo_reference?: string }) => p.photo_reference).filter(Boolean)
    : [];

  const { data: inserted, error } = await supabase
    .from("places")
    .insert({
      google_place_id: cand.place_id,
      display_name: r.name || cand.name || query,
      formatted_address: r.formatted_address ?? null,
      lat,
      lng,
      rating: r.rating ?? null,
      hours_json: r.opening_hours ?? null,
      photo_refs: photoRefs.length ? photoRefs : null,
      raw_query: query,
    })
    .select("id")
    .single();

  if (error) {
    const { data: retry } = await supabase
      .from("places")
      .select("id")
      .eq("google_place_id", cand.place_id)
      .maybeSingle();
    return retry?.id ?? null;
  }

  return inserted?.id ?? null;
}
