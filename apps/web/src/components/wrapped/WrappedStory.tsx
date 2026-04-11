import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, animate, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { JournalEntry, PersonTripStats, SuperlativeId, Trip, TripReportPayload } from "@pangofold/shared";
import {
  collectItemMap,
  heroPhotoForPerson,
  journalPhotoUrls,
  personSuperlatives,
  topSpendCategoryForPerson,
} from "../../lib/wrapped-helpers";
import { cn } from "../../lib/cn";

const SUPERLATIVE_LABEL: Record<SuperlativeId, string> = {
  foodie: "The Foodie",
  highRoller: "High Roller",
  historian: "The Historian",
  navigator: "The Navigator",
};

const THEMES = [
  { gradient: "from-amber-500 via-orange-600 to-rose-900", accent: "text-amber-100" },
  { gradient: "from-violet-600 via-purple-800 to-slate-950", accent: "text-violet-100" },
  { gradient: "from-emerald-600 via-teal-800 to-slate-950", accent: "text-emerald-100" },
  { gradient: "from-sky-600 via-blue-800 to-indigo-950", accent: "text-sky-100" },
  { gradient: "from-pink-600 via-fuchsia-800 to-purple-950", accent: "text-pink-100" },
  { gradient: "from-lime-700 via-green-800 to-emerald-950", accent: "text-lime-100" },
];

export type WrappedSlide =
  | { id: string; kind: "intro" }
  | { id: string; kind: "total" }
  | { id: string; kind: "categories" }
  | { id: string; kind: "person"; person: PersonTripStats }
  | { id: string; kind: "superlatives" }
  | { id: string; kind: "settlement" }
  | { id: string; kind: "bestMoment" }
  | { id: string; kind: "photoGrid" }
  | { id: string; kind: "outro" };

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function buildSlideList(payload: TripReportPayload, entries: JournalEntry[]): WrappedSlide[] {
  const slides: WrappedSlide[] = [{ id: "intro", kind: "intro" }];
  if (payload.totalSpendCents > 0) slides.push({ id: "total", kind: "total" });
  const cats = Object.entries(payload.spendByCategory).filter(([, v]) => v > 0);
  if (cats.length > 0) slides.push({ id: "cats", kind: "categories" });
  for (const p of payload.perPerson) {
    slides.push({ id: `person-${p.name}`, kind: "person", person: p });
  }
  const hasSuper = Object.values(payload.superlatives).some(Boolean);
  if (hasSuper) slides.push({ id: "super", kind: "superlatives" });
  if (payload.settlement.length > 0) slides.push({ id: "settle", kind: "settlement" });
  if (payload.bestRated) slides.push({ id: "best", kind: "bestMoment" });
  const urls = journalPhotoUrls(entries, 6);
  if (urls.length > 0) slides.push({ id: "photos", kind: "photoGrid" });
  slides.push({ id: "outro", kind: "outro" });
  return slides;
}

function AnimatedCents({ cents }: { cents: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const controls = animate(0, cents, {
      duration: 1.05,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setV(Math.round(latest)),
    });
    return () => controls.stop();
  }, [cents]);
  return <span className="tabular-nums">{formatMoney(v)}</span>;
}

interface WrappedStoryProps {
  trip: Trip;
  payload: TripReportPayload;
  entries: JournalEntry[];
  exportRef?: React.RefObject<HTMLDivElement | null>;
}

