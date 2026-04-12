import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, animate, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import type {
  DailyLog,
  JournalEntry,
  PersonTripStats,
  SuperlativeId,
  Trip,
  TripMember,
  TripReportPayload,
} from "@pangofold/shared";
import {
  collectItemMap,
  heroPhotoForPerson,
  journalPhotoUrls,
  personSuperlatives,
  topSpendCategoryForPerson,
} from "../../lib/wrapped-helpers";
import { cn } from "../../lib/cn";
import { exportStoryCardAsZip } from "../../lib/wrapped-export";

const TEAL = "#2DD4BF";

const SUPERLATIVE_LABEL: Record<SuperlativeId, string> = {
  foodie: "The Foodie",
  highRoller: "High Roller",
  historian: "The Historian",
  navigator: "The Navigator",
};

// Per-card light gradients (aligned with app shell)
const CARD_THEMES: Record<string, { gradient: string; accent: string }> = {
  intro:       { gradient: "from-amber-100 via-orange-50 to-rose-100", accent: "text-amber-900" },
  crew:        { gradient: "from-teal-100 via-cyan-50 to-slate-100", accent: "text-teal-900" },
  tripNumbers: { gradient: "from-teal-100 via-emerald-50 to-slate-100", accent: "text-teal-900" },
  total:       { gradient: "from-violet-100 via-purple-50 to-fuchsia-100", accent: "text-violet-900" },
  categories:  { gradient: "from-violet-100 via-purple-50 to-indigo-100", accent: "text-violet-900" },
  biggestSpender: { gradient: "from-indigo-100 via-violet-50 to-purple-100", accent: "text-indigo-900" },
  foodVerdict: { gradient: "from-amber-100 via-orange-50 to-stone-100", accent: "text-amber-900" },
  person:      { gradient: "from-emerald-100 via-teal-50 to-cyan-100", accent: "text-emerald-900" },
  superlatives:{ gradient: "from-sky-100 via-blue-50 to-indigo-100", accent: "text-sky-900" },
  settlement:  { gradient: "from-slate-100 via-slate-50 to-zinc-100", accent: "text-slate-700" },
  bestMoment:  { gradient: "from-pink-100 via-fuchsia-50 to-purple-100", accent: "text-pink-900" },
  funniestMoments: { gradient: "from-violet-100 via-purple-50 to-fuchsia-100", accent: "text-violet-900" },
  photoGrid:   { gradient: "from-zinc-100 via-stone-50 to-neutral-100", accent: "text-zinc-800" },
  crewProfiles:{ gradient: "from-teal-100 via-slate-50 to-slate-100", accent: "text-teal-900" },
  outro:       { gradient: "from-amber-100 via-orange-50 to-rose-100", accent: "text-amber-900" },
};

function getTheme(kind: string) {
  return CARD_THEMES[kind] ?? CARD_THEMES.intro!;
}

export type WrappedSlide =
  | { id: string; kind: "intro" }
  | { id: string; kind: "crew" }
  | { id: string; kind: "tripNumbers" }
  | { id: string; kind: "total" }
  | { id: string; kind: "categories" }
  | { id: string; kind: "biggestSpender" }
  | { id: string; kind: "foodVerdict" }
  | { id: string; kind: "person"; person: PersonTripStats }
  | { id: string; kind: "superlatives" }
  | { id: string; kind: "settlement" }
  | { id: string; kind: "bestMoment" }
  | { id: string; kind: "funniestMoments" }
  | { id: string; kind: "photoGrid" }
  | { id: string; kind: "crewProfiles" }
  | { id: string; kind: "outro" };

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatTripDateRange(start?: string, end?: string): string {
  if (!start) return "";
  try {
    const fmt = (iso: string) =>
      new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const year = new Date(start + "T00:00:00").getFullYear();
    return end
      ? `${fmt(start)} – ${fmt(end)}, ${year}`
      : `${fmt(start)}, ${year}`;
  } catch {
    return start;
  }
}

