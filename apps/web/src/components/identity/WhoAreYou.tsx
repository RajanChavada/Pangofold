import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, ChevronRight, Link2, Check } from "lucide-react";
import type { TripMember } from "@pangofold/shared";
import { cn } from "../../lib/cn";

const TEAL = "#2DD4BF";

interface WhoAreYouProps {
  tripTitle: string;
  tripDates?: string;
  members: TripMember[];
  onSelect: (member: TripMember) => void;
  onNewMember: () => void;
  loading?: boolean;
  /** Full collaborate URL — shows “copy invite” so guests can return if they leave this page */
  inviteUrl?: string;
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
  size = 72,
  selected,
}: {
  member: TripMember;
  size?: number;
  selected?: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const hasPhoto = member.avatarUrl && !imgError;

  return (
    <div className="relative flex-shrink-0 mx-auto" style={{ width: size, height: size }}>
      <motion.div
        transition={{ duration: 0.2 }}
        className={cn(
          "w-full h-full rounded-full overflow-hidden bg-surface-muted",
          selected ? "ring-[3px] ring-primary shadow-md" : "ring-2 ring-border",
        )}
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
                : "linear-gradient(135deg, #94a3b8, #64748b)",
              fontSize: size * 0.28,
            }}
          >
            {initials(member.displayName)}
          </div>
        )}
      </motion.div>
      {selected && (
        <motion.div
          layoutId="selected-ring-who"
          className="absolute inset-[-4px] rounded-full border-2 pointer-events-none"
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
  inviteUrl,
}: WhoAreYouProps) {
  const [selected, setSelected] = useState<TripMember | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selected || !gridRef.current) return;
    const idx = members.findIndex((m) => m.id === selected.id);
    const cards = gridRef.current.querySelectorAll("[data-member-card]");
    cards[idx]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
    <div className="fixed inset-0 z-[70] flex flex-col bg-surface">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex flex-col flex-1 min-h-0 w-full max-w-lg mx-auto"
      >
        {/* Static header */}
        <div className="flex-shrink-0 px-6 pt-8 pb-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary mb-2">Pangofold</p>
          <h1 className="text-3xl sm:text-4xl font-black text-text mb-2 tracking-tight">Who are you?</h1>
          <p className="text-sm text-text-muted break-words px-1">{tripTitle}</p>
          {tripDates && <p className="text-xs text-text-muted/80 mt-1">{tripDates}</p>}
        </div>

        {/* Scrollable profile grid */}
        <div ref={gridRef} className="flex-1 min-h-0 overflow-y-auto px-4 pb-2">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="aspect-[4/5] rounded-2xl bg-surface-muted animate-pulse border border-border" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 auto-rows-fr">
              {members.map((member) => {
                const isSelected = selected?.id === member.id;
                return (
                  <motion.button
                    key={member.id}
                    data-member-card
                    type="button"
                    onClick={() => setSelected(isSelected ? null : member)}
                    className={cn(
                      "flex flex-col items-center gap-2 p-3 rounded-2xl border text-left transition-colors cursor-pointer min-h-[140px]",
                      isSelected
                        ? "bg-primary/10 border-primary shadow-sm"
                        : "bg-surface-card border-border hover:bg-surface-muted/80",
                    )}
                    whileTap={{ scale: 0.97 }}
                  >
                    <MemberAvatar member={member} size={72} selected={isSelected} />
                    <div className="text-center w-full min-w-0">
                      <p className="text-sm font-bold text-text break-words line-clamp-2 leading-snug">
                        {member.displayName ?? "Unknown"}
                      </p>
                      {member.onboardingPromptAnswer && (
                        <p className="text-[11px] text-text-muted mt-1 leading-snug line-clamp-2 break-words">
                          {member.onboardingPromptAnswer}
                        </p>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>

        {/* Static footer: actions + add profile */}
        <div className="flex-shrink-0 px-4 pb-6 pt-3 border-t border-border bg-surface space-y-3">
          <AnimatePresence>
            {selected && (
              <motion.div
                key="actions"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-col gap-2 overflow-hidden"
              >
                <motion.button
                  type="button"
                  onClick={handleEnter}
                  disabled={confirming}
                  className="w-full py-3.5 rounded-2xl font-semibold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-60 shadow-sm"
                  style={{
                    background: confirming
                      ? "linear-gradient(135deg, #0891b2, #0e7490)"
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
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="w-full py-2.5 rounded-2xl text-sm text-text-muted border border-border bg-surface-card hover:bg-surface-muted transition-colors"
                >
                  Not me — switch
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Always-visible add profile */}
          <motion.button
            type="button"
            onClick={onNewMember}
            className="w-full flex flex-col items-center justify-center gap-2 py-4 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer"
            whileTap={{ scale: 0.99 }}
          >
            <div className="w-14 h-14 rounded-full border-2 border-dashed border-primary/50 flex items-center justify-center bg-surface-card">
              <Plus className="w-7 h-7 text-primary" />
            </div>
            <span className="text-sm font-semibold text-primary">Add new profile</span>
            <span className="text-[11px] text-text-muted text-center px-2">Someone new on this trip</span>
          </motion.button>

          {!selected && !loading && members.length === 0 && (
            <p className="text-center text-sm text-text-muted">No profiles yet — use Add new profile above.</p>
          )}

          <p className="text-[11px] text-text-muted text-center leading-relaxed px-1">
            Identity is trip-scoped. You can switch anytime from your profile.
          </p>

          {inviteUrl && (
            <div className="rounded-xl border border-border bg-surface-muted/50 px-3 py-2.5 space-y-2">
              <p className="text-[11px] text-text-muted text-center leading-snug">
                If you used the back button or left this page, paste or open your invite link again — or copy it here.
              </p>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(inviteUrl).then(() => {
                    setInviteCopied(true);
                    setTimeout(() => setInviteCopied(false), 2000);
                  });
                }}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium border border-border bg-surface-card hover:bg-surface-muted transition-colors"
              >
                {inviteCopied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Link2 className="w-3.5 h-3.5 text-primary" />
                )}
                {inviteCopied ? "Copied invite link" : "Copy invite link"}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export function MemberAvatarBadge({
  member,
  size,
  className,
  onClick,
}: {
  member: TripMember;
  /** Pixel size; omit to use responsive default (larger on small screens). */
  size?: number;
  className?: string;
  onClick?: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const hasPhoto = member.avatarUrl && !imgError;
  const px = size ?? null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex-shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2",
        px == null && "w-12 h-12 md:w-9 md:h-9",
        className,
      )}
      style={px != null ? { width: px, height: px } : undefined}
    >
      <div className="w-full h-full rounded-full overflow-hidden ring-2 ring-primary/50 shadow-sm">
        {hasPhoto ? (
          <img
            src={member.avatarUrl!}
            alt={member.displayName ?? ""}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            className={cn(
              "w-full h-full flex items-center justify-center font-bold text-white",
              px == null ? "text-sm md:text-xs" : "text-xs",
            )}
            style={{
              background: `linear-gradient(135deg, ${TEAL}, #0891b2)`,
              fontSize: px != null ? Math.max(10, px * 0.32) : undefined,
            }}
          >
            {initials(member.displayName)}
          </div>
        )}
      </div>
    </button>
  );
}
