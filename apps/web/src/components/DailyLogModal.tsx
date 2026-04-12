import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X, Footprints, Star, Skull, Laugh, Compass, Plus } from "lucide-react";
import { supabase } from "../lib/supabase";
import { cn } from "../lib/cn";
import { getSavedToken } from "../hooks/useMemberIdentity";
import {
  parseCheckInPhotoUrls,
  serializeCheckInPhotoUrls,
  uploadDailyCheckInPhoto,
} from "../lib/daily-log-photos";

const TEAL = "#2DD4BF";

function formatSaveError(err: unknown): string {
  if (err && typeof err === "object") {
    const o = err as { message?: string; details?: string; hint?: string; code?: string };
    const parts: string[] = [];
    if (o.message) parts.push(o.message);
    if (o.details) parts.push(o.details);
    if (o.hint) parts.push(`Hint: ${o.hint}`);
    let s = parts.length ? parts.join(" — ") : "Could not save check-in.";
    if (/does not exist|42883|PGRST202/i.test(s + (o.code ?? ""))) {
      s +=
        " Apply pending Supabase migrations (007 itinerary columns + 009 guest checklist & daily log photos).";
    }
    return s;
  }
  if (err instanceof Error) return err.message;
  return "Could not save check-in.";
}

const MOODS = [
  { score: 1, emoji: "😤", label: "Rough" },
  { score: 2, emoji: "😐", label: "Meh" },
  { score: 3, emoji: "🙂", label: "Good" },
  { score: 4, emoji: "😁", label: "Great" },
  { score: 5, emoji: "🤩", label: "Best day" },
];

export type DailyLogFocus = "full" | "food" | "activity";

export interface PlanItemOption {
  id: string;
  title: string;
  time?: string;
  category: string;
}

interface DailyLogModalProps {
  tripId: string;
  memberId: string;
  dayNumber: number;
  customPrompt?: string;
  initialFocus?: DailyLogFocus;
  onClose: () => void;
  onSaved: () => void;
}

