import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, animate, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import type { DailyLog, JournalEntry, TripMember } from "@pangofold/shared";
import { cn } from "../../lib/cn";
import { exportStoryCardAsZip } from "../../lib/wrapped-export";

const TEAL = "#2DD4BF";

const MOOD_EMOJI = ["", "😤", "😐", "🙂", "😁", "🤩"];

// Per-card light gradients (matches trip shell)
const PERSONAL_THEMES = [
  { gradient: "from-teal-50 via-cyan-50 to-emerald-50", accent: "text-teal-700" },
  { gradient: "from-violet-50 via-purple-50 to-fuchsia-50", accent: "text-violet-700" },
  { gradient: "from-amber-50 via-orange-50 to-rose-50", accent: "text-amber-800" },
  { gradient: "from-slate-100 via-slate-50 to-zinc-100", accent: "text-slate-600" },
  { gradient: "from-indigo-50 via-violet-50 to-purple-50", accent: "text-indigo-700" },
  { gradient: "from-sky-50 via-blue-50 to-indigo-50", accent: "text-sky-700" },
  { gradient: "from-teal-50 via-emerald-50 to-cyan-50", accent: "text-teal-700" },
];

type PersonalSlide =
  | { kind: "intro" }
  | { kind: "spend"; totalCents: number; biggestTitle: string; biggestCents: number }
  | { kind: "food"; bestFood: string; worstFood: string }
  | { kind: "photos"; urls: string[] }
  | { kind: "funniest"; moment: string }
  | { kind: "steps"; total: number; best: number; bestDay: string }
  | { kind: "mood"; scores: number[] }
  | { kind: "outro" };

function buildPersonalSlides(
  entries: JournalEntry[],
  logs: DailyLog[],
): PersonalSlide[] {
  const slides: PersonalSlide[] = [{ kind: "intro" }];

  // Spend
  const totalCents = entries.reduce((s, e) => s + (e.amountCents ?? 0), 0);
  if (totalCents > 0) {
    const biggest = [...entries].sort((a, b) => (b.amountCents ?? 0) - (a.amountCents ?? 0))[0];
    slides.push({
      kind: "spend",
      totalCents,
      biggestTitle: biggest?.title ?? "",
      biggestCents: biggest?.amountCents ?? 0,
    });
  }

  // Food from daily logs
  const bestFoods = logs.filter((l) => l.bestFoodText);
  const worstFoods = logs.filter((l) => l.worstFoodText);
  if (bestFoods.length > 0 || worstFoods.length > 0) {
    slides.push({
      kind: "food",
      bestFood: bestFoods[0]?.bestFoodText ?? "",
      worstFood: worstFoods[0]?.worstFoodText ?? "",
    });
  }

  // Photos
  const urls = entries
    .flatMap((e) => e.photos ?? [])
    .filter((p) => p.publicUrl)
    .map((p) => p.publicUrl!)
    .slice(0, 9);
  if (urls.length > 0) slides.push({ kind: "photos", urls });

  // Funniest moment
  const funny = logs.find((l) => l.funniestMoment);
  if (funny) slides.push({ kind: "funniest", moment: funny.funniestMoment! });

  // Steps
  const stepsLogs = logs.filter((l) => (l.stepsCount ?? 0) > 0);
  if (stepsLogs.length > 0) {
    const total = stepsLogs.reduce((s, l) => s + (l.stepsCount ?? 0), 0);
    const best = stepsLogs.reduce((b, l) => Math.max(b, l.stepsCount ?? 0), 0);
    const bestLog = stepsLogs.find((l) => l.stepsCount === best)!;
    slides.push({
      kind: "steps",
      total,
      best,
      bestDay: bestLog.logDate,
    });
  }

  // Mood timeline
  const moodLogs = logs.filter((l) => l.moodScore != null);
  if (moodLogs.length >= 2) {
    slides.push({ kind: "mood", scores: moodLogs.map((l) => l.moodScore!) });
  }

  slides.push({ kind: "outro" });
  return slides;
}

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const ctrl = animate(0, value, {
      duration: 1.2,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => ctrl.stop();
  }, [value]);
  return <span className="tabular-nums">{display.toLocaleString()}</span>;
}

function AnimatedCents({ cents }: { cents: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const ctrl = animate(0, cents / 100, {
      duration: 1.2,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (x) => setV(Math.round(x * 100) / 100),
    });
    return () => ctrl.stop();
  }, [cents]);
  return (
    <span className="tabular-nums">
      {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v)}
    </span>
  );
}

interface PersonalWrappedProps {
  member: TripMember;
  entries: JournalEntry[];
  dailyLogs: DailyLog[];
  onClose: () => void;
}

