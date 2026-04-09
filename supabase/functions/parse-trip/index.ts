import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { title, textContent, links, imageUrls, docUrl } = await req.json();

    const tripJson = await parseWithAI(title, textContent, links);

    const { data: trip, error: tripError } = await supabase
      .from("trips")
      .insert({
        title: tripJson.title || title,
        start_date: tripJson.startDate || null,
        end_date: tripJson.endDate || null,
        source_doc_url: docUrl,
        owner_id: user.id,
        raw_doc_text: textContent,
        cover_image_url: imageUrls?.[0] || null,
      })
      .select()
      .single();

    if (tripError) throw tripError;

    for (let di = 0; di < (tripJson.destinations || []).length; di++) {
      const dest = tripJson.destinations[di];
      const { data: destRow, error: destError } = await supabase
        .from("destinations")
        .insert({
          trip_id: trip.id,
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
      JSON.stringify({ tripId: trip.id, parsed: tripJson }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function parseWithAI(
  title: string,
  textContent: string,
  links: string[],
) {
  const systemPrompt = `You parse messy Google Doc trip plans into structured JSON. Handle:
- Bullet lists, incomplete sentences, mixed languages
- Prices in various formats ($15, 8.5/person)
- Abbreviations (DT=downtown, MTL=Montreal)
- Strikethrough items (mark isChecked: true)
- Checkbox items

Categorize each item: food, activity, transport, accommodation, or other.
Group by destination, then by day when possible.
Extract food spots into a separate array per destination.
Extract activities into a separate array per destination.`;

  const userPrompt = `Parse this trip plan:

Title: ${title}

Content:
${textContent.slice(0, 12000)}

Links found: ${links.slice(0, 20).join(", ")}

Return JSON matching this exact schema:
{
  "title": "string",
  "startDate": "YYYY-MM-DD or null",
  "endDate": "YYYY-MM-DD or null",
  "destinations": [{
    "name": "string",
    "duration": "string or null",
    "hotel": { "name": "string", "address": "string or null", "link": "string or null" } | null,
    "days": [{
      "dayNumber": 1,
      "date": "YYYY-MM-DD or null",
      "items": [{
        "time": "string or null",
        "title": "string",
        "description": "string or null",
        "category": "food|activity|transport|accommodation|other",
        "location": "string or null",
        "link": "string or null",
        "cost": "string or null",
        "isChecked": false
      }]
    }],
    "foodSpots": [{
      "name": "string",
      "type": "restaurant|cafe|street|bakery|bar",
      "notes": "string or null",
      "link": "string or null",
      "priceRange": "string or null"
    }],
    "activities": [{
      "name": "string",
      "notes": "string or null",
      "cost": "string or null",
      "link": "string or null",
      "location": "string or null"
    }]
  }]
}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("No content in OpenAI response");

  return JSON.parse(content);
}