export function WrappedStory({ trip, payload, entries, exportRef }: WrappedStoryProps) {
  const slides = useMemo(() => buildSlideList(payload, entries), [payload, entries]);
  const itemById = useMemo(() => collectItemMap(trip), [trip]);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const slide = slides[index]!;
  const theme = THEMES[index % THEMES.length]!;

  const slideVariants = {
    enter: (d: number) => ({ x: d > 0 ? "100%" : "-100%", opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? "-100%" : "100%", opacity: 0 }),
  };

  const slideNode = useMemo(() => {
    const g = `bg-gradient-to-br ${theme.gradient}`;
    const sub = theme.accent;

    switch (slide.kind) {
      case "intro":
        return (
          <div className={cn("flex h-full flex-col justify-between p-8 text-white", g)}>
            <div>
              <p className={cn("text-xs font-semibold uppercase tracking-[0.35em]", sub)}>Pangofold Wrapped</p>
              <p className="mt-6 text-7xl font-black leading-none opacity-90">2026</p>
              <h1 className="mt-4 text-3xl font-bold leading-tight">{trip.title}</h1>
              {trip.startDate && trip.endDate && (
                <p className={cn("mt-3 text-sm", sub)}>{trip.startDate} → {trip.endDate}</p>
              )}
            </div>
            <div className="relative h-40 w-full overflow-hidden rounded-2xl border-2 border-white/30 bg-black/20">
              {trip.coverImageUrl ? (
                <img src={trip.coverImageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-white/70">Your trip</div>
              )}
            </div>
          </div>
        );
      case "total":
        return (
          <div className={cn("flex h-full flex-col justify-center px-8 text-white", g)}>
            <p className={cn("text-sm font-medium uppercase tracking-widest", sub)}>Total logged</p>
            <div className="mt-4 text-5xl font-black tabular-nums sm:text-6xl">
              <AnimatedCents cents={payload.totalSpendCents} />
            </div>
            <p className={cn("mt-6 max-w-[280px] text-base leading-relaxed", sub)}>
              Every meal, ride, and memory you logged — in one number.
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
          <div className={cn("flex h-full flex-col justify-center gap-6 px-8 py-10 text-white", g)}>
            <p className={cn("text-sm font-medium uppercase tracking-widest", sub)}>Where the money went</p>
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
      case "person": {
        const p = slide.person;
        const hero = heroPhotoForPerson(entries, p.name);
        const topCat = topSpendCategoryForPerson(entries, p.name, itemById);
        const badges = personSuperlatives(p.name, payload.superlatives);
        return (
          <div className={cn("flex h-full flex-col text-white", g)}>
            <div className="relative h-[42%] min-h-[160px] w-full overflow-hidden border-b border-white/10">
              {hero ? (
                <img src={hero} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center bg-black/30 text-sm text-white/70">
                  No photo yet — keep logging!
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <p className={cn("absolute bottom-4 left-6 text-xs uppercase tracking-widest", sub)}>Traveler</p>
              <h2 className="absolute bottom-8 left-6 right-6 text-3xl font-bold leading-tight">{p.name}</h2>
            </div>
            <div className="flex flex-1 flex-col justify-center gap-4 px-8 py-6">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-white/10 p-3 backdrop-blur-sm">
                  <p className={cn("text-[10px] uppercase tracking-wide", sub)}>Share of spend</p>
                  <p className="text-xl font-bold tabular-nums">{formatMoney(p.attributedSpendCents)}</p>
                </div>
                <div className="rounded-xl bg-white/10 p-3 backdrop-blur-sm">
                  <p className={cn("text-[10px] uppercase tracking-wide", sub)}>Logs</p>
                  <p className="text-xl font-bold">{p.logCount}</p>
                </div>
                <div className="rounded-xl bg-white/10 p-3 backdrop-blur-sm">
                  <p className={cn("text-[10px] uppercase tracking-wide", sub)}>Photos</p>
                  <p className="text-xl font-bold">{p.photoCount}</p>
                </div>
                <div className="rounded-xl bg-white/10 p-3 backdrop-blur-sm">
                  <p className={cn("text-[10px] uppercase tracking-wide", sub)}>Food stops</p>
                  <p className="text-xl font-bold">{p.foodLogCount}</p>
                </div>
              </div>
              {topCat && (
                <p className={cn("text-sm", sub)}>
                  Top category: <strong className="text-white">{topCat}</strong>
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
          <div className={cn("flex h-full flex-col justify-center gap-5 px-8 text-white", g)}>
            <p className={cn("text-sm font-medium uppercase tracking-widest", sub)}>Superlatives</p>
            <ul className="space-y-4">
              {(Object.keys(payload.superlatives) as SuperlativeId[]).map((key) => {
                const name = payload.superlatives[key];
                return (
                  <motion.li
                    key={key}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.08 * (["foodie", "highRoller", "historian", "navigator"].indexOf(key) + 1) }}
                    className="flex items-center justify-between border-b border-white/10 pb-3 last:border-0"
                  >
                    <span className="font-semibold">{SUPERLATIVE_LABEL[key]}</span>
                    <span className="text-lg font-bold">{name ?? "—"}</span>
                  </motion.li>
                );
              })}
            </ul>
          </div>
        );
      case "settlement":
        return (
          <div className={cn("flex h-full flex-col justify-center gap-4 px-8 text-white", g)}>
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
          <div className={cn("flex h-full flex-col justify-between p-8 text-white", g)}>
            <div>
              <p className={cn("text-sm font-medium uppercase tracking-widest", sub)}>Best moment</p>
              <p className="mt-6 text-2xl font-bold leading-snug">{payload.bestRated?.title}</p>
              <p className="mt-2 text-5xl font-black">{payload.bestRated?.rating ?? "—"}<span className="text-2xl">/5</span></p>
            </div>
            {entries.find((e) => e.id === payload.bestRated?.entryId)?.photos?.[0]?.publicUrl && (
              <div className="mt-4 h-44 overflow-hidden rounded-2xl border border-white/20">
                <img
                  src={entries.find((e) => e.id === payload.bestRated?.entryId)!.photos![0]!.publicUrl!}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            )}
          </div>
        );
      case "photoGrid": {
        const urls = journalPhotoUrls(entries, 6);
        return (
          <div className={cn("flex h-full flex-col justify-center gap-4 p-6 text-white", g)}>
            <p className={cn("text-sm font-medium uppercase tracking-widest", sub)}>The reel</p>
            <div className="grid grid-cols-3 gap-2">
              {urls.map((url, i) => (
                <motion.img
                  key={url + i}
                  src={url}
                  alt=""
                  className="aspect-square rounded-lg object-cover"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.06 * i }}
                />
              ))}
            </div>
          </div>
        );
      }
      case "outro":
        return (
          <div className={cn("flex h-full flex-col items-center justify-center gap-6 px-8 text-center text-white", g)}>
            <SparklesGlyph />
            <div>
              <p className="text-2xl font-bold">That’s a wrap</p>
              <p className={cn("mt-3 text-sm leading-relaxed", sub)}>
                Scroll down for maps, categories, and the full breakdown — or swipe through again anytime.
              </p>
            </div>
          </div>
        );
      default:
        return null;
    }
  }, [slide, trip, payload, entries, itemById, theme]);

  return (
    <div className="relative w-full">
      <div className="mb-3 flex h-1.5 w-full overflow-hidden rounded-full bg-black/10">
        <motion.div
          className="h-full rounded-full bg-primary"
          animate={{ width: `${((index + 1) / slides.length) * 100}%` }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      </div>

      <p className="mb-2 text-center text-xs text-text-muted">
        Tap sides or use ← → keys · {index + 1} / {slides.length}
      </p>

      <div
        ref={exportRef}
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
          className="absolute left-0 top-0 z-10 flex h-full w-[22%] cursor-w-resize items-center justify-start pl-2 text-white/80 hover:text-white disabled:opacity-0"
          onClick={() => go(-1)}
          disabled={index <= 0}
        >
          <ChevronLeft className="h-10 w-10 drop-shadow-lg" />
        </button>
        <button
          type="button"
          aria-label="Next slide"
          className="absolute right-0 top-0 z-10 flex h-full w-[22%] cursor-e-resize items-center justify-end pr-2 text-white/80 hover:text-white disabled:opacity-0"
          onClick={() => go(1)}
          disabled={index >= slides.length - 1}
        >
          <ChevronRight className="h-10 w-10 drop-shadow-lg" />
        </button>
      </div>
    </div>
  );
}

function SparklesGlyph() {
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 text-3xl backdrop-blur-sm">
      ✦
    </div>
  );
}
