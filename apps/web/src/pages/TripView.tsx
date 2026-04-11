import { useState, useCallback, useEffect, useMemo } from "react";
import { useParams, useMatch, useSearchParams, useNavigate } from "react-router";
import { Utensils, Compass, ListChecks, List, MapPin, Sparkles, Plus, Map as MapIcon } from "lucide-react";
import { useTrip, useScheduleConflicts } from "../hooks/useTrip";
import { useJournal } from "../hooks/useJournal";
import { useTripSpend } from "../hooks/useTripSpend";
import { useAuth } from "../hooks/useAuth";
import { getGuestName, setGuestName } from "../hooks/useGuestIdentity";
import { TripHeader } from "../components/TripHeader";
import { DestinationTabs } from "../components/DestinationTabs";
import { DayTabs } from "../components/DayTabs";
import { ItineraryCard } from "../components/ItineraryCard";
import { FoodCard } from "../components/FoodCard";
import { ActivityCard } from "../components/ActivityCard";
import { HotelCard } from "../components/HotelCard";
import { SectionHeader } from "../components/SectionHeader";
import { JournalModal } from "../components/JournalModal";
import { TripMapPanel, collectDestinationMapPoints } from "../components/TripMapPanel";
import { CollabJoinModal } from "../components/CollabJoinModal";
import { cn } from "../lib/cn";
import { MOCK_TRIP } from "../lib/mock-data";
import { supabase } from "../lib/supabase";
import { personDisplayKey } from "../lib/trip-report";

type ViewTab = "itinerary" | "food" | "activities" | "map";

async function filesToGuestPhotos(
  files: File[],
): Promise<Array<{ filename: string; base64: string }>> {
  const out: Array<{ filename: string; base64: string }> = [];
  for (const f of files) {
    const base64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const d = r.result as string;
        const i = d.indexOf(",");
        resolve(i >= 0 ? d.slice(i + 1) : d);
      };
      r.onerror = () => reject(new Error("Failed to read file"));
      r.readAsDataURL(f);
    });
    out.push({ filename: f.name || "photo.jpg", base64 });
  }
  return out;
}

