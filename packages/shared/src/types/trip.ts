export interface Trip {
  id: string;
  title: string;
  coverImageUrl?: string;
  startDate: string;
  endDate: string;
  sourceDocUrl: string;
  ownerId: string;
  shareSlug: string;
  rawDocText?: string;
  createdAt: string;
  destinations: Destination[];
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
}

export interface Activity {
  id: string;
  name: string;
  notes?: string;
  cost?: string;
  link?: string;
  location?: string;
  sortOrder: number;
}
