import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import {
  MapPin,
  Plus,
  Calendar,
  ExternalLink,
  Share2,
  ArrowRight,
  Plane,
  Trash2,
} from "lucide-react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { TripShareDropdown } from "../components/TripShareDropdown";
import { cn } from "../lib/cn";

interface TripSummary {
  id: string;
  title: string;
  cover_image_url: string | null;
  start_date: string | null;
  end_date: string | null;
  share_slug: string;
  source_doc_url: string | null;
  created_at: string;
  destination_count: number;
}

export function Dashboard() {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [shareMenu, setShareMenu] = useState<{ tripId: string; from: "header" | "row" } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    if (!user) return;

    (async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("id, title, cover_image_url, start_date, end_date, share_slug, source_doc_url, created_at, destinations(id)")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setTrips(
          data.map((row) => {
            const t = row as TripSummary & { destinations?: unknown[] };
            return {
              id: t.id,
              title: t.title,
              cover_image_url: t.cover_image_url,
              start_date: t.start_date,
              end_date: t.end_date,
              share_slug: t.share_slug,
              source_doc_url: t.source_doc_url,
              created_at: t.created_at,
              destination_count: Array.isArray(t.destinations) ? t.destinations.length : 0,
            };
          })
        );
      }
      setLoading(false);
    })();
  }, [user]);

  const toggleShareMenu = (tripId: string, from: "header" | "row") => {
    setShareMenu((prev) =>
      prev?.tripId === tripId && prev.from === from ? null : { tripId, from },
    );
  };

  const deleteTrip = async (id: string) => {
    setDeletingId(id);
    const { error } = await supabase.from("trips").delete().eq("id", id);
    if (!error) {
      setTrips((prev) => prev.filter((t) => t.id !== id));
      setDeleteTarget(null);
    }
    setDeletingId(null);
  };

  if (authLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    navigate("/");
    return null;
  }

  return (
    <div className="min-h-dvh bg-surface">
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this trip?"
        description={
          deleteTarget
            ? `“${deleteTarget.title}” and all of its destinations, days, and items will be permanently removed. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete trip"
        cancelLabel="Keep trip"
        variant="danger"
        loading={deleteTarget !== null && deletingId === deleteTarget.id}
        onCancel={() => {
          if (!deletingId) setDeleteTarget(null);
        }}
        onConfirm={() => {
          if (deleteTarget) void deleteTrip(deleteTarget.id);
        }}
      />
      <div className="max-w-2xl mx-auto px-5 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <MapPin className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">My Trips</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="flex items-center gap-2 bg-primary text-white font-medium py-2 px-4 rounded-xl hover:bg-primary-dark transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              New Trip
            </Link>
            <button
              onClick={signOut}
              className="text-sm text-text-muted hover:text-text transition-colors cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : trips.length === 0 ? (
          <div className="text-center py-20">
            <Plane className="w-12 h-12 mx-auto mb-4 text-text-muted/40" />
            <p className="text-text-muted mb-4">No trips yet. Parse your first Google Doc!</p>
            <Link
              to="/"
              className="inline-flex items-center gap-2 bg-primary text-white font-medium py-3 px-6 rounded-xl hover:bg-primary-dark transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create your first trip
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {trips.map((trip) => (
              <div
                key={trip.id}
                className="bg-surface-card rounded-card border border-border p-5 shadow-sm hover:shadow-md transition-shadow relative"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/trip/${trip.id}`}
                      className="text-lg font-semibold hover:text-primary transition-colors inline-flex items-center gap-2"
                    >
                      {trip.title}
                      <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100" />
                    </Link>

                    <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-text-muted">
                      {trip.start_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(trip.start_date + "T00:00:00").toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                          {trip.end_date &&
                            ` – ${new Date(trip.end_date + "T00:00:00").toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}`}
                        </span>
                      )}
                      <span>{trip.destination_count} destination{trip.destination_count !== 1 ? "s" : ""}</span>
                      <span>
                        Created{" "}
                        {new Date(trip.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {trip.source_doc_url && (
                      <a
                        href={trip.source_doc_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg hover:bg-surface-muted transition-colors text-text-muted hover:text-text"
                        title="Open source doc"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => toggleShareMenu(trip.id, "header")}
                        className={cn(
                          "p-2 rounded-lg transition-colors cursor-pointer",
                          shareMenu?.tripId === trip.id && shareMenu.from === "header"
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-surface-muted text-text-muted hover:text-primary",
                        )}
                        title="Share trip"
                        aria-expanded={shareMenu?.tripId === trip.id && shareMenu.from === "header"}
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                      {shareMenu?.tripId === trip.id && shareMenu.from === "header" && (
                        <TripShareDropdown
                          tripId={trip.id}
                          shareSlug={trip.share_slug}
                          onClose={() => setShareMenu(null)}
                          className="absolute right-0 top-full z-50 mt-2 w-[min(calc(100vw-2.5rem),22rem)]"
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex gap-2">
                    <Link
                      to={`/trip/${trip.id}`}
                      className="flex-1 text-center py-2 px-4 rounded-xl bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
                    >
                      View
                    </Link>
                    <Link
                      to={`/trip/${trip.id}/edit`}
                      className="flex-1 text-center py-2 px-4 rounded-xl bg-surface-muted text-text-muted text-sm font-medium hover:bg-surface-muted/80 hover:text-text transition-colors"
                    >
                      Edit
                    </Link>
                    <div className="relative flex-1">
                      <button
                        type="button"
                        onClick={() => toggleShareMenu(trip.id, "row")}
                        className={cn(
                          "w-full flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl text-sm font-medium transition-colors cursor-pointer",
                          shareMenu?.tripId === trip.id && shareMenu.from === "row"
                            ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                            : "bg-surface-muted text-text-muted hover:bg-surface-muted/80 hover:text-text",
                        )}
                        aria-expanded={shareMenu?.tripId === trip.id && shareMenu.from === "row"}
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        Share
                      </button>
                      {shareMenu?.tripId === trip.id && shareMenu.from === "row" && (
                        <TripShareDropdown
                          tripId={trip.id}
                          shareSlug={trip.share_slug}
                          onClose={() => setShareMenu(null)}
                          className="absolute right-0 top-full z-50 mt-2 w-[min(calc(100vw-2.5rem),22rem)]"
                        />
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget({ id: trip.id, title: trip.title })}
                    disabled={deletingId === trip.id}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete trip
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
