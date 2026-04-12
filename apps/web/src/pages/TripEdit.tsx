import { useState, useCallback, useEffect, useRef } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useParams, useNavigate } from "react-router";
import {
  ArrowLeft,
  Plus,
  Trash2,
  GripVertical,
  Utensils,
  Compass,
  MapPin,
  Eye,
  Image as ImageIcon,
  Link2,
  Copy,
  Check,
  FileText,
  RefreshCw,
} from "lucide-react";
import type { ItineraryItem, FoodSpot, Activity, TripPhase, TripMember } from "@pangofold/shared";
import { CATEGORIES, FOOD_TYPES } from "@pangofold/shared";
import { useTrip } from "../hooks/useTrip";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { cn } from "../lib/cn";
import { MOCK_TRIP } from "../lib/mock-data";

export function TripEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { trip: dbTrip, loading, error, refetch, updateTripMeta } = useTrip(id);
  const { user } = useAuth();

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
  const [memberUid, setMemberUid] = useState("");
  const [members, setMembers] = useState<TripMember[]>([]);
  const [memberSaving, setMemberSaving] = useState(false);
  const [collabEnabled, setCollabEnabled] = useState(false);
  const [collabToken, setCollabToken] = useState<string | null>(null);
  const [coverInput, setCoverInput] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const coverFileRef = useRef<HTMLInputElement>(null);
  const [resyncing, setResyncing] = useState(false);
  const [resyncMessage, setResyncMessage] = useState<string | null>(null);
  // Onboarding prompts for the crew
  const [onboardPrompt1, setOnboardPrompt1] = useState("What are you most excited about?");
  const [onboardPrompt2, setOnboardPrompt2] = useState("What is your one must-eat on this trip?");
  const [onboardFunFact, setOnboardFunFact] = useState("Most likely to _____ on this trip?");
  const [dailyLogPromptText, setDailyLogPromptText] = useState("");
  const [promptsSaved, setPromptsSaved] = useState(false);

  const handleResyncDoc = useCallback(async () => {
    if (!trip?.sourceDocUrl || useMock) return;
    if (user?.id !== trip.ownerId) {
      setResyncMessage("Only the trip owner can resync.");
      return;
    }
    setResyncMessage(null);
    setResyncing(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        setResyncMessage("Sign in required.");
        return;
      }
      const providerToken =
        session.provider_token || sessionStorage.getItem("google_provider_token");
      if (!providerToken) {
        setResyncMessage("Google access expired. Sign out and sign in again.");
        return;
      }
      const fetchRes = await supabase.functions.invoke("fetch-doc", {
        body: { docUrl: trip.sourceDocUrl, providerToken },
      });
      if (fetchRes.error) {
        throw new Error(
          typeof fetchRes.error.message === "string" ? fetchRes.error.message : "Could not fetch doc",
        );
      }
      const parseRes = await supabase.functions.invoke("parse-trip", {
        body: {
          ...(fetchRes.data as Record<string, unknown>),
          userId: session.user.id,
          mode: "append",
          tripId: trip.id,
        },
      });
      if (parseRes.error) {
        throw new Error(
          typeof parseRes.error.message === "string" ? parseRes.error.message : "Parse failed",
        );
      }
      const d = parseRes.data as {
        skipped?: boolean;
        reason?: string;
        appended?: {
          itinerary?: number;
          food?: number;
          activities?: number;
          destinations?: number;
        };
      };
      if (d.skipped) {
        setResyncMessage(
          d.reason === "document_unchanged"
            ? "Doc unchanged — nothing to add."
            : "No new text to parse.",
        );
      } else {
        const a = d.appended;
        setResyncMessage(
          `Added ${a?.itinerary ?? 0} itinerary · ${a?.food ?? 0} food · ${a?.activities ?? 0} activities` +
            ((a?.destinations ?? 0) > 0 ? ` · ${a?.destinations} new destination(s)` : "") +
            ".",
        );
      }
      await refetch();
    } catch (e) {
      setResyncMessage(e instanceof Error ? e.message : "Resync failed.");
    } finally {
      setResyncing(false);
    }
  }, [trip?.sourceDocUrl, trip?.id, trip?.ownerId, user?.id, useMock, refetch]);

  useEffect(() => {
    if (trip?.coverImageUrl) setCoverInput(trip.coverImageUrl);
  }, [trip?.coverImageUrl]);

  useEffect(() => {
    if (!trip?.onboardingPrompts) return;
    const p = trip.onboardingPrompts;
    if (p.prompt_1) setOnboardPrompt1(p.prompt_1);
    if (p.prompt_2) setOnboardPrompt2(p.prompt_2);
    if (p.fun_fact) setOnboardFunFact(p.fun_fact);
    if (trip.dailyLogPrompt) setDailyLogPromptText(trip.dailyLogPrompt);
  }, [trip?.onboardingPrompts, trip?.dailyLogPrompt]);

  useEffect(() => {
    if (!id || useMock) return;
    void supabase.rpc("trip_collab_settings_for_owner", { p_trip_id: id }).then(({ data, error: rpcErr }) => {
      if (rpcErr || !data?.length) return;
      const row = data[0] as { collaboration_enabled: boolean; collaborate_token: string | null };
      setCollabEnabled(row.collaboration_enabled);
      setCollabToken(row.collaborate_token);
    });
  }, [id, useMock]);

  useEffect(() => {
    if (!id || useMock) return;
    void supabase
      .from("trip_members")
      .select("*")
      .eq("trip_id", id)
      .then(({ data }) => {
        setMembers(
          (data || []).map((row) => {
            const o = row as Record<string, unknown>;
            const camel: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(o)) {
              camel[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v;
            }
            return camel as unknown as TripMember;
          }),
        );
      });
  }, [id, useMock]);

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

  const addMember = async () => {
    if (!memberUid.trim() || !trip || useMock) return;
    setMemberSaving(true);
    try {
      const { error: insErr } = await supabase.from("trip_members").insert({
        trip_id: trip.id,
        user_id: memberUid.trim(),
        role: "editor",
      });
      if (!insErr) {
        setMemberUid("");
        const { data } = await supabase.from("trip_members").select("*").eq("trip_id", trip.id);
        setMembers(
          (data || []).map((row) => {
            const o = row as Record<string, unknown>;
            const camel: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(o)) {
              camel[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v;
            }
            return camel as unknown as TripMember;
          }),
        );
      }
    } finally {
      setMemberSaving(false);
    }
  };

  const setCollabToggle = async (on: boolean) => {
    if (!trip || useMock) return;
    if (on) {
      const token = collabToken || crypto.randomUUID().replace(/-/g, "");
      const { error: uErr } = await supabase
        .from("trips")
        .update({ collaboration_enabled: true, collaborate_token: token })
        .eq("id", trip.id);
      if (!uErr) {
        setCollabEnabled(true);
        setCollabToken(token);
      }
    } else {
      const { error: uErr } = await supabase
        .from("trips")
        .update({ collaboration_enabled: false })
        .eq("id", trip.id);
      if (!uErr) setCollabEnabled(false);
    }
  };

  const copyCollabLink = async () => {
    if (!trip || !collabToken) return;
    const url = `${window.location.origin}/trip/${trip.id}/collab?token=${collabToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const saveOnboardingPrompts = async () => {
    if (!trip || useMock) return;
    setPromptsSaved(false);
    await updateTripMeta({
      onboardingPrompts: {
        prompt_1: onboardPrompt1.trim(),
        prompt_2: onboardPrompt2.trim(),
        fun_fact: onboardFunFact.trim(),
      },
      dailyLogPrompt: dailyLogPromptText.trim() || null,
    });
    setPromptsSaved(true);
    setTimeout(() => setPromptsSaved(false), 2500);
  };

  const saveCoverUrl = async () => {
    await updateTripMeta({ coverImageUrl: coverInput.trim() || null });
  };

  const uploadCoverFile = async (file: File) => {
    if (!trip || useMock) return;
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${trip.id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("trip-covers").upload(path, file);
    if (upErr) return;
    const { data } = supabase.storage.from("trip-covers").getPublicUrl(path);
    await updateTripMeta({ coverImageUrl: data.publicUrl });
    setCoverInput(data.publicUrl);
  };

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

        {!useMock && (
          <div className="px-5 mb-6 space-y-4">
            <div className="bg-surface-card rounded-2xl border border-border p-4 space-y-3">
              <h2 className="text-sm font-semibold">Trip mode &amp; group</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-muted">Phase</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                    value={trip.phase ?? "planning"}
                    onChange={(e) => void updateTripMeta({ phase: e.target.value as TripPhase })}
                  >
                    <option value="planning">Planning</option>
                    <option value="active">Active (on trip)</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-text-muted">Group size (equal split)</label>
                  <input
                    type="number"
                    min={1}
                    className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                    value={trip.defaultSplitCount ?? 1}
                    onChange={(e) =>
                      void updateTripMeta({ defaultSplitCount: Math.max(1, parseInt(e.target.value, 10) || 1) })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="bg-surface-card rounded-2xl border border-border p-4 space-y-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />
                Cover image
              </h2>
              <p className="text-xs text-text-muted">
                Paste an image URL or upload to the trip-covers bucket (shown on the trip page).
              </p>
              <input
                value={coverInput}
                onChange={(e) => setCoverInput(e.target.value)}
                placeholder="https://…"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void saveCoverUrl()}
                  className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium cursor-pointer"
                >
                  Save URL
                </button>
                <input
                  ref={coverFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadCoverFile(f);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => coverFileRef.current?.click()}
                  className="px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-surface-muted cursor-pointer"
                >
                  Upload file
                </button>
              </div>
            </div>

            {trip.sourceDocUrl && (
              <div className="bg-surface-card rounded-2xl border border-border p-4 space-y-3">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Google Doc
                </h2>
                <p className="text-xs text-text-muted">
                  Pull the latest text from your linked doc and <strong>append</strong> new stops to this trip. Nothing
                  is deleted — duplicates are skipped using a fingerprint set (and the model is told what already
                  exists). If the file is unchanged, the LLM is skipped entirely.
                </p>
                <button
                  type="button"
                  disabled={resyncing || user?.id !== trip.ownerId}
                  onClick={() => void handleResyncDoc()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${resyncing ? "animate-spin" : ""}`} />
                  {resyncing ? "Resyncing…" : "Resync from Google Doc"}
                </button>
                {resyncMessage && (
                  <p className="text-xs text-text-muted whitespace-pre-wrap">{resyncMessage}</p>
                )}
              </div>
            )}

            <div className="bg-surface-card rounded-2xl border border-border p-4 space-y-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Link2 className="w-4 h-4" />
                Friend logging link
              </h2>
              <p className="text-xs text-text-muted">
                Anyone with the link can read this trip and add journal entries (no Pangofold account). Keep the link
                private.
              </p>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={collabEnabled}
                  onChange={(e) => void setCollabToggle(e.target.checked)}
                  className="rounded border-border"
                />
                Allow friends to log via link
              </label>
              {collabEnabled && collabToken && (
                <div className="flex items-start gap-2">
                  <p className="text-[11px] font-mono break-all flex-1 bg-surface-muted rounded-lg px-2 py-1.5">
                    {`${window.location.origin}/trip/${trip.id}/collab?token=${collabToken}`}
                  </p>
                  <button
                    type="button"
                    onClick={() => void copyCollabLink()}
                    className="p-2 rounded-xl border border-border hover:bg-surface-muted shrink-0 cursor-pointer"
                    title="Copy link"
                  >
                    {linkCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              )}
            </div>

            <div className="bg-surface-card rounded-2xl border border-border p-4 space-y-3">
              <h2 className="text-sm font-semibold">Collaborators</h2>
              <p className="text-xs text-text-muted">
                Add another Pangofold user by their Supabase auth user UUID (editors can log journal entries).
              </p>
              <div className="flex gap-2">
                <input
                  value={memberUid}
                  onChange={(e) => setMemberUid(e.target.value)}
                  placeholder="User UUID"
                  className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-mono"
                />
                <button
                  type="button"
                  onClick={() => void addMember()}
                  disabled={memberSaving}
                  className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium disabled:opacity-50 cursor-pointer"
                >
                  Add
                </button>
              </div>
              {members.length > 0 && (
                <ul className="text-xs font-mono space-y-1 text-text-muted">
                  {members.map((m) => (
                    <li key={m.id}>{m.userId} ({m.role})</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-surface-card rounded-2xl border border-border p-4 space-y-3">
              <h2 className="text-sm font-semibold">Crew onboarding questions</h2>
              <p className="text-xs text-text-muted">
                Guests see these when they join via the friend link. Customize per trip (golf vs beach).
              </p>
              <div className="space-y-2">
                <label className="block text-[11px] font-medium text-text-muted uppercase tracking-wide">
                  Prompt 1 (name + vibe step)
                </label>
                <input
                  value={onboardPrompt1}
                  onChange={(e) => setOnboardPrompt1(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  placeholder="What are you most excited about?"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[11px] font-medium text-text-muted uppercase tracking-wide">
                  Prompt 2 (optional follow-up)
                </label>
                <input
                  value={onboardPrompt2}
                  onChange={(e) => setOnboardPrompt2(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  placeholder="What is your one must-eat on this trip?"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[11px] font-medium text-text-muted uppercase tracking-wide">
                  Fun fact prompt (step 3)
                </label>
                <input
                  value={onboardFunFact}
                  onChange={(e) => setOnboardFunFact(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  placeholder="Most likely to _____ on this trip?"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[11px] font-medium text-text-muted uppercase tracking-wide">
                  Custom daily check-in question (optional)
                </label>
                <input
                  value={dailyLogPromptText}
                  onChange={(e) => setDailyLogPromptText(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  placeholder="e.g. What's your word of the day?"
                />
              </div>
              <button
                type="button"
                onClick={() => void saveOnboardingPrompts()}
                className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 cursor-pointer"
              >
                {promptsSaved ? "Saved!" : "Save crew questions"}
              </button>
            </div>
          </div>
        )}

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
