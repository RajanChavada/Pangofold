import type { Trip, TripPhase } from "@pangofold/shared";
import { Sparkles, BookOpen, PartyPopper, RotateCcw } from "lucide-react";
import { cn } from "../lib/cn";

function effectivePhase(trip: Trip): TripPhase {
  if (trip.phase && trip.phase !== "planning") return trip.phase;
  if (!trip.startDate || !trip.endDate) return trip.phase ?? "planning";
  const now = new Date();
  const s = new Date(trip.startDate + "T12:00:00");
  const e = new Date(trip.endDate + "T23:59:59");
  if (now < s) return "planning";
  if (now > e) return "completed";
  return "active";
}

export interface PhaseBannerProps {
  trip: Trip;
  /** `underHeader`: parent supplies horizontal padding; `page` adds mx-5 for standalone use */
  variant?: "page" | "underHeader";
  /** When the trip is marked completed in the DB, owners can reopen for editing and finish again later */
  onReopenTrip?: () => void;
  /** Show reopen control (typically owner + phase completed) */
  showReopen?: boolean;
}

export function PhaseBanner({
  trip,
  variant = "page",
  onReopenTrip,
  showReopen = false,
}: PhaseBannerProps) {
  const phase = effectivePhase(trip);
  const wrap = variant === "page" ? "mx-5" : "w-full";

  if (phase === "planning") {
    return (
      <div
        className={cn(
          "mb-0 flex flex-col gap-2 rounded-xl bg-sky-50 border border-sky-200 px-4 py-3 text-sm text-sky-900",
          wrap,
        )}
      >
        <div className="flex items-start gap-2">
          <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <strong>Planning mode</strong> — enrich places and finalize your itinerary before you go.
          </span>
        </div>
      </div>
    );
  }

  if (phase === "active") {
    return (
      <div
        className={cn(
          "mb-0 flex flex-col gap-2 rounded-xl bg-teal-50 border border-teal-200 px-4 py-3 text-sm text-teal-900",
          wrap,
        )}
      >
        <div className="flex items-start gap-2">
          <BookOpen className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <strong>Journal mode</strong> — log meals, costs, and photos as you travel.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mb-0 flex flex-col gap-2 rounded-xl bg-zinc-100 border border-zinc-200 px-4 py-3 text-sm text-black",
        wrap,
      )}
    >
      <div className="flex items-start gap-2">
        <PartyPopper className="w-4 h-4 shrink-0 mt-0.5 text-zinc-700" />
        <span className="text-black">
          <strong className="text-black font-semibold">Trip complete</strong>
          <span className="text-zinc-800"> — open your report for spend, highlights, and maps.</span>
        </span>
      </div>
      {showReopen && onReopenTrip && (
        <button
          type="button"
          onClick={onReopenTrip}
          className="flex items-center justify-center gap-2 w-full sm:w-auto self-start rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-black hover:bg-zinc-50 cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          Reopen for editing
        </button>
      )}
    </div>
  );
}
