import type { Trip } from "@pangofold/shared";
import {
  MapPin,
  Calendar,
  Share2,
  ArrowLeft,
  Pencil,
  Check,
  Trash2,
  BarChart3,
  PartyPopper,
} from "lucide-react";
import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { cn } from "../lib/cn";
import { supabase } from "../lib/supabase";
import { ConfirmDialog } from "./ConfirmDialog";
import { PhaseBanner } from "./PhaseBanner";

interface TripHeaderProps {
  trip: Trip;
  editable?: boolean;
  /** Status strip + actions directly under the cover image */
  showPhaseBanner?: boolean;
  /** Marks the trip complete and navigates to the Wrapped report (owner view). */
  onFinishTrip?: () => void;
  /** Sets phase back to active so the owner can edit and finish again later. */
  onReopenTrip?: () => void;
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (s.getFullYear() !== e.getFullYear()) {
    return `${s.toLocaleDateString("en-US", { ...opts, year: "numeric" })} – ${e.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
  }
  return `${s.toLocaleDateString("en-US", opts)} – ${e.toLocaleDateString("en-US", opts)}, ${s.getFullYear()}`;
}

export function TripHeader({
  trip,
  editable = false,
  showPhaseBanner = false,
  onFinishTrip,
  onReopenTrip,
}: TripHeaderProps) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const shareUrl = `${window.location.origin}/s/${trip.shareSlug}`;

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    const { error } = await supabase.from("trips").delete().eq("id", trip.id);
    if (!error) {
      setDeleteOpen(false);
      navigate("/dashboard");
    } else {
      setDeleting(false);
    }
  };

  const showReopen = Boolean(onReopenTrip && trip.phase === "completed");
  const showFinishCta = Boolean(onFinishTrip && trip.phase !== "completed");

  return (
    <div className="relative">
      <ConfirmDialog
        open={deleteOpen}
        title="Delete this trip?"
        description={`“${trip.title}” and all of its destinations, days, and items will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete trip"
        cancelLabel="Keep trip"
        variant="danger"
        loading={deleting}
        onCancel={() => {
          if (!deleting) setDeleteOpen(false);
        }}
        onConfirm={() => void handleDelete()}
      />
      {trip.coverImageUrl && (
        <div className="relative h-48 w-full overflow-hidden rounded-b-3xl">
          <img
            src={trip.coverImageUrl}
            alt={trip.title}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 h-48 bg-gradient-to-t from-black/40 to-transparent rounded-b-3xl pointer-events-none" />
        </div>
      )}

      {showPhaseBanner && (
        <div className="px-5 pt-3 space-y-2">
          <PhaseBanner
            trip={trip}
            variant="underHeader"
            onReopenTrip={onReopenTrip}
            showReopen={showReopen}
          />
          {showFinishCta && onFinishTrip && (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={onFinishTrip}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold text-sm shadow-md hover:opacity-95 cursor-pointer"
              >
                <PartyPopper className="w-5 h-5 shrink-0" />
                Finish trip &amp; view Wrapped
              </button>
              <p className="text-[11px] text-text-muted text-center px-1">
                Marks this trip complete and opens your spend &amp; superlatives report.
              </p>
            </div>
          )}
        </div>
      )}

      <div className={cn("px-5 pb-4", trip.coverImageUrl ? "pt-4" : "pt-6")}>
        <div className="flex items-start justify-between gap-3">
          <button
            onClick={() => navigate("/dashboard")}
            className="mt-1 p-2 -ml-2 rounded-xl hover:bg-surface-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex gap-2">
            {editable && (
              <Link
                to={`/trip/${trip.id}/report`}
                className="p-2 rounded-xl hover:bg-surface-muted transition-colors"
                title="Trip report"
              >
                <BarChart3 className="w-4 h-4" />
              </Link>
            )}
            {editable && (
              <Link
                to={`/trip/${trip.id}/edit`}
                className="p-2 rounded-xl hover:bg-surface-muted transition-colors"
              >
                <Pencil className="w-4 h-4" />
              </Link>
            )}
            <button
              onClick={handleShare}
              className={cn(
                "p-2 rounded-xl transition-colors",
                copied ? "bg-primary/10 text-primary" : "hover:bg-surface-muted",
              )}
            >
              {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
            </button>
            {editable && (
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                disabled={deleting}
                className="p-2 rounded-xl hover:bg-red-50 text-text-muted hover:text-red-500 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center gap-1.5 text-primary mb-1">
            <MapPin className="w-4 h-4" />
            <span className="text-xs font-semibold tracking-wide uppercase">Pangofold</span>
          </div>
          <h1
            className={cn(
              "text-2xl font-bold tracking-tight leading-tight text-text",
            )}
          >
            {trip.title}
          </h1>
          {trip.startDate && trip.endDate && (
            <div className="flex items-center gap-1.5 mt-2 text-text-muted text-sm">
              <Calendar className="w-3.5 h-3.5" />
              <span>{formatDateRange(trip.startDate, trip.endDate)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