function buildSlideList(
  payload: TripReportPayload,
  entries: JournalEntry[],
  members: TripMember[],
  dailyLogs: DailyLog[],
): WrappedSlide[] {
  const slides: WrappedSlide[] = [{ id: "intro", kind: "intro" }];

  // Crew slide if we have member profiles
  if (members.length > 0) slides.push({ id: "crew", kind: "crew" });

  // Trip in numbers
  const hasNumbers = payload.totalSpendCents > 0 || entries.length > 0;
  if (hasNumbers) slides.push({ id: "tripNumbers", kind: "tripNumbers" });

  // Total spend
  if (payload.totalSpendCents > 0) slides.push({ id: "total", kind: "total" });

  // Categories
  const cats = Object.entries(payload.spendByCategory).filter(([, v]) => v > 0);
  if (cats.length > 0) slides.push({ id: "cats", kind: "categories" });

  // Biggest spender
  if (payload.perPerson.length > 1) slides.push({ id: "bigSpender", kind: "biggestSpender" });

  // Food verdict from daily logs
  const hasFood = dailyLogs.some((l) => l.bestFoodText || l.worstFoodText);
  if (hasFood) slides.push({ id: "food", kind: "foodVerdict" });

  // Per person
  for (const p of payload.perPerson) {
    slides.push({ id: `person-${p.name}`, kind: "person", person: p });
  }

  // Superlatives
  const hasSuper = Object.values(payload.superlatives).some(Boolean);
  if (hasSuper) slides.push({ id: "super", kind: "superlatives" });

  // Settlement
  if (payload.settlement.length > 0) slides.push({ id: "settle", kind: "settlement" });

  // Best moment
  if (payload.bestRated) slides.push({ id: "best", kind: "bestMoment" });

  // Funniest moments reveal
  const hasFunny = dailyLogs.some((l) => l.funniestMoment);
  if (hasFunny) slides.push({ id: "funny", kind: "funniestMoments" });

  // Photo grid
  const photoUrls = journalPhotoUrls(entries, 6);
  if (photoUrls.length > 0) slides.push({ id: "photos", kind: "photoGrid" });

  // Crew profiles
  const hasProfiles = members.some((m) => m.onboardingPromptAnswer || m.funFact);
  if (hasProfiles) slides.push({ id: "crewProfiles", kind: "crewProfiles" });

  slides.push({ id: "outro", kind: "outro" });
  return slides;
}

function AnimatedCents({ cents }: { cents: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const controls = animate(0, cents, {
      duration: 1.2,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setV(Math.round(latest)),
    });
    return () => controls.stop();
  }, [cents]);
  return <span className="tabular-nums">{formatMoney(v)}</span>;
}

function AnimatedInt({ value }: { value: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const controls = animate(0, value, {
      duration: 1.0,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setV(Math.round(latest)),
    });
    return () => controls.stop();
  }, [value]);
  return <span className="tabular-nums">{v.toLocaleString()}</span>;
}

