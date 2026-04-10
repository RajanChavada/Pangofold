import type { FoodSpot, FoodType } from "@pangofold/shared";
import { ExternalLink, DollarSign } from "lucide-react";
import { cn } from "../lib/cn";

const TYPE_STYLE: Record<FoodType, { label: string; color: string }> = {
  restaurant: { label: "Restaurant", color: "bg-orange-100 text-orange-700" },
  cafe: { label: "Cafe", color: "bg-amber-100 text-amber-700" },
  street: { label: "Street Food", color: "bg-red-100 text-red-700" },
  bakery: { label: "Bakery", color: "bg-yellow-100 text-yellow-700" },
  bar: { label: "Bar", color: "bg-purple-100 text-purple-700" },
};

interface FoodCardProps {
  spot: FoodSpot;
}

export function FoodCard({ spot }: FoodCardProps) {
  const style = TYPE_STYLE[spot.type];

  return (
    <div className="bg-surface-card rounded-2xl border border-border p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="font-semibold text-[15px] leading-snug">{spot.name}</h4>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide", style.color)}>
              {style.label}
            </span>
            {spot.priceRange && (
              <span className="flex items-center gap-0.5 text-xs text-text-muted">
                <DollarSign className="w-3 h-3" />
                {spot.priceRange}
              </span>
            )}
          </div>
        </div>
        {spot.link && (
          <a
            href={spot.link}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-xl hover:bg-surface-muted transition-colors shrink-0"
          >
            <ExternalLink className="w-4 h-4 text-primary" />
          </a>
        )}
      </div>
      {spot.place?.formattedAddress && (
        <p className="text-xs text-text-muted mt-2">{spot.place.formattedAddress}</p>
      )}
      {spot.place?.rating != null && (
        <p className="text-xs text-amber-700 mt-0.5">Google ★ {spot.place.rating.toFixed(1)}</p>
      )}
      {spot.notes && (
        <p className="text-sm text-text-muted mt-2 leading-relaxed">{spot.notes}</p>
      )}
    </div>
  );
}
