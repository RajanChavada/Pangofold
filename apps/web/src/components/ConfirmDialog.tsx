import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { cn } from "../lib/cn";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px] transition-opacity"
        onClick={loading ? undefined : onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="relative w-full max-w-md rounded-t-3xl sm:rounded-2xl border border-border bg-surface-card shadow-xl"
      >
        <div className="p-6 sm:p-7">
          <div className="flex gap-4">
            {variant === "danger" && (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                <AlertTriangle className="h-5 w-5" aria-hidden />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 id="confirm-dialog-title" className="text-lg font-semibold tracking-tight text-text">
                {title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{description}</p>
            </div>
          </div>

          <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={onCancel}
              className="w-full sm:w-auto rounded-xl border border-border bg-surface-card px-5 py-2.5 text-sm font-medium text-text hover:bg-surface-muted transition-colors cursor-pointer disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={onConfirm}
              className={cn(
                "w-full sm:w-auto rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50",
                variant === "danger"
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-primary text-white hover:bg-primary-dark",
              )}
            >
              {loading ? "Please wait…" : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
