import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Eye, Copy, Check, Users, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { cn } from "../lib/cn";

type Copied = "view" | "collab" | null;

interface TripShareDropdownProps {
  tripId: string;
  shareSlug: string;
  /** Close when clicking outside */
  onClose: () => void;
  className?: string;
}

export function TripShareDropdown({ tripId, shareSlug, onClose, className }: TripShareDropdownProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [collabEnabled, setCollabEnabled] = useState(false);
  const [collabToken, setCollabToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<Copied>(null);

  useEffect(() => {
    void supabase.rpc("trip_collab_settings_for_owner", { p_trip_id: tripId }).then(({ data, error }) => {
      if (!error && data?.length) {
        const row = data[0] as { collaboration_enabled: boolean; collaborate_token: string | null };
        setCollabEnabled(row.collaboration_enabled);
        setCollabToken(row.collaborate_token);
      }
      setLoading(false);
    });
  }, [tripId]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const viewUrl = `${origin}/s/${shareSlug}`;
  const collabUrl =
    collabEnabled && collabToken ? `${origin}/trip/${tripId}/collab?token=${collabToken}` : null;

  const copy = async (kind: "view" | "collab", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      ref={rootRef}
      className={cn(
        "rounded-2xl border border-border bg-surface-card shadow-xl p-3 space-y-2 text-left",
        className,
      )}
      role="dialog"
      aria-label="Share trip"
    >
      <p className="text-xs font-semibold text-text-muted uppercase tracking-wide px-1">Share this trip</p>

      {/* View only */}
      <div className="rounded-xl border border-border bg-surface-muted/50 p-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600">
            <Eye className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text">View only</p>
            <p className="text-xs text-text-muted mt-0.5 leading-snug">
              Read-only itinerary — great for friends who should not edit or log.
            </p>
            <p className="text-[11px] font-mono text-text-muted/80 truncate mt-2" title={viewUrl}>
              {viewUrl}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void copy("view", viewUrl)}
            className="shrink-0 flex items-center gap-1 rounded-lg border border-border bg-surface-card px-2.5 py-1.5 text-xs font-medium text-text hover:bg-surface-muted transition-colors cursor-pointer"
          >
            {copied === "view" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied === "view" ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* Collaborate / guest link */}
      <div className="rounded-xl border border-border bg-surface-muted/50 p-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Users className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text">Collaborate</p>
            <p className="text-xs text-text-muted mt-0.5 leading-snug">
              Guests can pick their profile and add journal entries — no Pangofold account required.
            </p>
            {loading ? (
              <div className="flex items-center gap-2 mt-2 text-xs text-text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading link…
              </div>
            ) : collabUrl ? (
              <p className="text-[11px] font-mono text-text-muted/80 truncate mt-2" title={collabUrl}>
                {collabUrl}
              </p>
            ) : (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5 mt-2">
                Turn on <strong>Allow friends to log via link</strong> in Trip → Edit, then copy this link here.
              </p>
            )}
          </div>
          <button
            type="button"
            disabled={!collabUrl || loading}
            onClick={() => collabUrl && void copy("collab", collabUrl)}
            className="shrink-0 flex items-center gap-1 rounded-lg border border-border bg-surface-card px-2.5 py-1.5 text-xs font-medium text-text hover:bg-surface-muted transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {copied === "collab" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied === "collab" ? "Copied" : "Copy"}
          </button>
        </div>
        {!loading && !collabUrl && (
          <Link
            to={`/trip/${tripId}/edit`}
            className="mt-2 block text-center text-xs font-medium text-primary hover:underline"
            onClick={onClose}
          >
            Open trip settings
          </Link>
        )}
      </div>
    </div>
  );
}
