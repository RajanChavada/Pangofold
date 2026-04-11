import { useState, useMemo, useEffect } from "react";
import type { JournalSpendingCategory, JournalSplitMode } from "@pangofold/shared";
import { X, Camera } from "lucide-react";
import { cn } from "../lib/cn";
import { isCapacitorNative, pickOneNativePhoto } from "../lib/nativePhotos";

const CATEGORIES: { value: JournalSpendingCategory; label: string }[] = [
  { value: "food", label: "Food" },
  { value: "transport", label: "Transport" },
  { value: "activities", label: "Activities" },
  { value: "accommodation", label: "Stay" },
  { value: "other", label: "Other" },
];

const SPLIT_MODES: { value: JournalSplitMode; label: string }[] = [
  { value: "equal", label: "Split equally" },
  { value: "full_amount", label: "Full amount (one payer)" },
  { value: "group_split", label: "Group split" },
];

export interface JournalModalSubmitPayload {
  title: string;
  note: string;
  rating: number | null;
  amountCents: number | null;
  category: JournalSpendingCategory | null;
  splitBetween: number;
  splitMode: JournalSplitMode;
  paidByName: string | null;
  files: File[];
}

interface JournalModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  defaultTitle: string;
  defaultSplitCount: number;
  /** Shown under the modal title. */
  subtitle?: string;
  /** Read-only line e.g. guest name or email. */
  capturedByLabel: string;
  /** Past names + roster for “Who paid?” datalist. */
  rosterNames?: string[];
  onSubmit: (data: JournalModalSubmitPayload) => Promise<void>;
}

export function JournalModal({
  open,
  onClose,
  title,
  defaultTitle,
  defaultSplitCount,
  subtitle = "Capture a bite, a view, what you spent — quick notes beat perfect prose.",
  capturedByLabel,
  rosterNames = [],
  onSubmit,
}: JournalModalProps) {
  const [note, setNote] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<JournalSpendingCategory | "">("food");
  const [split, setSplit] = useState(String(defaultSplitCount));
  const [splitMode, setSplitMode] = useState<JournalSplitMode>("equal");
  const [paidBy, setPaidBy] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [entryTitle, setEntryTitle] = useState(defaultTitle);
  const [nativeCam, setNativeCam] = useState(false);
  const [nativeBusy, setNativeBusy] = useState(false);

  const datalistId = useMemo(() => `paid-roster-${Math.random().toString(36).slice(2)}`, []);

  useEffect(() => {
    setNativeCam(isCapacitorNative());
  }, []);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const cents =
        amount.trim() === ""
          ? null
          : Math.round(parseFloat(amount.replace(/[^0-9.]/g, "")) * 100);
      await onSubmit({
        title: entryTitle.trim() || defaultTitle,
        note,
        rating,
        amountCents: cents !== null && !Number.isNaN(cents) ? cents : null,
        category: category || null,
        splitBetween: Math.max(1, parseInt(split, 10) || defaultSplitCount),
        splitMode,
        paidByName: paidBy.trim() ? paidBy.trim().slice(0, 120) : null,
        files,
      });
      setNote("");
      setRating(null);
      setAmount("");
      setPaidBy("");
      setFiles([]);
      setEntryTitle(defaultTitle);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-surface-card rounded-2xl border border-border shadow-xl max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            <p className="text-xs text-text-muted mt-1 max-w-[280px]">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-surface-muted cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="px-5 py-4 space-y-4">
          <div className="rounded-xl bg-surface-muted/80 px-3 py-2 text-xs">
            <span className="text-text-muted">Captured by </span>
            <span className="font-medium">{capturedByLabel}</span>
          </div>
          <div>
            <label className="text-xs font-medium text-text-muted">Title</label>
            <input
              value={entryTitle}
              onChange={(e) => setEntryTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-muted">Note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm resize-none"
              placeholder="What stood out?"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-text-muted">Rating</label>
              <div className="mt-1 flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(rating === n ? null : n)}
                    className={cn(
                      "w-9 h-9 rounded-lg text-sm font-semibold border transition-colors cursor-pointer",
                      rating === n
                        ? "bg-primary text-white border-primary"
                        : "bg-surface-muted border-border hover:border-primary/40",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="w-28">
              <label className="text-xs font-medium text-text-muted">Cost (total)</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                placeholder="$0"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-muted">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as JournalSpendingCategory)}
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted">Split (people)</label>
              <input
                value={split}
                onChange={(e) => setSplit(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                inputMode="numeric"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-text-muted">Split mode</label>
            <select
              value={splitMode}
              onChange={(e) => setSplitMode(e.target.value as JournalSplitMode)}
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            >
              {SPLIT_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-text-muted">Who paid?</label>
            <input
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
              list={datalistId}
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              placeholder="Name (optional)"
            />
            <datalist id={datalistId}>
              {rosterNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="text-xs font-medium text-text-muted flex items-center gap-2">
              <Camera className="w-3.5 h-3.5" />
              Photos
            </label>
            {nativeCam && (
              <button
                type="button"
                disabled={nativeBusy}
                onClick={() => {
                  setNativeBusy(true);
                  void pickOneNativePhoto()
                    .then((f) => {
                      if (f) setFiles((prev) => [...prev, f]);
                    })
                    .finally(() => setNativeBusy(false));
                }}
                className="mt-2 w-full rounded-xl border border-border bg-surface py-2.5 text-sm font-medium text-text hover:bg-surface-muted disabled:opacity-50 cursor-pointer"
              >
                {nativeBusy ? "Opening camera…" : "Camera or photo library"}
              </button>
            )}
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files) : [])}
              className={cn("text-sm w-full", nativeCam ? "mt-2" : "mt-1")}
            />
            {files.length > 0 && (
              <p className="text-xs text-text-muted mt-1">{files.length} file(s) selected</p>
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-border font-medium text-text-muted hover:bg-surface-muted cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-primary text-white font-medium hover:bg-primary-dark disabled:opacity-50 cursor-pointer"
            >
              {saving ? "Saving…" : "Save log"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
