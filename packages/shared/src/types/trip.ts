export type TripPhase = "planning" | "active" | "completed";

export interface Trip {
  id: string;
  title: string;
  coverImageUrl?: string;
  startDate?: string;
  endDate?: string;
  sourceDocUrl?: string;
  ownerId: string;
  shareSlug: string;
  rawDocText?: string;
  createdAt: string;
  phase?: TripPhase;
  defaultSplitCount?: number;
  /** Present when loaded via owner-only RPC; omitted from public trip fetches. */
  collaborationEnabled?: boolean;
  collaborateToken?: string | null;
  onboardingPrompts?: OnboardingPrompts | null;
  dailyLogPrompt?: string | null;
  destinations: Destination[];
}

export interface OnboardingPrompts {
  prompt_1: string;
  prompt_2: string;
  fun_fact: string;
}

export interface Destination {
  id: string;
  name: string;
  duration?: string;
  hotel?: {
    name: string;
    address?: string;
    link?: string;
  };
  sortOrder: number;
  days: DayItinerary[];
  foodSpots: FoodSpot[];
  activities: Activity[];
}

export interface DayItinerary {
  id: string;
  dayNumber: number;
  date?: string;
  items: ItineraryItem[];
}

export type ItemCategory = "food" | "activity" | "transport" | "accommodation" | "other";
export type ItemCostUnit = "per_person" | "total" | "unknown";

export interface Place {
  id: string;
  googlePlaceId?: string | null;
  displayName: string;
  formattedAddress?: string | null;
  lat?: number | null;
  lng?: number | null;
  rating?: number | null;
  photoRefs?: string[] | null;
}

export interface ItineraryItem {
  id: string;
  time?: string;
  title: string;
  description?: string;
  category: ItemCategory;
  location?: string;
  link?: string;
  cost?: string;
  isChecked: boolean;
  sortOrder: number;
  placeId?: string | null;
  place?: Place | null;
  costAmount?: number | null;
  costUnit?: ItemCostUnit;
  timeMinutes?: number | null;
}

export type FoodType = "restaurant" | "cafe" | "street" | "bakery" | "bar";

export interface FoodSpot {
  id: string;
  name: string;
  type: FoodType;
  notes?: string;
  link?: string;
  priceRange?: string;
  sortOrder: number;
  placeId?: string | null;
  place?: Place | null;
}

export interface Activity {
  id: string;
  name: string;
  notes?: string;
  cost?: string;
  link?: string;
  location?: string;
  sortOrder: number;
  placeId?: string | null;
  place?: Place | null;
}

export type JournalSpendingCategory =
  | "food"
  | "transport"
  | "activities"
  | "accommodation"
  | "other";

export interface JournalPhoto {
  id: string;
  entryId: string;
  storagePath: string;
  sortOrder: number;
  caption?: string | null;
  publicUrl?: string | null;
  isReceipt?: boolean;
}

export type JournalSplitMode = "equal" | "full_amount" | "group_split";

export interface JournalEntry {
  id: string;
  tripId: string;
  authorId: string | null;
  /** Display name for this log; required when authorId is null (guest). */
  loggedByName?: string | null;
  paidByName?: string | null;
  splitMode?: JournalSplitMode;
  itineraryItemId?: string | null;
  placeId?: string | null;
  title: string;
  note?: string | null;
  rating?: number | null;
  amountCents?: number | null;
  currency: string;
  category?: JournalSpendingCategory | null;
  splitBetween: number;
  loggedAt: string;
  lat?: number | null;
  lng?: number | null;
  createdAt: string;
  photos?: JournalPhoto[];
}

export type TripMemberRole = "viewer" | "editor";

export interface TripMember {
  id: string;
  tripId: string;
  userId?: string | null;
  role: TripMemberRole;
  invitedEmail?: string | null;
  createdAt: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  bioBurb?: string | null;
  funFact?: string | null;
  onboardingPromptAnswer?: string | null;
  onboardingCompleted?: boolean;
  localStorageToken?: string;
}

export interface DailyLog {
  id: string;
  tripId: string;
  memberId: string;
  logDate: string;
  stepsCount?: number | null;
  moodScore?: number | null;
  bestFoodText?: string | null;
  bestFoodPhotoUrl?: string | null;
  worstFoodText?: string | null;
  funniestMoment?: string | null;
  customPromptAnswer?: string | null;
  /** Optional link to a planned stop on the itinerary */
  linkedItineraryItemId?: string | null;
  activityHighlight?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PersonTripStats {
  name: string;
  /** Sum of per-person shares (equal split divides amount by split_between). */
  attributedSpendCents: number;
  logCount: number;
  photoCount: number;
  foodLogCount: number;
}

export type SuperlativeId = "foodie" | "highRoller" | "historian" | "navigator";

export interface SettlementTransfer {
  from: string;
  to: string;
  amountCents: number;
}

export interface TripReportPayload {
  generatedAt: string;
  spendByCategory: Record<JournalSpendingCategory | "uncategorized", number>;
  totalSpendCents: number;
  bestRated: { entryId: string; title: string; rating: number } | null;
  mostExpensiveDay: { date: string; cents: number } | null;
  unvisitedItems: { id: string; title: string }[];
  topPhotoPaths: string[];
  /** Per-person aggregates for Wrapped-style views. */
  perPerson: PersonTripStats[];
  /** Derived titles; values are display names or null if no data / tie to empty. */
  superlatives: Record<SuperlativeId, string | null>;
  /** Suggested settlements to clear group balances (see computeSettlement). */
  settlement: SettlementTransfer[];
}