export function TripView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const collabMatch = useMatch({ path: "/trip/:id/collab", end: true });
  const isCollab = Boolean(collabMatch);
  const tokenFromUrl = searchParams.get("token")?.trim() ?? "";

  const { user, loading: authLoading } = useAuth();
  const { trip: dbTrip, loading, error, toggleItemChecked, refetch, updateTripMeta } = useTrip(id);
  const { entries, createEntry, refetch: refetchJournal } = useJournal(id);

  const [isMember, setIsMember] = useState(false);

  const [destIndex, setDestIndex] = useState(0);
  const [dayIndex, setDayIndex] = useState(0);
  const [checklistMode, setChecklistMode] = useState(false);
  const [viewTab, setViewTab] = useState<ViewTab>("itinerary");
  const [journalOpen, setJournalOpen] = useState(false);
  const [journalItemId, setJournalItemId] = useState<string | null>(null);
  const [journalDefaultTitle, setJournalDefaultTitle] = useState("");
  const [enriching, setEnriching] = useState(false);
  const [enrichMessage, setEnrichMessage] = useState<string | null>(null);

  const [gate, setGate] = useState<"checking" | "bad" | "ok">(() => (isCollab ? "checking" : "ok"));
  const [guestOverride, setGuestOverride] = useState<string | null>(null);

  const [collabVerifyError, setCollabVerifyError] = useState<string | null>(null);
  const [journalActionError, setJournalActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id || !dbTrip?.id) {
      setIsMember(false);
      return;
    }
    if (dbTrip.ownerId === user.id) {
      setIsMember(false);
      return;
    }
    void supabase
      .from("trip_members")
      .select("id")
      .eq("trip_id", dbTrip.id)
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setIsMember(Boolean(data)));
  }, [user?.id, dbTrip?.id, dbTrip?.ownerId]);

  useEffect(() => {
    if (!isCollab) {
      setGate("ok");
      setCollabVerifyError(null);
      return;
    }
    if (!id) return;
    if (!tokenFromUrl) {
      setGate("bad");
      setCollabVerifyError("Add ?token=… from the link your friend shared (Trip → Edit → Friend logging link).");
      return;
    }
    setGate("checking");
    setCollabVerifyError(null);
    void supabase
      .rpc("verify_trip_collab_token", { p_trip_id: id, p_token: tokenFromUrl })
      .then(({ data, error: rpcErr }) => {
        if (rpcErr) {
          setGate("bad");
          setCollabVerifyError(
            rpcErr.message ||
              "Could not verify the link. Apply migration 004 to your Supabase project (function verify_trip_collab_token).",
          );
          return;
        }
        setGate(data ? "ok" : "bad");
        if (!data) {
          setCollabVerifyError(
            "Token doesn’t match this trip, or friend logging is turned off. Ask the owner to re-copy the link from Trip → Edit.",
          );
        }
      });
  }, [isCollab, id, tokenFromUrl]);

  const storedGuestName = id ? getGuestName(id) : null;
  const guestName = guestOverride ?? storedGuestName;
  const showJoinModal = isCollab && gate === "ok" && !guestName;

  const useMock = !isCollab && !dbTrip && !loading;
  const trip = dbTrip || (useMock ? MOCK_TRIP : null);
  const destForHooks = trip?.destinations[destIndex];
  const mapPinCount = useMemo(
    () => (destForHooks ? collectDestinationMapPoints(destForHooks).length : 0),
    [destForHooks],
  );
  const dayForHooks = destForHooks?.days[dayIndex];
  const conflicts = useScheduleConflicts(destForHooks, dayForHooks);
  const { tripTotalCents, dayTotalCents } = useTripSpend(entries, dayForHooks?.date);

  useEffect(() => {
    if (!dbTrip || loading || isCollab || authLoading) return;
    if (dbTrip.phase !== "completed") return;
    if (!user?.id) return;
    const allowed = dbTrip.ownerId === user.id || isMember;
    if (!allowed) return;
    if (searchParams.get("view") === "itinerary") return;
    navigate(`/trip/${dbTrip.id}/report`, { replace: true });
  }, [dbTrip, loading, isCollab, authLoading, user?.id, isMember, navigate, searchParams]);

  const openLog = useCallback((itemId: string | null, defaultTitle: string) => {
    setJournalItemId(itemId);
    setJournalDefaultTitle(defaultTitle);
    setJournalOpen(true);
  }, []);

  const rosterNames = useMemo(() => {
    const s = new Set<string>();
    for (const e of entries) {
      s.add(personDisplayKey(e));
    }
    if (user?.email) s.add(user.email.split("@")[0] ?? "");
    if (guestName) s.add(guestName);
    return [...s].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [entries, user?.email, guestName]);

  const capturedByLabel = isCollab
    ? guestName || "—"
    : user?.email?.split("@")[0] || user?.email || "Signed in";

  const handleEnrich = useCallback(async () => {
    if (!dbTrip || useMock) return;
    setEnrichMessage(null);
    setEnriching(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        setEnrichMessage("Sign in required to enrich.");
        return;
      }
      const { data, error: fnErr } = await supabase.functions.invoke("enrich-places", {
        body: { tripId: dbTrip.id, userId: session.user.id },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (fnErr) {
        setEnrichMessage(fnErr.message ?? "Enrich failed. Check the function logs.");
        return;
      }
      await refetch();
      const d =
        data && typeof data === "object"
          ? (data as { enriched?: unknown; alreadyLinked?: unknown; lookupFailed?: unknown })
          : null;
      const n = Number(d?.enriched);
      const already = Number(d?.alreadyLinked);
      const failed = Number(d?.lookupFailed);

      if (Number.isFinite(n) && n > 0) {
        setEnrichMessage(`Linked ${n} new place${n === 1 ? "" : "s"} from Google.`);
      } else if (Number.isFinite(failed) && failed > 0) {
        setEnrichMessage(
          `Google had no confident match for ${failed} stop${failed === 1 ? "" : "s"}. Add a specific address or venue name in your doc, then re-import or edit items.`,
        );
      } else if (Number.isFinite(already) && already > 0 && failed === 0) {
        setEnrichMessage("Every stop already has a place link — nothing new to add.");
      } else {
        setEnrichMessage("Enrichment finished — no items needed linking.");
      }
    } finally {
      setEnriching(false);
    }
  }, [dbTrip, useMock, refetch]);

  const handleFinishTrip = useCallback(async () => {
    if (!id) return;
    await updateTripMeta({ phase: "completed" });
    navigate(`/trip/${id}/report`);
  }, [id, navigate, updateTripMeta]);

  const handleReopenTrip = useCallback(async () => {
    if (!id) return;
    await updateTripMeta({ phase: "active" });
  }, [id, updateTripMeta]);

  const handleStartTrip = useCallback(async () => {
    if (!id) return;
    await updateTripMeta({ phase: "active" });
  }, [id, updateTripMeta]);

  const leaderboard = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) {
      const k = personDisplayKey(e);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [entries]);

  if (loading || (isCollab && gate === "checking")) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isCollab && gate === "bad") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4 gap-3 max-w-md mx-auto">
        <p className="text-red-600 text-center font-medium">This collaboration link isn’t valid.</p>
        {collabVerifyError && (
          <p className="text-sm text-text-muted text-center">{collabVerifyError}</p>
        )}
        <p className="text-sm text-text-muted text-center">
          The logging URL looks like{" "}
          <code className="text-xs bg-surface-muted px-1 rounded">/trip/TRIP_ID/collab?token=…</code> — not the public
          read-only <code className="text-xs bg-surface-muted px-1 rounded">/s/slug</code> page.
        </p>
      </div>
    );
  }

  if (error && !trip && !isCollab) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-600 mb-2">{error}</p>
          <p className="text-text-muted text-sm">Using demo data instead.</p>
        </div>
      </div>
    );
  }

  if (isCollab && error && !trip) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-4">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!trip) return null;

  const isOwner = Boolean(user?.id && trip.ownerId === user.id);
  const showFinishTripCta =
    !useMock && !isCollab && isOwner && trip.phase !== "completed" && !authLoading;
  const showReopenTripCta =
    !useMock && !isCollab && isOwner && trip.phase === "completed" && !authLoading;

  const dest = trip.destinations[destIndex];
  const day = dest?.days[dayIndex];
  const conflictIds = new Set<string>();
  for (const c of conflicts) {
    conflictIds.add(c.a.id);
    conflictIds.add(c.b.id);
  }

  const handleDestChange = (i: number) => {
    setDestIndex(i);
    setDayIndex(0);
  };

  const VIEW_TABS: { key: ViewTab; label: string; icon: typeof Utensils; count: number }[] = [
    { key: "itinerary", label: "Itinerary", icon: ListChecks, count: day?.items.length ?? 0 },
    { key: "food", label: "Food", icon: Utensils, count: dest?.foodSpots.length ?? 0 },
    { key: "activities", label: "Activities", icon: Compass, count: dest?.activities.length ?? 0 },
    { key: "map", label: "Map", icon: MapIcon, count: mapPinCount },
  ];

  const split = trip.defaultSplitCount ?? 1;
  const canJournal = !isCollab || Boolean(guestName && tokenFromUrl);
  const readOnlyTrip = isCollab;
  const dbPhase = trip.phase ?? "planning";
  /** Logged journal totals: show for owner, invited members, and verified guest links — not only in "active" phase. */
  const canSeeTripSpendTotals =
    !useMock &&
    (isOwner ||
      isMember ||
      (isCollab && gate === "ok"));
  const showTripSpendStrip = canSeeTripSpendTotals;
  const showJournalFab =
    !useMock && !isCollab && dbPhase === "active" && canJournal && !readOnlyTrip;

  return (
    <div className="min-h-dvh bg-surface pb-8">
      <CollabJoinModal
        open={showJoinModal}
        tripTitle={trip.title}
        onSave={(name) => {
          if (id) setGuestName(id, name);
          setGuestOverride(name);
        }}
      />

      <JournalModal
        key={`${journalItemId ?? "new"}-${isCollab ? "g" : "m"}`}
        open={journalOpen}
        onClose={() => setJournalOpen(false)}
        title={journalItemId ? "Log this stop" : "Log something new"}
        defaultTitle={journalDefaultTitle}
        defaultSplitCount={split}
        capturedByLabel={capturedByLabel}
        rosterNames={rosterNames}
        onSubmit={async (data) => {
          setJournalActionError(null);
          try {
            if (isCollab && id && tokenFromUrl && guestName) {
              const photos = await filesToGuestPhotos(data.files);
              const { error: fnErr } = await supabase.functions.invoke("guest-journal-submit", {
                body: {
                  tripId: id,
                  collaborateToken: tokenFromUrl,
                  loggedByName: guestName,
                  title: data.title,
                  note: data.note,
                  rating: data.rating,
                  amountCents: data.amountCents,
                  currency: "USD",
                  category: data.category,
                  splitBetween: data.splitBetween,
                  splitMode: data.splitMode,
                  paidByName: data.paidByName,
                  itineraryItemId: journalItemId,
                  photos,
                },
              });
              if (fnErr) throw new Error(fnErr.message);
              await refetchJournal();
              return;
            }
            await createEntry({
              itineraryItemId: journalItemId,
              title: data.title,
              note: data.note,
              rating: data.rating,
              amountCents: data.amountCents,
              category: data.category ?? undefined,
              splitBetween: data.splitBetween,
              splitMode: data.splitMode,
              paidByName: data.paidByName,
              files: data.files,
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Could not save log";
            setJournalActionError(msg);
            throw err;
          }
        }}
      />

      <div className="max-w-lg mx-auto">
        <TripHeader
          trip={trip}
          editable={!useMock && !isCollab}
          showPhaseBanner={!useMock && !isCollab}
          onFinishTrip={showFinishTripCta ? () => void handleFinishTrip() : undefined}
          onReopenTrip={showReopenTripCta ? () => void handleReopenTrip() : undefined}
          onStartTrip={
            !useMock && !isCollab && isOwner && (trip.phase ?? "planning") === "planning"
              ? () => void handleStartTrip()
              : undefined
          }
        />

        {showTripSpendStrip && (
          <div className="px-5 mb-3 sticky top-0 z-30 bg-surface/95 backdrop-blur border-b border-border py-3 -mx-0">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Trip spend (logged)</p>
            <p className="text-[11px] text-text-muted mb-1">
              Total from journal entries — everyone on this trip sees the same number.
            </p>
            <p className="text-lg font-bold text-text mt-0.5">
              {(tripTotalCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}{" "}
              <span className="text-sm font-normal text-text-muted">
                trip total
                {day?.date && (
                  <>
                    {" "}
                    · This day{" "}
                    {(dayTotalCents / 100).toLocaleString("en-US", {
                      style: "currency",
                      currency: "USD",
                    })}
                  </>
                )}
              </span>
            </p>
          </div>
        )}

        {!useMock && !isCollab && !authLoading && !user && (
          <div className="px-5 mb-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-sm py-3">
            <strong>Sign in</strong> with the account that owns this trip to edit items, finish the trip, and open the
            full report.
          </div>
        )}

        {!useMock && !isCollab && (
          <div className="px-5 mb-3 flex flex-wrap gap-2">
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void handleEnrich()}
                disabled={enriching}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 disabled:opacity-50 cursor-pointer w-fit"
              >
                <Sparkles className="w-4 h-4" />
                {enriching ? "Enriching places…" : "Enrich places (Google)"}
              </button>
              {enrichMessage && (
                <p
                  className={`text-sm ${
                    enrichMessage.startsWith("Linked") || enrichMessage.endsWith("finished.")
                      ? "text-emerald-700"
                      : enrichMessage.includes("No new places")
                        ? "text-text-muted"
                        : "text-amber-800"
                  }`}
                >
                  {enrichMessage}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => openLog(null, "New memory")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-surface-muted cursor-pointer"
            >
              <MapPin className="w-4 h-4" />
              Log something new
            </button>
          </div>
        )}

        {journalActionError && (
          <div className="px-5 mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl py-2 px-3">
            {journalActionError}
          </div>
        )}

        {isCollab && gate === "ok" && (
          <div className="px-5 mb-3">
            <p className="text-xs text-text-muted mb-2 rounded-xl bg-primary/5 border border-primary/10 px-3 py-2">
              You’re logging as <strong>{guestName ?? "…"}</strong> — memories save to this trip for everyone on the
              link.
            </p>
            <button
              type="button"
              disabled={!canJournal}
              onClick={() => openLog(null, "New memory")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-surface-muted cursor-pointer disabled:opacity-50"
            >
              <MapPin className="w-4 h-4" />
              Log something new
            </button>
          </div>
        )}

        <DestinationTabs
          destinations={trip.destinations}
          activeIndex={destIndex}
          onChange={handleDestChange}
        />

        {dest?.hotel && (
          <div className="px-5 mb-4">
            <HotelCard
              name={dest.hotel.name}
              address={dest.hotel.address}
              link={dest.hotel.link}
            />
          </div>
        )}

        <div className="px-5 mb-4">
          <div className="flex gap-1 bg-surface-muted rounded-2xl p-1">
            {VIEW_TABS.map(({ key, label, icon: TabIcon, count }) => (
              <button
                key={key}
                onClick={() => setViewTab(key)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer",
                  viewTab === key
                    ? "bg-surface-card text-text shadow-sm"
                    : "text-text-muted hover:text-text",
                )}
              >
                <TabIcon className="w-3.5 h-3.5" />
                {label}
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full",
                    viewTab === key ? "bg-primary/10 text-primary" : "bg-surface-muted",
                  )}
                >
                  {count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {viewTab === "itinerary" && (
          <>
            <DayTabs
              days={dest?.days ?? []}
              activeIndex={dayIndex}
              onChange={setDayIndex}
            />

            <div className="px-5 mb-3 flex items-center justify-between">
              <p className="text-sm text-text-muted">
                {day?.items.length ?? 0} items
                {day?.date &&
                  ` · ${new Date(day.date + "T00:00:00").toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}`}
              </p>
              <button
                onClick={() => setChecklistMode(!checklistMode)}
                className={cn(
                  "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-all cursor-pointer",
                  checklistMode
                    ? "bg-primary text-white"
                    : "bg-surface-card border border-border text-text-muted hover:text-text",
                )}
              >
                {checklistMode ? <ListChecks className="w-3.5 h-3.5" /> : <List className="w-3.5 h-3.5" />}
                {checklistMode ? "Checklist On" : "Checklist"}
              </button>
            </div>

            <div className="px-5 space-y-3">
              {day?.items.map((item) => (
                <ItineraryCard
                  key={item.id}
                  item={item}
                  checklistMode={checklistMode}
                  onToggleChecked={useMock || readOnlyTrip ? undefined : toggleItemChecked}
                  onLogThis={
                    useMock || !canJournal ? undefined : (itemId) => openLog(itemId, item.title)
                  }
                  scheduleConflict={conflictIds.has(item.id)}
                />
              ))}
              {(!day || day.items.length === 0) && (
                <div className="text-center py-12 text-text-muted text-sm">
                  No items for this day yet.
                </div>
              )}
            </div>
          </>
        )}

        {viewTab === "food" && (
          <div className="px-5">
            <SectionHeader
              icon={<Utensils className="w-4 h-4 text-orange-600" />}
              title="Food Spots"
              count={dest?.foodSpots.length}
            />
            <div className="space-y-3">
              {dest?.foodSpots.map((spot) => (
                <FoodCard key={spot.id} spot={spot} />
              ))}
              {(!dest || dest.foodSpots.length === 0) && (
                <div className="text-center py-12 text-text-muted text-sm">
                  No food spots added yet.
                </div>
              )}
            </div>
          </div>
        )}

        {viewTab === "activities" && (
          <div className="px-5">
            <SectionHeader
              icon={<Compass className="w-4 h-4 text-blue-600" />}
              title="Activities"
              count={dest?.activities.length}
            />
            <div className="space-y-3">
              {dest?.activities.map((activity) => (
                <ActivityCard key={activity.id} activity={activity} />
              ))}
              {(!dest || dest.activities.length === 0) && (
                <div className="text-center py-12 text-text-muted text-sm">
                  No activities added yet.
                </div>
              )}
            </div>
          </div>
        )}

        {viewTab === "map" && dest && (
          <div className="px-5 space-y-3">
            <p className="text-xs text-text-muted">
              Pins for this destination come from enriched places (lat/lng). Use{" "}
              <strong className="text-text">Enrich places (Google)</strong> above if the map is empty.
            </p>
            <TripMapPanel dest={dest} />
          </div>
        )}

        {!useMock && leaderboard.length > 0 && (
          <div className="px-5 mt-6">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Who’s logging</p>
            <div className="flex flex-wrap gap-2">
              {leaderboard.slice(0, 6).map(([name, count]) => (
                <span
                  key={name}
                  className="text-xs px-2.5 py-1 rounded-full bg-surface-muted border border-border"
                >
                  {name} · {count}
                </span>
              ))}
            </div>
          </div>
        )}

        {showJournalFab && (
          <button
            type="button"
            onClick={() => openLog(null, "New memory")}
            className="fixed bottom-6 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg hover:bg-primary/90 cursor-pointer"
            aria-label="Log something new"
          >
            <Plus className="w-7 h-7" />
          </button>
        )}

        {!useMock && entries.length > 0 && (
          <div className="px-5 mt-8">
            <SectionHeader
              icon={<List className="w-4 h-4 text-teal-600" />}
              title="Trip journal"
              count={entries.length}
            />
            <div className="space-y-3 mt-3">
              {entries.slice(0, 8).map((e) => (
                <div key={e.id} className="bg-surface-card rounded-2xl border border-border p-4 text-sm">
                  <div className="font-semibold">{e.title}</div>
                  <p className="text-[11px] text-text-muted mt-0.5">{personDisplayKey(e)}</p>
                  {e.note && <p className="text-text-muted mt-1">{e.note}</p>}
                  <div className="flex flex-wrap gap-2 mt-2 text-xs text-text-muted">
                    {e.rating != null && <span>{e.rating}/5</span>}
                    {e.amountCents != null && (
                      <span>
                        {(e.amountCents / 100).toLocaleString("en-US", {
                          style: "currency",
                          currency: e.currency,
                        })}
                      </span>
                    )}
                    {e.category && <span className="capitalize">{e.category}</span>}
                  </div>
                  {e.photos && e.photos.length > 0 && (
                    <div className="flex gap-2 mt-2 overflow-x-auto">
                      {e.photos.map((p: { id: string; publicUrl?: string | null }) =>
                        p.publicUrl ? (
                          <img
                            key={p.id}
                            src={p.publicUrl}
                            alt=""
                            className="h-16 w-16 rounded-lg object-cover shrink-0"
                          />
                        ) : null,
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
