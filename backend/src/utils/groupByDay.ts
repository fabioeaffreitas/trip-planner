import type { ItineraryEvent } from "@prisma/client";

export interface DayGroup {
  date: string;
  events: ItineraryEvent[];
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Groups a flat list of itinerary events by calendar day (based on startTime).
 * Events without a startTime are grouped under "unscheduled".
 * Pure function — no I/O, safe to unit test directly.
 */
export function groupByDay(events: ItineraryEvent[]): DayGroup[] {
  const groups = new Map<string, ItineraryEvent[]>();

  for (const event of events) {
    const key = event.startTime ? dateKey(event.startTime) : "unscheduled";
    const list = groups.get(key) ?? [];
    list.push(event);
    groups.set(key, list);
  }

  for (const list of groups.values()) {
    list.sort((a, b) => {
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return a.startTime.getTime() - b.startTime.getTime();
    });
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => {
      if (a === "unscheduled") return 1;
      if (b === "unscheduled") return -1;
      return a.localeCompare(b);
    })
    .map(([date, dayEvents]) => ({ date, events: dayEvents }));
}