function LazyPhoto({
  src,
  className,
  attribution,
}: {
  src: string;
  className?: string;
  attribution?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState(false);
  return (
    <div className={cn("relative overflow-hidden", className)}>
      {!loaded && !err && (
        <div className="absolute inset-0 animate-pulse bg-white/10" />
      )}
      {!err && (
        <img
          src={src}
          alt={attribution ?? ""}
          className={cn("w-full h-full object-cover transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setErr(true)}
        />
      )}
      {err && (
        <div className="absolute inset-0 bg-white/5 flex items-center justify-center text-text-muted text-xs">
          No photo
        </div>
      )}
      {attribution && loaded && (
        <div className="absolute bottom-1 right-1 text-[10px] text-text-muted bg-black/40 px-1 rounded-sm">
          {attribution}
        </div>
      )}
    </div>
  );
}

function MemberAvatar({ member, size = 40 }: { member: TripMember; size?: number }) {
  const [err, setErr] = useState(false);
  const initials = (member.displayName ?? "?")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div
      className="rounded-full overflow-hidden flex items-center justify-center font-bold text-text shrink-0"
      style={{
        width: size,
        height: size,
        background:
          member.avatarUrl && !err ? undefined : `linear-gradient(135deg, ${TEAL}, #0891b2)`,
        fontSize: size * 0.36,
        boxShadow: `0 0 0 2px ${TEAL}60`,
      }}
    >
      {member.avatarUrl && !err ? (
        <img
          src={member.avatarUrl}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setErr(true)}
        />
      ) : (
        initials
      )}
    </div>
  );
}

interface WrappedStoryProps {
  trip: Trip;
  payload: TripReportPayload;
  entries: JournalEntry[];
  members?: TripMember[];
  dailyLogs?: DailyLog[];
  exportRef?: React.RefObject<HTMLDivElement | null>;
}

export function WrappedStory({
  trip,
  payload,
  entries,
  members = [],
  dailyLogs = [],
  exportRef,
}: WrappedStoryProps) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [exporting, setExporting] = useState(false);
  const fallbackCardRef = useRef<HTMLDivElement>(null);
  const cardRef = exportRef ?? fallbackCardRef;
  const slides = useMemo(
    () => buildSlideList(payload, entries, members, dailyLogs),
    [payload, entries, members, dailyLogs],
  );
  const itemById = useMemo(() => collectItemMap(trip), [trip]);

  useEffect(() => {
    if (slides.length === 0) return;
    setIndex((i) => Math.min(i, slides.length - 1));
  }, [slides.length]);

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => {
        const n = i + delta;
        if (n < 0 || n >= slides.length) return i;
        setDirection(delta > 0 ? 1 : -1);
        return n;
      });
    },
    [slides.length],
  );

  const handleExportZip = useCallback(async () => {
    const el = cardRef.current;
    if (!el || slides.length === 0 || exporting) return;
    const restoreIndex = index;
    setExporting(true);
    try {
      await exportStoryCardAsZip({
        cardElement: el,
        slideCount: slides.length,
        setSlideIndex: setIndex,
        restoreIndex,
        zipFilename: `group-wrapped-${trip.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 12)}.zip`,
        filePrefix: "wrapped",
      });
    } catch (e) {
      console.error("Wrapped export failed", e);
    } finally {
      setExporting(false);
    }
  }, [cardRef, slides.length, index, exporting, trip.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const slide = slides[index]!;
  const theme = getTheme(slide.kind);

  const slideVariants = {
    enter: (d: number) => ({ x: d > 0 ? "100%" : "-100%", opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? "-100%" : "100%", opacity: 0 }),
  };

  const slideNode = useMemo(() => {
    const g = `bg-gradient-to-br ${theme.gradient}`;
    const sub = theme.accent;

    // Aggregate daily log data helpers
    const allBestFoods = dailyLogs.filter((l) => l.bestFoodText);
    const allFunniestMoments = dailyLogs.filter((l) => l.funniestMoment);
    const totalGroupSteps = dailyLogs.reduce((s, l) => s + (l.stepsCount ?? 0), 0);
    const totalPhotos = entries.flatMap((e) => e.photos ?? []).length;

    // Member by id lookup
    const memberById = Object.fromEntries(members.map((m) => [m.id, m]));

    switch (slide.kind) {
      case "intro":
        return (
          <div className={cn("flex h-full flex-col justify-between p-8 text-text", g)}>
            <div>
              <p className={cn("text-xs font-semibold uppercase tracking-[0.35em]", sub)}>
                Pangofold Wrapped
              </p>
              <p className="mt-6 text-7xl font-black leading-none opacity-90">
                {new Date().getFullYear()}
              </p>
              <h1 className="mt-4 text-3xl font-bold leading-tight">{trip.title}</h1>
              {trip.startDate && (
                <p className={cn("mt-3 text-sm", sub)}>
                  {formatTripDateRange(trip.startDate, trip.endDate)}
                </p>
              )}
            </div>
            <div className="relative h-40 w-full overflow-hidden rounded-2xl border-2 border-white/30 bg-black/20">
              {trip.coverImageUrl ? (
                <LazyPhoto src={trip.coverImageUrl} className="h-full w-full" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-text-muted">
                  Your trip
                </div>
              )}
            </div>
          </div>
        );

      case "crew":
        return (
          <div className={cn("flex h-full flex-col justify-center gap-6 px-8 text-text", g)}>
            <div>
              <p className={cn("text-xs font-semibold uppercase tracking-[0.35em] mb-4", sub)}>
                The crew
              </p>
              <p className="text-5xl font-black leading-none">
                {members.length} {members.length === 1 ? "person" : "people"}
              </p>
              <p className={cn("mt-3 text-base", sub)}>
                {trip.destinations.length} destination{trip.destinations.length !== 1 ? "s" : ""}
                {trip.startDate && trip.endDate && (
                  <>
                    {" "}· {formatTripDateRange(trip.startDate, trip.endDate)}
                  </>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {members.map((m, i) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.08 * i, type: "spring", stiffness: 300, damping: 24 }}
                  className="flex flex-col items-center gap-2"
                >
                  <MemberAvatar member={m} size={56} />
                  <p className="text-xs font-medium text-text-muted">{m.displayName ?? "—"}</p>
                </motion.div>
              ))}
            </div>
          </div>
        );

      case "tripNumbers":
        return (
          <div className={cn("flex h-full flex-col justify-center gap-5 px-8 text-text", g)}>
            <p className={cn("text-xs font-semibold uppercase tracking-[0.35em]", sub)}>
              The numbers
            </p>
            <div className="grid grid-cols-2 gap-3">
              <NumberTile
                label="Total spent"
                sub={sub}
                value={<AnimatedCents cents={payload.totalSpendCents} />}
              />
              <NumberTile label="Memories logged" sub={sub} value={<AnimatedInt value={entries.length} />} />
              <NumberTile label="Photos taken" sub={sub} value={<AnimatedInt value={totalPhotos} />} />
              {totalGroupSteps > 0 && (
                <NumberTile
                  label="Steps walked"
                  sub={sub}
                  value={<AnimatedInt value={totalGroupSteps} />}
                />
              )}
            </div>
            {totalGroupSteps > 0 && (
              <p className={cn("text-xs", sub)}>
                You collectively walked {Math.round(totalGroupSteps / 1300)} km.
              </p>
            )}
          </div>
        );

      case "total":
        return (
          <div className={cn("flex h-full flex-col justify-center px-8 text-text", g)}>
            <p className={cn("text-sm font-medium uppercase tracking-widest", sub)}>Total logged</p>
            <div className="mt-4 text-5xl font-black tabular-nums sm:text-6xl">
              <AnimatedCents cents={payload.totalSpendCents} />
            </div>
            <p className={cn("mt-6 max-w-[280px] text-base leading-relaxed", sub)}>
              Every meal, ride, and memory — in one number.
            </p>
          </div>
        );

      case "categories": {
        const sorted = (Object.entries(payload.spendByCategory) as [string, number][])
          .filter(([, v]) => v > 0)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);
        const max = sorted[0]?.[1] ?? 1;
        return (
          <div className={cn("flex h-full flex-col justify-center gap-6 px-8 py-10 text-text", g)}>
            <p className={cn("text-sm font-medium uppercase tracking-widest", sub)}>Where it went</p>
            <ul className="space-y-4">
              {sorted.map(([k, v]) => (
                <li key={k} className="space-y-1">
                  <div className="flex justify-between text-sm font-medium capitalize">
                    <span>{k === "uncategorized" ? "Other" : k}</span>
                    <span>{formatMoney(v)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-black/25">
                    <motion.div
                      className="h-full rounded-full bg-white/90"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(8, (v / max) * 100)}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      }

      case "biggestSpender": {
        const sorted = [...payload.perPerson].sort(
          (a, b) => b.attributedSpendCents - a.attributedSpendCents,
        );
        const top = sorted[0];
        const bestValue = [...payload.perPerson].sort(
          (a, b) =>
            (b.photoCount + b.logCount) / Math.max(b.attributedSpendCents, 1) -
            (a.photoCount + a.logCount) / Math.max(a.attributedSpendCents, 1),
        )[0];
        return (
          <div className={cn("flex h-full flex-col justify-center gap-5 px-8 text-text", g)}>
            <p className={cn("text-xs font-semibold uppercase tracking-[0.35em]", sub)}>
              The tab
            </p>
            {top && (
              <div className="rounded-2xl bg-white/10 border border-white/10 p-5">
                <p className={cn("text-[10px] uppercase tracking-wide mb-2", sub)}>
                  Highest spend
                </p>
                <p className="text-2xl font-black">{top.name}</p>
                <p className={cn("mt-1 text-xl font-bold", sub)}>
                  {formatMoney(top.attributedSpendCents)}
                </p>
              </div>
            )}
            {bestValue && bestValue.name !== top?.name && (
              <div className="rounded-2xl bg-white/10 border border-white/10 p-5">
                <p className={cn("text-[10px] uppercase tracking-wide mb-2", sub)}>
                  Best value (most memories per dollar)
                </p>
                <p className="text-2xl font-black">{bestValue.name}</p>
              </div>
            )}
            {payload.settlement.length > 0 && (
              <p className={cn("text-xs", sub)}>
                Settle up on the next slide.
              </p>
            )}
          </div>
        );
      }

      case "foodVerdict": {
        const grouped = allBestFoods.reduce<Record<string, string[]>>((acc, l) => {
          const key = l.memberId;
          acc[key] = acc[key] ?? [];
          acc[key].push(l.bestFoodText!);
          return acc;
        }, {});
        const topBites = Object.entries(grouped)
          .slice(0, 3)
          .map(([memberId, texts]) => ({ member: memberById[memberId], text: texts[0] ?? "" }));
        const worstLog = dailyLogs
          .filter((l) => l.worstFoodText)
          .sort(() => Math.random() - 0.5)[0];
        return (
          <div className={cn("flex h-full flex-col justify-center gap-4 px-8 text-text", g)}>
            <p className={cn("text-xs font-semibold uppercase tracking-[0.35em]", sub)}>
              Food verdict
            </p>
            <p className="text-sm font-bold text-text-muted uppercase tracking-wide">
              Top bites
            </p>
            <div className="space-y-3">
              {topBites.map(({ member: m, text }, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 * i }}
                  className="rounded-2xl bg-white/10 border border-white/10 p-4"
                >
                  <div className="flex items-center gap-2 mb-1">
                    {m && <MemberAvatar member={m} size={24} />}
                    <p className="text-[11px] text-text-muted">{m?.displayName ?? "Someone"}</p>
                  </div>
                  <p className="text-sm font-semibold">"{text}"</p>
                </motion.div>
              ))}
            </div>
            {worstLog && (
              <div className={cn("text-xs mt-2", sub)}>
                💀 Most regrettable:{" "}
                <span className="italic">"{worstLog.worstFoodText}"</span>
              </div>
            )}
          </div>
        );
      }

      case "person": {
        const p = slide.person;
        const hero = heroPhotoForPerson(entries, p.name);
        const topCat = topSpendCategoryForPerson(entries, p.name, itemById);
        const badges = personSuperlatives(p.name, payload.superlatives);
        const memberProfile = members.find((m) => m.displayName === p.name);
        const memberSteps = dailyLogs
          .filter((l) => l.memberId === memberProfile?.id)
          .reduce((s, l) => s + (l.stepsCount ?? 0), 0);
        return (
          <div className={cn("flex h-full flex-col text-text", g)}>
            <div className="relative h-[42%] min-h-[160px] w-full overflow-hidden border-b border-white/10">
              {hero ? (
                <LazyPhoto src={hero} className="h-full w-full" />
              ) : (
                <div className="flex h-full items-center justify-center bg-black/30 text-sm text-text-muted">
                  {memberProfile ? (
                    <MemberAvatar member={memberProfile} size={80} />
                  ) : (
                    "No photo yet — keep logging!"
                  )}
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <p className={cn("absolute bottom-4 left-6 text-xs uppercase tracking-widest", sub)}>Traveler</p>
              <h2 className="absolute bottom-8 left-6 right-6 text-3xl font-bold leading-tight">{p.name}</h2>
            </div>
            <div className="flex flex-1 flex-col justify-center gap-4 px-8 py-6">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <StatCell label="Share of spend" value={formatMoney(p.attributedSpendCents)} sub={sub} />
                <StatCell label="Logs" value={String(p.logCount)} sub={sub} />
                <StatCell label="Photos" value={String(p.photoCount)} sub={sub} />
                {memberSteps > 0 && (
                  <StatCell label="Steps" value={memberSteps.toLocaleString()} sub={sub} />
                )}
              </div>
              {topCat && (
                <p className={cn("text-sm", sub)}>
                  Top category: <strong className="text-text">{topCat}</strong>
                </p>
              )}
              {memberProfile?.onboardingPromptAnswer && (
                <p className={cn("text-xs italic", sub)}>
                  "{memberProfile.onboardingPromptAnswer}"
                </p>
              )}
              {badges.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {badges.map((b) => (
                    <span key={b} className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">
                      {b}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      }

      case "superlatives":
        return (
          <div className={cn("flex h-full flex-col justify-center gap-5 px-8 text-text", g)}>
            <p className={cn("text-sm font-medium uppercase tracking-widest", sub)}>Superlatives</p>
            <ul className="space-y-4">
              {(Object.keys(payload.superlatives) as SuperlativeId[]).map((key, i) => {
                const name = payload.superlatives[key];
                if (!name) return null;
                return (
                  <motion.li
                    key={key}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.08 * i }}
                    className="flex items-center justify-between border-b border-white/10 pb-3 last:border-0"
                  >
                    <span className="font-semibold">{SUPERLATIVE_LABEL[key]}</span>
                    <span className="text-lg font-bold">{name}</span>
                  </motion.li>
                );
              })}
            </ul>
            {/* Auto-generated from data */}
            {payload.perPerson.length > 0 && (
              <div className="mt-2 space-y-2">
                {[
                  {
                    label: "Most photos",
                    winner: [...payload.perPerson].sort((a, b) => b.photoCount - a.photoCount)[0],
                    stat: (p: PersonTripStats) => `${p.photoCount} photos`,
                  },
                  {
                    label: "Most logs",
                    winner: [...payload.perPerson].sort((a, b) => b.logCount - a.logCount)[0],
                    stat: (p: PersonTripStats) => `${p.logCount} logs`,
                  },
                ]
                  .filter(({ winner }) => winner && winner.logCount > 0)
                  .map(({ label, winner, stat }) => (
                    <div key={label} className={cn("text-xs", sub)}>
                      {label}: <strong className="text-text">{winner!.name}</strong>{" "}
                      ({stat(winner!)})
                    </div>
                  ))}
              </div>
            )}
          </div>
        );

      case "settlement":
        return (
          <div className={cn("flex h-full flex-col justify-center gap-4 px-8 text-text", g)}>
            <p className={cn("text-sm font-medium uppercase tracking-widest", sub)}>Settle up</p>
            <ul className="max-h-[min(50vh,320px)] space-y-3 overflow-y-auto pr-1 text-sm">
              {payload.settlement.map((s, i) => (
                <li key={i} className="flex justify-between gap-2 rounded-xl bg-white/10 px-3 py-2">
                  <span>
                    {s.from} → {s.to}
                  </span>
                  <span className="shrink-0 font-bold tabular-nums">{formatMoney(s.amountCents)}</span>
                </li>
              ))}
            </ul>
          </div>
        );

      case "bestMoment":
        return (
          <div className={cn("flex h-full flex-col justify-between p-8 text-text", g)}>
            <div>
              <p className={cn("text-sm font-medium uppercase tracking-widest", sub)}>Best moment</p>
              <p className="mt-6 text-2xl font-bold leading-snug">{payload.bestRated?.title}</p>
              <p className="mt-2 text-5xl font-black">
                {payload.bestRated?.rating ?? "—"}
                <span className="text-2xl">/5</span>
              </p>
            </div>
            {entries.find((e) => e.id === payload.bestRated?.entryId)?.photos?.[0]?.publicUrl && (
              <div className="mt-4 h-44 overflow-hidden rounded-2xl border border-white/20">
                <LazyPhoto
                  src={entries.find((e) => e.id === payload.bestRated?.entryId)!.photos![0]!.publicUrl!}
                  className="h-full w-full"
                />
              </div>
            )}
          </div>
        );

      case "funniestMoments": {
        // Group by member
        const byMember: { member: TripMember | undefined; moment: string }[] =
          allFunniestMoments.map((l) => ({
            member: memberById[l.memberId],
            moment: l.funniestMoment!,
          }));
        return (
          <div className={cn("flex h-full flex-col p-8 text-text", g)}>
            <p className={cn("text-xs font-semibold uppercase tracking-[0.35em] mb-2", sub)}>
              Funniest moments
            </p>
            <p className="text-xs text-text-muted mb-5">Private during the trip · revealed now</p>
            <div className="space-y-3 overflow-y-auto flex-1">
              {byMember.map(({ member: m, moment }, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12 * i, type: "spring", stiffness: 280, damping: 26 }}
                  className="rounded-2xl bg-white/10 border border-white/10 p-4"
                >
                  {m && (
                    <div className="flex items-center gap-2 mb-2">
                      <MemberAvatar member={m} size={20} />
                      <p className="text-[11px] text-text-muted">{m.displayName}</p>
                    </div>
                  )}
                  <p className="text-sm font-semibold leading-snug">"{moment}"</p>
                </motion.div>
              ))}
            </div>
          </div>
        );
      }

      case "photoGrid": {
        const urls = journalPhotoUrls(entries, 6);
        return (
          <div className={cn("flex h-full flex-col justify-center gap-4 p-6 text-text", g)}>
            <p className={cn("text-sm font-medium uppercase tracking-widest", sub)}>The reel</p>
            <div className="grid grid-cols-3 gap-2">
              {urls.map((url, i) => (
                <motion.div
                  key={url + i}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.06 * i }}
                  className="aspect-square rounded-xl overflow-hidden"
                >
                  <LazyPhoto src={url} className="h-full w-full" />
                </motion.div>
              ))}
            </div>
          </div>
        );
      }

      case "crewProfiles":
        return (
          <div className={cn("flex h-full flex-col p-8 text-text", g)}>
            <p className={cn("text-xs font-semibold uppercase tracking-[0.35em] mb-6", sub)}>
              The crew
            </p>
            <div className="space-y-4 overflow-y-auto flex-1">
              {members
                .filter((m) => m.onboardingPromptAnswer || m.funFact)
                .map((m, i) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 * i }}
                    className="flex gap-3"
                  >
                    <MemberAvatar member={m} size={40} />
                    <div className="min-w-0">
                      <p className="text-sm font-bold">{m.displayName}</p>
                      {m.onboardingPromptAnswer && (
                        <p className={cn("text-xs mt-0.5 line-clamp-2", sub)}>
                          {m.onboardingPromptAnswer}
                        </p>
                      )}
                      {m.funFact && (
                        <p className="text-xs text-text-muted italic mt-0.5 line-clamp-1">
                          {m.funFact}
                        </p>
                      )}
                    </div>
                  </motion.div>
                ))}
            </div>
          </div>
        );

      case "outro":
        return (
          <div className={cn("flex h-full flex-col items-center justify-center gap-6 px-8 text-center text-text", g)}>
            <SparklesGlyph />
            <div>
              <p className="text-2xl font-bold">That's a wrap</p>
              <p className={cn("mt-3 text-sm leading-relaxed", sub)}>
                Scroll down for maps, categories, and the full breakdown — or swipe through again anytime.
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  }, [slide, trip, payload, entries, members, dailyLogs, itemById, theme]);

  return (
    <div className="relative w-full">
      {/* Progress bar */}
      <div className="mb-3 flex h-1.5 w-full overflow-hidden rounded-full bg-border/70">
        <motion.div
          className="h-full rounded-full bg-primary"
          animate={{ width: `${((index + 1) / slides.length) * 100}%` }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      </div>

      <div className="mb-2 flex flex-col items-center gap-2">
        <p className="text-center text-xs text-text-muted">
          {exporting
            ? "Exporting…"
            : `Tap sides or use ← → keys · ${index + 1} / ${slides.length}`}
        </p>
        <button
          type="button"
          onClick={handleExportZip}
          disabled={exporting || slides.length === 0}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-card px-3 py-1.5 text-xs font-medium text-text shadow-sm hover:bg-surface-card/90 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          Export ZIP (PNG)
        </button>
      </div>

      <div
        ref={cardRef}
        className="relative mx-auto aspect-[9/16] w-full max-w-[min(100%,420px)] overflow-hidden rounded-[2rem] border border-border shadow-2xl"
      >
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={slide.id}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 380, damping: 35 }}
            className="absolute inset-0"
          >
            {slideNode}
          </motion.div>
        </AnimatePresence>

        <button
          type="button"
          aria-label="Previous slide"
          className="absolute left-0 top-0 z-10 flex h-full w-[22%] cursor-w-resize items-center justify-start pl-2 text-text hover:text-text disabled:opacity-0"
          onClick={() => go(-1)}
          disabled={index <= 0}
        >
          <ChevronLeft className="h-10 w-10 drop-shadow-lg" />
        </button>
        <button
          type="button"
          aria-label="Next slide"
          className="absolute right-0 top-0 z-10 flex h-full w-[22%] cursor-e-resize items-center justify-end pr-2 text-text hover:text-text disabled:opacity-0"
          onClick={() => go(1)}
          disabled={index >= slides.length - 1}
        >
          <ChevronRight className="h-10 w-10 drop-shadow-lg" />
        </button>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatCell({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-card/90 p-3 backdrop-blur-sm shadow-sm">
      <p className={cn("text-[10px] uppercase tracking-wide", sub)}>{label}</p>
      <p className="text-xl font-bold tabular-nums text-text">{value}</p>
    </div>
  );
}

function NumberTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface-card/90 p-4 shadow-sm">
      <p className={cn("text-[10px] uppercase tracking-wide mb-1", sub)}>{label}</p>
      <p className="text-xl font-black text-text">{value}</p>
    </div>
  );
}

function SparklesGlyph() {
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-3xl text-text backdrop-blur-sm">
      ✦
    </div>
  );
}
