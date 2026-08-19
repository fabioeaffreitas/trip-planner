import { describe, expect, it } from "vitest";
import type { ItineraryEvent } from "@prisma/client";
import { groupByDay } from "../src/utils/groupByDay";

function makeEvent(overrides: Partial<ItineraryEvent>): ItineraryEvent {
  return {
    id: overrides.id ?? "event-id",
    tripId: "trip-id",
    eventType: "ACTIVITY",
    title: "Test event",
    description: null,
    locationName: null,
    locationLat: null,
    locationLng: null,
    locationValidated: null,
    startTime: null,
    endTime: null,
    notifyWhatsapp: false,
    estimatedPriceLabel: null,
    bookingUrl: null,
    tripAdvisorRating: null,
    tripAdvisorReviewCount: null,
    tripAdvisorPriceLevel: null,
    tripAdvisorUrl: null,
    notes: null,
    alternatives: null,
    ...overrides,
  };
}

describe("groupByDay", () => {
  it("groups events by calendar day of startTime", () => {
    const events = [
      makeEvent({ id: "1", startTime: new Date("2026-09-01T09:00:00Z") }),
      makeEvent({ id: "2", startTime: new Date("2026-09-01T19:00:00Z") }),
      makeEvent({ id: "3", startTime: new Date("2026-09-02T09:00:00Z") }),
    ];

    const days = groupByDay(events);

    expect(days).toHaveLength(2);
    expect(days[0].date).toBe("2026-09-01");
    expect(days[0].events).toHaveLength(2);
    expect(days[1].date).toBe("2026-09-02");
    expect(days[1].events).toHaveLength(1);
  });

  it("sorts events within a day by startTime and days chronologically", () => {
    const events = [
      makeEvent({ id: "late", startTime: new Date("2026-09-01T19:00:00Z") }),
      makeEvent({ id: "early", startTime: new Date("2026-09-01T09:00:00Z") }),
    ];

    const days = groupByDay(events);
    expect(days[0].events.map((e) => e.id)).toEqual(["early", "late"]);
  });

  it("buckets events without a startTime under 'unscheduled', sorted last", () => {
    const events = [
      makeEvent({ id: "scheduled", startTime: new Date("2026-09-01T09:00:00Z") }),
      makeEvent({ id: "unscheduled", startTime: null }),
    ];

    const days = groupByDay(events);
    expect(days[days.length - 1].date).toBe("unscheduled");
    expect(days[days.length - 1].events.map((e) => e.id)).toEqual(["unscheduled"]);
  });
});
