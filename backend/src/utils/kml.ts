import type { ItineraryEvent } from "@prisma/client";
import type { DayGroup } from "./groupByDay";

interface KmlTrip {
  destinations: unknown;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatTime(value: Date | null): string {
  if (!value) return "";
  return value.toISOString().slice(11, 16);
}

function folderLabel(date: string): string {
  return date === "unscheduled" ? "Unscheduled" : date;
}

function buildPlacemark(event: ItineraryEvent): string | null {
  if (typeof event.locationLat !== "number" || typeof event.locationLng !== "number") {
    return null;
  }

  const descriptionLines = [event.eventType, formatTime(event.startTime), event.locationName, event.notes].filter(
    (line): line is string => Boolean(line)
  );

  return `      <Placemark>
        <name>${escapeXml(event.title)}</name>
        <description>${escapeXml(descriptionLines.join(" — "))}</description>
        <Point>
          <coordinates>${event.locationLng},${event.locationLat},0</coordinates>
        </Point>
      </Placemark>`;
}

/**
 * Builds a KML document (one Folder per day, one Placemark per located event)
 * for import into Google My Maps (mymaps.google.com → Import) — Google has no
 * public API for writing directly into a user's Saved Places lists, so this
 * file is the practical way to turn a trip's pins into a real, saved,
 * shareable Google Maps list.
 */
export function buildTripKml(trip: KmlTrip, days: DayGroup[]): string {
  const destinationLabel = Array.isArray(trip.destinations) ? trip.destinations.join(" + ") : "Trip";

  const folders = days
    .map((day) => {
      const placemarks = day.events.map(buildPlacemark).filter((p): p is string => p !== null);
      if (placemarks.length === 0) return null;
      return `    <Folder>
      <name>${escapeXml(folderLabel(day.date))}</name>
${placemarks.join("\n")}
    </Folder>`;
    })
    .filter((f): f is string => f !== null);

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(destinationLabel)}</name>
${folders.join("\n")}
  </Document>
</kml>
`;
}
