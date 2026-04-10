import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_AUTH_TOKEN = Deno.env.get("ANTHROPIC_AUTH_TOKEN") ?? "";
const ANTHROPIC_BASE_URL = Deno.env.get("ANTHROPIC_BASE_URL") ?? "https://api.z.ai/api/anthropic";
const MODEL = Deno.env.get("MODEL") ?? "glm-4.5-air";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { title, textContent, links, imageUrls, docUrl, userId, structured, mapsResolved } = await req.json();

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

    const docUrlNorm = typeof docUrl === "string" && docUrl.length > 0 ? docUrl : null;

    let tripId: string;
    let shareSlug: string;

    if (docUrlNorm) {
      const { data: existing } = await supabase
        .from("trips")
        .select("id, share_slug")
        .eq("owner_id", userId)
        .eq("source_doc_url", docUrlNorm)
        .maybeSingle();

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
            cover_image_url: imageUrls?.[0] || null,
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
            source_doc_url: docUrlNorm,
            owner_id: userId,
            raw_doc_text: textContent,
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
    | Array<{ items?: Array<{ text?: string; subSection?: string; link?: string; cost?: string }> }>
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

  for (const sec of sections) {
    for (const raw of sec.items || []) {
      const text = String(raw.text || "").trim();
      if (text.length < 2) continue;
      const sub = String(raw.subSection || "");
      const link = raw.link as string | undefined;
      const cost = raw.cost as string | undefined;

      const isFood = FOOD_SUB_RE.test(sub) || (!sub && FOOD_TITLE_RE.test(text));
      const isAct = ACT_SUB_RE.test(sub) || (!sub && ACT_TITLE_RE.test(text));

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
- CRITICAL: Every hike, park, attraction, excursion, or sightseeing block must appear in BOTH (1) day items with category "activity" AND (2) the destination's "activities" array (name, notes, cost, link, location).
- If a section has a sub-heading "Food" (or similar), EVERY bullet under that sub-heading must be category "food" and must appear in foodSpots.
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
