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
    const authHeader = req.headers.get("Authorization") ?? "";
    const serviceKeyEnv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const isServiceRole = Boolean(serviceKeyEnv && authHeader === `Bearer ${serviceKeyEnv}`);

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
    const serviceKey = serviceKeyEnv;

    let authorizedUserId: string;

    if (isServiceRole) {
      authorizedUserId = userId;
    } else {
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Missing Authorization" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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
      authorizedUserId = user.id;
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

    if (isServiceRole && trip.owner_id !== userId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isOwner = trip.owner_id === authorizedUserId;
    const { data: memberRow } = await supabase
      .from("trip_members")
      .select("id")
      .eq("trip_id", tripId)
      .eq("user_id", authorizedUserId)
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
    let alreadyLinked = 0;
    let lookupFailed = 0;

    for (const dest of destinations || []) {
      const ctx = `${dest.name}`;
      const regionHint = regionSuffixFromDestination(ctx);

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
          if (item.place_id) {
            alreadyLinked++;
            continue;
          }
          const loc = (item.location || "").trim();
          let placeId = await tryAttachFromMapsLink(supabase, item.link);
          if (!placeId) {
            const queries = buildSearchQueries(item.title, loc || null, ctx, regionHint);
            if (queries.length > 0) {
              placeId = await findOrCreatePlaceWithFallbacks(supabase, queries);
            }
            if (!placeId && loc.length > 2) {
              placeId = await findOrCreatePlaceFromGeocode(supabase, `${loc}${regionHint}`);
            }
          }
          if (placeId) {
            await supabase.from("itinerary_items").update({ place_id: placeId }).eq("id", item.id);
            enriched++;
          } else {
            lookupFailed++;
          }
          await delay(120);
        }
      }

      const { data: foods } = await supabase
        .from("food_spots")
        .select("id, name, link, place_id")
        .eq("destination_id", dest.id);

      for (const f of foods || []) {
        if (f.place_id) {
          alreadyLinked++;
          continue;
        }
        let placeId = await tryAttachFromMapsLink(supabase, f.link);
        if (!placeId) {
          const queries = buildSearchQueries(f.name, null, ctx, regionHint);
          if (queries.length > 0) {
            placeId = await findOrCreatePlaceWithFallbacks(supabase, queries);
          }
        }
        if (placeId) {
          await supabase.from("food_spots").update({ place_id: placeId }).eq("id", f.id);
          enriched++;
        } else {
          lookupFailed++;
        }
        await delay(120);
      }

      const { data: acts } = await supabase
        .from("activities")
        .select("id, name, location, link, place_id")
        .eq("destination_id", dest.id);

      for (const a of acts || []) {
        if (a.place_id) {
          alreadyLinked++;
          continue;
        }
        const aloc = (a.location || "").trim();
        let placeId = await tryAttachFromMapsLink(supabase, a.link);
        if (!placeId) {
          const queries = buildSearchQueries(a.name, aloc || null, ctx, regionHint);
          if (queries.length > 0) {
            placeId = await findOrCreatePlaceWithFallbacks(supabase, queries);
          }
          if (!placeId && aloc.length > 2) {
            placeId = await findOrCreatePlaceFromGeocode(supabase, `${aloc}${regionHint}`);
          }
        }
        if (placeId) {
          await supabase.from("activities").update({ place_id: placeId }).eq("id", a.id);
          enriched++;
        } else {
          lookupFailed++;
        }
        await delay(120);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        enriched,
        alreadyLinked,
        lookupFailed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

/** e.g. "Vancouver BC" -> ", BC, Canada" for better Find Place results */
function regionSuffixFromDestination(destName: string): string {
  const d = destName.toLowerCase();
  if (d.includes("vancouver") || d.includes("bc") || d.includes("british columbia")) {
    return ", BC, Canada";
  }
  if (d.includes("seattle") || d.includes("washington")) return ", WA, USA";
  if (d.includes("montreal") || d.includes("montréal") || d.includes("quebec") || d.includes("québec")) {
    return ", QC, Canada";
  }
  return "";
}

/** Remove "Visit …", "Go to …", take first option before " or " */
function normalizePlaceTitle(raw: string): string {
  let t = raw.trim();
  if (t.length < 2) return "";
  t = t.replace(/^[\s•\-–—]+/, "");
  t = t.replace(
    /^(visit|go to|get|travel to|drive to|walk to|head to|stop at|landing at|meet at)\s+/i,
    "",
  );
  const orSplit = t.split(/\s+or\s+/i);
  t = orSplit[0]?.trim() ?? t;
  return t;
}

/** Several query strings: venue + region usually beats a long sentence for Find Place From Text */
function buildSearchQueries(
  title: string,
  location: string | null,
  destName: string,
  regionSuffix: string,
): string[] {
  const loc = (location || "").trim();
  const core = normalizePlaceTitle(title);
  if (!core && !loc) return [];

  const out: string[] = [];
  const dest = destName.replace(/\s+planning\s*$/i, "").trim() || destName;

  if (loc.length > 2) {
    out.push(`${loc}${regionSuffix}`);
    if (core.length > 2) out.push(`${core} ${loc}${regionSuffix}`);
  }
  if (core.length > 2) {
    out.push(`${core}, ${dest}${regionSuffix}`);
    out.push(`${core}${regionSuffix}`);
  }

  const seen = new Set<string>();
  return out.filter((q) => {
    const k = q.toLowerCase();
    if (seen.has(k) || q.length < 3) return false;
    seen.add(k);
    return true;
  });
}

function looksLikeGoogleMapsLink(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false;
  const u = raw.trim().toLowerCase();
  if (u.startsWith("data:") || u.startsWith("javascript:")) return false;
  return (
    u.includes("google.com/maps") ||
    u.includes("maps.google.com") ||
    u.includes("goo.gl") ||
    u.includes("maps.app.goo.gl")
  );
}

async function resolveGoogleMapsLink(
  rawLink: string,
): Promise<{ placeId?: string; lat?: number; lng?: number } | null> {
  try {
    const res = await fetch(rawLink, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PangofoldEnrich/1.0)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) {
      console.warn("[enrich-places] fetch maps link HTTP", res.status, rawLink.slice(0, 80));
      return null;
    }
    const finalUrl = res.url;

    const at = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (at) {
      return { lat: parseFloat(at[1]), lng: parseFloat(at[2]) };
    }

    const bang = finalUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (bang) {
      return { lat: parseFloat(bang[1]), lng: parseFloat(bang[2]) };
    }

    const placeIdParam = finalUrl.match(/[?&]place_id=([^&]+)/);
    if (placeIdParam) {
      return { placeId: decodeURIComponent(placeIdParam[1]) };
    }

    const ch = finalUrl.match(/(ChIJ[A-Za-z0-9_-]{20,})/);
    if (ch) return { placeId: ch[1] };
  } catch (e) {
    console.warn("[enrich-places] resolveGoogleMapsLink", e);
  }
  return null;
}

async function nearbySearchPlaceId(lat: number, lng: number): Promise<string | null> {
  for (const radius of [120, 400]) {
    const url =
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&key=${GOOGLE_MAPS_API_KEY}`;
    const j = await fetch(url).then((r) => r.json()) as {
      status?: string;
      error_message?: string;
      results?: Array<{ place_id?: string }>;
    };
    if (j.status && j.status !== "OK" && j.status !== "ZERO_RESULTS") {
      console.warn("[enrich-places] NearbySearch", j.status, j.error_message);
    }
    const pid = j.results?.[0]?.place_id;
    if (pid) return pid;
    await delay(40);
  }
  return null;
}

async function tryAttachFromMapsLink(
  supabase: ReturnType<typeof createClient>,
  link: string | null | undefined,
): Promise<string | null> {
  if (!looksLikeGoogleMapsLink(link)) return null;
  const resolved = await resolveGoogleMapsLink(link!.trim());
  if (!resolved) return null;

  if (resolved.placeId) {
    const id = await upsertPlaceFromGooglePlaceId(supabase, resolved.placeId, link!.trim());
    if (id) return id;
  }

  if (resolved.lat != null && resolved.lng != null) {
    const pid = await nearbySearchPlaceId(resolved.lat, resolved.lng);
    if (pid) {
      const id = await upsertPlaceFromGooglePlaceId(supabase, pid, link!.trim());
      if (id) return id;
    }
  }

  return null;
}

async function findOrCreatePlaceFromGeocode(
  supabase: ReturnType<typeof createClient>,
  address: string,
): Promise<string | null> {
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;
  const ge = await fetch(url).then((r) => r.json()) as {
    status?: string;
    error_message?: string;
    results?: Array<{ formatted_address?: string }>;
  };
  if (ge.status && ge.status !== "OK" && ge.status !== "ZERO_RESULTS") {
    console.warn("[enrich-places] Geocode", ge.status, ge.error_message);
  }
  const formatted = ge.results?.[0]?.formatted_address;
  if (!formatted) return null;
  return findOrCreatePlace(supabase, formatted);
}

async function findOrCreatePlaceWithFallbacks(
  supabase: ReturnType<typeof createClient>,
  queries: string[],
): Promise<string | null> {
  for (const q of queries) {
    const id = await findOrCreatePlace(supabase, q);
    if (id) return id;
    await delay(40);
  }
  return null;
}

async function delay(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

interface PlaceDetailsResult {
  name?: string;
  formatted_address?: string;
  geometry?: { location?: { lat?: number; lng?: number } };
  rating?: number;
  opening_hours?: unknown;
  photos?: Array<{ photo_reference?: string }>;
}

async function upsertPlaceFromGooglePlaceId(
  supabase: ReturnType<typeof createClient>,
  googlePlaceId: string,
  rawQuery: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("places")
    .select("id")
    .eq("google_place_id", googlePlaceId)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const detUrl =
    `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(googlePlaceId)}&fields=name,formatted_address,geometry,rating,opening_hours,photos&key=${GOOGLE_MAPS_API_KEY}`;
  const detRes = await fetch(detUrl);
  const detJson = await detRes.json() as { result?: PlaceDetailsResult; status?: string; error_message?: string };
  if (detJson.status && detJson.status !== "OK") {
    console.warn("[enrich-places] PlaceDetails", detJson.status, detJson.error_message, googlePlaceId);
  }
  const r = detJson.result;
  if (!r) return null;

  const lat = r.geometry?.location?.lat ?? null;
  const lng = r.geometry?.location?.lng ?? null;
  const photoRefs = Array.isArray(r.photos)
    ? r.photos.slice(0, 3).map((p) => p.photo_reference).filter(Boolean) as string[]
    : [];

  const { data: inserted, error } = await supabase
    .from("places")
    .insert({
      google_place_id: googlePlaceId,
      display_name: r.name || rawQuery,
      formatted_address: r.formatted_address ?? null,
      lat,
      lng,
      rating: r.rating ?? null,
      hours_json: r.opening_hours ?? null,
      photo_refs: photoRefs.length ? photoRefs : null,
      raw_query: rawQuery,
    })
    .select("id")
    .single();

  if (error) {
    const { data: retry } = await supabase
      .from("places")
      .select("id")
      .eq("google_place_id", googlePlaceId)
      .maybeSingle();
    return retry?.id ?? null;
  }

  return inserted?.id ?? null;
}

async function findOrCreatePlace(
  supabase: ReturnType<typeof createClient>,
  query: string,
): Promise<string | null> {
  const findUrl =
    `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id,name,formatted_address,geometry,rating,opening_hours,photos&key=${GOOGLE_MAPS_API_KEY}`;

  const findRes = await fetch(findUrl);
  const findJson = await findRes.json() as {
    status?: string;
    error_message?: string;
    candidates?: Array<{ place_id?: string }>;
  };
  if (findJson.status && findJson.status !== "OK" && findJson.status !== "ZERO_RESULTS") {
    console.warn("[enrich-places] FindPlaceFromText", findJson.status, findJson.error_message, query);
  }
  const cand = findJson.candidates?.[0];
  if (!cand?.place_id) return null;

  return upsertPlaceFromGooglePlaceId(supabase, cand.place_id, query);
}
