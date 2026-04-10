import type { ItineraryItem, ItemCategory } from "@pangofold/shared";
import { cn } from "../lib/cn";
import {
  Utensils,
  Compass,
  Bus,
  BedDouble,
  MoreHorizontal,
  MapPin,
  ExternalLink,
  DollarSign,
  Clock,
  Square,
  CheckSquare,
} from "lucide-react";

const CATEGORY_CONFIG: Record<ItemCategory, { color: string; bg: string; icon: typeof Utensils }> = {
  food: { color: "text-orange-600", bg: "bg-orange-50 border-orange-200", icon: Utensils },
  activity: { color: "text-blue-600", bg: "bg-blue-50 border-blue-200", icon: Compass },
  transport: { color: "text-violet-600", bg: "bg-violet-50 border-violet-200", icon: Bus },
  accommodation: { color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", icon: BedDouble },
  other: { color: "text-slate-500", bg: "bg-slate-50 border-slate-200", icon: MoreHorizontal },
};

interface ItineraryCardProps {
  item: ItineraryItem;
  checklistMode?: boolean;
  onToggleChecked?: (id: string, checked: boolean) => void;
}

export function ItineraryCard({ item, checklistMode = false, onToggleChecked }: ItineraryCardProps) {
  const config = CATEGORY_CONFIG[item.category];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "bg-surface-card rounded-2xl border p-4 transition-all",
        item.isChecked && checklistMode ? "opacity-50 border-border" : "border-border shadow-sm",
      )}
    >
      <div className="flex gap-3">
        {checklistMode && (
          <button
            onClick={() => onToggleChecked?.(item.id, !item.isChecked)}
            className="mt-0.5 shrink-0 cursor-pointer"
          >
            {item.isChecked ? (
              <CheckSquare className="w-5 h-5 text-primary" />
            ) : (
              <Square className="w-5 h-5 text-text-muted" />
            )}
          </button>
        )}

        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border", config.bg)}>
          <Icon className={cn("w-4 h-4", config.color)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className={cn(
              "font-semibold text-[15px] leading-snug",
              item.isChecked && checklistMode && "line-through",
            )}>
              {item.title}
            </h3>
            {item.time && (
              <span className="flex items-center gap-1 text-xs text-text-muted whitespace-nowrap shrink-0 mt-0.5">
                <Clock className="w-3 h-3" />
                {item.time}
              </span>
            )}
          </div>

          {item.description && (
            <p className="text-sm text-text-muted mt-1 leading-relaxed">{item.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
            {item.location && (
              <span className="flex items-center gap-1 text-xs text-text-muted">
                <MapPin className="w-3 h-3" />
                <span className="truncate max-w-[180px]">{item.location}</span>
              </span>
            )}
            {item.cost && (
              <span className="flex items-center gap-1 text-xs text-text-muted">
                <DollarSign className="w-3 h-3" />
                {item.cost}
              </span>
            )}
            {item.link && (
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                Link
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
