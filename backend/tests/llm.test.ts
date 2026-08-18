import { describe, expect, it } from "vitest";
import { mockLlmService } from "../src/services/llm";

describe("mockLlmService.generateItinerary", () => {
  it("generates events for every day in the trip range, all within range", async () => {
    const startDate = new Date("2026-09-01");
    const endDate = new Date("2026-09-03");

    const events = await mockLlmService.generateItinerary({
      destinations: ["Paris"],
      startDate,
      endDate,
      preferences: { interests: ["food"] },
    });

    expect(events.length).toBeGreaterThan(0);

    const rangeStart = startDate.getTime();
    const rangeEnd = endDate.getTime() + 24 * 60 * 60 * 1000;
    for (const event of events) {
      expect(event.startTime.getTime()).toBeGreaterThanOrEqual(rangeStart);
      expect(event.startTime.getTime()).toBeLessThan(rangeEnd);
    }
  });

  it("includes accommodation check-in on day 1 and check-out on the last day", async () => {
    const events = await mockLlmService.generateItinerary({
      destinations: ["Rome"],
      startDate: new Date("2026-10-01"),
      endDate: new Date("2026-10-04"),
    });

    const accommodationEvents = events.filter((e) => e.eventType === "ACCOMMODATION");
    expect(accommodationEvents.length).toBe(2);
    expect(accommodationEvents.some((e) => e.title.toLowerCase().includes("check-in"))).toBe(true);
    expect(accommodationEvents.some((e) => e.title.toLowerCase().includes("check-out"))).toBe(true);
  });

  it("covers the expected spread of event types", async () => {
    const events = await mockLlmService.generateItinerary({
      destinations: ["Tokyo"],
      startDate: new Date("2026-11-01"),
      endDate: new Date("2026-11-02"),
    });

    const types = new Set(events.map((e) => e.eventType));
    expect(types.has("TRANSPORT")).toBe(true);
    expect(types.has("ACCOMMODATION")).toBe(true);
    expect(types.has("DINING")).toBe(true);
    expect(types.has("ACTIVITY")).toBe(true);
  });

  it("uses TripAdvisor candidates for DINING/ACTIVITY locationName when provided", async () => {
    const events = await mockLlmService.generateItinerary({
      destinations: ["Berlin"],
      startDate: new Date("2026-12-01"),
      endDate: new Date("2026-12-01"),
      restaurantCandidatesByDestination: { Berlin: [{ name: "Candidate Restaurant" }] },
      attractionCandidatesByDestination: { Berlin: [{ name: "Candidate Museum" }] },
    });

    const dining = events.filter((e) => e.eventType === "DINING");
    const activities = events.filter((e) => e.eventType === "ACTIVITY");

    expect(dining.every((e) => e.locationName === "Candidate Restaurant")).toBe(true);
    expect(activities.every((e) => e.locationName === "Candidate Museum")).toBe(true);
  });

  it("favors family-friendly activities and adds a kids tip when children are traveling", async () => {
    const withKids = await mockLlmService.generateItinerary({
      destinations: ["Lisbon"],
      startDate: new Date("2026-07-01"),
      endDate: new Date("2026-07-01"),
      preferences: { travelers: { adults: 2, children: 2, childrenAges: ["4", "8"] } },
    });

    const activities = withKids.filter((e) => e.eventType === "ACTIVITY");
    const familyKeywords = ["park", "playground", "children's", "science museum", "zoo", "aquarium"];
    expect(activities.some((e) => familyKeywords.some((k) => e.title.toLowerCase().includes(k)))).toBe(true);
    expect(withKids.some((e) => e.eventType === "TIP" && e.title.toLowerCase().includes("kids"))).toBe(true);

    const withoutKids = await mockLlmService.generateItinerary({
      destinations: ["Lisbon"],
      startDate: new Date("2026-07-01"),
      endDate: new Date("2026-07-01"),
    });
    expect(withoutKids.some((e) => e.eventType === "TIP" && e.title.toLowerCase().includes("kids"))).toBe(false);
  });

  it("splits days across multiple destinations and adds transport between them", async () => {
    const events = await mockLlmService.generateItinerary({
      destinations: ["Paris", "Rome"],
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-09-04"), // 4 days -> 2 + 2
    });

    // Arrival into the first destination, one transfer between destinations, departure from the last.
    const transport = events.filter((e) => e.eventType === "TRANSPORT");
    expect(transport.some((e) => e.title.toLowerCase().includes("arrival in paris"))).toBe(true);
    expect(transport.some((e) => e.title.toLowerCase().includes("paris to rome"))).toBe(true);
    expect(transport.some((e) => e.title.toLowerCase().includes("departure from rome"))).toBe(true);

    // A check-in/check-out pair for each destination (2 destinations -> 4 accommodation events total).
    const accommodation = events.filter((e) => e.eventType === "ACCOMMODATION");
    expect(accommodation.length).toBe(4);

    // Every event still falls within the overall trip range.
    const rangeStart = new Date("2026-09-01").getTime();
    const rangeEnd = new Date("2026-09-04").getTime() + 24 * 60 * 60 * 1000;
    for (const event of events) {
      expect(event.startTime.getTime()).toBeGreaterThanOrEqual(rangeStart);
      expect(event.startTime.getTime()).toBeLessThan(rangeEnd);
    }

    // Every event is tagged with one of the trip's actual destinations —
    // this is what lets Places validation avoid matching, e.g., a Rome
    // landmark to a same-themed place in Paris. See trips.service.ts.
    expect(events.every((e) => e.destination === "Paris" || e.destination === "Rome")).toBe(true);
    const parisActivity = events.find((e) => e.eventType === "ACTIVITY" && e.destination === "Paris");
    const romeActivity = events.find((e) => e.eventType === "ACTIVITY" && e.destination === "Rome");
    expect(parisActivity).toBeDefined();
    expect(romeActivity).toBeDefined();
  });
});
