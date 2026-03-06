// src/lib/cities.ts
export type CityKey = "Brisbane" | "Melbourne" | "Canberra";

export const CITIES: Record<CityKey, { center: [number, number]; zoom: number }> = {
  Brisbane:   { center: [153.0251, -27.4698], zoom: 12 }, 
  Melbourne:  { center: [144.9631, -37.8136], zoom: 12 },
  Canberra:   { center: [149.1287, -35.2820], zoom: 12 },
};

export const DEFAULT_CITY: CityKey = "Canberra";
