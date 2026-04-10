import type { Destination } from "@pangofold/shared";
import { cn } from "../lib/cn";
import { MapPin } from "lucide-react";

interface DestinationTabsProps {
  destinations: Destination[];
  activeIndex: number;
  onChange: (index: number) => void;
}

export function DestinationTabs({ destinations, activeIndex, onChange }: DestinationTabsProps) {
  if (destinations.length <= 1) return null;

  return (
    <div className="px-5 mb-4">
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
        {destinations.map((dest, i) => (
          <button
            key={dest.id}
            onClick={() => onChange(i)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all cursor-pointer",
              i === activeIndex
                ? "bg-primary text-white shadow-sm"
                : "bg-surface-card border border-border text-text-muted hover:border-primary/30 hover:text-text",
            )}
          >
            <MapPin className="w-3.5 h-3.5" />
            {dest.name}
          </button>
        ))}
      </div>
    </div>
  );
}
