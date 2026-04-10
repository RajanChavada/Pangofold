import type { DayItinerary } from "@pangofold/shared";
import { cn } from "../lib/cn";

interface DayTabsProps {
  days: DayItinerary[];
  activeIndex: number;
  onChange: (index: number) => void;
}

function formatDayDate(date?: string): string {
  if (!date) return "";
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function DayTabs({ days, activeIndex, onChange }: DayTabsProps) {
  if (days.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none px-5 pb-3">
      {days.map((day, i) => (
        <button
          key={day.id}
          onClick={() => onChange(i)}
          className={cn(
            "flex flex-col items-center min-w-[4.5rem] px-3 py-2.5 rounded-2xl text-center transition-all cursor-pointer",
            i === activeIndex
              ? "bg-primary text-white shadow-sm"
              : "bg-surface-card border border-border hover:border-primary/30",
          )}
        >
          <span className={cn(
            "text-xs font-medium",
            i === activeIndex ? "text-white/80" : "text-text-muted",
          )}>
            Day
          </span>
          <span className="text-lg font-bold leading-tight">{day.dayNumber}</span>
          {day.date && (
            <span className={cn(
              "text-[10px] mt-0.5",
              i === activeIndex ? "text-white/70" : "text-text-muted",
            )}>
              {formatDayDate(day.date)}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
