import { useParams } from "react-router";
import { MapPin } from "lucide-react";

export function SharedView() {
  const { slug } = useParams();

  return (
    <div className="min-h-dvh bg-surface">
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="flex items-center gap-2 text-primary mb-6">
          <MapPin className="w-5 h-5" />
          <span className="text-sm font-medium">Pangofold</span>
        </div>

        <div className="bg-surface-card rounded-card border border-border p-8 shadow-sm text-center">
          <h1 className="text-xl font-semibold mb-2">Shared Trip</h1>
          <p className="text-text-muted">
            Public view for <code className="text-xs bg-surface-muted px-2 py-1 rounded">{slug}</code>. Anyone with this link can view the trip (read-only).
          </p>
        </div>
      </div>
    </div>
  );
}
