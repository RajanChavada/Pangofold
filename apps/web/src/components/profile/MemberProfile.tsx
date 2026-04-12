import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  Pencil,
  Check,
  SwitchCamera,
  Receipt,
  Image as ImageIcon,
  Footprints,
  ChevronRight,
} from "lucide-react";
import type { DailyLog, JournalEntry, TripMember } from "@pangofold/shared";
import { supabase } from "../../lib/supabase";
import { cn } from "../../lib/cn";
import { PersonalWrapped } from "../wrapped/PersonalWrapped";

const TEAL = "#2DD4BF";

const MOOD_EMOJI = ["", "😤", "😐", "🙂", "😁", "🤩"];
const SPEND_COLORS: Record<string, string> = {
  food: "#f59e0b",
  transport: "#3b82f6",
  activities: "#8b5cf6",
  accommodation: "#10b981",
  other: "#6b7280",
};

interface MemberProfileProps {
  member: TripMember;
  tripId: string;
  entries: JournalEntry[];
  onClose: () => void;
  onSwitch?: () => void;
}

interface ReceiptPhoto {
  id: string;
  storagePath: string;
  publicUrl: string | null;
  entryTitle: string;
  amountCents: number | null;
}

export function MemberProfile({ member, tripId, entries, onClose, onSwitch }: MemberProfileProps) {
  const [editingBlurb, setEditingBlurb] = useState(false);
  const [blurbDraft, setBlurbDraft] = useState(member.bioBurb ?? "");
  const [savingBlurb, setSavingBlurb] = useState(false);
  const [currentBlurb, setCurrentBlurb] = useState(member.bioBurb ?? "");

  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [receipts, setReceipts] = useState<ReceiptPhoto[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [showWrapped, setShowWrapped] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Fetch daily logs
  useEffect(() => {
    setLoadingLogs(true);
    void supabase
      .from("daily_logs")
      .select("*")
      .eq("trip_id", tripId)
      .eq("member_id", member.id)
      .order("log_date", { ascending: true })
      .then(({ data }) => {
        setDailyLogs(
          (data ?? []).map((r) => ({
            id: r.id,
            tripId: r.trip_id,
            memberId: r.member_id,
            logDate: r.log_date,
            stepsCount: r.steps_count ?? null,
            moodScore: r.mood_score ?? null,
            bestFoodText: r.best_food_text ?? null,
            worstFoodText: r.worst_food_text ?? null,
            funniestMoment: r.funniest_moment ?? null,
            customPromptAnswer: r.custom_prompt_answer ?? null,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          })),
        );
        setLoadingLogs(false);
      });
  }, [tripId, member.id]);

  // Fetch receipt photos for this trip only
  useEffect(() => {
    const entryIds = new Set(entries.map((e) => e.id));
    void supabase
      .from("journal_photos")
      .select("id, storage_path, entry_id")
      .eq("is_receipt", true)
      .then(async ({ data }) => {
        if (!data || data.length === 0) return;
        const results: ReceiptPhoto[] = [];
        for (const photo of data) {
          if (!entryIds.has(photo.entry_id)) continue;
          const entry = entries.find((e) => e.id === photo.entry_id);
          if (!entry) continue;
          const { data: urlData } = await supabase.storage
            .from("journal-photos")
            .createSignedUrl(photo.storage_path, 3600);
          results.push({
            id: photo.id,
            storagePath: photo.storage_path,
            publicUrl: urlData?.signedUrl ?? null,
            entryTitle: entry.title,
            amountCents: entry.amountCents ?? null,
          });
        }
        setReceipts(results);
      });
  }, [entries]);

  // Member's journal entries (by logged_by_name or author_id)
  const memberEntries = entries.filter(
    (e) =>
      (e.loggedByName && e.loggedByName.includes(member.id)) ||
      (member.userId && e.authorId === member.userId) ||
      (e.loggedByName === member.displayName),
  );

  // Spend summary
  const totalPaidCents = memberEntries.reduce((s, e) => s + (e.amountCents ?? 0), 0);
  const spendByCategory = memberEntries.reduce<Record<string, number>>((acc, e) => {
    const cat = e.category ?? "other";
    acc[cat] = (acc[cat] ?? 0) + (e.amountCents ?? 0);
    return acc;
  }, {});
  const biggestExpense = [...memberEntries].sort(
    (a, b) => (b.amountCents ?? 0) - (a.amountCents ?? 0),
  )[0];

  // Member's photos
  const memberPhotos = memberEntries.flatMap(
    (e) => (e.photos ?? []).filter((p) => p.publicUrl && !/* receipt */ false),
  );

  // Steps total
  const totalSteps = dailyLogs.reduce((s, l) => s + (l.stepsCount ?? 0), 0);

  const saveBlurb = useCallback(async () => {
    setSavingBlurb(true);
    await supabase
      .from("trip_members")
      .update({ bio_blurb: blurbDraft.trim() || null })
      .eq("id", member.id);
    setCurrentBlurb(blurbDraft.trim());
    setEditingBlurb(false);
    setSavingBlurb(false);
  }, [member.id, blurbDraft]);

  return (
    <>
      <div className="fixed inset-0 z-[80] flex flex-col">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Sheet */}
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 360, damping: 36 }}
          className="absolute bottom-0 left-0 right-0 max-h-[94dvh] bg-[#0f0f0f] rounded-t-3xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="relative flex-shrink-0">
            {/* Avatar + gradient */}
            <div
              className="h-32 w-full relative overflow-hidden"
              style={{
                background: "linear-gradient(160deg, #0d2b29 0%, #111 100%)",
              }}
            >
              <div
                className="absolute inset-0 opacity-30"
                style={{
                  background: `radial-gradient(circle at 30% 60%, ${TEAL}40, transparent 70%)`,
                }}
              />

              {/* Close */}
              <button
                type="button"
                onClick={onClose}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Avatar overlapping gradient */}
            <div className="absolute left-5" style={{ bottom: -32 }}>
              <MemberAvatar member={member} size={72} />
            </div>
          </div>

          {/* Name row */}
          <div className="px-5 pt-10 pb-4 flex-shrink-0 border-b border-white/5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-xl font-black text-white">{member.displayName ?? "—"}</h2>
                {member.onboardingPromptAnswer && (
                  <p className="text-sm text-teal-400/80 mt-0.5">{member.onboardingPromptAnswer}</p>
                )}
                <div className="mt-2">
                  {editingBlurb ? (
                    <div className="flex gap-2">
                      <textarea
                        autoFocus
                        value={blurbDraft}
                        onChange={(e) => setBlurbDraft(e.target.value.slice(0, 280))}
                        rows={2}
                        className="flex-1 bg-white/[0.06] border border-teal-400/40 rounded-xl px-3 py-2 text-sm text-white resize-none focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => void saveBlurb()}
                        disabled={savingBlurb}
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: TEAL }}
                      >
                        <Check className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setBlurbDraft(currentBlurb); setEditingBlurb(true); }}
                      className="flex items-center gap-1.5 text-xs text-white/35 hover:text-white/60 transition-colors"
                    >
                      {currentBlurb || (
                        <span className="italic text-white/20">Add a bio blurb…</span>
                      )}
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                </div>
                {member.funFact && (
                  <p className="text-xs text-white/30 mt-1.5 italic">"{member.funFact}"</p>
                )}
              </div>
            </div>

            {/* Stats row */}
            <div className="flex gap-3 mt-4">
              <StatBadge label="logs" value={memberEntries.length} />
              <StatBadge label="photos" value={memberPhotos.length} />
              <StatBadge label="steps" value={totalSteps > 0 ? totalSteps.toLocaleString() : "—"} />
              <StatBadge label="check-ins" value={dailyLogs.length} />
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto pb-8">

            {/* Spend summary */}
            {totalPaidCents > 0 && (
              <Section title="Spend summary" icon="💳">
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="rounded-2xl bg-white/[0.04] border border-white/8 p-3 text-center">
                    <p className="text-[10px] text-white/40 uppercase tracking-wide mb-1">Total</p>
                    <p className="text-base font-bold text-white tabular-nums">
                      {fmt(totalPaidCents)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/[0.04] border border-white/8 p-3 text-center">
                    <p className="text-[10px] text-white/40 uppercase tracking-wide mb-1">Biggest</p>
                    <p className="text-sm font-bold text-white tabular-nums truncate">
                      {biggestExpense ? fmt(biggestExpense.amountCents ?? 0) : "—"}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/[0.04] border border-white/8 p-3 text-center">
                    <p className="text-[10px] text-white/40 uppercase tracking-wide mb-1">Receipts</p>
                    <p className="text-base font-bold text-white">{receipts.length}</p>
                  </div>
                </div>
                {/* Category bars */}
                {Object.entries(spendByCategory)
                  .sort(([, a], [, b]) => b - a)
                  .map(([cat, cents]) => (
                    <div key={cat} className="mb-2">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="capitalize text-white/60">{cat}</span>
                        <span className="text-white/60 tabular-nums">{fmt(cents)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: SPEND_COLORS[cat] ?? "#6b7280" }}
                          initial={{ width: 0 }}
                          animate={{ width: `${(cents / totalPaidCents) * 100}%` }}
                          transition={{ duration: 0.7, ease: "easeOut", delay: 0.1 }}
                        />
                      </div>
                    </div>
                  ))}
              </Section>
            )}

            {/* Photo reel */}
            {memberPhotos.length > 0 && (
              <Section title={`Photos (${memberPhotos.length})`} icon="📸">
                <div className="grid grid-cols-2 gap-2">
                  {memberPhotos.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setLightboxUrl(p.publicUrl ?? null)}
                      className="aspect-square rounded-2xl overflow-hidden border border-white/8"
                    >
                      <img
                        src={p.publicUrl!}
                        alt=""
                        className="w-full h-full object-cover hover:scale-105 transition-transform"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {/* Receipt archive */}
            {receipts.length > 0 && (
              <Section title="Receipt archive" icon="🧾">
                <div className="grid grid-cols-3 gap-2">
                  {receipts.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => r.publicUrl && setLightboxUrl(r.publicUrl)}
                      className="relative aspect-square rounded-xl overflow-hidden border border-white/8 group"
                    >
                      {r.publicUrl ? (
                        <img src={r.publicUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full bg-white/[0.04] flex items-center justify-center">
                          <Receipt className="w-5 h-5 text-white/20" />
                        </div>
                      )}
                      {r.amountCents != null && (
                        <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[10px] text-white text-center py-1">
                          {fmt(r.amountCents)}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {/* Daily log timeline */}
            {dailyLogs.length > 0 && (
              <Section title="Daily log" icon="📓">
                <div className="space-y-3">
                  {dailyLogs.map((log, i) => (
                    <DailyLogEntry key={log.id} log={log} dayIndex={i} />
                  ))}
                </div>
              </Section>
            )}

            {loadingLogs && (
              <div className="px-5 py-8 flex justify-center">
                <div className="w-6 h-6 border-2 border-teal-400/30 border-t-teal-400 rounded-full animate-spin" />
              </div>
            )}

            {/* Personal Wrapped button */}
            <div className="px-5 mt-2">
              <button
                type="button"
                onClick={() => setShowWrapped(true)}
                className="w-full py-4 rounded-2xl flex items-center justify-between px-5 font-semibold text-sm text-white border border-white/10 hover:border-teal-400/30 hover:bg-teal-500/5 transition-colors group"
              >
                <span>✦ View my personal Wrapped</span>
                <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-teal-400 transition-colors" />
              </button>
            </div>

            {/* Switch person */}
            {onSwitch && (
              <div className="px-5 mt-3">
                <button
                  type="button"
                  onClick={onSwitch}
                  className="w-full py-3 rounded-2xl flex items-center justify-center gap-2 text-sm text-white/40 border border-white/8 hover:bg-white/[0.04] transition-colors"
                >
                  <SwitchCamera className="w-4 h-4" />
                  Switch to a different person
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Personal Wrapped overlay */}
      <AnimatePresence>
        {showWrapped && (
          <PersonalWrapped
            member={member}
            entries={memberEntries}
            dailyLogs={dailyLogs}
            onClose={() => setShowWrapped(false)}
          />
        )}
      </AnimatePresence>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
            onClick={() => setLightboxUrl(null)}
          >
            <motion.img
              src={lightboxUrl}
              alt=""
              className="max-w-full max-h-full rounded-2xl"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MemberAvatar({ member, size }: { member: TripMember; size: number }) {
  const [err, setErr] = useState(false);
  const initials = (member.displayName ?? "?")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div
      className="rounded-full overflow-hidden"
      style={{
        width: size,
        height: size,
        boxShadow: `0 0 0 3px ${TEAL}`,
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
        <div
          className="w-full h-full flex items-center justify-center font-bold text-white"
          style={{
            background: `linear-gradient(135deg, ${TEAL}, #0891b2)`,
            fontSize: size * 0.32,
          }}
        >
          {initials}
        </div>
      )}
    </div>
  );
}

function StatBadge({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex-1 rounded-2xl bg-white/[0.04] border border-white/8 px-3 py-2 text-center">
      <p className="text-base font-bold text-white">{value}</p>
      <p className="text-[10px] text-white/35 uppercase tracking-wide">{label}</p>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-5 py-4 border-b border-white/5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">{icon}</span>
        <h3 className="text-sm font-bold text-white">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function DailyLogEntry({ log, dayIndex }: { log: DailyLog; dayIndex: number }) {
  const [expanded, setExpanded] = useState(false);
  const hasContent =
    log.stepsCount ||
    log.moodScore ||
    log.bestFoodText ||
    log.worstFoodText ||
    log.funniestMoment;

  const dateLabel = new Date(log.logDate + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">{log.moodScore ? MOOD_EMOJI[log.moodScore] : "📅"}</span>
          <div>
            <p className="text-sm font-semibold text-white">Day {dayIndex + 1}</p>
            <p className="text-xs text-white/35">{dateLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {log.stepsCount && (
            <span className="text-xs text-white/30 flex items-center gap-1">
              <Footprints className="w-3 h-3" />
              {log.stepsCount.toLocaleString()}
            </span>
          )}
          <ChevronRight
            className={cn("w-4 h-4 text-white/20 transition-transform", expanded && "rotate-90")}
          />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && hasContent && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-2 border-t border-white/5 pt-3">
              {log.bestFoodText && (
                <LogLine emoji="⭐" label="Best food" text={log.bestFoodText} />
              )}
              {log.worstFoodText && (
                <LogLine emoji="💀" label="Worst food" text={log.worstFoodText} />
              )}
              {log.funniestMoment && (
                <LogLine emoji="😂" label="Funniest" text={log.funniestMoment} />
              )}
              {log.customPromptAnswer && (
                <LogLine emoji="✨" label="Prompt" text={log.customPromptAnswer} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LogLine({ emoji, label, text }: { emoji: string; label: string; text: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-sm shrink-0">{emoji}</span>
      <div>
        <span className="text-[10px] text-white/30 uppercase tracking-wide mr-1">{label}</span>
        <span className="text-xs text-white/70">{text}</span>
      </div>
    </div>
  );
}

function fmt(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
