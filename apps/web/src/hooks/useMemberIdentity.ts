import { useCallback, useEffect, useState } from "react";
import type { TripMember } from "@pangofold/shared";
import { supabase } from "../lib/supabase";

// ── Storage ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = (tripId: string) => `pf_member_${tripId}`;

export function getSavedToken(tripId: string): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY(tripId)) ?? null;
  } catch {
    return null;
  }
}

export function saveToken(tripId: string, token: string): void {
  try {
    localStorage.setItem(STORAGE_KEY(tripId), token);
  } catch {
    /* quota ignore */
  }
}

export function clearIdentity(tripId: string): void {
  try {
    localStorage.removeItem(STORAGE_KEY(tripId));
  } catch {
    /* ignore */
  }
}

// ── RPC helpers ──────────────────────────────────────────────────────────────

/** Look up a trip_member row by their local_storage_token UUID. */
export async function resolveIdentity(token: string): Promise<TripMember | null> {
  try {
    const { data, error } = await supabase.rpc("resolve_member_token", {
      p_token: token,
    });
    if (error || !data || (Array.isArray(data) && data.length === 0)) return null;
    const row = Array.isArray(data) ? data[0] : data;
    return rowToMember(row);
  } catch {
    return null;
  }
}

/** Fetch all trip_member profiles for a given trip (for the "Who are you?" carousel). */
export async function fetchTripMembers(tripId: string): Promise<TripMember[]> {
  const { data, error } = await supabase
    .from("trip_members")
    .select("*")
    .eq("trip_id", tripId)
    .eq("onboarding_completed", true)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map(rowToMember);
}

/** Insert a new trip_member for a guest onboarding flow. Returns the created row. */
export async function insertGuestMember(
  tripId: string,
  fields: {
    displayName: string;
    avatarUrl?: string;
    bioBurb?: string;
    funFact?: string;
    onboardingPromptAnswer?: string;
  },
): Promise<TripMember | null> {
  const { data, error } = await supabase
    .from("trip_members")
    .insert({
      trip_id: tripId,
      role: "editor",
      display_name: fields.displayName,
      avatar_url: fields.avatarUrl ?? null,
      bio_blurb: fields.bioBurb ?? null,
      fun_fact: fields.funFact ?? null,
      onboarding_prompt_answer: fields.onboardingPromptAnswer ?? null,
      onboarding_completed: true,
    })
    .select("*")
    .single();
  if (error || !data) return null;
  return rowToMember(data);
}

/** Update an existing member's profile (owner creating their own profile inline). */
export async function upsertOwnerMember(
  tripId: string,
  userId: string,
  fields: {
    displayName: string;
    avatarUrl?: string;
    bioBurb?: string;
    funFact?: string;
    onboardingPromptAnswer?: string;
  },
): Promise<TripMember | null> {
  const { data, error } = await supabase
    .from("trip_members")
    .upsert(
      {
        trip_id: tripId,
        user_id: userId,
        role: "editor",
        display_name: fields.displayName,
        avatar_url: fields.avatarUrl ?? null,
        bio_blurb: fields.bioBurb ?? null,
        fun_fact: fields.funFact ?? null,
        onboarding_prompt_answer: fields.onboardingPromptAnswer ?? null,
        onboarding_completed: true,
      },
      { onConflict: "trip_id,user_id" },
    )
    .select("*")
    .single();
  if (error || !data) return null;
  return rowToMember(data);
}

/** Upload an avatar image to the member-avatars bucket. Returns public URL or null. */
export async function uploadMemberAvatar(
  memberId: string,
  file: File,
): Promise<string | null> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${memberId}/avatar.${ext}`;
  const { error } = await supabase.storage
    .from("member-avatars")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) return null;
  const { data } = supabase.storage.from("member-avatars").getPublicUrl(path);
  return data.publicUrl ?? null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export type MemberIdentityState =
  | { status: "loading" }
  | { status: "identified"; member: TripMember }
  | { status: "unknown" };

/**
 * Resolves the current user's trip_member identity from localStorage.
 * Returns loading → identified | unknown.
 */
export function useCurrentMember(tripId: string | undefined): {
  state: MemberIdentityState;
  setMember: (m: TripMember) => void;
  logout: () => void;
  reload: () => void;
} {
  const [state, setState] = useState<MemberIdentityState>({ status: "loading" });

  const resolve = useCallback(async () => {
    if (!tripId) {
      setState({ status: "unknown" });
      return;
    }
    const token = getSavedToken(tripId);
    if (!token) {
      setState({ status: "unknown" });
      return;
    }
    const member = await resolveIdentity(token);
    if (member) {
      setState({ status: "identified", member });
    } else {
      // Token no longer valid — clear it
      clearIdentity(tripId);
      setState({ status: "unknown" });
    }
  }, [tripId]);

  useEffect(() => {
    void resolve();
  }, [resolve]);

  const setMember = useCallback(
    (m: TripMember) => {
      if (tripId && m.localStorageToken) {
        saveToken(tripId, m.localStorageToken);
      }
      setState({ status: "identified", member: m });
    },
    [tripId],
  );

  const logout = useCallback(() => {
    if (tripId) clearIdentity(tripId);
    setState({ status: "unknown" });
  }, [tripId]);

  return { state, setMember, logout, reload: resolve };
}

// ── Internal ─────────────────────────────────────────────────────────────────

function rowToMember(row: Record<string, unknown>): TripMember {
  return {
    id: row.id as string,
    tripId: row.trip_id as string,
    userId: (row.user_id as string | null) ?? null,
    role: (row.role as TripMember["role"]) ?? "editor",
    invitedEmail: (row.invited_email as string | null) ?? null,
    createdAt: (row.created_at as string) ?? "",
    displayName: (row.display_name as string | null) ?? null,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    bioBurb: (row.bio_blurb as string | null) ?? null,
    funFact: (row.fun_fact as string | null) ?? null,
    onboardingPromptAnswer: (row.onboarding_prompt_answer as string | null) ?? null,
    onboardingCompleted: Boolean(row.onboarding_completed),
    localStorageToken: (row.local_storage_token as string) ?? undefined,
  };
}
