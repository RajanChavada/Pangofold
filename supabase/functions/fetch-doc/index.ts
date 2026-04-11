import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { docUrl, providerToken } = await req.json();

    if (!providerToken) {
      return new Response(
        JSON.stringify({ error: "Google token not provided. Please sign out and sign in again." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const docIdMatch = docUrl?.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
    if (!docIdMatch) {
      return new Response(JSON.stringify({ error: "Invalid Google Doc URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const docId = docIdMatch[1];

    const docRes = await fetch(
      `https://docs.googleapis.com/v1/documents/${docId}`,
      { headers: { Authorization: `Bearer ${providerToken}` } },
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
    const structured = preParseStructured(textContent, links);
    const mapsResolved = await resolveMapsLinks(links);

    return new Response(
      JSON.stringify({ title, textContent, links, imageUrls, docUrl, structured, mapsResolved }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function isMapsLink(url: string): boolean {
  return /goo\.gl|maps\.app\.goo\.gl|google\.com\/maps|maps\.google|share\.google/i.test(url);
}

async function delayMs(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/** Follow short Maps URLs and extract @lat,lng or q=lat,lng for enrichment hints. */
async function resolveGoogleMapsUrl(url: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const u = url.startsWith("http") ? url : `https://${url}`;
    const res = await fetch(u, { redirect: "follow" });
    const finalUrl = res.url;
    const at = finalUrl.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)(?:,|\/|$)/);
    if (at) {
      return { lat: parseFloat(at[1]), lng: parseFloat(at[2]) };
    }
    const parsed = new URL(finalUrl);
    const q = parsed.searchParams.get("q");
    if (q) {
      const ll = q.match(/(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
      if (ll) return { lat: parseFloat(ll[1]), lng: parseFloat(ll[2]) };
    }
    const center = parsed.searchParams.get("center");
    if (center) {
      const ll = center.match(/(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
      if (ll) return { lat: parseFloat(ll[1]), lng: parseFloat(ll[2]) };
    }
  } catch {
    // ignore
  }
  return null;
}

async function resolveMapsLinks(links: string[]): Promise<Array<{ url: string; lat: number | null; lng: number | null }>> {
  const out: Array<{ url: string; lat: number | null; lng: number | null }> = [];
  const seen = new Set<string>();
  for (const url of links) {
    if (!isMapsLink(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    const coords = await resolveGoogleMapsUrl(url);
    out.push({
      url,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    });
    await delayMs(80);
    if (out.length >= 12) break;
  }
  return out;
}

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
    textContent: lines.join("\n"),
    links,
    imageUrls,
  };
}

// ─── Generic pattern analyzer ───
// Detects structure in ANY document without hardcoded domain knowledge.
// The LLM handles semantics (what things mean); this handles syntax (how things are structured).

interface AnnotatedLine {
  raw: string;
  text: string;              // cleaned text
  lineNum: number;
  patterns: {
    isHeading: boolean;       // Google Doc heading or ALL CAPS short line
    headingLevel: number;     // 1-6 for headings, 0 otherwise
    isSectionBreak: boolean;  // repeating numbered/labeled section (Day 1, Week 2, Part A, etc.)
    sectionLabel?: string;    // "Day 1", "Week 2", etc.
    sectionIndex?: number;    // 1, 2, 3...
    sectionDate?: string;     // extracted date if present in header
    isSubHeading: boolean;    // single-word/short label line (Food, Notes, Links, etc.)
    subHeadingLabel?: string;
    isLink: boolean;          // line is only a URL
    linkUrl?: string;
    isChecked: boolean;       // ✅ ☑ ✓ [x] ~~strikethrough~~
    isBullet: boolean;
    bulletDepth: number;
    hasTime: boolean;
    time?: string;            // "9:20 AM", "14:30", etc.
    hasCost: boolean;
    cost?: string;            // "$15", "~$345.09", "€20/person"
    hasAddress: boolean;
    address?: string;
    hasKeyValue: boolean;     // "Label: value" pattern
    kvKey?: string;
    kvValue?: string;
    hasReference: boolean;    // alphanumeric codes like HUKDS7, ABC123
    reference?: string;
    embeddedLinks: string[];  // URLs found within the text
  };
}

interface StructuredData {
  sections: {
    label: string;
    index: number;
    date?: string;
    items: {
      text: string;
      link?: string;
      time?: string;
      cost?: string;
      isChecked: boolean;
      subSection?: string;
    }[];
  }[];
  keyValues: { key: string; value: string; cost?: string; link?: string }[];
  linkMap: { text: string; url: string }[];
  orphanItems: { text: string; link?: string; time?: string; cost?: string; isChecked: boolean }[];
}

const MONTH_PAT = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const MONTH_MAP: Record<string, string> = {
  jan: "01", january: "01", feb: "02", february: "02", mar: "03", march: "03",
  apr: "04", april: "04", may: "05", jun: "06", june: "06", jul: "07", july: "07",
  aug: "08", august: "08", sep: "09", sept: "09", september: "09",
  oct: "10", october: "10", nov: "11", november: "11", dec: "12", december: "12",
};

function tryParseDate(s: string, defaultYear: string): string | undefined {
  // "April 27th" → "2025-04-27", "28th" with prior month context, etc.
  const m = s.match(new RegExp(`(${MONTH_PAT})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:[,\\s]+(\\d{4}))?`, "i"));
  if (!m) return undefined;
  const mm = MONTH_MAP[m[1].toLowerCase()];
  if (!mm) return undefined;
  const dd = m[2].padStart(2, "0");
  const yyyy = m[3] || defaultYear;
  return `${yyyy}-${mm}-${dd}`;
}

function preParseStructured(text: string, links: string[]): StructuredData {
  const yearMatch = text.match(/\b(202\d|203\d)\b/);
  const defaultYear = yearMatch?.[1] || new Date().getFullYear().toString();

  const rawLines = text.split("\n");
  const annotated: AnnotatedLine[] = [];

  // ── Pass 1: Annotate every line with detected patterns ──
  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const stripped = trimmed.replace(/^[-•*]\s*/, "").replace(/^#+ /, "").trim();

    const p: AnnotatedLine["patterns"] = {
      isHeading: false, headingLevel: 0,
      isSectionBreak: false, isSubHeading: false,
      isLink: false, isChecked: false,
      isBullet: false, bulletDepth: 0,
      hasTime: false, hasCost: false, hasAddress: false,
      hasKeyValue: false, hasReference: false,
      embeddedLinks: [],
    };

    // Heading detection: markdown # or ALL CAPS short line
    const headingMatch = trimmed.match(/^(#{1,6})\s/);
    if (headingMatch) {
      p.isHeading = true;
      p.headingLevel = headingMatch[1].length;
    } else if (stripped.length > 2 && stripped.length < 60 && stripped === stripped.toUpperCase() && /[A-Z]/.test(stripped)) {
      p.isHeading = true;
      p.headingLevel = 2;
    }

    // Section break: numbered/labeled repeating pattern
    // "Day 1", "DAY 1 [April 27th]", "Week 2", "Part 3", "Phase 1", "1.", "1)"
    const sectionPats = [
      /^#*\s*(?:day|week|part|phase|leg|stop|stage|night|session)\s+(\d+)\s*(.*)/i,
      /^#*\s*(\d+)[.)]\s+(.*)/,
    ];
    for (const sp of sectionPats) {
      const sm = stripped.match(sp);
      if (sm) {
        p.isSectionBreak = true;
        p.sectionIndex = parseInt(sm[1]);
        p.sectionLabel = stripped.replace(/[\[\]()]/g, "").trim();
        p.sectionDate = tryParseDate(sm[2] || stripped, defaultYear);
        break;
      }
    }

    // Sub-heading: short label line (1-3 words, often single word like "Food", "Notes", "Links")
    if (!p.isSectionBreak && stripped.length < 30 && /^[A-Za-z\s]+$/.test(stripped) && stripped.split(/\s+/).length <= 3) {
      p.isSubHeading = true;
      p.subHeadingLabel = stripped;
    }

    // Link-only line
    if (/^https?:\/\/\S+$/.test(stripped) || /^maps\.app\.goo\.gl\/\S+$/.test(stripped)) {
      p.isLink = true;
      p.linkUrl = stripped.startsWith("http") ? stripped : `https://${stripped}`;
    }

    // Checked / completed
    p.isChecked = /✅|☑|✓|\[x\]|~~.+~~/i.test(trimmed);

    // Bullet
    if (/^[-•*]\s/.test(trimmed) || raw.match(/^\s{2,}-\s/)) {
      p.isBullet = true;
      const indent = raw.match(/^(\s*)/)?.[1]?.length || 0;
      p.bulletDepth = Math.floor(indent / 2);
    }

    // Time patterns: "9:20 AM", "14:30", "at 11:30 AM"
    const timeMatch = stripped.match(/\b(?:at\s+)?(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)\b/);
    if (timeMatch) {
      p.hasTime = true;
      p.time = timeMatch[1].trim();
    }

    // Cost patterns: "$15", "~$345.09", "€20", "£50/person", "$606.42"
    const costMatch = stripped.match(/[~≈]?\s*[$€£¥]\s*[\d,.]+(?:\s*\/\s*person)?/i);
    if (costMatch) {
      p.hasCost = true;
      p.cost = costMatch[0].trim();
    }

    // Address pattern: number + street words + optional city/state/postal
    const addrMatch = stripped.match(/\d+\s+[\w\s]+(?:avenue|ave|street|st|road|rd|drive|dr|boulevard|blvd|way|crescent|lane|court|place|plaza|highway|hwy)[\w\s,.]*/i);
    if (addrMatch && addrMatch[0].length > 15) {
      p.hasAddress = true;
      p.address = addrMatch[0].trim();
    }

    // Key-value: "Label: value" or "Label - value"
    const kvMatch = stripped.match(/^([A-Za-z][\w\s]{0,30}?)\s*[:–—-]\s+(.+)/);
    if (kvMatch && kvMatch[1].length < 30) {
      p.hasKeyValue = true;
      p.kvKey = kvMatch[1].trim();
      p.kvValue = kvMatch[2].trim();
    }

    // Reference codes: 5-12 char alphanumeric that looks like a booking ref
    const refMatch = stripped.match(/\b([A-Z0-9]{5,12})\b/);
    if (refMatch && /[A-Z]/.test(refMatch[1]) && /\d/.test(refMatch[1])) {
      p.hasReference = true;
      p.reference = refMatch[1];
    }

    // Embedded links
    const urlMatches = stripped.matchAll(/https?:\/\/\S+/g);
    for (const um of urlMatches) {
      p.embeddedLinks.push(um[0]);
    }

    annotated.push({ raw, text: stripped, lineNum: i, patterns: p });
  }

  // ── Pass 2: Build structured output from annotations ──
  const sections: StructuredData["sections"] = [];
  const keyValues: StructuredData["keyValues"] = [];
  const linkMap: StructuredData["linkMap"] = [];
  const orphanItems: StructuredData["orphanItems"] = [];

  let currentSection: StructuredData["sections"][0] | null = null;
  let currentSubSection: string | undefined;
  let lastContentItem: { text: string; link?: string } | null = null;

  for (let ai = 0; ai < annotated.length; ai++) {
    const a = annotated[ai];
    const p = a.patterns;

    // Section breaks start a new section
    if (p.isSectionBreak) {
      currentSubSection = undefined;
      currentSection = {
        label: p.sectionLabel!,
        index: p.sectionIndex!,
        date: p.sectionDate,
        items: [],
      };
      sections.push(currentSection);
      lastContentItem = null;
      continue;
    }

    // Sub-headings set context within a section
    if (p.isSubHeading && currentSection) {
      currentSubSection = p.subHeadingLabel;
      continue;
    }

    // Link-only lines attach to previous item
    if (p.isLink && p.linkUrl) {
      if (lastContentItem) {
        lastContentItem.link = p.linkUrl;
        linkMap.push({ text: lastContentItem.text, url: p.linkUrl });
      }
      continue;
    }

    // Key-value pairs go to a flat list
    if (p.hasKeyValue && !currentSection) {
      const kvLink = p.embeddedLinks[0];
      keyValues.push({
        key: p.kvKey!,
        value: p.kvValue!,
        cost: p.hasCost ? p.cost : undefined,
        link: kvLink,
      });
      continue;
    }

    // Skip pure heading lines that aren't section breaks
    if (p.isHeading && !p.isSectionBreak && a.text.length < 40) {
      if (!currentSection) {
        currentSubSection = a.text.replace(/^#+ /, "");
      }
      continue;
    }

    // Skip very short lines
    if (a.text.length < 2) continue;

    // Build content item
    let cleanText = a.text
      .replace(/✅|☑|✓|\[x\]/gi, "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleanText || cleanText.length < 2) continue;

    // Check next annotated line for a link
    let nextLink: string | undefined;
    if (ai + 1 < annotated.length && annotated[ai + 1].patterns.isLink) {
      nextLink = annotated[ai + 1].patterns.linkUrl;
    }

    const item = {
      text: cleanText,
      link: p.embeddedLinks[0] || nextLink,
      time: p.hasTime ? p.time : undefined,
      cost: p.hasCost ? p.cost : undefined,
      isChecked: p.isChecked,
      subSection: currentSubSection,
    };

    lastContentItem = item;

    if (currentSection) {
      currentSection.items.push(item);
    } else {
      // Key-value at top level
      if (p.hasKeyValue) {
        keyValues.push({
          key: p.kvKey!,
          value: p.kvValue!,
          cost: p.hasCost ? p.cost : undefined,
          link: p.embeddedLinks[0],
        });
      } else {
        orphanItems.push(item);
      }
    }
  }

  return { sections, keyValues, linkMap, orphanItems };
}
