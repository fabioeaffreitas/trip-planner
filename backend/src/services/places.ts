import type { GeoPoint, ValidatedLocation } from "../types";
import { haversineKm } from "../utils/geo";

export interface DestinationSuggestion {
  description: string;
  mainText: string;
  secondaryText?: string;
}

/** A validated match further than this from the destination itself is treated as a mismatch, not a real result. */
const MAX_PLAUSIBLE_DISTANCE_KM = 100;
/** Soft location bias radius passed to the real Places search, in meters (Google's max for a circle bias). */
const LOCATION_BIAS_RADIUS_METERS = 50000;

export interface PlacesService {
  /** @param near optional destination coordinates (from geocodeDestination) used to bias/sanity-check the match */
  validateLocation(locationName: string | undefined, destination: string, near?: GeoPoint): Promise<ValidatedLocation | null>;
  suggestDestinations(query: string): Promise<DestinationSuggestion[]>;
  /** Geocodes the destination itself (e.g. "Araras, SP, Brazil") — used to bias/sanity-check per-event lookups. */
  geocodeDestination(destination: string): Promise<GeoPoint | null>;
}

const BASE_COORDS: Record<string, { lat: number; lng: number }> = {
  paris: { lat: 48.8566, lng: 2.3522 },
  tokyo: { lat: 35.6762, lng: 139.6503 },
  "new york": { lat: 40.7128, lng: -74.006 },
  rome: { lat: 41.9028, lng: 12.4964 },
  barcelona: { lat: 41.3851, lng: 2.1734 },
  london: { lat: 51.5074, lng: -0.1278 },
  lisbon: { lat: 38.7223, lng: -9.1393 },
  berlin: { lat: 52.52, lng: 13.405 },
  amsterdam: { lat: 52.3676, lng: 4.9041 },
  bangkok: { lat: 13.7563, lng: 100.5018 },
};

