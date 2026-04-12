import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X, Footprints, Star, Skull, Laugh, Camera } from "lucide-react";
import { supabase } from "../lib/supabase";
import { cn } from "../lib/cn";
import { getSavedToken } from "../hooks/useMemberIdentity";

const TEAL = "#2DD4BF";

const MOODS = [
  { score: 1, emoji: "😤", label: "Rough" },
  { score: 2, emoji: "😐", label: "Meh" },
  { score: 3, emoji: "🙂", label: "Good" },
  { score: 4, emoji: "😁", label: "Great" },
  { score: 5, emoji: "🤩", label: "Best day" },
];

interface DailyLogModalProps {
  tripId: string;
  memberId: string;
  dayNumber: number;
  customPrompt?: string;
  onClose: () => void;
  onSaved: () => void;
}

export function DailyLogModal({
  tripId,
  memberId,
  dayNumber,
  customPrompt,
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Receipt photo upload
  const receiptRef = useRef<HTMLInputElement>(null);
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [receiptThumb, setReceiptThumb] = useState<string | null>(null);

  // Load existing log for today if any (auth row query or guest RPC)
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
      const { data, error } = await supabase.rpc("guest_get_daily_log", {
        p_token: token,
        p_log_date: today,
      });
      if (error || !data || !Array.isArray(data) || data.length === 0) return;
      applyRow(data[0] as Record<string, unknown>);
    };
    function applyRow(data: Record<string, unknown>) {
      setStepsCount(data.steps_count != null ? String(data.steps_count) : "");
      setMoodScore((data.mood_score as number | null) ?? null);
      setBestFood((data.best_food_text as string) ?? "");
      setWorstFood((data.worst_food_text as string) ?? "");
      setFunniestMoment((data.funniest_moment as string) ?? "");
      setCustomAnswer((data.custom_prompt_answer as string) ?? "");
    }
    void load();
  }, [tripId, memberId, today]);

  const stepsNum = stepsCount ? parseInt(stepsCount, 10) : null;

  // Fun step equivalents
  const stepsContext = useCallback((steps: number): string => {
    if (steps > 30000) return "You basically ran a marathon. Respect.";
    if (steps > 20000) return "That's the equivalent of crossing a city on foot.";
    if (steps > 15000) return "Solid day of exploring.";
    if (steps > 10000) return "Hit the magic 10k+ mark.";
    if (steps > 5000) return "Decent amount of ground covered.";
    return "A more leisurely kind of day.";
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
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
        });
        if (rpcErr) throw rpcErr;
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save check-in.");
    } finally {
      setSaving(false);
    }
  }, [tripId, memberId, today, stepsNum, moodScore, bestFood, worstFood, funniestMoment, customAnswer, onSaved]);

  const handleReceiptUpload = useCallback(async (file: File) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      setError("Sign in to attach receipts, or add them from a journal log.");
      return;
    }
    setReceiptUploading(true);
    try {
      // Preview
      setReceiptThumb(URL.createObjectURL(file));
      // Upload to journal-photos bucket with is_receipt flag
      // We create a minimal journal entry to hold the receipt
      const { data: entry, error: entryErr } = await supabase
        .from("journal_entries")
        .insert({
          trip_id: tripId,
          author_id: session.user.id,
          title: `Receipt – Day ${dayNumber}`,
          split_between: 1,
          currency: "USD",
        })
        .select("id")
        .single();
      if (entryErr || !entry) return;

      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${tripId}/${entry.id}/receipt.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("journal-photos")
        .upload(path, file, { contentType: file.type });
      if (uploadErr) return;

      await supabase.from("journal_photos").insert({
        entry_id: entry.id,
        storage_path: path,
        sort_order: 0,
        is_receipt: true,
      });
    } finally {
      setReceiptUploading(false);
    }
  }, [tripId, memberId, dayNumber]);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 38 }}
        className="absolute bottom-0 left-0 right-0 max-h-[90dvh] bg-[#111] rounded-t-3xl overflow-hidden flex flex-col"
      >
        {/* Handle + header */}
        <div className="px-5 pt-4 pb-3 border-b border-white/5 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-white">Day {dayNumber} check-in</h2>
              <p className="text-xs text-white/40 mt-0.5">Private until the group Wrapped</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-white/50 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

          {/* Mood */}
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
                      ? "border-teal-400/60 bg-teal-500/10"
                      : "border-white/8 bg-white/[0.03] hover:bg-white/[0.06]",
                  )}
                >
                  <span className={cn(
                    "text-2xl transition-transform",
                    moodScore === score ? "scale-110" : "",
                  )}>
                    {emoji}
                  </span>
                  <span className="text-[10px] text-white/40">{label}</span>
                </button>
              ))}
            </div>
          </PromptCard>

          {/* Steps */}
          <PromptCard
            icon={<Footprints className="w-4 h-4 text-teal-400" />}
            title="Steps today"
            subtitle="Manual entry or sync from Health"
          >
            <input
              type="number"
              value={stepsCount}
              onChange={(e) => setStepsCount(e.target.value)}
              placeholder="e.g. 12,400"
              className="mt-3 w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-teal-400/50 transition-colors"
            />
            {stepsNum && stepsNum > 0 && (
              <p className="mt-2 text-xs text-teal-400/80">
                {stepsNum.toLocaleString()} steps · {stepsContext(stepsNum)}
              </p>
            )}
          </PromptCard>

          {/* Best food */}
          <PromptCard
            icon={<Star className="w-4 h-4 text-amber-400" />}
            title="Best food today"
            subtitle="The bite you'll still be talking about"
          >
            <textarea
              value={bestFood}
              onChange={(e) => setBestFood(e.target.value)}
              placeholder="Din Tai Fung — the soup dumplings changed me"
              rows={2}
              className="mt-3 w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-teal-400/50 transition-colors resize-none"
            />
          </PromptCard>

          {/* Worst food */}
          <PromptCard
            icon={<Skull className="w-4 h-4 text-rose-400" />}
            title="Worst food today"
            subtitle="The one you regret (or won't admit to)"
          >
            <textarea
              value={worstFood}
              onChange={(e) => setWorstFood(e.target.value)}
              placeholder="Gas station hot dog. Not my finest hour."
              rows={2}
              className="mt-3 w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-teal-400/50 transition-colors resize-none"
            />
          </PromptCard>

          {/* Funniest moment */}
          <PromptCard
            icon={<Laugh className="w-4 h-4 text-purple-400" />}
            title="Funniest moment"
            subtitle={
              <span>
                Private · <span className="text-purple-400/80">revealed in group Wrapped</span>
              </span>
            }
          >
            <textarea
              value={funniestMoment}
              onChange={(e) => setFunniestMoment(e.target.value.slice(0, 280))}
              placeholder="Kai tried to pay for parking with Tim Hortons rewards"
              rows={3}
              className="mt-3 w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-teal-400/50 transition-colors resize-none"
            />
            <p className="text-right text-[11px] text-white/25 mt-1">{funniestMoment.length}/280</p>
          </PromptCard>

          {/* Custom prompt */}
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
                className="mt-3 w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-teal-400/50 transition-colors resize-none"
              />
            </PromptCard>
          )}

          {/* Receipt upload */}
          <PromptCard
            icon={<Camera className="w-4 h-4 text-white/40" />}
            title="Receipt"
            subtitle="Optional — photograph a receipt to track spend"
          >
            <div className="mt-3 flex items-center gap-3">
              {receiptThumb && (
                <img src={receiptThumb} alt="Receipt" className="w-14 h-14 rounded-xl object-cover border border-white/10" />
              )}
              <button
                type="button"
                onClick={() => receiptRef.current?.click()}
                disabled={receiptUploading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-xs text-white/50 hover:bg-white/[0.05] transition-colors disabled:opacity-50"
              >
                <Camera className="w-3.5 h-3.5" />
                {receiptUploading ? "Uploading…" : receiptThumb ? "Replace" : "Add receipt"}
              </button>
            </div>
            <input
              ref={receiptRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleReceiptUpload(f);
              }}
            />
          </PromptCard>

        </div>

        {/* Footer */}
        <div className="px-5 pb-8 pt-3 flex-shrink-0 border-t border-white/5">
          {error && (
            <p className="text-sm text-red-400 mb-3 text-center">{error}</p>
          )}
          <motion.button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="w-full py-4 rounded-2xl font-semibold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-60"
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

// ── Card wrapper ─────────────────────────────────────────────────────────────

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
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 w-7 h-7 rounded-xl bg-white/[0.06] flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white leading-snug">{title}</p>
          {subtitle && (
            <p className="text-xs text-white/35 mt-0.5 leading-snug">{subtitle}</p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
