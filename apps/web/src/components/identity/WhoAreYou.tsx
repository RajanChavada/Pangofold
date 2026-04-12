import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, ChevronRight } from "lucide-react";
import type { TripMember } from "@pangofold/shared";
import { cn } from "../../lib/cn";

// Teal palette matching the app accent
const TEAL = "#2DD4BF";

interface WhoAreYouProps {
  tripTitle: string;
  tripDates?: string;
  members: TripMember[];
  /** Called when user picks an existing member */
  onSelect: (member: TripMember) => void;
  /** Called when user taps "I'm someone new" */
  onNewMember: () => void;
  /** Loading state while fetching members */
  loading?: boolean;
}

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function MemberAvatar({
  member,
  size = 64,
  selected,
}: {
  member: TripMember;
  size?: number;
  selected?: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const hasPhoto = member.avatarUrl && !imgError;

  return (
    <div
      className="relative flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <motion.div
        animate={{
          boxShadow: selected
            ? `0 0 0 3px ${TEAL}, 0 0 20px ${TEAL}55`
            : "0 0 0 2px rgba(255,255,255,0.1)",
        }}
        transition={{ duration: 0.2 }}
        className="w-full h-full rounded-full overflow-hidden"
      >
        {hasPhoto ? (
          <img
            src={member.avatarUrl!}
            alt={member.displayName ?? ""}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center font-bold text-white"
            style={{
              background: selected
                ? `linear-gradient(135deg, ${TEAL}, #0891b2)`
                : "linear-gradient(135deg, #374151, #1f2937)",
              fontSize: size * 0.32,
            }}
          >
            {initials(member.displayName)}
          </div>
        )}
      </motion.div>
      {selected && (
        <motion.div
          layoutId="selected-ring"
          className="absolute inset-[-3px] rounded-full border-2"
          style={{ borderColor: TEAL }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}
    </div>
  );
}

export function WhoAreYou({
  tripTitle,
  tripDates,
  members,
  onSelect,
  onNewMember,
  loading = false,
}: WhoAreYouProps) {
  const [selected, setSelected] = useState<TripMember | null>(null);
  const [confirming, setConfirming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll selected card into view
  useEffect(() => {
    if (!selected || !scrollRef.current) return;
    const idx = members.findIndex((m) => m.id === selected.id);
    const cards = scrollRef.current.querySelectorAll("[data-member-card]");
    cards[idx]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selected, members]);

  const handleEnter = () => {
    if (!selected) return;
    setConfirming(true);
    setTimeout(() => {
      onSelect(selected);
      setConfirming(false);
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-[#0d0d0d]">
      {/* Background texture */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle at 50% 50%, #2DD4BF 0%, transparent 70%)",
          backgroundSize: "100% 100%",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md px-6 flex flex-col items-center"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-teal-400 mb-3">
            Pangofold
          </p>
          <h1 className="text-4xl font-black text-white mb-2 tracking-tight">Who are you?</h1>
          <p className="text-sm text-white/50">{tripTitle}</p>
          {tripDates && (
            <p className="text-xs text-white/30 mt-1">{tripDates}</p>
          )}
        </div>

        {/* Member cards — scrollable horizontal carousel */}
        {loading ? (
          <div className="flex gap-4 overflow-x-auto pb-4 w-full">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex-shrink-0 w-[140px] h-[180px] rounded-2xl bg-white/5 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="flex gap-3 overflow-x-auto pb-4 w-full snap-x snap-mandatory"
            style={{ scrollbarWidth: "none" }}
          >
            {members.map((member) => {
              const isSelected = selected?.id === member.id;
              return (
                <motion.button
                  key={member.id}
                  data-member-card
                  type="button"
                  onClick={() => setSelected(isSelected ? null : member)}
                  className={cn(
                    "flex-shrink-0 snap-center w-[140px] flex flex-col items-center gap-3 p-4 rounded-2xl border transition-colors cursor-pointer",
                    isSelected
                      ? "bg-white/10 border-teal-400/60"
                      : "bg-white/[0.04] border-white/10 hover:bg-white/[0.07]",
                  )}
                  whileTap={{ scale: 0.96 }}
                >
                  <MemberAvatar member={member} size={64} selected={isSelected} />
                  <div className="text-center w-full min-w-0">
                    <p className="text-sm font-bold text-white truncate">
                      {member.displayName ?? "Unknown"}
                    </p>
                    {member.onboardingPromptAnswer && (
                      <p className="text-[11px] text-white/40 mt-1 leading-snug line-clamp-2">
                        {member.onboardingPromptAnswer}
                      </p>
                    )}
                  </div>
                </motion.button>
              );
            })}

            {/* "I'm someone new" card */}
            <motion.button
              type="button"
              onClick={onNewMember}
              className="flex-shrink-0 snap-center w-[140px] flex flex-col items-center justify-center gap-3 p-4 rounded-2xl border border-dashed border-white/20 bg-transparent hover:bg-white/[0.04] cursor-pointer transition-colors"
              whileTap={{ scale: 0.96 }}
            >
              <div className="w-16 h-16 rounded-full border-2 border-dashed border-white/30 flex items-center justify-center">
                <Plus className="w-6 h-6 text-white/40" />
              </div>
              <p className="text-[12px] text-white/40 text-center leading-snug">
                I'm someone new
              </p>
            </motion.button>
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-6 w-full flex flex-col gap-3">
          <AnimatePresence>
            {selected && (
              <motion.button
                key="enter"
                type="button"
                onClick={handleEnter}
                disabled={confirming}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.2 }}
                className="w-full py-3.5 rounded-2xl font-semibold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-60"
                style={{
                  background: confirming
                    ? `linear-gradient(135deg, #0891b2, #0e7490)`
                    : `linear-gradient(135deg, ${TEAL}, #0891b2)`,
                }}
                whileTap={{ scale: 0.98 }}
              >
                {confirming ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                    className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                  />
                ) : (
                  <>
                    Enter as {selected.displayName}
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </motion.button>
            )}
          </AnimatePresence>

          {selected && (
            <motion.button
              type="button"
              onClick={() => setSelected(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full py-3 rounded-2xl text-sm text-white/50 border border-white/10 hover:bg-white/[0.04] transition-colors"
            >
              Not me — switch
            </motion.button>
          )}

          {!selected && !loading && members.length === 0 && (
            <p className="text-center text-sm text-white/30">
              No profiles yet — tap "I'm someone new" to get started.
            </p>
          )}
        </div>

        <p className="mt-8 text-[11px] text-white/20 text-center">
          Identity is trip-scoped. You can switch anytime from your profile.
        </p>
      </motion.div>
    </div>
  );
}

// ── Compact inline variant for owner banner ──────────────────────────────────

export function MemberAvatarBadge({
  member,
  size = 36,
  onClick,
}: {
  member: TripMember;
  size?: number;
  onClick?: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const hasPhoto = member.avatarUrl && !imgError;

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex-shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-teal-400"
      style={{ width: size, height: size }}
    >
      <div
        className="w-full h-full rounded-full overflow-hidden ring-2 ring-teal-400/60"
      >
        {hasPhoto ? (
          <img
            src={member.avatarUrl!}
            alt={member.displayName ?? ""}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center font-bold text-white text-xs"
            style={{
              background: `linear-gradient(135deg, ${TEAL}, #0891b2)`,
            }}
          >
            {initials(member.displayName)}
          </div>
        )}
      </div>
    </button>
  );
}
