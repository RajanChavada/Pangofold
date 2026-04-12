import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, Check, ArrowLeft, ArrowRight, Plus } from "lucide-react";
import type { OnboardingPrompts, TripMember } from "@pangofold/shared";
import { insertGuestMember, saveToken, uploadMemberAvatar, upsertOwnerMember } from "../../hooks/useMemberIdentity";
import { supabase } from "../../lib/supabase";
import { cn } from "../../lib/cn";

const TEAL = "#2DD4BF";
const DEFAULT_PROMPTS: OnboardingPrompts = {
  prompt_1: "What are you most excited about?",
  prompt_2: "What is your one must-eat on this trip?",
  fun_fact: "Most likely to _____ on this trip?",
};

interface MemberOnboardingProps {
  tripId: string;
  /** Optional Supabase auth user id — when set, upserts an owner-linked member */
  ownerId?: string;
  prompts?: OnboardingPrompts | null;
  onComplete: (member: TripMember) => void;
  onBack?: () => void;
}

type Step = 1 | 2 | 3;

export function MemberOnboarding({
  tripId,
  ownerId,
  prompts,
  onComplete,
  onBack,
}: MemberOnboardingProps) {
  const p = prompts ?? DEFAULT_PROMPTS;
  const [step, setStep] = useState<Step>(1);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [promptAnswer, setPromptAnswer] = useState("");
  const [funFact, setFunFact] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [direction, setDirection] = useState<1 | -1>(1);

  const pickFile = (file: File) => {
    setAvatarFile(file);
    const url = URL.createObjectURL(file);
    setAvatarPreview(url);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) pickFile(f);
  };

  const canAdvanceStep1 = true; // avatar is optional — we allow skipping
  const canAdvanceStep2 = displayName.trim().length >= 1;

  const goNext = () => {
    setDirection(1);
    setStep((s) => Math.min(s + 1, 3) as Step);
  };

  const goPrev = () => {
    if (step === 1) {
      onBack?.();
      return;
    }
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 1) as Step);
  };

  const handleFinish = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      let avatarUrl: string | undefined;

      // We need a placeholder member id to upload avatar; insert first, then upload
      let member: TripMember | null = null;
      if (ownerId) {
        member = await upsertOwnerMember(tripId, ownerId, {
          displayName: displayName.trim(),
          bioBurb: promptAnswer.trim() || undefined,
          funFact: funFact.trim() || undefined,
          onboardingPromptAnswer: promptAnswer.trim() || undefined,
        });
      } else {
        member = await insertGuestMember(tripId, {
          displayName: displayName.trim(),
          bioBurb: promptAnswer.trim() || undefined,
          funFact: funFact.trim() || undefined,
          onboardingPromptAnswer: promptAnswer.trim() || undefined,
        });
      }

      if (!member) {
        setError("Couldn't create your profile. Please try again.");
        setSaving(false);
        return;
      }

      // Upload avatar after getting the member id
      if (avatarFile) {
        avatarUrl = (await uploadMemberAvatar(member.id, avatarFile)) ?? undefined;
        if (avatarUrl) {
          await supabase
            .from("trip_members")
            .update({ avatar_url: avatarUrl })
            .eq("id", member.id);
          member = { ...member, avatarUrl };
        }
      }

      // Persist token to localStorage
      if (member.localStorageToken) {
        saveToken(tripId, member.localStorageToken);
      }

      onComplete(member);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }, [tripId, ownerId, displayName, promptAnswer, funFact, avatarFile, onComplete]);

  const slideVariants = {
    enter: (d: number) => ({ x: d > 0 ? 60 : -60, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -60 : 60, opacity: 0 }),
  };

  return (
    <div className="fixed inset-0 z-[75] flex flex-col bg-surface text-text">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-5 pb-2">
        <button
          type="button"
          onClick={goPrev}
          className="p-2 rounded-xl text-text-muted hover:text-text hover:bg-surface-muted transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Progress dots */}
        <div className="flex items-center gap-2">
          {([1, 2, 3] as Step[]).map((s) => (
            <motion.div
              key={s}
              animate={{
                width: s === step ? 20 : 6,
                backgroundColor: s === step ? TEAL : s < step ? "#0891b2" : "rgba(15,23,42,0.15)",
              }}
              className="h-1.5 rounded-full"
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          ))}
        </div>

        <div className="w-9" /> {/* spacer */}
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={step}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 380, damping: 35 }}
            className="absolute inset-0 flex flex-col items-center justify-center px-6"
          >
            {step === 1 && (
              <Step1
                preview={avatarPreview}
                onUpload={() => fileRef.current?.click()}
              />
            )}
            {step === 2 && (
              <Step2
                prompt={p.prompt_1}
                displayName={displayName}
                setDisplayName={setDisplayName}
                answer={promptAnswer}
                setAnswer={setPromptAnswer}
              />
            )}
            {step === 3 && (
              <Step3
                prompt={p.fun_fact}
                value={funFact}
                setValue={setFunFact}
                error={error}
                saving={saving}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom action */}
      <div className="px-6 pb-8 pt-4">
        {step < 3 ? (
          <motion.button
            type="button"
            onClick={goNext}
            disabled={step === 2 && !canAdvanceStep2}
            className={cn(
              "w-full py-4 rounded-2xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-opacity shadow-md",
              step === 2 && !canAdvanceStep2 ? "opacity-40" : "opacity-100",
            )}
            style={{ background: `linear-gradient(135deg, ${TEAL}, #0891b2)` }}
            whileTap={{ scale: 0.98 }}
          >
            {step === 1 && avatarPreview ? "Looks good" : step === 1 ? "Skip for now" : "Continue"}
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        ) : (
          <motion.button
            type="button"
            onClick={handleFinish}
            disabled={saving}
            className="w-full py-4 rounded-2xl font-semibold text-sm text-white flex items-center justify-center gap-2"
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
              <>
                <Check className="w-4 h-4" />
                Join the trip
              </>
            )}
          </motion.button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={handleFileInput}
      />
    </div>
  );
}

