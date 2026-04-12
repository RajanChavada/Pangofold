import { useState, useMemo, useEffect } from "react";
import type { JournalSplitMode } from "@pangofold/shared";
import { X, Camera, Utensils } from "lucide-react";
import { cn } from "../lib/cn";
import { isCapacitorNative, pickOneNativePhoto } from "../lib/nativePhotos";
import type { JournalModalSubmitPayload } from "./JournalModal";
import type { PlanItemOption } from "./DailyLogModal";

type BillStyle = "split" | "individual";

interface FoodExpenseLogModalProps {
  open: boolean;
  onClose: () => void;
  planItemsForDay: PlanItemOption[];
  defaultSplitCount: number;
  capturedByLabel: string;
  rosterNames: string[];
  onSubmit: (data: JournalModalSubmitPayload) => Promise<void>;
}

export function FoodExpenseLogModal({
  open,
  onClose,
  planItemsForDay,
  defaultSplitCount,
  capturedByLabel,
  rosterNames,
  onSubmit,
}: FoodExpenseLogModalProps) {
  const [placeTitle, setPlaceTitle] = useState("");
  const [linkedItemId, setLinkedItemId] = useState<string | null>(null);
  const [diners, setDiners] = useState(String(Math.max(1, defaultSplitCount)));
  const [billStyle, setBillStyle] = useState<BillStyle>("split");
  const [amount, setAmount] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [momentNote, setMomentNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [nativeCam, setNativeCam] = useState(false);
  const [nativeBusy, setNativeBusy] = useState(false);

  const datalistId = useMemo(() => `food-paid-${Math.random().toString(36).slice(2)}`, []);

  useEffect(() => {
    setNativeCam(isCapacitorNative());
  }, []);

  useEffect(() => {
    if (!open) return;
    setPlaceTitle("");
    setLinkedItemId(null);
    setDiners(String(Math.max(1, defaultSplitCount)));
    setBillStyle("split");
    setAmount("");
    setRating(null);
    setMomentNote("");
    setFiles([]);
  }, [open, defaultSplitCount]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = placeTitle.trim();
    if (!t) return;
    setSaving(true);
    try {
      const centsRaw = amount.trim() === "" ? null : Math.round(parseFloat(amount.replace(/[^0-9.]/g, "")) * 100);
      const cents = centsRaw !== null && !Number.isNaN(centsRaw) ? centsRaw : null;
      const n = Math.max(1, parseInt(diners, 10) || 1);
      const splitMode: JournalSplitMode = billStyle === "individual" ? "full_amount" : "equal";
      const noteParts: string[] = [];
      if (momentNote.trim()) {
        noteParts.push(`Funniest / interesting: ${momentNote.trim()}`);
      }
      await onSubmit({
        title: t,
        note: noteParts.join("\n\n") || "",
        rating,
        amountCents: cents,
        category: "food",
        splitBetween: n,
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
            <Utensils className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-lg font-bold text-text">Food & expense</h2>
              <p className="text-xs text-text-muted mt-0.5">Saved to the trip journal — not the daily check-in</p>
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
                if (it && !placeTitle.trim()) setPlaceTitle(it.title);
              }}
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">Not linked</option>
              {planItemsForDay.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.time ? `${it.time} · ` : ""}
                  {it.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-text-muted">Place / meal name</label>
            <input
              value={placeTitle}
              onChange={(e) => setPlaceTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              placeholder="e.g. Din Tai Fung"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-muted">How many people?</label>
              <input
                value={diners}
                onChange={(e) => setDiners(e.target.value)}
                inputMode="numeric"
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                min={1}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted">Total bill (optional)</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                placeholder="$0"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-text-muted">Bill</label>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setBillStyle("split")}
                className={cn(
                  "flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors",
                  billStyle === "split"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-surface text-text-muted",
                )}
              >
                Split between us
              </button>
              <button
                type="button"
                onClick={() => setBillStyle("individual")}
                className={cn(
                  "flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors",
                  billStyle === "individual"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-surface text-text-muted",
                )}
              >
                One total (one payer)
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-text-muted">Rate the food (optional)</label>
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

          <div>
            <label className="text-xs font-medium text-text-muted">
              Funniest or interesting moment (optional)
            </label>
            <textarea
              value={momentNote}
              onChange={(e) => setMomentNote(e.target.value.slice(0, 500))}
              rows={3}
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm resize-none"
              placeholder="Something you talked about, or something you saw…"
            />
          </div>

          <datalist id={datalistId}>
            {rosterNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>

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
              disabled={saving || !placeTitle.trim()}
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
