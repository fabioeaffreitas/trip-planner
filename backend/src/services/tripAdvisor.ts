import type { TripAdvisorCandidate } from "../types";
import { budgetToPriceLevels } from "../utils/budget";

export type TripAdvisorCategory = "restaurants" | "attractions" | "hotels";

export interface SearchTopRatedParams {
  destination: string;
  category: TripAdvisorCategory;
  budget?: unknown;
  limit?: number;
}

export interface TripAdvisorService {
  searchTopRated(params: SearchTopRatedParams): Promise<TripAdvisorCandidate[]>;
}

interface MockPlace {
  name: string;
  rating: number;
  numReviews: number;
  priceLevel: string;
}

const MOCK_RESTAURANTS: Record<string, MockPlace[]> = {
  paris: [
    { name: "Le Comptoir du Relais", rating: 4.6, numReviews: 3200, priceLevel: "$$" },
    { name: "Septime", rating: 4.7, numReviews: 1800, priceLevel: "$$$" },
    { name: "L'Ami Jean", rating: 4.5, numReviews: 2600, priceLevel: "$$" },
    { name: "Bistrot Paul Bert", rating: 4.4, numReviews: 2100, priceLevel: "$$" },
    { name: "Le Jules Verne", rating: 4.3, numReviews: 4200, priceLevel: "$$$$" },
    { name: "Chez L'Ami Louis", rating: 4.2, numReviews: 900, priceLevel: "$$$" },
    { name: "Breizh Café", rating: 4.5, numReviews: 3800, priceLevel: "$" },
    { name: "L'As du Fallafel", rating: 4.4, numReviews: 5100, priceLevel: "$" },
  ],
};

const MOCK_ATTRACTIONS: Record<string, MockPlace[]> = {
  paris: [
    { name: "Louvre Museum", rating: 4.7, numReviews: 150000, priceLevel: "$$" },
    { name: "Eiffel Tower", rating: 4.6, numReviews: 180000, priceLevel: "$$" },
    { name: "Musée d'Orsay", rating: 4.7, numReviews: 45000, priceLevel: "$$" },
    { name: "Notre-Dame Cathedral", rating: 4.6, numReviews: 90000, priceLevel: "$" },
    { name: "Sainte-Chapelle", rating: 4.6, numReviews: 12000, priceLevel: "$" },
    { name: "Musée de l'Orangerie", rating: 4.6, numReviews: 8000, priceLevel: "$" },
    { name: "Arc de Triomphe", rating: 4.5, numReviews: 60000, priceLevel: "$" },
    { name: "Palace of Versailles", rating: 4.6, numReviews: 70000, priceLevel: "$$$" },
  ],
};

const MOCK_HOTELS: Record<string, MockPlace[]> = {
  paris: [
    { name: "Hôtel Plaza Athénée", rating: 4.8, numReviews: 4200, priceLevel: "$$$$" },
    { name: "Le Marais Boutique Hotel", rating: 4.5, numReviews: 2100, priceLevel: "$$$" },
    { name: "Hôtel des Grands Boulevards", rating: 4.4, numReviews: 1600, priceLevel: "$$" },
    { name: "Generator Paris", rating: 4.1, numReviews: 5300, priceLevel: "$" },
  ],
};

function filterAndRank(places: MockPlace[], budget: unknown, limit: number): TripAdvisorCandidate[] {
  const allowedPriceLevels = budgetToPriceLevels(budget);
  const filtered = allowedPriceLevels
    ? places.filter((p) => allowedPriceLevels.includes(p.priceLevel))
    : places;

  const source = filtered.length > 0 ? filtered : places;

  return [...source]
    .sort((a, b) => b.rating - a.rating || b.numReviews - a.numReviews)
    .slice(0, limit)
    .map((p) => ({ name: p.name, rating: p.rating, numReviews: p.numReviews, priceLevel: p.priceLevel }));
}

/**
 * Deterministic stand-in for the real TripAdvisor Content API. Same
 * interface as the real implementation so swapping it in later is a
 * one-line change (USE_MOCKS=false).
 */
