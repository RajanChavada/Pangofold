import type { Trip } from "@pangofold/shared";
import { MapPin, Calendar, Share2, ArrowLeft, Pencil, Check } from "lucide-react";
import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { cn } from "../lib/cn";

interface TripHeaderProps {
  trip: Trip;
  editable?: boolean;
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

export function TripHeader({ trip, editable = false }: TripHeaderProps) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

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

  return (
    <div className="relative">
      {trip.coverImageUrl && (
        <div className="h-48 w-full overflow-hidden rounded-b-3xl">
          <img
            src={trip.coverImageUrl}
            alt={trip.title}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 h-48 bg-gradient-to-t from-black/40 to-transparent rounded-b-3xl" />
        </div>
      )}

      <div className={cn("px-5 pb-4", trip.coverImageUrl ? "pt-4 -mt-16 relative z-10" : "pt-6")}>
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
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center gap-1.5 text-primary mb-1">
            <MapPin className="w-4 h-4" />
            <span className="text-xs font-semibold tracking-wide uppercase">Pangofold</span>
          </div>
          <h1 className={cn(
            "text-2xl font-bold tracking-tight leading-tight",
            trip.coverImageUrl && "text-white drop-shadow-sm",
          )}>
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
