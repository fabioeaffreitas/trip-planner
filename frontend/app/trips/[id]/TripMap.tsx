"use client";

import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ItineraryEvent } from "@/lib/types";

// react-leaflet's default marker icon references image paths that don't
// resolve correctly through Next.js's bundler — point at the CDN copies
// leaflet itself ships, instead of trying to make webpack resolve them.
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function formatDateTime(value?: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TripMap({ events }: { events: ItineraryEvent[] }) {
  const located = events.filter(
    (e): e is ItineraryEvent & { locationLat: number; locationLng: number } =>
      typeof e.locationLat === "number" && typeof e.locationLng === "number"
  );

  if (located.length === 0) {
    return <p className="event-meta">No located events to show on the map yet.</p>;
  }

  const center: [number, number] = [
    located.reduce((sum, e) => sum + e.locationLat, 0) / located.length,
    located.reduce((sum, e) => sum + e.locationLng, 0) / located.length,
  ];

  return (
    <MapContainer center={center} zoom={13} style={{ height: "400px", width: "100%", borderRadius: "6px" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {located.map((event) => (
        <Marker key={event.id} position={[event.locationLat, event.locationLng]} icon={defaultIcon}>
          <Popup>
            <strong>{event.title}</strong>
            <br />
            {event.eventType}
            {event.startTime ? ` · ${formatDateTime(event.startTime)}` : ""}
            {event.locationName ? <><br />{event.locationName}</> : null}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
