import { motion } from "framer-motion";
import { X, Wallet, ClipboardList, Utensils, Compass, MapPinned } from "lucide-react";
import { cn } from "../lib/cn";

export type TripLogAction =
  | "journal"
  | "checkin_full"
  | "checkin_food"
  | "checkin_activity"
  | "checkin_plan";

interface TripLogActionsSheetProps {
  open: boolean;
  onClose: () => void;
  onSelect: (action: TripLogAction) => void;
}

const ROWS: { action: TripLogAction; icon: typeof Wallet; title: string; subtitle: string }[] = [
  {
    action: "journal",
    icon: Wallet,
    title: "Expense or memory",
    subtitle: "Photos, amounts, split — saved to the trip journal",
  },
  {
    action: "checkin_full",
    icon: ClipboardList,
    title: "Full day check-in",
    subtitle: "Mood, steps, food, funniest moment…",
  },
  {
    action: "checkin_food",
    icon: Utensils,
    title: "Food highlight",
    subtitle: "Best bite — optionally tie it to the itinerary",
  },
  {
    action: "checkin_activity",
    icon: Compass,
    title: "Activity moment",
    subtitle: "What you did — hike, show, wander…",
  },
  {
    action: "checkin_plan",
    icon: MapPinned,
    title: "On the itinerary",
    subtitle: "Connect your note to a planned stop",
  },
];

export function TripLogActionsSheet({ open, onClose, onSelect }: TripLogActionsSheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 38 }}
        className="absolute bottom-0 left-0 right-0 max-h-[85dvh] rounded-t-3xl bg-surface-card border border-border shadow-xl flex flex-col"
      >
        <div className="px-5 pt-4 pb-3 border-b border-border flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-border mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-text">Log something</h2>
              <p className="text-xs text-text-muted mt-0.5">Choose what you want to capture</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-surface-muted flex items-center justify-center text-text-muted hover:text-text transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-3 py-2 pb-10 space-y-1">
          {ROWS.map(({ action, icon: Icon, title, subtitle }) => (
            <button
              key={action}
              type="button"
              onClick={() => {
                onSelect(action);
                onClose();
              }}
              className={cn(
                "w-full flex items-start gap-3 rounded-2xl px-4 py-3.5 text-left",
                "hover:bg-surface-muted/80 transition-colors cursor-pointer",
              )}
            >
              <div className="mt-0.5 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text">{title}</p>
                <p className="text-xs text-text-muted mt-0.5 leading-snug">{subtitle}</p>
              </div>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
