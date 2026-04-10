import { useState, useCallback } from "react";
import { useParams } from "react-router";
import { Utensils, Compass, ListChecks, List, MapPin, Sparkles } from "lucide-react";
import { useTrip, useScheduleConflicts } from "../hooks/useTrip";
import { useJournal } from "../hooks/useJournal";
import { TripHeader } from "../components/TripHeader";
import { DestinationTabs } from "../components/DestinationTabs";
import { DayTabs } from "../components/DayTabs";
import { ItineraryCard } from "../components/ItineraryCard";
import { FoodCard } from "../components/FoodCard";
import { ActivityCard } from "../components/ActivityCard";
import { HotelCard } from "../components/HotelCard";
import { SectionHeader } from "../components/SectionHeader";
import { PhaseBanner } from "../components/PhaseBanner";
import { JournalModal } from "../components/JournalModal";
import { cn } from "../lib/cn";
import { MOCK_TRIP } from "../lib/mock-data";
import { supabase } from "../lib/supabase";

type ViewTab = "itinerary" | "food" | "activities";

export function TripView() {
  const { id } = useParams();
  const { trip: dbTrip, loading, error, toggleItemChecked, refetch } = useTrip(id);
  const { entries, createEntry } = useJournal(id);

  const [destIndex, setDestIndex] = useState(0);
  const [dayIndex, setDayIndex] = useState(0);
  const [checklistMode, setChecklistMode] = useState(false);
  const [viewTab, setViewTab] = useState<ViewTab>("itinerary");
  const [journalOpen, setJournalOpen] = useState(false);
  const [journalItemId, setJournalItemId] = useState<string | null>(null);
  const [journalDefaultTitle, setJournalDefaultTitle] = useState("");
  const [enriching, setEnriching] = useState(false);

  const useMock = !dbTrip && !loading;
  const trip = dbTrip || (useMock ? MOCK_TRIP : null);
  const destForHooks = trip?.destinations[destIndex];
  const dayForHooks = destForHooks?.days[dayIndex];
  const conflicts = useScheduleConflicts(destForHooks, dayForHooks);

  const openLog = useCallback((itemId: string | null, defaultTitle: string) => {
    setJournalItemId(itemId);
    setJournalDefaultTitle(defaultTitle);
    setJournalOpen(true);
  }, []);

  const handleEnrich = useCallback(async () => {
    if (!dbTrip || useMock) return;
    setEnriching(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;
      const { error: fnErr } = await supabase.functions.invoke("enrich-places", {
        body: { tripId: dbTrip.id, userId: session.user.id },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!fnErr) await refetch();
    } finally {
      setEnriching(false);
    }
  }, [dbTrip, useMock, refetch]);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !trip) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-600 mb-2">{error}</p>
          <p className="text-text-muted text-sm">Using demo data instead.</p>
        </div>
      </div>
    );
  }

  if (!trip) return null;

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
  ];

  const split = trip.defaultSplitCount ?? 1;

  return (
    <div className="min-h-dvh bg-surface pb-8">
      <JournalModal
        key={journalItemId ?? "new"}
        open={journalOpen}
        onClose={() => setJournalOpen(false)}
        title={journalItemId ? "Log this stop" : "Log something new"}
        defaultTitle={journalDefaultTitle}
        defaultSplitCount={split}
        onSubmit={async (data) => {
          await createEntry({
            itineraryItemId: journalItemId,
            title: data.title,
            note: data.note,
            rating: data.rating,
            amountCents: data.amountCents,
            category: data.category ?? undefined,
            splitBetween: data.splitBetween,
            files: data.files,
          });
        }}
      />

      <div className="max-w-lg mx-auto">
        <TripHeader trip={trip} editable={!useMock} />

        {!useMock && <PhaseBanner trip={trip} />}

        {!useMock && (
          <div className="px-5 mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleEnrich()}
              disabled={enriching}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 disabled:opacity-50 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              {enriching ? "Enriching places…" : "Enrich places (Google)"}
            </button>
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
                  onToggleChecked={useMock ? undefined : toggleItemChecked}
                  onLogThis={useMock ? undefined : (itemId) => openLog(itemId, item.title)}
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
                  {e.note && <p className="text-text-muted mt-1">{e.note}</p>}
                  <div className="flex flex-wrap gap-2 mt-2 text-xs text-text-muted">
                    {e.rating != null && <span>{e.rating}/5</span>}
                    {e.amountCents != null && (
                      <span>{(e.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: e.currency })}</span>
                    )}
                    {e.category && <span className="capitalize">{e.category}</span>}
                  </div>
                  {e.photos && e.photos.length > 0 && (
                    <div className="flex gap-2 mt-2 overflow-x-auto">
                      {e.photos.map((p: { id: string; publicUrl?: string | null }) =>
                        p.publicUrl ? (
                          <img key={p.id} src={p.publicUrl} alt="" className="h-16 w-16 rounded-lg object-cover shrink-0" />
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