export function PersonalWrapped({ member, entries, dailyLogs, onClose }: PersonalWrappedProps) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [exporting, setExporting] = useState(false);
  const cardCaptureRef = useRef<HTMLDivElement>(null);

  const slides = useMemo(() => buildPersonalSlides(entries, dailyLogs), [entries, dailyLogs]);

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
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [go, onClose]);

  const slide = slides[index]!;
  const themeIndex = Math.min(index, PERSONAL_THEMES.length - 1);
  const theme = PERSONAL_THEMES[themeIndex]!;

  const slideVariants = {
    enter: (d: number) => ({ x: d > 0 ? "100%" : "-100%", opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? "-100%" : "100%", opacity: 0 }),
  };

  const initials = (member.displayName ?? "?")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  const handleExportZip = useCallback(async () => {
    const el = cardCaptureRef.current;
    if (!el || slides.length === 0 || exporting) return;
    const restoreIndex = index;
    setExporting(true);
    try {
      const safeName = (member.displayName ?? "you")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 32);
      await exportStoryCardAsZip({
        cardElement: el,
        slideCount: slides.length,
        setSlideIndex: setIndex,
        restoreIndex,
        zipFilename: `personal-wrapped-${safeName || "export"}.zip`,
        filePrefix: "personal-wrapped",
      });
    } catch (e) {
      console.error("Personal Wrapped export failed", e);
    } finally {
      setExporting(false);
    }
  }, [slides.length, index, exporting, member.displayName]);

  const slideNode = useMemo(() => {
    const g = `bg-gradient-to-br ${theme.gradient}`;
    const sub = theme.accent;

    switch (slide.kind) {
      case "intro":
        return (
          <div className={cn("flex h-full flex-col items-center justify-center gap-6 px-8 text-text", g)}>
            {/* Avatar */}
            <div className="relative">
              <div
                className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center font-bold text-2xl"
                style={{
                  background: member.avatarUrl ? undefined : `linear-gradient(135deg, ${TEAL}, #0891b2)`,
                  boxShadow: `0 0 0 3px ${TEAL}`,
                }}
              >
                {member.avatarUrl ? (
                  <img src={member.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  initials
                )}
              </div>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                className="absolute inset-[-8px] rounded-full border border-dashed"
                style={{ borderColor: `${TEAL}40` }}
              />
            </div>
            <div className="text-center">
              <p className={cn("text-xs font-semibold uppercase tracking-[0.35em] mb-2", sub)}>
                Your Personal
              </p>
              <h1 className="text-4xl font-black leading-none">
                {member.displayName?.split(" ")[0] ?? "You"}
              </h1>
              <p className={cn("mt-3 text-sm leading-relaxed", sub)}>
                {member.onboardingPromptAnswer ?? "Your trip, your story."}
              </p>
            </div>
          </div>
        );

      case "spend":
        return (
          <div className={cn("flex h-full flex-col justify-center px-8 text-text", g)}>
            <p className={cn("text-xs font-semibold uppercase tracking-[0.35em] mb-4", sub)}>You spent</p>
            <div className="text-5xl font-black">
              <AnimatedCents cents={slide.totalCents} />
            </div>
            <div className="mt-6 rounded-2xl bg-surface-card/90 p-4 border border-border shadow-sm">
              <p className={cn("text-[10px] uppercase tracking-wide mb-1", sub)}>Biggest expense</p>
              <p className="text-base font-bold">{slide.biggestTitle}</p>
              <p className={cn("text-sm mt-0.5", sub)}>
                {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
                  slide.biggestCents / 100,
                )}
              </p>
            </div>
          </div>
        );

      case "food":
        return (
          <div className={cn("flex h-full flex-col justify-center gap-5 px-8 text-text", g)}>
            <p className={cn("text-xs font-semibold uppercase tracking-[0.35em]", sub)}>The verdict</p>
            {slide.bestFood && (
              <div className="rounded-2xl bg-surface-card/90 border border-border p-5 shadow-sm">
                <p className={cn("text-[10px] uppercase tracking-wide mb-2", sub)}>⭐ Best food</p>
                <p className="text-lg font-bold leading-snug">"{slide.bestFood}"</p>
              </div>
            )}
            {slide.worstFood && (
              <div className="rounded-2xl bg-surface-card/90 border border-border p-5 shadow-sm">
                <p className={cn("text-[10px] uppercase tracking-wide mb-2", sub)}>💀 Worst food</p>
                <p className="text-lg font-bold leading-snug">"{slide.worstFood}"</p>
              </div>
            )}
          </div>
        );

      case "photos":
        return (
          <div className={cn("flex h-full flex-col p-6 text-text", g)}>
            <p className={cn("text-xs font-semibold uppercase tracking-[0.35em] mb-4", sub)}>
              Your reel · {slide.urls.length} photos
            </p>
            <div className="grid grid-cols-3 gap-1.5 flex-1">
              {slide.urls.map((url, i) => (
                <motion.div
                  key={url + i}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.05 * i, duration: 0.3 }}
                  className="aspect-square rounded-xl overflow-hidden"
                >
                  <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                </motion.div>
              ))}
            </div>
          </div>
        );

      case "funniest":
        return (
          <div className={cn("flex h-full flex-col items-center justify-center gap-6 px-8 text-center text-text", g)}>
            <p className="text-6xl">😂</p>
            <div>
              <p className={cn("text-xs font-semibold uppercase tracking-[0.35em] mb-4", sub)}>
                Your funniest moment
              </p>
              <p className="text-2xl font-bold leading-snug">"{slide.moment}"</p>
            </div>
            <p className={cn("text-xs", sub)}>Revealed in group Wrapped at the end</p>
          </div>
        );

      case "steps": {
        const bestDateLabel = new Date(slide.bestDay + "T00:00:00").toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
        return (
          <div className={cn("flex h-full flex-col justify-center px-8 text-text", g)}>
            <p className={cn("text-xs font-semibold uppercase tracking-[0.35em] mb-4", sub)}>
              You walked
            </p>
            <div className="text-5xl font-black">
              <AnimatedNumber value={slide.total} /> steps
            </div>
            <div className="mt-6 rounded-2xl bg-surface-card/90 border border-border p-4 shadow-sm">
              <p className={cn("text-[10px] uppercase tracking-wide mb-1", sub)}>Best day</p>
              <p className="text-xl font-bold">{slide.best.toLocaleString()} steps</p>
              <p className={cn("text-sm mt-0.5", sub)}>{bestDateLabel}</p>
            </div>
          </div>
        );
      }

      case "mood": {
        const peak = Math.max(...slide.scores);
        const peakIdx = slide.scores.indexOf(peak);
        return (
          <div className={cn("flex h-full flex-col justify-center gap-6 px-8 text-text", g)}>
            <div>
              <p className={cn("text-xs font-semibold uppercase tracking-[0.35em] mb-2", sub)}>
                Your mood arc
              </p>
              <p className="text-4xl font-black">You peaked on Day {peakIdx + 1}</p>
            </div>
            {/* Emoji row */}
            <div className="flex items-end gap-2 justify-center">
              {slide.scores.map((score, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1 * i, type: "spring", stiffness: 300 }}
                    className={cn("text-2xl", i === peakIdx ? "scale-125" : "opacity-70")}
                  >
                    {MOOD_EMOJI[score]}
                  </motion.span>
                  {i === peakIdx && (
                    <div
                      className="w-1 h-1 rounded-full"
                      style={{ background: TEAL }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      }

      case "outro":
        return (
          <div className={cn("flex h-full flex-col items-center justify-center gap-6 px-8 text-center text-text", g)}>
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl bg-primary/10 border border-primary/30"
            >
              ✦
            </div>
            <div>
              <h2 className="text-2xl font-black">That's your trip</h2>
              <p className={cn("mt-3 text-sm leading-relaxed", sub)}>
                The group Wrapped is coming at the end. <br />
                Your funniest moment will be revealed.
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  }, [slide, member, initials, theme]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[105] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="relative w-full max-w-sm"
      >
        {/* Close */}
        <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportZip}
            disabled={exporting || slides.length === 0}
            title="Download all slides as PNG (ZIP)"
            className="w-8 h-8 rounded-full bg-surface-card border border-border shadow-sm flex items-center justify-center text-text-muted hover:text-text disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-card border border-border shadow-sm flex items-center justify-center text-text-muted hover:text-text"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="mb-3 flex h-1 gap-1">
          {slides.map((_, i) => (
            <div key={i} className="flex-1 rounded-full bg-border overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: TEAL }}
                animate={{ width: i < index ? "100%" : i === index ? "100%" : "0%" }}
                transition={{ duration: i === index ? 0 : 0 }}
              />
            </div>
          ))}
        </div>

        {/* Card — capture ref for ZIP export (fixed 9:16 frame) */}
        <div
          ref={cardCaptureRef}
          className="relative aspect-[9/16] overflow-hidden rounded-[2rem] border border-border shadow-xl bg-surface-card"
        >
          <AnimatePresence initial={false} custom={direction} mode="wait">
            <motion.div
              key={index}
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

          {/* Tap zones */}
          <button
            type="button"
            aria-label="Previous"
            className="absolute left-0 top-0 h-full w-[30%] z-10 opacity-0"
            onClick={() => go(-1)}
            disabled={index === 0}
          />
          <button
            type="button"
            aria-label="Next"
            className="absolute right-0 top-0 h-full w-[30%] z-10 opacity-0"
            onClick={() => go(1)}
            disabled={index === slides.length - 1}
          />

          {/* Arrow hints */}
          {index > 0 && (
            <ChevronLeft className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-6 text-text-muted/50 z-10 pointer-events-none" />
          )}
          {index < slides.length - 1 && (
            <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 text-text-muted/50 z-10 pointer-events-none" />
          )}
        </div>

        <p className="text-center text-xs text-text-muted mt-2">
          {exporting ? "Exporting…" : `${index + 1} / ${slides.length} · tap sides or use ← →`}
        </p>
      </motion.div>
    </motion.div>
  );
}
