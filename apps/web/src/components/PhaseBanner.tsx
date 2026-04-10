import type { Trip, TripPhase } from "@pangofold/shared";
import { Sparkles, BookOpen, PartyPopper } from "lucide-react";

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

export function PhaseBanner({ trip }: { trip: Trip }) {
  const phase = effectivePhase(trip);

  if (phase === "planning") {
    return (
      <div className="mx-5 mb-3 flex items-center gap-2 rounded-xl bg-sky-50 border border-sky-200 px-4 py-3 text-sm text-sky-900">
        <Sparkles className="w-4 h-4 shrink-0" />
        <span>
          <strong>Planning mode</strong> — enrich places and finalize your itinerary before you go.
        </span>
      </div>
    );
  }

  if (phase === "active") {
    return (
      <div className="mx-5 mb-3 flex items-center gap-2 rounded-xl bg-teal-50 border border-teal-200 px-4 py-3 text-sm text-teal-900">
        <BookOpen className="w-4 h-4 shrink-0" />
        <span>
          <strong>Journal mode</strong> — log meals, costs, and photos as you travel.
        </span>
      </div>
    );
  }

  return (
    <div className="mx-5 mb-3 flex items-center gap-2 rounded-xl bg-violet-50 border border-violet-200 px-4 py-3 text-sm text-violet-900">
      <PartyPopper className="w-4 h-4 shrink-0" />
      <span>
        <strong>Trip complete</strong> — open your report for spend, highlights, and maps.
      </span>
    </div>
  );
}
