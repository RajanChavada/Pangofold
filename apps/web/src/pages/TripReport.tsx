import { useMemo, useState, useEffect, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toPng } from "html-to-image";
import {
  ArrowLeft,
  MapPin,
  PieChart,
  Trophy,
  Calendar,
  AlertCircle,
  Image as ImageIcon,
  Sparkles,
  Users,
} from "lucide-react";
import { useTrip } from "../hooks/useTrip";
import { useJournal } from "../hooks/useJournal";
import { useAuth } from "../hooks/useAuth";
import { buildTripReportPayload } from "../lib/trip-report";
import { supabase } from "../lib/supabase";
import type { Trip, SuperlativeId } from "@pangofold/shared";

const SUPERLATIVE_COPY: Record<
  SuperlativeId,
  { title: string; blurb: string }
> = {
  foodie: { title: "The Foodie", blurb: "Most food-tagged logs" },
  highRoller: { title: "High Roller", blurb: "Highest spend on the tab" },
  historian: { title: "The Historian", blurb: "Richest notes & photos" },
  navigator: { title: "The Navigator", blurb: "Most activity-tagged logs" },
};

function formatMoney(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function plannedPoints(trip: Trip) {
  const pts: { label: string; lat: number; lng: number }[] = [];
  for (const d of trip.destinations) {
    for (const day of d.days) {
      for (const it of day.items) {
        const p = it.place;
        if (p?.lat != null && p?.lng != null) {
          pts.push({ label: it.title, lat: p.lat, lng: p.lng });
        }
      }
    }
    for (const f of d.foodSpots) {
      const p = f.place;
      if (p?.lat != null && p?.lng != null) pts.push({ label: f.name, lat: p.lat, lng: p.lng });
    }
    for (const a of d.activities) {
      const p = a.place;
      if (p?.lat != null && p?.lng != null) pts.push({ label: a.name, lat: p.lat, lng: p.lng });
    }
  }
  return pts;
}

export function TripReport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { trip, loading, error } = useTrip(id);
  const { entries, loading: jLoading } = useJournal(id);
  const [saving, setSaving] = useState(false);
  const [canView, setCanView] = useState(false);
  const [memberChecked, setMemberChecked] = useState(false);
  const [exporting, setExporting] = useState(false);
  const shareCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!trip || !user) {
      setCanView(false);
      setMemberChecked(false);
      return;
    }
    if (trip.ownerId === user.id) {
      setCanView(true);
      setMemberChecked(true);
      return;
    }
    setMemberChecked(false);
    void supabase
      .from("trip_members")
      .select("id")
      .eq("trip_id", trip.id)
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setCanView(Boolean(data));
        setMemberChecked(true);
      });
  }, [trip, user]);

  const payload = useMemo(() => {
    if (!trip) return null;
    return buildTripReportPayload(trip, entries);
  }, [trip, entries]);

  const actualPoints = useMemo(() => {
    return entries
      .filter((e) => e.lat != null && e.lng != null)
      .map((e) => ({ label: e.title, lat: e.lat!, lng: e.lng! }));
  }, [entries]);

  const planned = trip ? plannedPoints(trip) : [];

  const handleSaveSnapshot = async () => {
    if (!trip || !payload || !user) return;
    setSaving(true);
    try {
      await supabase.from("trip_reports").insert({
        trip_id: trip.id,
        payload: payload as unknown as Record<string, unknown>,
      });
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading || jLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-red-600">{error || "Not found"}</p>
        <Link to="/dashboard" className="text-primary font-medium">
          Back to trips
        </Link>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-text-muted">Sign in to view this trip report.</p>
        <Link to="/dashboard" className="text-primary font-medium">
          Back to trips
        </Link>
      </div>
    );
  }

  if (user.id !== trip.ownerId && !memberChecked) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-text-muted">Only the owner or invited travelers can view this report.</p>
        <button type="button" onClick={() => navigate(`/trip/${trip.id}`)} className="text-primary font-medium">
          Go to trip
        </button>
      </div>
    );
  }

  if (!payload) return null;

  const handleExportPng = async () => {
    const el = shareCardRef.current;
    if (!el) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(el, { pixelRatio: 2, cacheBust: true });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `pangofold-wrapped-${trip.id.slice(0, 8)}.png`;
      a.click();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-dvh bg-surface pb-12">
      <div className="max-w-lg mx-auto px-5 pt-6">
        <button
          type="button"
          onClick={() => navigate(`/trip/${trip.id}?view=itinerary`)}
          className="flex items-center gap-2 text-text-muted hover:text-text mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to trip
        </button>

        <div
          ref={shareCardRef}
          className="rounded-3xl overflow-hidden border border-border bg-gradient-to-b from-violet-950 to-slate-950 text-white p-6 shadow-xl aspect-[9/16] max-h-[min(90vh,640px)] flex flex-col justify-between"
        >
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-violet-200/90">Pangofold Wrapped</p>
            <h1 className="text-2xl font-bold tracking-tight mt-2">{trip.title}</h1>
            {trip.startDate && trip.endDate && (
              <p className="text-sm text-violet-100/80 mt-1">
                {trip.startDate} → {trip.endDate}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-4xl font-black tabular-nums">
              {formatMoney(payload.totalSpendCents)}
            </p>
            <p className="text-sm text-violet-100/90">Total logged spend</p>
            {payload.bestRated && (
              <p className="text-sm pt-2 border-t border-white/10">
                Best moment: <strong>{payload.bestRated.title}</strong> ({payload.bestRated.rating}/5)
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleExportPng()}
          disabled={exporting}
          className="mt-4 w-full py-3 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
        >
          {exporting ? "Saving image…" : "Download story card (PNG)"}
        </button>

        <h1 className="text-2xl font-bold tracking-tight mt-10">{trip.title}</h1>
        <p className="text-sm text-text-muted mt-1">Full report</p>

        <div className="mt-6 space-y-4">
          <section className="bg-gradient-to-br from-violet-600/10 to-amber-500/10 rounded-2xl border border-border p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-violet-600" />
              <h2 className="font-semibold">Superlatives</h2>
            </div>
            <p className="text-xs text-text-muted mb-4">
              Tie-breaks: higher score wins; if tied, names are sorted A–Z (see trip-report.ts).
            </p>
            <ul className="space-y-3">
              {(Object.keys(payload.superlatives) as SuperlativeId[]).map((key) => {
                const name = payload.superlatives[key];
                const copy = SUPERLATIVE_COPY[key];
                return (
                  <li
                    key={key}
                    className="flex items-start justify-between gap-3 text-sm border-b border-border/60 pb-3 last:border-0 last:pb-0"
                  >
                    <div>
                      <p className="font-semibold text-text">{copy.title}</p>
                      <p className="text-xs text-text-muted">{copy.blurb}</p>
                    </div>
                    <span className="font-medium text-primary shrink-0">{name ?? "—"}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          {payload.perPerson.length > 0 && (
            <section className="bg-surface-card rounded-2xl border border-border p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-5 h-5 text-slate-600" />
                <h2 className="font-semibold">By traveler</h2>
              </div>
              <ul className="space-y-2 text-sm">
                {payload.perPerson.map((p) => (
                  <li key={p.name} className="flex flex-wrap justify-between gap-2 border-b border-border/40 pb-2 last:border-0">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-text-muted text-xs">
                      {formatMoney(p.attributedSpendCents)} · {p.logCount} logs · {p.photoCount} photos · {p.foodLogCount}{" "}
                      food
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {payload.settlement.length > 0 && (
            <section className="bg-surface-card rounded-2xl border border-border p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-5 h-5 text-emerald-600" />
                <h2 className="font-semibold">Who owes who</h2>
              </div>
              <p className="text-xs text-text-muted mb-3">
                Approximate settlements from equal / group splits and named payers. Add everyone as loggers for best
                results.
              </p>
              <ul className="space-y-2 text-sm">
                {payload.settlement.map((s, i) => (
                  <li key={i} className="flex justify-between gap-2 border-b border-border/40 pb-2 last:border-0">
                    <span>
                      <strong>{s.from}</strong> → <strong>{s.to}</strong>
                    </span>
                    <span className="font-medium">{formatMoney(s.amountCents)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="bg-surface-card rounded-2xl border border-border p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <PieChart className="w-5 h-5 text-primary" />
              <h2 className="font-semibold">Spend by category</h2>
            </div>
            <p className="text-2xl font-bold">{formatMoney(payload.totalSpendCents)}</p>
            <ul className="mt-3 space-y-1 text-sm">
              {(Object.entries(payload.spendByCategory) as [string, number][]).map(([k, v]) =>
                v > 0 ? (
                  <li key={k} className="flex justify-between">
                    <span className="text-text-muted capitalize">{k}</span>
                    <span>{formatMoney(v)}</span>
                  </li>
                ) : null,
              )}
            </ul>
          </section>

          <section className="bg-surface-card rounded-2xl border border-border p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-5 h-5 text-amber-600" />
              <h2 className="font-semibold">Best rated</h2>
            </div>
            {payload.bestRated ? (
              <p className="text-sm">
                <strong>{payload.bestRated.title}</strong> — {payload.bestRated.rating}/5
              </p>
            ) : (
              <p className="text-sm text-text-muted">No ratings logged yet.</p>
            )}
          </section>

          <section className="bg-surface-card rounded-2xl border border-border p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              <h2 className="font-semibold">Most expensive day</h2>
            </div>
            {payload.mostExpensiveDay ? (
              <p className="text-sm">
                {payload.mostExpensiveDay.date} — {formatMoney(payload.mostExpensiveDay.cents)}
              </p>
            ) : (
              <p className="text-sm text-text-muted">No spend logged by day.</p>
            )}
          </section>

          <section className="bg-surface-card rounded-2xl border border-border p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-5 h-5 text-orange-600" />
              <h2 className="font-semibold">Planned but not visited</h2>
            </div>
            {payload.unvisitedItems.length > 0 ? (
              <ul className="text-sm space-y-1 list-disc pl-5">
                {payload.unvisitedItems.map((u: { id: string; title: string }) => (
                  <li key={u.id}>{u.title}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-muted">
                No unvisited items detected (or trip not marked complete / still in future).
              </p>
            )}
          </section>

          <section className="bg-surface-card rounded-2xl border border-border p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <ImageIcon className="w-5 h-5 text-violet-600" />
              <h2 className="font-semibold">Highlights</h2>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {entries
                .flatMap((e) => e.photos || [])
                .slice(0, 9)
                .map((p) =>
                  p.publicUrl ? (
                    <img
                      key={p.id}
                      src={p.publicUrl}
                      alt=""
                      className="w-full aspect-square object-cover rounded-lg"
                    />
                  ) : null,
                )}
            </div>
          </section>

          <section className="bg-surface-card rounded-2xl border border-border p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-5 h-5 text-emerald-600" />
              <h2 className="font-semibold">Planned vs actual</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="font-semibold text-text-muted mb-1">Planned (enriched)</p>
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {planned.map((p, i) => (
                    <li key={`p-${i}`}>
                      <a
                        className="text-primary hover:underline"
                        href={`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {p.label}
                      </a>
                    </li>
                  ))}
                  {planned.length === 0 && <li className="text-text-muted">No place pins yet.</li>}
                </ul>
              </div>
              <div>
                <p className="font-semibold text-text-muted mb-1">Logged (GPS)</p>
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {actualPoints.map((p, i) => (
                    <li key={`a-${i}`}>
                      <a
                        className="text-primary hover:underline"
                        href={`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {p.label}
                      </a>
                    </li>
                  ))}
                  {actualPoints.length === 0 && (
                    <li className="text-text-muted">No journal entries with location.</li>
                  )}
                </ul>
              </div>
            </div>
          </section>

          {user.id === trip.ownerId && (
            <button
              type="button"
              onClick={() => void handleSaveSnapshot()}
              disabled={saving}
              className="w-full py-3 rounded-xl bg-primary/10 text-primary font-medium hover:bg-primary/20 disabled:opacity-50 cursor-pointer"
            >
              {saving ? "Saving…" : "Save snapshot to history"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
