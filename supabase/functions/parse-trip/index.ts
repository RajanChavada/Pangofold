import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_AUTH_TOKEN = Deno.env.get("ANTHROPIC_AUTH_TOKEN") ?? "";
const ANTHROPIC_BASE_URL = Deno.env.get("ANTHROPIC_BASE_URL") ?? "https://api.z.ai/api/anthropic";
const MODEL = Deno.env.get("MODEL") ?? "glm-4.5-air";

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function extractGoogleDocId(url: string): string | null {
  const m = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

/** Canonical form for trips.source_doc_url — matches unique (owner_id, source_doc_url). */
function canonicalGoogleDocUrl(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  const id = extractGoogleDocId(raw);
  if (id) return `https://docs.google.com/document/d/${id}/edit`;
  return raw;
}

async function findTripBySourceDoc(
  supabase: ReturnType<typeof createClient>,
  ownerId: string,
  docInput: string,
): Promise<{ id: string; share_slug: string } | null> {
  const canonical = canonicalGoogleDocUrl(docInput);
  if (!canonical) return null;

  const { data: exact } = await supabase
    .from("trips")
    .select("id, share_slug")
    .eq("owner_id", ownerId)
    .eq("source_doc_url", canonical)
    .maybeSingle();

  if (exact) return exact;

  const did = extractGoogleDocId(docInput);
  if (!did) return null;

  const { data: candidates } = await supabase
    .from("trips")
    .select("id, share_slug, source_doc_url")
    .eq("owner_id", ownerId)
    .not("source_doc_url", "is", null);

  const match = candidates?.find(
    (t) => extractGoogleDocId(String(t.source_doc_url ?? "")) === did,
  );
  return match ? { id: match.id, share_slug: match.share_slug } : null;
}

async function triggerEnrichPlaces(
  supabaseUrl: string,
  serviceRoleKey: string,
  tripId: string,
  userId: string,
): Promise<void> {
  const base = supabaseUrl.replace(/\/$/, "");
  try {
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const res = await fetch(`${base}/functions/v1/enrich-places`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: anonKey || serviceRoleKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tripId, userId }),
    });
    if (!res.ok) {
      console.warn("[parse-trip] enrich-places HTTP", res.status, await res.text());
    }
  } catch (e) {
    console.warn("[parse-trip] enrich-places error", e);
  }
}

/** In-memory set for O(1) duplicate detection (avoids trusting the LLM alone). */
async function loadFingerprintSet(
  supabase: ReturnType<typeof createClient>,
  tripId: string,
): Promise<Set<string>> {
  const keys = new Set<string>();
  const { data: dests } = await supabase.from("destinations").select("id, name").eq("trip_id", tripId);
  for (const d of dests || []) {
    const destId = d.id as string;
    const { data: foods } = await supabase.from("food_spots").select("name").eq("destination_id", destId);
    for (const f of foods || []) {
      keys.add(`f:${destId}:${normKey(String(f.name ?? ""))}`);
    }
    const { data: acts } = await supabase.from("activities").select("name").eq("destination_id", destId);
    for (const a of acts || []) {
      keys.add(`a:${destId}:${normKey(String(a.name ?? ""))}`);
    }
    const { data: days } = await supabase
      .from("day_itineraries")
      .select("id, day_number")
      .eq("destination_id", destId);
    for (const day of days || []) {
      const { data: items } = await supabase.from("itinerary_items").select("title").eq("day_id", day.id);
      const dn = day.day_number as number;
      for (const it of items || []) {
        keys.add(`i:${destId}:${dn}:${normKey(String(it.title ?? ""))}`);
      }
    }
  }
  return keys;
}

