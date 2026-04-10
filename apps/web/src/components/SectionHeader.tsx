import type { ReactNode } from "react";
import { cn } from "../lib/cn";

interface SectionHeaderProps {
  icon: ReactNode;
  title: string;
  count?: number;
  className?: string;
}

export function SectionHeader({ icon, title, count, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center gap-2 mb-3", className)}>
      {icon}
      <h3 className="font-semibold text-base">{title}</h3>
      {count !== undefined && (
        <span className="text-xs text-text-muted bg-surface-muted px-2 py-0.5 rounded-full">
          {count}
        </span>
      )}
    </div>
  );
}
