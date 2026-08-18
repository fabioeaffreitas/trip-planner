import { describe, expect, it } from "vitest";
import { mockPlacesService } from "../src/services/places";

describe("mockPlacesService.validateLocation", () => {
  it("returns null for an undefined location name", async () => {
    const result = await mockPlacesService.validateLocation(undefined, "Paris");
    expect(result).toBeNull();
  });

  it("returns deterministic coordinates for the same input", async () => {
    const a = await mockPlacesService.validateLocation("Central Paris Hotel", "Paris");
    const b = await mockPlacesService.validateLocation("Central Paris Hotel", "Paris");
    expect(a).toEqual(b);
  });

  it("returns different coordinates for different location names in the same city", async () => {
    const a = await mockPlacesService.validateLocation("Central Paris Hotel", "Paris");
    const b = await mockPlacesService.validateLocation("Paris bistro", "Paris");
    expect(a).not.toEqual(b);
  });

  it("marks known destinations as validated and unknown ones as not", async () => {
    const known = await mockPlacesService.validateLocation("Some place", "Paris");
    const unknown = await mockPlacesService.validateLocation("Some place", "Nowhereville");
    expect(known?.validated).toBe(true);
    expect(unknown?.validated).toBe(false);
  });
});

describe("mockPlacesService.suggestDestinations", () => {
  it("returns disambiguated suggestions for an ambiguous city name", async () => {
    const results = await mockPlacesService.suggestDestinations("Paris");
    expect(results.length).toBeGreaterThan(1);
    expect(results.some((r) => r.description === "Paris, France")).toBe(true);
    expect(results.some((r) => r.description === "Paris, TX, USA")).toBe(true);
  });

  it("is case-insensitive and matches by prefix", async () => {
    const results = await mockPlacesService.suggestDestinations("lon");
    expect(results.some((r) => r.mainText === "London")).toBe(true);
  });

  it("returns nothing for a query shorter than 2 characters", async () => {
    const results = await mockPlacesService.suggestDestinations("p");
    expect(results).toEqual([]);
  });

  it("returns nothing for a query with no matches", async () => {
    const results = await mockPlacesService.suggestDestinations("zzzznotarealcity");
    expect(results).toEqual([]);
  });
});

describe("mockPlacesService.geocodeDestination", () => {
  it("returns coordinates for a known destination", async () => {
    const result = await mockPlacesService.geocodeDestination("Paris");
    expect(result).toEqual({ lat: 48.8566, lng: 2.3522 });
  });

  it("returns null for an unknown destination", async () => {
    const result = await mockPlacesService.geocodeDestination("Nowhereville");
    expect(result).toBeNull();
  });
});