const MOCK_DESTINATIONS: DestinationSuggestion[] = [
  { description: "Paris, France", mainText: "Paris", secondaryText: "France" },
  { description: "Paris, TX, USA", mainText: "Paris", secondaryText: "TX, USA" },
  { description: "Tokyo, Japan", mainText: "Tokyo", secondaryText: "Japan" },
  { description: "New York, NY, USA", mainText: "New York", secondaryText: "NY, USA" },
  { description: "Rome, Italy", mainText: "Rome", secondaryText: "Italy" },
  { description: "Barcelona, Spain", mainText: "Barcelona", secondaryText: "Spain" },
  { description: "London, United Kingdom", mainText: "London", secondaryText: "United Kingdom" },
  { description: "London, ON, Canada", mainText: "London", secondaryText: "ON, Canada" },
  { description: "Lisbon, Portugal", mainText: "Lisbon", secondaryText: "Portugal" },
  { description: "Berlin, Germany", mainText: "Berlin", secondaryText: "Germany" },
  { description: "Amsterdam, Netherlands", mainText: "Amsterdam", secondaryText: "Netherlands" },
  { description: "Bangkok, Thailand", mainText: "Bangkok", secondaryText: "Thailand" },
  { description: "Vienna, Austria", mainText: "Vienna", secondaryText: "Austria" },
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

/**
 * Deterministic stand-in for a real Google Places lookup. Same interface as
 * the eventual real implementation so swapping it in later is a one-line change.
 */
export const mockPlacesService: PlacesService = {
  async validateLocation(locationName, destination) {
    if (!locationName) return null;

    const key = destination.trim().toLowerCase();
    const base = BASE_COORDS[key] ?? { lat: 0, lng: 0 };
    const jitterSeed = hashString(locationName);
    const jitterLat = ((jitterSeed % 1000) / 1000 - 0.5) * 0.05;
    const jitterLng = (((jitterSeed >> 10) % 1000) / 1000 - 0.5) * 0.05;

    return {
      lat: base.lat + jitterLat,
      lng: base.lng + jitterLng,
      validated: Boolean(BASE_COORDS[key]),
    };
  },

  async suggestDestinations(query: string): Promise<DestinationSuggestion[]> {
    const normalized = query.trim().toLowerCase();
    if (normalized.length < 2) return [];
    return MOCK_DESTINATIONS.filter((d) => d.mainText.toLowerCase().startsWith(normalized)).slice(0, 8);
  },

  async geocodeDestination(destination: string): Promise<GeoPoint | null> {
    const key = destination.trim().toLowerCase();
    return BASE_COORDS[key] ?? null;
  },
};

interface PlacesTextSearchResponse {
  places?: Array<{
    location?: { latitude: number; longitude: number };
    displayName?: { text?: string };
  }>;
}

interface PlacesAutocompleteResponse {
  suggestions?: Array<{
    placePrediction?: {
      text?: { text?: string };
      structuredFormat?: {
        mainText?: { text?: string };
        secondaryText?: { text?: string };
      };
    };
  }>;
}

/**
 * Real location validation + destination autocomplete via the Google
 * Places API (New) — Text Search and Autocomplete endpoints, respectively
 * (spec section 6.1). Requires GOOGLE_PLACES_API_KEY; selected when
 * USE_MOCKS=false.
 */
export const googlePlacesService: PlacesService = {
  async validateLocation(locationName, destination, near): Promise<ValidatedLocation | null> {
    if (!locationName) return null;

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_PLACES_API_KEY is not set");
    }

    const body: Record<string, unknown> = {
      textQuery: `${locationName}, ${destination}`,
      maxResultCount: 1,
    };
    if (near) {
      body.locationBias = {
        circle: { center: { latitude: near.lat, longitude: near.lng }, radius: LOCATION_BIAS_RADIUS_METERS },
      };
    }

    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.location,places.displayName",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Google Places request failed with status ${res.status}`);
    }

    const data = (await res.json()) as PlacesTextSearchResponse;
    const place = data.places?.[0];
    const location = place?.location;
    if (!location) {
      // Not found — no coordinates, not (0, 0). A fake origin-point
      // "match" is worse than no match: it silently corrupts map centering
      // and any distance-based logic downstream.
      return { validated: false };
    }

    const match: GeoPoint = { lat: location.latitude, lng: location.longitude };
    if (near && haversineKm(near, match) > MAX_PLAUSIBLE_DISTANCE_KM) {
      // Google found *a* place with this name, but it's implausibly far from
      // the destination (e.g. a same-named place in a different state/country) —
      // treat it as a non-match rather than plotting a wrong pin.
      return { validated: false };
    }

    // The LLM's guessed name can be wrong even when Google's match is real and
    // correctly located (e.g. it invented "Padre Atilio Library" for what is
    // actually "Biblioteca Municipal 'Martinico Prado'") — Google's own name
    // for the place it found is the trustworthy one, so prefer it.
    return { lat: match.lat, lng: match.lng, validated: true, matchedName: place?.displayName?.text };
  },

  async suggestDestinations(query: string): Promise<DestinationSuggestion[]> {
    if (query.trim().length < 2) return [];

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_PLACES_API_KEY is not set");
    }

    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
      },
      body: JSON.stringify({ input: query, includedPrimaryTypes: ["locality"] }),
    });

    if (!res.ok) {
      throw new Error(`Google Places autocomplete request failed with status ${res.status}`);
    }

    const data = (await res.json()) as PlacesAutocompleteResponse;
    return (data.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => Boolean(p?.text?.text))
      .map((p) => ({
        description: p.text!.text!,
        mainText: p.structuredFormat?.mainText?.text ?? p.text!.text!,
        secondaryText: p.structuredFormat?.secondaryText?.text,
      }))
      .slice(0, 8);
  },

  async geocodeDestination(destination: string): Promise<GeoPoint | null> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_PLACES_API_KEY is not set");
    }

    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.location",
      },
      body: JSON.stringify({ textQuery: destination, maxResultCount: 1 }),
    });

    if (!res.ok) {
      throw new Error(`Google Places request failed with status ${res.status}`);
    }

    const data = (await res.json()) as PlacesTextSearchResponse;
    const location = data.places?.[0]?.location;
    return location ? { lat: location.latitude, lng: location.longitude } : null;
  },
};

export const placesService: PlacesService =
  process.env.USE_MOCKS === "false" ? googlePlacesService : mockPlacesService;
