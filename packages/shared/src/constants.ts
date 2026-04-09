import type { ItemCategory, FoodType } from "./types/trip.js";

export const CATEGORIES: { value: ItemCategory; label: string }[] = [
  { value: "food", label: "Food" },
  { value: "activity", label: "Activity" },
  { value: "transport", label: "Transport" },
  { value: "accommodation", label: "Accommodation" },
  { value: "other", label: "Other" },
];

export const FOOD_TYPES: { value: FoodType; label: string }[] = [
  { value: "restaurant", label: "Restaurant" },
  { value: "cafe", label: "Cafe" },
  { value: "street", label: "Street Food" },
  { value: "bakery", label: "Bakery" },
  { value: "bar", label: "Bar" },
];
