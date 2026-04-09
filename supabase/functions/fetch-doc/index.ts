import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { docUrl } = await req.json();
    const docIdMatch = docUrl.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
    if (!docIdMatch) {
      return new Response(JSON.stringify({ error: "Invalid Google Doc URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const docId = docIdMatch[1];
    const googleToken = user.user_metadata?.provider_token;

    if (!googleToken) {
      return new Response(
        JSON.stringify({ error: "Google token not found. Please re-authenticate." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const docRes = await fetch(
      `https://docs.googleapis.com/v1/documents/${docId}`,
      { headers: { Authorization: `Bearer ${googleToken}` } },
    );

    if (!docRes.ok) {
      const errText = await docRes.text();
      return new Response(
        JSON.stringify({ error: `Google Docs API error: ${docRes.status}`, details: errText }),
        { status: docRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const doc = await docRes.json();
    const { title, textContent, links, imageUrls } = extractDocContent(doc);

    return new Response(
      JSON.stringify({ title, textContent, links, imageUrls, docUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

interface DocContent {
  title: string;
  textContent: string;
  links: string[];
  imageUrls: string[];
}

function extractDocContent(doc: any): DocContent {
  const title = doc.title || "Untitled Trip";
  const lines: string[] = [];
  const links: string[] = [];
  const imageUrls: string[] = [];

  const elements = doc.body?.content || [];

  for (const el of elements) {
    if (el.paragraph) {
      let lineText = "";
      for (const run of el.paragraph.elements || []) {
        if (run.textRun) {
          const text = run.textRun.content || "";
          lineText += text;

          const link = run.textRun.textStyle?.link?.url;
          if (link && !links.includes(link)) {
            links.push(link);
          }
        }
        if (run.inlineObjectElement) {
          const objId = run.inlineObjectElement.inlineObjectId;
          const obj = doc.inlineObjects?.[objId];
          const uri =
            obj?.inlineObjectProperties?.embeddedObject?.imageProperties
              ?.contentUri;
          if (uri && !imageUrls.includes(uri)) {
            imageUrls.push(uri);
          }
        }
      }

      const headingId = el.paragraph.paragraphStyle?.namedStyleType;
      if (headingId?.startsWith("HEADING")) {
        const level = headingId.replace("HEADING_", "");
        lineText = `${"#".repeat(Number(level))} ${lineText.trim()}`;
      }

      if (el.paragraph.bullet) {
        const nestingLevel = el.paragraph.bullet.nestingLevel || 0;
        lineText = `${"  ".repeat(nestingLevel)}- ${lineText.trim()}`;
      }

      lines.push(lineText);
    }

    if (el.table) {
      for (const row of el.table.tableRows || []) {
        const cells: string[] = [];
        for (const cell of row.tableCells || []) {
          let cellText = "";
          for (const cellEl of cell.content || []) {
            if (cellEl.paragraph) {
              for (const run of cellEl.paragraph.elements || []) {
                if (run.textRun) {
                  cellText += run.textRun.content || "";
                }
              }
            }
          }
          cells.push(cellText.trim());
        }
        lines.push(`| ${cells.join(" | ")} |`);
      }
    }
  }

  return {
    title,
    textContent: lines.join(""),
    links,
    imageUrls,
  };
}
