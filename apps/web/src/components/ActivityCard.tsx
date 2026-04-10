import type { Activity } from "@pangofold/shared";
import { MapPin, ExternalLink, DollarSign } from "lucide-react";

interface ActivityCardProps {
  activity: Activity;
}

export function ActivityCard({ activity }: ActivityCardProps) {
  return (
    <div className="bg-surface-card rounded-2xl border border-border p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-semibold text-[15px] leading-snug">{activity.name}</h4>
        {activity.link && (
          <a
            href={activity.link}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-xl hover:bg-surface-muted transition-colors shrink-0"
          >
            <ExternalLink className="w-4 h-4 text-primary" />
          </a>
        )}
      </div>

      {activity.notes && (
        <p className="text-sm text-text-muted mt-1.5 leading-relaxed">{activity.notes}</p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
        {activity.location && (
          <span className="flex items-center gap-1 text-xs text-text-muted">
            <MapPin className="w-3 h-3" />
            <span className="truncate max-w-[180px]">{activity.location}</span>
          </span>
        )}
        {activity.cost && (
          <span className="flex items-center gap-1 text-xs text-text-muted">
            <DollarSign className="w-3 h-3" />
            {activity.cost}
          </span>
        )}
      </div>
    </div>
  );
}
