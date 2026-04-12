import { useState, useEffect } from "react";
import type { JournalSplitMode } from "@pangofold/shared";
import { X, Camera, Compass } from "lucide-react";
import { cn } from "../lib/cn";
import { isCapacitorNative, pickOneNativePhoto } from "../lib/nativePhotos";
import type { JournalModalSubmitPayload } from "./JournalModal";
import type { PlanItemOption } from "./DailyLogModal";

interface ActivityMomentLogModalProps {
  open: boolean;
  onClose: () => void;
  planItemsForDay: PlanItemOption[];
  defaultSplitCount: number;
  capturedByLabel: string;
  onSubmit: (data: JournalModalSubmitPayload) => Promise<void>;
}

export function ActivityMomentLogModal({
  open,
  onClose,
  planItemsForDay,
  defaultSplitCount,
  capturedByLabel,
  onSubmit,
}: ActivityMomentLogModalProps) {
  const [title, setTitle] = useState("");
  const [linkedItemId, setLinkedItemId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [nativeCam, setNativeCam] = useState(false);
  const [nativeBusy, setNativeBusy] = useState(false);

  useEffect(() => {
    setNativeCam(isCapacitorNative());
  }, []);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setLinkedItemId(null);
    setNote("");
    setRating(null);
    setFiles([]);
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setSaving(true);
    try {
      const splitMode: JournalSplitMode = "equal";
      await onSubmit({
        title: t,
        note: note.trim(),
        rating,
        amountCents: null,
        category: "activities",
        splitBetween: Math.max(1, defaultSplitCount),
        splitMode,
        paidByName: null,
        files,
        itineraryItemId: linkedItemId,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center p-4 bg-black/40">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-surface-card rounded-2xl border border-border shadow-xl max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-lg font-bold text-text">Activity moment</h2>
              <p className="text-xs text-text-muted mt-0.5">Journal entry — link a plan stop or write your own</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-surface-muted cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="px-5 py-4 space-y-4">
          <div className="rounded-xl bg-surface-muted/80 px-3 py-2 text-xs">
            <span className="text-text-muted">Logged by </span>
            <span className="font-medium">{capturedByLabel}</span>
          </div>

          <div>
            <label className="text-xs font-medium text-text-muted">Link to itinerary (optional)</label>
            <select
              value={linkedItemId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setLinkedItemId(v || null);
                const it = planItemsForDay.find((x) => x.id === v);
                if (it && !title.trim()) setTitle(it.title);
              }}
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">Not linked — custom name below</option>
              {planItemsForDay.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.time ? `${it.time} · ` : ""}
                  {it.title} ({it.category})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-text-muted">Activity / place name</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              placeholder="e.g. Grouse Mountain, evening walk…"
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium text-text-muted">What happened?</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm resize-none"
              placeholder="Highlights, vibe, who was there…"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-text-muted">Rating (optional)</label>
            <div className="mt-1 flex gap-1 flex-wrap">
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
                className="mt-2 w-full rounded-xl border border-border bg-surface py-2.5 text-sm font-medium hover:bg-surface-muted disabled:opacity-50"
              >
                {nativeBusy ? "Opening…" : "Camera or library"}
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
              <p className="text-xs text-text-muted mt-1">{files.length} photo(s)</p>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-border font-medium text-text-muted hover:bg-surface-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="flex-1 py-3 rounded-xl bg-primary text-white font-medium hover:bg-primary-dark disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
