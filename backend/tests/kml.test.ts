import { describe, expect, it } from "vitest";
import type { ItineraryEvent } from "@prisma/client";
import { buildTripKml } from "../src/utils/kml";
import type { DayGroup } from "../src/utils/groupByDay";

function makeEvent(overrides: Partial<ItineraryEvent>): ItineraryEvent {
  return {
    id: "event-id",
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

describe("buildTripKml", () => {
  it("includes one Placemark per located event, skipping unlocated ones", () => {
    const days: DayGroup[] = [
      {
        date: "2026-09-01",
        events: [
          makeEvent({ id: "1", title: "Eiffel Tower", locationLat: 48.8584, locationLng: 2.2945 }),
          makeEvent({ id: "2", title: "No coords event" }),
        ],
      },
    ];

    const kml = buildTripKml({ destinations: ["Paris"] }, days);

    expect(kml).toContain("<Placemark>");
    expect((kml.match(/<Placemark>/g) ?? []).length).toBe(1);
    expect(kml).toContain("Eiffel Tower");
    expect(kml).not.toContain("No coords event");
    expect(kml).toContain("2.2945,48.8584,0");
  });

  it("groups placemarks into a Folder per day and escapes XML-unsafe characters", () => {
    const days: DayGroup[] = [
      {
        date: "2026-09-01",
        events: [makeEvent({ id: "1", title: "Fish & Chips", locationLat: 1, locationLng: 2 })],
      },
      {
        date: "unscheduled",
        events: [makeEvent({ id: "2", title: "Loose end", locationLat: 3, locationLng: 4 })],
      },
    ];

    const kml = buildTripKml({ destinations: ["London"] }, days);

    expect((kml.match(/<Folder>/g) ?? []).length).toBe(2);
    expect(kml).toContain("<name>2026-09-01</name>");
    expect(kml).toContain("<name>Unscheduled</name>");
    expect(kml).toContain("Fish &amp; Chips");
  });

  it("omits a day's Folder entirely when it has no located events", () => {
    const days: DayGroup[] = [{ date: "2026-09-01", events: [makeEvent({ id: "1", title: "No coords" })] }];

    const kml = buildTripKml({ destinations: ["Paris"] }, days);

    expect(kml).not.toContain("<Folder>");
  });
});
