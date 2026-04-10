const PREFIX = "pangofold_guest_";

export function guestStorageKey(tripId: string): string {
  return `${PREFIX}${tripId}`;
}

export function getGuestName(tripId: string): string | null {
  try {
    const v = localStorage.getItem(guestStorageKey(tripId));
    return v?.trim() ? v.trim().slice(0, 120) : null;
  } catch {
    return null;
  }
}

export function setGuestName(tripId: string, name: string): void {
  try {
    localStorage.setItem(guestStorageKey(tripId), name.trim().slice(0, 120));
  } catch {
    /* ignore quota */
  }
}