export const mockTripAdvisorService: TripAdvisorService = {
  async searchTopRated({ destination, category, budget, limit = 8 }): Promise<TripAdvisorCandidate[]> {
    // Match on the city name only (before the first comma) — the app's
    // destination autocomplete produces values like "Paris, France", which
    // wouldn't hit a "paris" table key on an exact match.
    const key = destination.split(",")[0].trim().toLowerCase();
    const table = category === "restaurants" ? MOCK_RESTAURANTS : category === "hotels" ? MOCK_HOTELS : MOCK_ATTRACTIONS;
    const places = table[key];
    // No generic filler fallback: a destination without curated mock data
    // returns no candidates, rather than a fake "real" match. Filler entries
    // (e.g. "City History Museum") aren't actually better than an
    // interest-based pick, but would unconditionally override one anyway
    // (see llm.ts's `candidate?.name ?? title`) — silencing the interest
    // system for every destination except the few hardcoded here.
    if (!places) return [];
    return filterAndRank(places, budget, limit);
  },
};

interface TripAdvisorSearchResponse {
  data?: Array<{ location_id: string; name: string }>;
}

interface TripAdvisorDetailsResponse {
  name?: string;
  rating?: string;
  num_reviews?: string;
  price_level?: string;
  web_url?: string;
}

/**
 * Real implementation via the TripAdvisor Content API: Location Search to
 * find candidates in the destination, then Location Details (in parallel)
 * to get rating/price_level/review count/url for ranking and budget
 * filtering. Requires TRIPADVISOR_API_KEY; selected when USE_MOCKS=false.
 */
export const tripAdvisorApiService: TripAdvisorService = {
  async searchTopRated({ destination, category, budget, limit = 8 }): Promise<TripAdvisorCandidate[]> {
    const apiKey = process.env.TRIPADVISOR_API_KEY;
    if (!apiKey) {
      throw new Error("TRIPADVISOR_API_KEY is not set");
    }

    const searchParams = new URLSearchParams({
      key: apiKey,
      searchQuery: destination,
      category,
      language: "en",
    });
    const searchRes = await fetch(`https://api.content.tripadvisor.com/api/v1/location/search?${searchParams}`, {
      headers: { Accept: "application/json" },
    });
    if (!searchRes.ok) {
      throw new Error(`TripAdvisor search request failed with status ${searchRes.status}`);
    }
    const searchData = (await searchRes.json()) as TripAdvisorSearchResponse;
    const locationIds = (searchData.data ?? []).slice(0, Math.max(limit * 2, 10)).map((d) => d.location_id);

    const details = await Promise.all(
      locationIds.map(async (id) => {
        const detailParams = new URLSearchParams({ key: apiKey, language: "en", currency: "USD" });
        const res = await fetch(`https://api.content.tripadvisor.com/api/v1/location/${id}/details?${detailParams}`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return null;
        return (await res.json()) as TripAdvisorDetailsResponse;
      })
    );

    const candidates: (TripAdvisorCandidate & { priceLevel?: string })[] = details
      .filter((d): d is TripAdvisorDetailsResponse => d !== null && Boolean(d.name))
      .map((d) => ({
        name: d.name!,
        rating: d.rating ? Number(d.rating) : undefined,
        numReviews: d.num_reviews ? Number(d.num_reviews) : undefined,
        priceLevel: d.price_level,
        webUrl: d.web_url,
      }));

    const allowedPriceLevels = budgetToPriceLevels(budget);
    const filtered = allowedPriceLevels
      ? candidates.filter((c) => c.priceLevel && allowedPriceLevels.includes(c.priceLevel))
      : candidates;
    const source = filtered.length > 0 ? filtered : candidates;

    return source
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.numReviews ?? 0) - (a.numReviews ?? 0))
      .slice(0, limit);
  },
};

export const tripAdvisorService: TripAdvisorService =
  process.env.USE_MOCKS === "false" ? tripAdvisorApiService : mockTripAdvisorService;
