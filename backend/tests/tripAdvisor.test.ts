import { describe, expect, it } from "vitest";
import { mockTripAdvisorService } from "../src/services/tripAdvisor";

describe("mockTripAdvisorService.searchTopRated", () => {
  it("returns results sorted by rating descending", async () => {
    const results = await mockTripAdvisorService.searchTopRated({
      destination: "Paris",
      category: "restaurants",
    });

    expect(results.length).toBeGreaterThan(0);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].rating ?? 0).toBeGreaterThanOrEqual(results[i].rating ?? 0);
    }
  });

  it("filters by budget when recognized", async () => {
    const budgetResults = await mockTripAdvisorService.searchTopRated({
      destination: "Paris",
      category: "restaurants",
      budget: "budget",
    });

    expect(budgetResults.length).toBeGreaterThan(0);
    for (const r of budgetResults) {
      expect(r.priceLevel).toBe("$");
    }
  });

  it("returns no candidates for an unrecognized destination, rather than generic filler", async () => {
    const results = await mockTripAdvisorService.searchTopRated({
      destination: "Nowhereville",
      category: "attractions",
    });

    expect(results).toEqual([]);
  });

  it("matches on the city name when the destination includes a country/region suffix", async () => {
    const results = await mockTripAdvisorService.searchTopRated({
      destination: "Paris, France",
      category: "restaurants",
    });

    expect(results.length).toBeGreaterThan(0);
  });

  it("respects the limit parameter", async () => {
    const results = await mockTripAdvisorService.searchTopRated({
      destination: "Paris",
      category: "attractions",
      limit: 2,
    });

    expect(results.length).toBeLessThanOrEqual(2);
  });
});