export function DailyLogModal({
  tripId,
  memberId,
  dayNumber,
  customPrompt,
  initialFocus = "full",
  onClose,
  onSaved,
}: DailyLogModalProps) {
  const today = new Date().toISOString().slice(0, 10);

  const [stepsCount, setStepsCount] = useState("");
  const [moodScore, setMoodScore] = useState<number | null>(null);
  const [bestFood, setBestFood] = useState("");
  const [worstFood, setWorstFood] = useState("");
  const [funniestMoment, setFunniestMoment] = useState("");
  const [customAnswer, setCustomAnswer] = useState("");
  const [activityHighlight, setActivityHighlight] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [photoRemoteUrls, setPhotoRemoteUrls] = useState<string[]>([]);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const totalPhotoCount = photoRemoteUrls.length + photoFiles.length;

  useEffect(() => {
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        const { data } = await supabase
          .from("daily_logs")
          .select("*")
          .eq("trip_id", tripId)
          .eq("member_id", memberId)
          .eq("log_date", today)
          .maybeSingle();
        if (!data) return;
        applyRow(data);
        return;
      }
      const token = getSavedToken(tripId);
      if (!token) return;
      const { data, error: rpcErr } = await supabase.rpc("guest_get_daily_log", {
        p_token: token,
        p_log_date: today,
      });
      if (rpcErr || !data || !Array.isArray(data) || data.length === 0) return;
      applyRow(data[0] as Record<string, unknown>);
    };
    function applyRow(data: Record<string, unknown>) {
      setStepsCount(data.steps_count != null ? String(data.steps_count) : "");
      setMoodScore((data.mood_score as number | null) ?? null);
      setBestFood((data.best_food_text as string) ?? "");
      setWorstFood((data.worst_food_text as string) ?? "");
      setFunniestMoment((data.funniest_moment as string) ?? "");
      setCustomAnswer((data.custom_prompt_answer as string) ?? "");
      setActivityHighlight((data.activity_highlight as string) ?? "");
      setPhotoRemoteUrls(parseCheckInPhotoUrls(data.best_food_photo_url as string | null | undefined));
    }
    void load();
  }, [tripId, memberId, today]);

  useEffect(() => {
    if (initialFocus === "full") return;
    const id = initialFocus === "food" ? "dl-anchor-food" : "dl-anchor-activity";
    const t = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 350);
    return () => window.clearTimeout(t);
  }, [initialFocus]);

  const stepsNum = stepsCount ? parseInt(stepsCount, 10) : null;

  const stepsContext = useCallback((steps: number): string => {
    if (steps > 30000) return "You basically ran a marathon. Respect.";
    if (steps > 20000) return "That's the equivalent of crossing a city on foot.";
    if (steps > 15000) return "Solid day of exploring.";
    if (steps > 10000) return "Hit the magic 10k+ mark.";
    if (steps > 5000) return "Decent amount of ground covered.";
    return "A more leisurely kind of day.";
  }, []);

  const addPhotoFiles = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    setPhotoFiles((prev) => {
      const next = [...prev];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (!f?.type.startsWith("image/")) continue;
        if (photoRemoteUrls.length + next.length >= 5) break;
        next.push(f);
      }
      return next;
    });
  }, [photoRemoteUrls.length]);

  const removePhotoAt = useCallback(
    (index: number) => {
      if (index < photoRemoteUrls.length) {
        setPhotoRemoteUrls((a) => a.filter((_, j) => j !== index));
      } else {
        const fi = index - photoRemoteUrls.length;
        setPhotoFiles((a) => a.filter((_, j) => j !== fi));
      }
    },
    [photoRemoteUrls.length],
  );

  const buildPhotoUrlsAfterUpload = useCallback(async (): Promise<string[]> => {
    const urls: string[] = [...photoRemoteUrls];
    let sortIndex = photoRemoteUrls.length;
    for (const file of photoFiles) {
      if (urls.length >= 5) break;
      const url = await uploadDailyCheckInPhoto(tripId, memberId, today, file, sortIndex);
      if (url) {
        urls.push(url);
        sortIndex++;
      }
    }
    return urls.slice(0, 5);
  }, [tripId, memberId, today, photoRemoteUrls, photoFiles]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const finalPhotoUrls = await buildPhotoUrlsAfterUpload();
      const photoSerialized = serializeCheckInPhotoUrls(finalPhotoUrls);

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        const { error: upsertErr } = await supabase.from("daily_logs").upsert(
          {
            trip_id: tripId,
            member_id: memberId,
            log_date: today,
            steps_count: stepsNum ?? null,
            mood_score: moodScore ?? null,
            best_food_text: bestFood.trim() || null,
            worst_food_text: worstFood.trim() || null,
            funniest_moment: funniestMoment.trim() || null,
            custom_prompt_answer: customAnswer.trim() || null,
            linked_itinerary_item_id: null,
            activity_highlight: activityHighlight.trim() || null,
            best_food_photo_url: photoSerialized,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "trip_id,member_id,log_date" },
        );
        if (upsertErr) throw upsertErr;
      } else {
        const token = getSavedToken(tripId);
        if (!token) throw new Error("Not signed in — reopen the trip link.");
        const { error: rpcErr } = await supabase.rpc("guest_upsert_daily_log", {
          p_token: token,
          p_log_date: today,
          p_steps_count: stepsNum ?? null,
          p_mood_score: moodScore ?? null,
          p_best_food_text: bestFood.trim() || null,
          p_worst_food_text: worstFood.trim() || null,
          p_funniest_moment: funniestMoment.trim() || null,
          p_custom_prompt_answer: customAnswer.trim() || null,
          p_linked_itinerary_item_id: null,
          p_activity_highlight: activityHighlight.trim() || null,
          p_best_food_photo_url: photoSerialized,
        });
        if (rpcErr) throw rpcErr;
      }
      onSaved();
    } catch (err) {
      setError(formatSaveError(err));
    } finally {
      setSaving(false);
    }
  }, [
    buildPhotoUrlsAfterUpload,
    tripId,
    memberId,
    today,
    stepsNum,
    moodScore,
    bestFood,
    worstFood,
    funniestMoment,
    customAnswer,
    activityHighlight,
    onSaved,
  ]);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 38 }}
        className="absolute bottom-0 left-0 right-0 max-h-[90dvh] bg-surface rounded-t-3xl overflow-hidden flex flex-col border-t border-border shadow-xl"
      >
        <div className="px-5 pt-4 pb-3 border-b border-border flex-shrink-0 bg-surface-card/50">
          <div className="w-10 h-1 rounded-full bg-border mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-text">
                {initialFocus === "food"
                  ? "Food highlight"
                  : initialFocus === "activity"
                    ? "Activity moment"
                    : `Day ${dayNumber} check-in`}
              </h2>
              <p className="text-xs text-text-muted mt-0.5">
                One check-in per calendar day · private until the group Wrapped
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-surface-muted flex items-center justify-center text-text-muted hover:text-text transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-surface">
          <div id="dl-anchor-activity">
            <PromptCard
              icon={<Compass className="w-4 h-4 text-sky-600" />}
              title="Activity highlight"
              subtitle="Museum, hike, show — what stood out?"
            >
              <textarea
                value={activityHighlight}
                onChange={(e) => setActivityHighlight(e.target.value.slice(0, 500))}
                placeholder="We accidentally joined a parade…"
                rows={3}
                className="mt-3 w-full bg-surface-card border border-border rounded-xl px-4 py-3 text-text placeholder:text-text-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 transition-colors resize-none"
              />
              <p className="text-right text-[11px] text-text-muted mt-1">{activityHighlight.length}/500</p>
            </PromptCard>
          </div>

          <PromptCard icon={<span className="text-xl">🎭</span>} title="Mood" subtitle="How was today?">
            <div className="flex gap-2 mt-3">
              {MOODS.map(({ score, emoji, label }) => (
                <button
                  key={score}
                  type="button"
                  onClick={() => setMoodScore(score === moodScore ? null : score)}
                  className={cn(
                    "flex-1 flex flex-col items-center gap-1 py-2.5 rounded-2xl border transition-all",
                    moodScore === score
                      ? "border-primary bg-primary/10"
                      : "border-border bg-surface-card hover:bg-surface-muted/80",
                  )}
                >
                  <span className={cn("text-2xl transition-transform", moodScore === score ? "scale-110" : "")}>
                    {emoji}
                  </span>
                  <span className="text-[10px] text-text-muted">{label}</span>
                </button>
              ))}
            </div>
          </PromptCard>

          <PromptCard
            icon={<Footprints className="w-4 h-4 text-teal-600" />}
            title="Steps today"
            subtitle="Manual entry or sync from Health"
          >
            <input
              type="number"
              value={stepsCount}
              onChange={(e) => setStepsCount(e.target.value)}
              placeholder="e.g. 12,400"
              className="mt-3 w-full bg-surface-card border border-border rounded-xl px-4 py-3 text-text placeholder:text-text-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 transition-colors"
            />
            {stepsNum && stepsNum > 0 && (
              <p className="mt-2 text-xs text-primary/90">{stepsNum.toLocaleString()} steps · {stepsContext(stepsNum)}</p>
            )}
          </PromptCard>

          <PromptCard
            icon={<span className="text-sm font-semibold text-text-muted">📷</span>}
            title="Check-in photos"
            subtitle="Up to 5 images from today"
          >
            <div className="mt-3 flex flex-wrap gap-2">
              {photoRemoteUrls.map((url, i) => (
                <div key={`r-${url}-${i}`} className="relative h-20 w-20 rounded-xl overflow-hidden border border-border bg-surface-card">
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => removePhotoAt(i)}
                    className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/50 text-white text-xs flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>
              ))}
              {photoFiles.map((file, i) => {
                const idx = photoRemoteUrls.length + i;
                return (
                  <LocalPhotoThumb
                    key={`l-${file.name}-${file.size}-${i}`}
                    file={file}
                    onRemove={() => removePhotoAt(idx)}
                  />
                );
              })}
              {totalPhotoCount < 5 && (
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="h-20 w-20 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 flex flex-col items-center justify-center gap-0.5 text-primary hover:bg-primary/10 transition-colors"
                >
                  <Plus className="w-7 h-7" />
                  <span className="text-[10px] font-medium">Add</span>
                </button>
              )}
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                addPhotoFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </PromptCard>

          <div id="dl-anchor-food">
            <PromptCard
              icon={<Star className="w-4 h-4 text-amber-600" />}
              title="Best food today"
              subtitle="The bite you'll still be talking about"
            >
              <textarea
                value={bestFood}
                onChange={(e) => setBestFood(e.target.value)}
                placeholder="Din Tai Fung — the soup dumplings changed me"
                rows={2}
                className="mt-3 w-full bg-surface-card border border-border rounded-xl px-4 py-3 text-text placeholder:text-text-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 transition-colors resize-none"
              />
            </PromptCard>
          </div>

          <PromptCard
            icon={<Skull className="w-4 h-4 text-rose-500" />}
            title="Worst food today"
            subtitle="The one you regret (or won't admit to)"
          >
            <textarea
              value={worstFood}
              onChange={(e) => setWorstFood(e.target.value)}
              placeholder="Gas station hot dog. Not my finest hour."
              rows={2}
              className="mt-3 w-full bg-surface-card border border-border rounded-xl px-4 py-3 text-text placeholder:text-text-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 transition-colors resize-none"
            />
          </PromptCard>

          <PromptCard
            icon={<Laugh className="w-4 h-4 text-violet-600" />}
            title="Funniest moment"
            subtitle={
              <span>
                Private · <span className="text-violet-700/90">revealed in group Wrapped</span>
              </span>
            }
          >
            <textarea
              value={funniestMoment}
              onChange={(e) => setFunniestMoment(e.target.value.slice(0, 280))}
              placeholder="Kai tried to pay for parking with Tim Hortons rewards"
              rows={3}
              className="mt-3 w-full bg-surface-card border border-border rounded-xl px-4 py-3 text-text placeholder:text-text-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 transition-colors resize-none"
            />
            <p className="text-right text-[11px] text-text-muted mt-1">{funniestMoment.length}/280</p>
          </PromptCard>

          {customPrompt && (
            <PromptCard
              icon={<span className="text-base">✨</span>}
              title={customPrompt}
              subtitle="Owner-defined question for this trip"
            >
              <textarea
                value={customAnswer}
                onChange={(e) => setCustomAnswer(e.target.value)}
                placeholder="Your answer…"
                rows={2}
                className="mt-3 w-full bg-surface-card border border-border rounded-xl px-4 py-3 text-text placeholder:text-text-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 transition-colors resize-none"
              />
            </PromptCard>
          )}
        </div>

        <div className="px-5 pb-8 pt-3 flex-shrink-0 border-t border-border bg-surface-card/80">
          {error && <p className="text-sm text-red-600 mb-3 text-center">{error}</p>}
          <motion.button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="w-full py-4 rounded-2xl font-semibold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-60 shadow-md"
            style={{ background: `linear-gradient(135deg, ${TEAL}, #0891b2)` }}
            whileTap={saving ? {} : { scale: 0.98 }}
          >
            {saving ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
              />
            ) : (
              "Save check-in"
            )}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

function LocalPhotoThumb({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  if (!url) {
    return (
      <div className="h-20 w-20 rounded-xl border border-border bg-surface-muted animate-pulse" />
    );
  }

  return (
    <div className="relative h-20 w-20 rounded-xl overflow-hidden border border-border bg-surface-card">
      <img src={url} alt="" className="h-full w-full object-cover" />
      <button
        type="button"
        aria-label="Remove photo"
        onClick={onRemove}
        className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/50 text-white text-xs flex items-center justify-center"
      >
        ×
      </button>
    </div>
  );
}

function PromptCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface-card px-4 py-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 w-7 h-7 rounded-xl bg-surface-muted flex items-center justify-center shrink-0 border border-border">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text leading-snug">{title}</p>
          {subtitle && <p className="text-xs text-text-muted mt-0.5 leading-snug">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}
