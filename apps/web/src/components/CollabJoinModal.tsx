import { useState } from "react";

interface CollabJoinModalProps {
  open: boolean;
  tripTitle: string;
  initialName?: string;
  onSave: (name: string) => void;
}

export function CollabJoinModal({ open, tripTitle, initialName = "", onSave }: CollabJoinModalProps) {
  const [name, setName] = useState(initialName);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
      <div className="relative w-full max-w-sm bg-surface-card rounded-2xl border border-border shadow-xl p-6">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h2 className="text-lg font-bold">Join this trip</h2>
            <p className="text-sm text-text-muted mt-1">{tripTitle}</p>
          </div>
        </div>
        <p className="text-sm text-text-muted mb-4">
          Add your first name or nickname so friends know who logged each memory.
        </p>
        <label className="text-xs font-medium text-text-muted">Your name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm mb-4"
          placeholder="Alex"
        />
        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => onSave(name.trim())}
          className="w-full py-3 rounded-xl bg-primary text-white font-medium hover:bg-primary-dark disabled:opacity-50 cursor-pointer"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
