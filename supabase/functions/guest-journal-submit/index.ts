import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { decode as decodeBase64 } from "https://deno.land/std@0.177.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function mimeFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

function decodePhotoBase64(raw: string): Uint8Array {
  const clean = raw.replace(/^data:image\/\w+;base64,/, "").trim();
  return decodeBase64(clean);
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Max-Age": "86400",
};

type Body = {
  tripId?: string;
  collaborateToken?: string;
  loggedByName?: string;
  title?: string;
  note?: string;
  rating?: number | null;
  amountCents?: number | null;
  currency?: string;
  category?: string | null;
  splitBetween?: number;
  splitMode?: string;
  paidByName?: string | null;
  itineraryItemId?: string | null;
  photos?: Array<{ filename: string; base64: string }>;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceKey);

    let body: Body;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      tripId,
      collaborateToken,
      loggedByName,
      title,
      note,
      rating,
      amountCents,
      currency,
      category,
      splitBetween,
      splitMode,
      paidByName,
      itineraryItemId,
      photos,
    } = body;

    if (!tripId || !collaborateToken || !loggedByName?.trim() || !title?.trim()) {
      return new Response(
        JSON.stringify({ error: "Missing tripId, collaborateToken, loggedByName, or title" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: trip, error: tripErr } = await supabase
      .from("trips")
      .select("id, collaborate_token, collaboration_enabled")
      .eq("id", tripId)
      .single();

    if (tripErr || !trip) {
      return new Response(JSON.stringify({ error: "Trip not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!trip.collaboration_enabled || trip.collaborate_token !== collaborateToken) {
      return new Response(JSON.stringify({ error: "Invalid or disabled collaboration link" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const split = Math.max(1, splitBetween ?? 1);
    const mode = ["equal", "full_amount", "group_split"].includes(splitMode ?? "")
      ? splitMode!
      : "equal";

    const { data: inserted, error: insErr } = await supabase
      .from("journal_entries")
      .insert({
        trip_id: tripId,
        author_id: null,
        logged_by_name: loggedByName.trim().slice(0, 120),
        itinerary_item_id: itineraryItemId ?? null,
        title: title.trim().slice(0, 500),
        note: note?.trim() ?? null,
        rating: rating ?? null,
        amount_cents: amountCents ?? null,
        currency: currency ?? "USD",
        category: category ?? null,
        split_between: split,
        split_mode: mode,
        paid_by_name: paidByName?.trim()?.slice(0, 120) ?? null,
      })
      .select("id")
      .single();

    if (insErr) throw insErr;

    const entryId = inserted!.id as string;
    const files = photos || [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      let bin: Uint8Array;
      try {
        bin = decodePhotoBase64(f.base64);
      } catch {
        console.error("[guest-journal-submit] bad base64 for", f.filename);
        continue;
      }
      const ext = (f.filename.split(".").pop() || "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "jpg";
      const path = `${tripId}/${entryId}/guest-${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("journal-photos").upload(path, bin, {
        contentType: mimeFromFilename(f.filename || `x.${ext}`),
        upsert: false,
      });
      if (upErr) {
        console.error("[guest-journal-submit] storage upload", upErr);
        continue;
      }
      await supabase.from("journal_photos").insert({
        entry_id: entryId,
        storage_path: path,
        sort_order: i,
      });
    }

    return new Response(
      JSON.stringify({ ok: true, entryId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