function fingerprintSummaryForPrompt(fp: Set<string>, maxLines: number): string {
  if (fp.size === 0) return "(no existing planner rows yet)";
  const lines: string[] = [];
  for (const k of fp) {
    lines.push(`- ${k}`);
    if (lines.length >= maxLines) {
      lines.push("... (truncated — never duplicate matching titles)");
      break;
    }
  }
  return lines.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      title,
      textContent,
      links,
      imageUrls,
      docUrl,
      userId,
      structured,
      mapsResolved,
      mode,
      tripId: bodyTripId,
    } = body;

    if (!userId) {
      return new Response(JSON.stringify({ error: "Missing userId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    if (mode === "append" && bodyTripId) {
      return await handleAppendResync(supabase, {
        title,
        textContent,
        links: links || [],
        imageUrls,
        docUrl,
        userId,
        tripId: bodyTripId,
        structured,
        mapsResolved,
      });
    }

    const tripJson = await parseWithAI(title, textContent, links, structured, mapsResolved);

    syncItineraryCategoriesToTables(tripJson, structured);
    promoteStructuredFoodActivities(structured, tripJson);

    // Validate and fix required fields
    if (!tripJson.title) tripJson.title = title;
    for (const dest of tripJson.destinations || []) {
      if (!dest.name) dest.name = title.replace(/trip/i, "").trim() || "Destination";
      for (const day of dest.days || []) {
        for (const item of day.items || []) {
          if (!item.title) item.title = "Untitled item";
        }
      }
      for (const spot of dest.foodSpots || []) {
        if (!spot.name) spot.name = "Unnamed spot";
      }
      for (const act of dest.activities || []) {
        if (!act.name) act.name = "Unnamed activity";
      }
    }

    const canonicalDoc =
      typeof docUrl === "string" && docUrl.trim().length > 0 ? canonicalGoogleDocUrl(docUrl) : null;
    const contentHash = await sha256Hex(textContent);

    let tripId: string;
    let shareSlug: string;

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (canonicalDoc) {
      const existing = await findTripBySourceDoc(supabase, userId, String(docUrl));

      if (existing) {
        const { error: delErr } = await supabase.from("destinations").delete().eq("trip_id", existing.id);
        if (delErr) throw delErr;

        const { data: updated, error: upErr } = await supabase
          .from("trips")
          .update({
            title: tripJson.title || title,
            start_date: tripJson.startDate || null,
            end_date: tripJson.endDate || null,
            raw_doc_text: textContent,
            raw_doc_content_hash: contentHash,
            cover_image_url: imageUrls?.[0] || null,
            source_doc_url: canonicalDoc,
          })
          .eq("id", existing.id)
          .select()
          .single();

        if (upErr) throw upErr;
        tripId = updated!.id;
        shareSlug = updated!.share_slug;
      } else {
        const { data: inserted, error: tripError } = await supabase
          .from("trips")
          .insert({
            title: tripJson.title || title,
            start_date: tripJson.startDate || null,
            end_date: tripJson.endDate || null,
            source_doc_url: canonicalDoc,
            owner_id: userId,
            raw_doc_text: textContent,
            raw_doc_content_hash: contentHash,
            cover_image_url: imageUrls?.[0] || null,
          })
          .select()
          .single();

        if (tripError) throw tripError;
        tripId = inserted!.id;
        shareSlug = inserted!.share_slug;
      }
    } else {
      const { data: inserted, error: tripError } = await supabase
        .from("trips")
        .insert({
          title: tripJson.title || title,
          start_date: tripJson.startDate || null,
          end_date: tripJson.endDate || null,
          source_doc_url: null,
          owner_id: userId,
          raw_doc_text: textContent,
          raw_doc_content_hash: contentHash,
          cover_image_url: imageUrls?.[0] || null,
        })
        .select()
        .single();

      if (tripError) throw tripError;
      tripId = inserted!.id;
      shareSlug = inserted!.share_slug;
    }

    for (let di = 0; di < (tripJson.destinations || []).length; di++) {
      const dest = tripJson.destinations[di];
      const { data: destRow, error: destError } = await supabase
        .from("destinations")
        .insert({
          trip_id: tripId,
          name: dest.name,
          duration: dest.duration || null,
          hotel_name: dest.hotel?.name || null,
          hotel_address: dest.hotel?.address || null,
          hotel_link: dest.hotel?.link || null,
          sort_order: di,
        })
        .select()
        .single();

      if (destError) throw destError;

      for (let dayIdx = 0; dayIdx < (dest.days || []).length; dayIdx++) {
        const day = dest.days[dayIdx];
        const { data: dayRow, error: dayError } = await supabase
          .from("day_itineraries")
          .insert({
            destination_id: destRow.id,
            day_number: day.dayNumber,
            date: day.date || null,
          })
          .select()
          .single();

        if (dayError) throw dayError;

        for (let ii = 0; ii < (day.items || []).length; ii++) {
          const item = day.items[ii];
          const costFields = parseCostFields(item.cost);
          const timeMin = timeStringToMinutes(item.time);
          await supabase.from("itinerary_items").insert({
            day_id: dayRow.id,
            time: item.time || null,
            title: item.title,
            description: item.description || null,
            category: item.category || "other",
            location: item.location || null,
            link: item.link || null,
            cost: item.cost || null,
            is_checked: item.isChecked || false,
            sort_order: ii,
            cost_amount: costFields.cost_amount,
            cost_unit: costFields.cost_unit,
            time_minutes: timeMin,
          });
        }
      }

      for (let fi = 0; fi < (dest.foodSpots || []).length; fi++) {
        const food = dest.foodSpots[fi];
        await supabase.from("food_spots").insert({
          destination_id: destRow.id,
          name: food.name,
          type: food.type || "restaurant",
          notes: food.notes || null,
          link: food.link || null,
          price_range: food.priceRange || null,
          sort_order: fi,
        });
      }

      for (let ai = 0; ai < (dest.activities || []).length; ai++) {
        const activity = dest.activities[ai];
        await supabase.from("activities").insert({
          destination_id: destRow.id,
          name: activity.name,
          notes: activity.notes || null,
          cost: activity.cost || null,
          link: activity.link || null,
          location: activity.location || null,
          sort_order: ai,
        });
      }
    }

    if (serviceRoleKey) {
      void triggerEnrichPlaces(supabaseUrl, serviceRoleKey, tripId, userId);
    }

    return new Response(
      JSON.stringify({ tripId, shareSlug, parsed: tripJson }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function dedupeKey(name: string, link: string | null | undefined): string {
  return `${(name || "").trim().toLowerCase()}|${(link || "").trim()}`;
}

const FOOD_SUB_RE = /food|cafe|meal|dining|restaurant|breakfast|lunch|dinner|brunch|bakery|bar|coffee/i;
const ACT_SUB_RE = /activity|sightseeing|hike|park|attraction|tour|museum|excursion|golf|beach|shopping/i;
const FOOD_TITLE_RE =
  /restaurant|cafe|coffee|bakery|bar|bistro|diner|food|meal|breakfast|lunch|dinner|brunch|eat|dining/i;
const ACT_TITLE_RE =
  /park|museum|hike|trail|tour|golf|beach|garden|market|aquarium|zoo|activity|attraction|ferry|kayak/i;

/** Pull food/activity rows from structured sections (nested bullets under "Food", etc.). */
function promoteStructuredFoodActivities(
  structured: Record<string, unknown> | undefined,
  tripJson: Record<string, unknown>,
): void {
  const sections = structured?.sections as
    | Array<{
        title?: string;
        items?: Array<{ text?: string; subSection?: string; link?: string; cost?: string }>;
      }>
    | undefined;
  if (!sections?.length) return;

  const destinations = tripJson.destinations as Record<string, unknown>[] | undefined;
  if (!destinations?.length) return;

  const dest = destinations[0];
  if (!Array.isArray(dest.foodSpots)) dest.foodSpots = [];
  if (!Array.isArray(dest.activities)) dest.activities = [];

  const foodSpots = dest.foodSpots as Record<string, unknown>[];
  const activities = dest.activities as Record<string, unknown>[];

  const foodSeen = new Set(
    foodSpots.map((f) => dedupeKey(String(f.name ?? ""), f.link as string | undefined)),
  );
  const actSeen = new Set(
    activities.map((a) => dedupeKey(String(a.name ?? ""), a.link as string | undefined)),
  );

  const SECTION_FOOD = /food|meal|dining|restaurant|eat|coffee|drink|bakery|bar|cafe|lunch|dinner|brunch|breakfast/i;
  const SECTION_ACT =
    /activity|sightseeing|hike|attraction|museum|park|tour|excursion|things to do|to do/i;

  for (const sec of sections) {
    const secTitle = String(sec.title || "").trim();
    const sectionIsFood = SECTION_FOOD.test(secTitle);
    const sectionIsAct = SECTION_ACT.test(secTitle);

    for (const raw of sec.items || []) {
      const text = String(raw.text || "").trim();
      if (text.length < 2) continue;
      const sub = String(raw.subSection || "");
      const link = raw.link as string | undefined;
      const cost = raw.cost as string | undefined;

      const isFood =
        sectionIsFood ||
        FOOD_SUB_RE.test(sub) ||
        (!sub && FOOD_TITLE_RE.test(text)) ||
        /^food\s*:/i.test(text);
      const isAct =
        sectionIsAct ||
        ACT_SUB_RE.test(sub) ||
        (!sub && ACT_TITLE_RE.test(text)) ||
        /^activity\s*:/i.test(text);

      if (isFood && !isAct) {
        const k = dedupeKey(text, link);
        if (!foodSeen.has(k)) {
          foodSeen.add(k);
          foodSpots.push({
            name: text,
            type: "restaurant",
            notes: null,
            link: link ?? null,
            priceRange: cost ?? null,
          });
        }
      } else if (isAct && !isFood) {
        const k = dedupeKey(text, link);
        if (!actSeen.has(k)) {
          actSeen.add(k);
          activities.push({
            name: text,
            notes: null,
            cost: cost ?? null,
            link: link ?? null,
            location: null,
          });
        }
      }
    }
  }
}

/** Ensures category=food / activity on day items also get food_spots / activities; promotes keyword "other" rows. */
function syncItineraryCategoriesToTables(
  tripJson: Record<string, unknown>,
  structured: Record<string, unknown> | undefined,
): void {
  const destinations = tripJson.destinations as Record<string, unknown>[] | undefined;
  if (!destinations?.length) return;

  const subSectionFood = new Set<string>();
  const subSectionAct = new Set<string>();
  const sections = structured?.sections as Array<{ items?: Array<{ text?: string; subSection?: string }> }> | undefined;
  for (const sec of sections || []) {
    for (const it of sec.items || []) {
      const sub = String(it.subSection || "");
      const tx = String(it.text || "").trim();
      if (FOOD_SUB_RE.test(sub)) subSectionFood.add(tx.toLowerCase());
      if (ACT_SUB_RE.test(sub)) subSectionAct.add(tx.toLowerCase());
    }
  }

  for (const dest of destinations) {
    if (!Array.isArray(dest.foodSpots)) dest.foodSpots = [];
    if (!Array.isArray(dest.activities)) dest.activities = [];

    const foodSpots = dest.foodSpots as Record<string, unknown>[];
    const activities = dest.activities as Record<string, unknown>[];

    const foodSeen = new Set(
      foodSpots.map((f) => dedupeKey(String(f.name ?? ""), f.link as string | undefined)),
    );
    const actSeen = new Set(
      activities.map((a) => dedupeKey(String(a.name ?? ""), a.link as string | undefined)),
    );

    const days = dest.days as Record<string, unknown>[] | undefined;
    for (const day of days || []) {
      const items = day.items as Record<string, unknown>[] | undefined;
      for (const item of items || []) {
        let cat = String(item.category || "").toLowerCase();
        const title = String(item.title || "Untitled").trim() || "Untitled";
        const desc = String(item.description || "");
        const combined = `${title} ${desc}`;

        if (cat === "other") {
          if (subSectionFood.has(title.toLowerCase()) || FOOD_TITLE_RE.test(combined)) {
            cat = "food";
            item.category = "food";
          } else if (subSectionAct.has(title.toLowerCase()) || ACT_TITLE_RE.test(combined)) {
            cat = "activity";
            item.category = "activity";
          }
        }

        if (cat === "food") {
          const k = dedupeKey(title, item.link as string | undefined);
          if (!foodSeen.has(k)) {
            foodSeen.add(k);
            foodSpots.push({
              name: title,
              type: "restaurant",
              notes: item.description ?? null,
              link: item.link ?? null,
              priceRange: item.cost ?? null,
            });
          }
        } else if (cat === "activity") {
          const k = dedupeKey(title, item.link as string | undefined);
          if (!actSeen.has(k)) {
            actSeen.add(k);
            activities.push({
              name: title,
              notes: item.description ?? null,
              cost: item.cost ?? null,
              link: item.link ?? null,
              location: item.location ?? null,
            });
          }
        }
      }
    }
  }
}

function parseCostFields(cost: string | null | undefined): {
  cost_amount: number | null;
  cost_unit: "per_person" | "total" | "unknown";
} {
  if (!cost || typeof cost !== "string") {
    return { cost_amount: null, cost_unit: "unknown" };
  }
  const m = cost.match(/[$€£¥]\s*([\d,.]+)/);
  if (!m) return { cost_amount: null, cost_unit: "unknown" };
  const num = parseFloat(m[1].replace(/,/g, ""));
  if (Number.isNaN(num)) return { cost_amount: null, cost_unit: "unknown" };
  const perPerson = /\bpp\b|per\s*person|\/\s*person|(?:^|\s)pp(?:\s|$)/i.test(cost);
  return {
    cost_amount: num,
    cost_unit: perPerson ? "per_person" : "total",
  };
}

/** Minutes from midnight local for conflict detection (best-effort). */
function timeStringToMinutes(t: string | null | undefined): number | null {
  if (!t || typeof t !== "string") return null;
  const s = t.trim();
  const m = s.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3]?.toUpperCase();
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  if (!ap && h > 24) return null;
  return h * 60 + min;
}

async function parseWithAI(
  title: string,
  textContent: string,
  links: string[],
  structured?: unknown,
  mapsResolved?: unknown,
) {
  const structuredSection = structured
    ? `\n\nPATTERN ANALYSIS (auto-detected structure from the document — use this as your primary source):\n${JSON.stringify(structured, null, 2)}`
    : "";

  const mapsSection = Array.isArray(mapsResolved) && mapsResolved.length
    ? `\n\nRESOLVED GOOGLE MAPS LINKS (lat/lng hints — use for location fields when matching items):\n${JSON.stringify(mapsResolved, null, 2)}`
    : "";

  const systemPrompt = `You are a trip plan parser. You receive a pattern analysis AND raw text from a Google Doc.

The pattern analysis was auto-detected and contains:
- "sections": numbered/labeled document sections with their items, links, times, costs, checked status, and sub-section labels
- "keyValues": key-value pairs found outside sections (expenses, booking info, addresses, etc.)
- "linkMap": which URLs are associated with which items
- "orphanItems": content items found outside any section

YOUR JOB: Convert this into a structured trip JSON. You handle the SEMANTICS (what things mean):
- Determine which sections are days/destinations/logistics
- Categorize day items: food, activity, transport, accommodation, other
- CRITICAL: Every restaurant, meal, cafe, or dining stop must appear in BOTH (1) the correct day's items with category "food" AND (2) the destination's "foodSpots" array (name, type, notes, link, priceRange). Do not put meals only in days without a matching foodSpots entry.
- NESTED LISTS: Many docs put restaurants ONLY as sub-bullets under a DAY heading (e.g. "Day 3" → "Food:" → nested bullets). You MUST still extract EVERY nested food line into foodSpots and into the matching day's items — do not skip nested bullets.
- CRITICAL: Every hike, park, attraction, excursion, or sightseeing block must appear in BOTH (1) day items with category "activity" AND (2) the destination's "activities" array (name, notes, cost, link, location).
- If a section has a sub-heading "Food" (or similar), EVERY bullet under that sub-heading must be category "food" and must appear in foodSpots.
- If a section title or day block contains "Food", "Meals", "Where to eat", "Dinner", or "Lunch" as a subsection, every bullet under it is food (not "other").
- Transport and accommodation stay as day items (or hotel object); flights/car rental use transport or accommodation categories.
- Identify hotels/accommodation from key-values or items mentioning addresses
- Preserve ALL links, times, costs, and isChecked values exactly as given
- Empty sections should still appear as empty days
- Orphan items go into the destination's activities array
- Key-value pairs with costs are expenses/bookings — incorporate them

Respond with ONLY the JSON object. No thinking, no explanation, no markdown.`;

  const userPrompt = `Parse this trip plan.

Title: ${title}
${structuredSection}
${mapsSection}

RAW TEXT (fallback — use pattern analysis above as primary source):
${textContent.slice(0, 10000)}

Links found: ${links.slice(0, 30).join(", ")}

REQUIRED JSON structure (destinations.name MUST be a real city/region name, NEVER null):
{"title":"string","startDate":"YYYY-MM-DD or null","endDate":"YYYY-MM-DD or null","destinations":[{"name":"REQUIRED city/region name","duration":"string or null","hotel":{"name":"string or null","address":"string or null","link":"string or null"},"days":[{"dayNumber":1,"date":"YYYY-MM-DD or null","items":[{"time":"string or null","title":"REQUIRED string","description":"string or null","category":"food|activity|transport|accommodation|other","location":"string or null","link":"string or null","cost":"string or null","isChecked":false}]}],"foodSpots":[{"name":"REQUIRED string","type":"restaurant|cafe|street|bakery|bar","notes":"string or null","link":"string or null","priceRange":"string or null"}],"activities":[{"name":"REQUIRED string","notes":"string or null","cost":"string or null","link":"string or null","location":"string or null"}]}]}

Duplicate semantics: for each meal in days[].items with category "food", include a matching object in foodSpots (same name/link). For each attraction in days[].items with category "activity", include a matching object in activities. The itinerary/plan stays in days; foodSpots and activities are the dedicated lists for those tabs.

If you cannot determine the destination city, use the title or "Trip Destination" as fallback. NEVER return null for name fields.`;

  const apiUrl = `${ANTHROPIC_BASE_URL}/v1/messages`;

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_AUTH_TOKEN,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      system: systemPrompt,
      messages: [
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM API error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const textBlock = data.content?.find((b: { type?: string }) => b.type === "text");
  if (!textBlock?.text) throw new Error("No content in LLM response");

  let raw = textBlock.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  const json = extractJsonObject(raw);
  if (!json) {
    throw new Error("LLM response does not contain a valid JSON object");
  }

  return JSON.parse(json);
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\") {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  let truncated = text.slice(start);
  if (inString) truncated += '"';

  const opens = { braces: 0, brackets: 0 };
  let inStr = false;
  let esc = false;
  for (const ch of truncated) {
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === "\\") {
      esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === "{") opens.braces++;
    else if (ch === "}") opens.braces--;
    else if (ch === "[") opens.brackets++;
    else if (ch === "]") opens.brackets--;
  }

  truncated = truncated.replace(/,\s*$/, "");

  for (let i = 0; i < opens.brackets; i++) truncated += "]";
  for (let i = 0; i < opens.braces; i++) truncated += "}";

  try {
    JSON.parse(truncated);
    return truncated;
  } catch {
    return null;
  }
}

async function parseWithAIAppend(
  title: string,
  textContent: string,
  links: string[],
  structured: unknown,
  mapsResolved: unknown,
  existingFingerprintsBlock: string,
  appendHint: string,
): Promise<Record<string, unknown>> {
  const structuredSection = structured
    ? `\n\nPATTERN ANALYSIS:\n${JSON.stringify(structured, null, 2).slice(0, 8000)}`
    : "";
  const mapsSection = Array.isArray(mapsResolved) && mapsResolved.length
    ? `\n\nMAPS HINTS:\n${JSON.stringify(mapsResolved, null, 2).slice(0, 4000)}`
    : "";

  const systemPrompt = `You are APPENDING to an existing saved trip. The user may have only added text at the end of their Google Doc.

RULES:
- Output the SAME JSON schema as a full trip, but include ONLY **new** destinations, days, items, food spots, and activities that are NOT already represented.
- We pass a machine fingerprint list of EXISTING rows — if a new line matches an existing title/name (same meaning), OMIT it.
- If nothing is new, return {"title":null,"startDate":null,"endDate":null,"destinations":[]}.
- Never output items solely to "refresh" old content.
- For new content under an existing city, reuse the EXACT destination "name" string so we can merge.
${appendHint}

Respond with ONLY the JSON object. No thinking, no markdown.`;

  const userPrompt = `EXISTING ROW KEYS (do not duplicate these):\n${existingFingerprintsBlock}\n\nTitle: ${title}\n${structuredSection}${mapsSection}\n\nTEXT TO PARSE (new or full doc context):\n${textContent.slice(0, 12000)}\n\nLinks: ${(links || []).slice(0, 40).join(", ")}\n\nREQUIRED JSON shape:\n{"title":"string or null","startDate":null,"endDate":null,"destinations":[{"name":"string","duration":null,"hotel":{},"days":[{"dayNumber":1,"date":null,"items":[]}],"foodSpots":[],"activities":[]}]}`;

  const apiUrl = `${ANTHROPIC_BASE_URL}/v1/messages`;
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_AUTH_TOKEN,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 12000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM API error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const textBlock = data.content?.find((b: { type?: string }) => b.type === "text");
  if (!textBlock?.text) throw new Error("No content in LLM response");

  let raw = textBlock.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const json = extractJsonObject(raw);
  if (!json) throw new Error("LLM response does not contain a valid JSON object");
  return JSON.parse(json) as Record<string, unknown>;
}

async function getOrCreateDay(
  supabase: ReturnType<typeof createClient>,
  destinationId: string,
  dayNumber: number,
  date: string | null | undefined,
): Promise<{ id: string }> {
  const { data: existing } = await supabase
    .from("day_itineraries")
    .select("id")
    .eq("destination_id", destinationId)
    .eq("day_number", dayNumber)
    .maybeSingle();
  if (existing?.id) return { id: existing.id as string };
  const { data: ins, error } = await supabase
    .from("day_itineraries")
    .insert({
      destination_id: destinationId,
      day_number: dayNumber,
      date: date || null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: ins!.id as string };
}

async function appendTripJsonToDb(
  supabase: ReturnType<typeof createClient>,
  tripId: string,
  tripJson: Record<string, unknown>,
  fp: Set<string>,
): Promise<{ itinerary: number; food: number; activities: number; destinations: number }> {
  const counts = { itinerary: 0, food: 0, activities: 0, destinations: 0 };
  const { data: destRows } = await supabase
    .from("destinations")
    .select("id, name, sort_order")
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: true });

  const destByNorm = new Map<string, { id: string; sort_order: number }>();
  for (const d of destRows || []) {
    destByNorm.set(normKey(String(d.name ?? "")), {
      id: d.id as string,
      sort_order: Number(d.sort_order ?? 0),
    });
  }

  const destinations = (tripJson.destinations as Record<string, unknown>[]) || [];

  for (const dest of destinations) {
    const name = String(dest.name ?? "").trim() || "Destination";
    const nk = normKey(name);
    let destId: string;
    const found = destByNorm.get(nk);
    if (found) {
      destId = found.id;
    } else {
      const nextOrder = (destRows?.length ?? 0) + counts.destinations;
      const { data: ins, error } = await supabase
        .from("destinations")
        .insert({
          trip_id: tripId,
          name,
          duration: (dest.duration as string) || null,
          hotel_name: (dest.hotel as { name?: string } | undefined)?.name || null,
          hotel_address: (dest.hotel as { address?: string } | undefined)?.address || null,
          hotel_link: (dest.hotel as { link?: string } | undefined)?.link || null,
          sort_order: nextOrder,
        })
        .select("id")
        .single();
      if (error) throw error;
      destId = ins!.id as string;
      destByNorm.set(nk, { id: destId, sort_order: nextOrder });
      counts.destinations++;
    }

    for (const food of (dest.foodSpots as Record<string, unknown>[]) || []) {
      const fn = normKey(String(food.name ?? ""));
      if (!fn) continue;
      const key = `f:${destId}:${fn}`;
      if (fp.has(key)) continue;
      const { data: maxRow } = await supabase
        .from("food_spots")
        .select("sort_order")
        .eq("destination_id", destId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const sortOrder = (typeof maxRow?.sort_order === "number" ? maxRow.sort_order : -1) + 1;
      await supabase.from("food_spots").insert({
        destination_id: destId,
        name: String(food.name ?? "Spot"),
        type: (food.type as string) || "restaurant",
        notes: (food.notes as string) || null,
        link: (food.link as string) || null,
        price_range: (food.priceRange as string) || null,
        sort_order: sortOrder,
      });
      fp.add(key);
      counts.food++;
    }

    for (const act of (dest.activities as Record<string, unknown>[]) || []) {
      const an = normKey(String(act.name ?? ""));
      if (!an) continue;
      const key = `a:${destId}:${an}`;
      if (fp.has(key)) continue;
      const { data: maxRow } = await supabase
        .from("activities")
        .select("sort_order")
        .eq("destination_id", destId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const sortOrder = (typeof maxRow?.sort_order === "number" ? maxRow.sort_order : -1) + 1;
      await supabase.from("activities").insert({
        destination_id: destId,
        name: String(act.name ?? "Activity"),
        notes: (act.notes as string) || null,
        cost: (act.cost as string) || null,
        link: (act.link as string) || null,
        location: (act.location as string) || null,
        sort_order: sortOrder,
      });
      fp.add(key);
      counts.activities++;
    }

    for (const day of (dest.days as Record<string, unknown>[]) || []) {
      const dayNum = Number(day.dayNumber ?? 1);
      const dayRow = await getOrCreateDay(supabase, destId, dayNum, (day.date as string) || null);
      let { data: maxItem } = await supabase
        .from("itinerary_items")
        .select("sort_order")
        .eq("day_id", dayRow.id)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      let nextSort = (typeof maxItem?.sort_order === "number" ? maxItem.sort_order : -1);

      for (const item of (day.items as Record<string, unknown>[]) || []) {
        const tit = normKey(String(item.title ?? ""));
        if (!tit) continue;
        const key = `i:${destId}:${dayNum}:${tit}`;
        if (fp.has(key)) continue;
        nextSort += 1;
        const costFields = parseCostFields(item.cost as string | undefined);
        const timeMin = timeStringToMinutes(item.time as string | undefined);
        await supabase.from("itinerary_items").insert({
          day_id: dayRow.id,
          time: (item.time as string) || null,
          title: String(item.title ?? "Item"),
          description: (item.description as string) || null,
          category: (item.category as string) || "other",
          location: (item.location as string) || null,
          link: (item.link as string) || null,
          cost: (item.cost as string) || null,
          is_checked: Boolean(item.isChecked),
          sort_order: nextSort,
          cost_amount: costFields.cost_amount,
          cost_unit: costFields.cost_unit,
          time_minutes: timeMin,
        });
        fp.add(key);
        counts.itinerary++;
      }
    }
  }

  return counts;
}

async function handleAppendResync(
  supabase: ReturnType<typeof createClient>,
  body: {
    title: string;
    textContent: string;
    links: string[];
    imageUrls?: string[];
    docUrl: string;
    userId: string;
    tripId: string;
    structured?: unknown;
    mapsResolved?: unknown;
  },
): Promise<Response> {
  const { title, textContent, links, imageUrls, docUrl, userId, tripId, structured, mapsResolved } = body;

  const { data: trip, error: tripErr } = await supabase
    .from("trips")
    .select("id, owner_id, source_doc_url, raw_doc_text, raw_doc_content_hash, title")
    .eq("id", tripId)
    .single();

  if (tripErr || !trip) {
    return new Response(JSON.stringify({ error: "Trip not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (trip.owner_id !== userId) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const tripDocId = extractGoogleDocId(String(trip.source_doc_url ?? ""));
  const reqDocId = extractGoogleDocId(docUrl);
  if (!trip.source_doc_url || !tripDocId || !reqDocId || tripDocId !== reqDocId) {
    return new Response(
      JSON.stringify({ error: "Use the same Google Doc URL this trip was created from." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const canonDoc = canonicalGoogleDocUrl(docUrl);
  if (canonDoc && canonDoc !== String(trip.source_doc_url ?? "")) {
    await supabase.from("trips").update({ source_doc_url: canonDoc }).eq("id", tripId);
  }

  const newHash = await sha256Hex(textContent);
  if (trip.raw_doc_content_hash && newHash === trip.raw_doc_content_hash) {
    const { data: slugRow } = await supabase.from("trips").select("share_slug").eq("id", tripId).single();
    return new Response(
      JSON.stringify({
        skipped: true,
        tripId,
        reason: "document_unchanged",
        shareSlug: slugRow?.share_slug ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const fp = await loadFingerprintSet(supabase, tripId);
  const fpBlock = fingerprintSummaryForPrompt(fp, 500);
  const prevRaw = String(trip.raw_doc_text ?? "");
  let textForAI = textContent;
  let appendHint = "";
  if (prevRaw.length > 0 && textContent.startsWith(prevRaw)) {
    const delta = textContent.slice(prevRaw.length);
    if (delta.trim().length > 0) {
      textForAI = delta;
      appendHint =
        "\nThe raw text below is ONLY the suffix appended after the previously-imported document — prioritize extracting from it.";
    }
  }

  if (textForAI.trim().length < 2) {
    await supabase
      .from("trips")
      .update({
        raw_doc_text: textContent,
        raw_doc_content_hash: newHash,
        ...(imageUrls?.[0] ? { cover_image_url: imageUrls[0] } : {}),
      })
      .eq("id", tripId);
    const { data: slugRow } = await supabase.from("trips").select("share_slug").eq("id", tripId).single();
    return new Response(
      JSON.stringify({
        skipped: true,
        tripId,
        reason: "no_new_text",
        shareSlug: slugRow?.share_slug ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const tripJson = await parseWithAIAppend(
    title,
    textForAI,
    links || [],
    structured,
    mapsResolved,
    fpBlock,
    appendHint,
  );

  syncItineraryCategoriesToTables(tripJson, structured as Record<string, unknown> | undefined);
  promoteStructuredFoodActivities(structured as Record<string, unknown> | undefined, tripJson);

  if (!tripJson.title) tripJson.title = title;
  for (const dest of (tripJson.destinations as Record<string, unknown>[]) || []) {
    if (!dest.name) dest.name = title.replace(/trip/i, "").trim() || "Destination";
    for (const day of (dest.days as Record<string, unknown>[]) || []) {
      for (const item of (day.items as Record<string, unknown>[]) || []) {
        if (!item.title) item.title = "Untitled item";
      }
    }
    for (const spot of (dest.foodSpots as Record<string, unknown>[]) || []) {
      if (!spot.name) spot.name = "Unnamed spot";
    }
    for (const act of (dest.activities as Record<string, unknown>[]) || []) {
      if (!act.name) act.name = "Unnamed activity";
    }
  }

  const appended = await appendTripJsonToDb(supabase, tripId, tripJson, fp);

  const tripPatch: Record<string, unknown> = {
    raw_doc_text: textContent,
    raw_doc_content_hash: newHash,
    title: (tripJson.title as string) || title,
  };
  if (tripJson.startDate) tripPatch.start_date = tripJson.startDate;
  if (tripJson.endDate) tripPatch.end_date = tripJson.endDate;
  if (imageUrls?.[0]) tripPatch.cover_image_url = imageUrls[0];
  await supabase.from("trips").update(tripPatch).eq("id", tripId);

  const { data: slugRow } = await supabase.from("trips").select("share_slug").eq("id", tripId).single();

  const supabaseUrlAppend = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKeyAppend = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (serviceRoleKeyAppend) {
    void triggerEnrichPlaces(supabaseUrlAppend, serviceRoleKeyAppend, tripId, userId);
  }

  return new Response(
    JSON.stringify({
      tripId,
      shareSlug: slugRow?.share_slug ?? null,
      skipped: false,
      appended,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