// ── Step 1: Avatar ────────────────────────────────────────────────────────────

function Step1({
  preview,
  onUpload,
}: {
  preview: string | null;
  onUpload: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-sm mx-auto">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary mb-3">Step 1 of 3</p>
        <h2 className="text-3xl font-black text-text mb-2">Your photo</h2>
        <p className="text-sm text-text-muted">This appears in the crew carousel and your personal Wrapped.</p>
      </div>

      <button
        type="button"
        onClick={onUpload}
        className="relative w-full flex flex-col items-center justify-center gap-3 py-8 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors"
      >
        <div className="relative">
          <div
            className="w-28 h-28 rounded-full overflow-hidden border-2 flex items-center justify-center bg-surface-card"
            style={{ borderColor: preview ? TEAL : undefined }}
          >
            {preview ? (
              <img src={preview} alt="Your avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-text-muted">
                <div className="w-14 h-14 rounded-full border-2 border-dashed border-primary/50 flex items-center justify-center bg-surface-card">
                  <Plus className="w-7 h-7 text-primary" />
                </div>
                <span className="text-xs">Add photo</span>
              </div>
            )}
          </div>
          {preview && (
            <div
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center shadow-md"
              style={{ background: TEAL }}
            >
              <Check className="w-4 h-4 text-white" />
            </div>
          )}
        </div>
        <span className="text-xs font-medium text-text-muted flex items-center gap-1.5">
          <Camera className="w-3.5 h-3.5 text-primary" />
          Tap to take or choose from library
        </span>
      </button>
    </div>
  );
}

// ── Step 2: Name + prompt ────────────────────────────────────────────────────

function Step2({
  prompt,
  displayName,
  setDisplayName,
  answer,
  setAnswer,
}: {
  prompt: string;
  displayName: string;
  setDisplayName: (v: string) => void;
  answer: string;
  setAnswer: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6 w-full max-w-sm mx-auto">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary mb-3">Step 2 of 3</p>
        <h2 className="text-3xl font-black text-text mb-2">About you</h2>
        <p className="text-sm text-text-muted">Shown in the crew carousel and group Wrapped.</p>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2 block">
            Your name
          </label>
          <input
            autoFocus
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={60}
            placeholder="First name or nickname"
            className="w-full bg-surface-card border border-border rounded-xl px-4 py-3 text-text placeholder:text-text-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 transition-colors"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2 block">{prompt}</label>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value.slice(0, 140))}
            placeholder="Your answer…"
            rows={3}
            className="w-full bg-surface-card border border-border rounded-xl px-4 py-3 text-text placeholder:text-text-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 transition-colors resize-none"
          />
          <p className="text-right text-[11px] text-text-muted mt-1">{answer.length}/140</p>
        </div>
      </div>
    </div>
  );
}

// ── Step 3: Fun fact ─────────────────────────────────────────────────────────

function Step3({
  prompt,
  value,
  setValue,
  error,
  saving,
}: {
  prompt: string;
  value: string;
  setValue: (v: string) => void;
  error: string | null;
  saving: boolean;
}) {
  return (
    <div className="flex flex-col gap-6 w-full max-w-sm mx-auto">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary mb-3">Step 3 of 3</p>
        <h2 className="text-3xl font-black text-text mb-2">Fun fact</h2>
        <p className="text-sm text-text-muted">Optional — this gets revealed in the group Wrapped at the end.</p>
      </div>

      <div>
        <label className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2 block">{prompt}</label>
        <textarea
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, 140))}
          placeholder="Your answer…"
          rows={4}
          className="w-full bg-surface-card border border-border rounded-xl px-4 py-3 text-text placeholder:text-text-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 transition-colors resize-none"
        />
        <p className="text-right text-[11px] text-text-muted mt-1">{value.length}/140</p>
      </div>

      {error && <p className="text-sm text-red-600 text-center">{error}</p>}

      {saving && <p className="text-sm text-primary text-center animate-pulse">Creating your profile…</p>}
    </div>
  );
}
