import { useState, useCallback } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useParams, useNavigate } from "react-router";
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  GripVertical,
  Utensils,
  Compass,
  MapPin,
  Eye,
} from "lucide-react";
import type { ItineraryItem, FoodSpot, Activity, ItemCategory, FoodType } from "@pangofold/shared";
import { CATEGORIES, FOOD_TYPES } from "@pangofold/shared";
import { useTrip } from "../hooks/useTrip";
import { supabase } from "../lib/supabase";
import { cn } from "../lib/cn";
import { MOCK_TRIP } from "../lib/mock-data";

export function TripEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { trip: dbTrip, loading, error, refetch } = useTrip(id);

  const useMock = !dbTrip && !loading;
  const trip = dbTrip || (useMock ? MOCK_TRIP : null);

  const [destIndex, setDestIndex] = useState(0);
  const [dayIndex, setDayIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [editTab, setEditTab] = useState<"days" | "food" | "activities">("days");
  const [pendingRemove, setPendingRemove] = useState<
    null | { type: "item" | "food" | "activity"; id: string }
  >(null);
  const [removeLoading, setRemoveLoading] = useState(false);

  const confirmRemove = useCallback(async () => {
    if (!pendingRemove) return;
    setRemoveLoading(true);
    try {
      const { type, id } = pendingRemove;
      if (type === "item") await supabase.from("itinerary_items").delete().eq("id", id);
      else if (type === "food") await supabase.from("food_spots").delete().eq("id", id);
      else await supabase.from("activities").delete().eq("id", id);
      setPendingRemove(null);
      await refetch();
    } finally {
      setRemoveLoading(false);
    }
  }, [pendingRemove, refetch]);

  const handleDeleteItem = useCallback((itemId: string) => {
    setPendingRemove({ type: "item", id: itemId });
  }, []);

  const handleDeleteFood = useCallback((foodId: string) => {
    setPendingRemove({ type: "food", id: foodId });
  }, []);

  const handleDeleteActivity = useCallback((actId: string) => {
    setPendingRemove({ type: "activity", id: actId });
  }, []);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-4">
        <p className="text-red-600">{error || "Trip not found"}</p>
      </div>
    );
  }

  const dest = trip.destinations[destIndex];
  const day = dest?.days[dayIndex];

  const handleAddItem = async () => {
    if (!day) return;
    setSaving(true);
    await supabase.from("itinerary_items").insert({
      day_id: day.id,
      title: "New item",
      category: "other",
      sort_order: day.items.length,
    });
    await refetch();
    setSaving(false);
  };

  const handleAddFood = async () => {
    if (!dest) return;
    setSaving(true);
    await supabase.from("food_spots").insert({
      destination_id: dest.id,
      name: "New food spot",
      type: "restaurant",
      sort_order: dest.foodSpots.length,
    });
    await refetch();
    setSaving(false);
  };

  const handleAddActivity = async () => {
    if (!dest) return;
    setSaving(true);
    await supabase.from("activities").insert({
      destination_id: dest.id,
      name: "New activity",
      sort_order: dest.activities.length,
    });
    await refetch();
    setSaving(false);
  };

  const handleUpdateItem = async (itemId: string, field: string, value: string) => {
    const dbField = field.replace(/([A-Z])/g, "_$1").toLowerCase();
    await supabase.from("itinerary_items").update({ [dbField]: value || null }).eq("id", itemId);
  };

  const handleUpdateFood = async (foodId: string, field: string, value: string) => {
    const dbField = field.replace(/([A-Z])/g, "_$1").toLowerCase();
    await supabase.from("food_spots").update({ [dbField]: value || null }).eq("id", foodId);
  };

  const handleUpdateActivity = async (actId: string, field: string, value: string) => {
    const dbField = field.replace(/([A-Z])/g, "_$1").toLowerCase();
    await supabase.from("activities").update({ [dbField]: value || null }).eq("id", actId);
  };

  const removeDialogCopy =
    pendingRemove?.type === "item"
      ? {
          title: "Remove this item?",
          description: "It will be removed from this day’s itinerary.",
          confirm: "Remove item",
        }
      : pendingRemove?.type === "food"
        ? {
            title: "Remove this food spot?",
            description: "It will disappear from your Food list for this destination.",
            confirm: "Remove",
          }
        : pendingRemove
          ? {
              title: "Remove this activity?",
              description: "It will disappear from your Activities list for this destination.",
              confirm: "Remove",
            }
          : { title: "", description: "", confirm: "Remove" };

  return (
    <div className="min-h-dvh bg-surface pb-8">
      <ConfirmDialog
        open={pendingRemove !== null}
        title={removeDialogCopy.title}
        description={removeDialogCopy.description}
        confirmLabel={removeDialogCopy.confirm}
        cancelLabel="Cancel"
        variant="danger"
        loading={removeLoading}
        onCancel={() => {
          if (!removeLoading) setPendingRemove(null);
        }}
        onConfirm={() => void confirmRemove()}
      />
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="px-5 pt-6 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(`/trip/${trip.id}`)}
                className="p-2 -ml-2 rounded-xl hover:bg-surface-muted transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-bold">{trip.title}</h1>
                <p className="text-xs text-text-muted">Edit mode</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => navigate(`/trip/${trip.id}`)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl border border-border hover:bg-surface-muted transition-colors"
              >
                <Eye className="w-4 h-4" />
                View
              </button>
            </div>
          </div>
        </div>

        {/* Destination selector */}
        {trip.destinations.length > 1 && (
          <div className="px-5 mb-4">
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              {trip.destinations.map((d, i) => (
                <button
                  key={d.id}
                  onClick={() => { setDestIndex(i); setDayIndex(0); }}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all cursor-pointer",
                    i === destIndex
                      ? "bg-primary text-white shadow-sm"
                      : "bg-surface-card border border-border text-text-muted hover:text-text",
                  )}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  {d.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Edit tabs */}
        <div className="px-5 mb-4">
          <div className="flex gap-1 bg-surface-muted rounded-2xl p-1">
            {[
              { key: "days" as const, label: "Days", icon: GripVertical },
              { key: "food" as const, label: "Food", icon: Utensils },
              { key: "activities" as const, label: "Activities", icon: Compass },
            ].map(({ key, label, icon: TabIcon }) => (
              <button
                key={key}
                onClick={() => setEditTab(key)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer",
                  editTab === key
                    ? "bg-surface-card text-text shadow-sm"
                    : "text-text-muted hover:text-text",
                )}
              >
                <TabIcon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {editTab === "days" && (
          <>
            {/* Day selector */}
            {dest && dest.days.length > 0 && (
              <div className="flex gap-2 overflow-x-auto scrollbar-none px-5 pb-3">
                {dest.days.map((d, i) => (
                  <button
                    key={d.id}
                    onClick={() => setDayIndex(i)}
                    className={cn(
                      "min-w-[3.5rem] px-3 py-2 rounded-xl text-center text-sm font-medium transition-all cursor-pointer",
                      i === dayIndex
                        ? "bg-primary text-white"
                        : "bg-surface-card border border-border text-text-muted",
                    )}
                  >
                    Day {d.dayNumber}
                  </button>
                ))}
              </div>
            )}

            {/* Items */}
            <div className="px-5 space-y-3">
              {day?.items.map((item) => (
                <EditItemCard
                  key={item.id}
                  item={item}
                  onUpdate={handleUpdateItem}
                  onDelete={handleDeleteItem}
                />
              ))}

              <button
                onClick={handleAddItem}
                disabled={saving || !day}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-border text-text-muted hover:border-primary/30 hover:text-primary transition-all cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                Add item
              </button>
            </div>
          </>
        )}

        {editTab === "food" && (
          <div className="px-5 space-y-3">
            {dest?.foodSpots.map((spot) => (
              <EditFoodCard
                key={spot.id}
                spot={spot}
                onUpdate={handleUpdateFood}
                onDelete={handleDeleteFood}
              />
            ))}
            <button
              onClick={handleAddFood}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-border text-text-muted hover:border-primary/30 hover:text-primary transition-all cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Add food spot
            </button>
          </div>
        )}

        {editTab === "activities" && (
          <div className="px-5 space-y-3">
            {dest?.activities.map((act) => (
              <EditActivityCard
                key={act.id}
                activity={act}
                onUpdate={handleUpdateActivity}
                onDelete={handleDeleteActivity}
              />
            ))}
            <button
              onClick={handleAddActivity}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-border text-text-muted hover:border-primary/30 hover:text-primary transition-all cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Add activity
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function EditItemCard({
  item,
  onUpdate,
  onDelete,
}: {
  item: ItineraryItem;
  onUpdate: (id: string, field: string, value: string) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="bg-surface-card rounded-2xl border border-border p-4 shadow-sm">
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-2">
          <input
            defaultValue={item.title}
            onBlur={(e) => onUpdate(item.id, "title", e.target.value)}
            className="w-full font-semibold text-[15px] bg-transparent border-b border-transparent focus:border-primary/30 outline-none pb-0.5 transition-colors"
            placeholder="Title"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              defaultValue={item.time || ""}
              onBlur={(e) => onUpdate(item.id, "time", e.target.value)}
              className="text-sm bg-surface-muted rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary/30"
              placeholder="Time"
            />
            <select
              defaultValue={item.category}
              onChange={(e) => onUpdate(item.id, "category", e.target.value)}
              className="text-sm bg-surface-muted rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary/30"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <textarea
            defaultValue={item.description || ""}
            onBlur={(e) => onUpdate(item.id, "description", e.target.value)}
            className="w-full text-sm bg-surface-muted rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary/30 resize-none"
            placeholder="Description"
            rows={2}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              defaultValue={item.location || ""}
              onBlur={(e) => onUpdate(item.id, "location", e.target.value)}
              className="text-sm bg-surface-muted rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary/30"
              placeholder="Location"
            />
            <input
              defaultValue={item.cost || ""}
              onBlur={(e) => onUpdate(item.id, "cost", e.target.value)}
              className="text-sm bg-surface-muted rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary/30"
              placeholder="Cost"
            />
          </div>
          <input
            defaultValue={item.link || ""}
            onBlur={(e) => onUpdate(item.id, "link", e.target.value)}
            className="w-full text-sm bg-surface-muted rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary/30"
            placeholder="Link URL"
          />
        </div>
        <button
          onClick={() => onDelete(item.id)}
          className="p-2 rounded-xl hover:bg-red-50 text-text-muted hover:text-red-500 transition-colors shrink-0 cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function EditFoodCard({
  spot,
  onUpdate,
  onDelete,
}: {
  spot: FoodSpot;
  onUpdate: (id: string, field: string, value: string) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="bg-surface-card rounded-2xl border border-border p-4 shadow-sm">
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-2">
          <input
            defaultValue={spot.name}
            onBlur={(e) => onUpdate(spot.id, "name", e.target.value)}
            className="w-full font-semibold text-[15px] bg-transparent border-b border-transparent focus:border-primary/30 outline-none pb-0.5 transition-colors"
            placeholder="Name"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              defaultValue={spot.type}
              onChange={(e) => onUpdate(spot.id, "type", e.target.value)}
              className="text-sm bg-surface-muted rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary/30"
            >
              {FOOD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <input
              defaultValue={spot.priceRange || ""}
              onBlur={(e) => onUpdate(spot.id, "priceRange", e.target.value)}
              className="text-sm bg-surface-muted rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary/30"
              placeholder="Price range"
            />
          </div>
          <textarea
            defaultValue={spot.notes || ""}
            onBlur={(e) => onUpdate(spot.id, "notes", e.target.value)}
            className="w-full text-sm bg-surface-muted rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary/30 resize-none"
            placeholder="Notes"
            rows={2}
          />
          <input
            defaultValue={spot.link || ""}
            onBlur={(e) => onUpdate(spot.id, "link", e.target.value)}
            className="w-full text-sm bg-surface-muted rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary/30"
            placeholder="Link URL"
          />
        </div>
        <button
          onClick={() => onDelete(spot.id)}
          className="p-2 rounded-xl hover:bg-red-50 text-text-muted hover:text-red-500 transition-colors shrink-0 cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function EditActivityCard({
  activity,
  onUpdate,
  onDelete,
}: {
  activity: Activity;
  onUpdate: (id: string, field: string, value: string) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="bg-surface-card rounded-2xl border border-border p-4 shadow-sm">
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-2">
          <input
            defaultValue={activity.name}
            onBlur={(e) => onUpdate(activity.id, "name", e.target.value)}
            className="w-full font-semibold text-[15px] bg-transparent border-b border-transparent focus:border-primary/30 outline-none pb-0.5 transition-colors"
            placeholder="Name"
          />
          <textarea
            defaultValue={activity.notes || ""}
            onBlur={(e) => onUpdate(activity.id, "notes", e.target.value)}
            className="w-full text-sm bg-surface-muted rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary/30 resize-none"
            placeholder="Notes"
            rows={2}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              defaultValue={activity.location || ""}
              onBlur={(e) => onUpdate(activity.id, "location", e.target.value)}
              className="text-sm bg-surface-muted rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary/30"
              placeholder="Location"
            />
            <input
              defaultValue={activity.cost || ""}
              onBlur={(e) => onUpdate(activity.id, "cost", e.target.value)}
              className="text-sm bg-surface-muted rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary/30"
              placeholder="Cost"
            />
          </div>
          <input
            defaultValue={activity.link || ""}
            onBlur={(e) => onUpdate(activity.id, "link", e.target.value)}
            className="w-full text-sm bg-surface-muted rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary/30"
            placeholder="Link URL"
          />
        </div>
        <button
          onClick={() => onDelete(activity.id)}
          className="p-2 rounded-xl hover:bg-red-50 text-text-muted hover:text-red-500 transition-colors shrink-0 cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
