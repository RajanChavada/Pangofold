import { useState } from "react";
import { useParams } from "react-router";
import { Utensils, Compass, ListChecks, List } from "lucide-react";
import { useTrip } from "../hooks/useTrip";
import { TripHeader } from "../components/TripHeader";
import { DestinationTabs } from "../components/DestinationTabs";
import { DayTabs } from "../components/DayTabs";
import { ItineraryCard } from "../components/ItineraryCard";
import { FoodCard } from "../components/FoodCard";
import { ActivityCard } from "../components/ActivityCard";
import { HotelCard } from "../components/HotelCard";
import { SectionHeader } from "../components/SectionHeader";
import { cn } from "../lib/cn";
import { MOCK_TRIP } from "../lib/mock-data";

type ViewTab = "itinerary" | "food" | "activities";

export function TripView() {
  const { id } = useParams();
  const { trip: dbTrip, loading, error, toggleItemChecked } = useTrip(id);

  const useMock = !dbTrip && !loading;
  const trip = dbTrip || (useMock ? MOCK_TRIP : null);

  const [destIndex, setDestIndex] = useState(0);
  const [dayIndex, setDayIndex] = useState(0);
  const [checklistMode, setChecklistMode] = useState(false);
  const [viewTab, setViewTab] = useState<ViewTab>("itinerary");

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

  const handleDestChange = (i: number) => {
    setDestIndex(i);
    setDayIndex(0);
  };

  const VIEW_TABS: { key: ViewTab; label: string; icon: typeof Utensils; count: number }[] = [
    { key: "itinerary", label: "Itinerary", icon: ListChecks, count: day?.items.length ?? 0 },
    { key: "food", label: "Food", icon: Utensils, count: dest?.foodSpots.length ?? 0 },
    { key: "activities", label: "Activities", icon: Compass, count: dest?.activities.length ?? 0 },
  ];

  return (
    <div className="min-h-dvh bg-surface pb-8">
      <div className="max-w-lg mx-auto">
        <TripHeader trip={trip} editable />

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

        {/* View tabs */}
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
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full",
                  viewTab === key ? "bg-primary/10 text-primary" : "bg-surface-muted",
                )}>
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
                {day?.date && ` \u00b7 ${new Date(day.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`}
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
                  onToggleChecked={toggleItemChecked}
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
      </div>
    </div>
  );
}
