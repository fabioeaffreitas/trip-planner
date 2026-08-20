"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { apiFetch, apiFetchBlob, ApiError } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import type { ItineraryEvent, TripDetail } from "@/lib/types";

// Leaflet touches `window` at import time, so it can't be part of the
// server-rendered bundle for this client component.
const TripMap = dynamic(() => import("./TripMap"), { ssr: false });

const POLL_INTERVAL_MS = 2000;

function formatTime(value?: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function toDatetimeLocal(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EventCard({
  event,
  onSave,
}: {
  event: ItineraryEvent;
  onSave: (id: string, startTime: string, endTime: string, notes: string, notifyWhatsapp: boolean) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [startTime, setStartTime] = useState(toDatetimeLocal(event.startTime));
  const [endTime, setEndTime] = useState(toDatetimeLocal(event.endTime));
  const [notes, setNotes] = useState(event.notes ?? "");
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(event.notifyWhatsapp);
  const [saving, setSaving] = useState(false);

  return (
    <div className="event-card">
      <div>
        <strong>{event.title}</strong> <span className="event-meta">({event.eventType})</span>
      </div>
      {event.description && <div className="event-meta">{event.description}</div>}
      {event.locationName && <div className="event-meta">📍 {event.locationName}</div>}
      {event.locationName && event.locationValidated === false && (
        <div className="event-meta warning-text">
          ⚠️ Location not independently verified — this place may not exist as named.
        </div>
      )}
      {event.estimatedPriceLabel && <div className="event-meta">💶 {event.estimatedPriceLabel} (estimate — verify before booking)</div>}
      {(event.tripAdvisorRating || event.tripAdvisorPriceLevel) && (
        <div className="event-meta">
          {event.tripAdvisorRating && `⭐ ${event.tripAdvisorRating}`}
          {event.tripAdvisorReviewCount ? ` (${event.tripAdvisorReviewCount.toLocaleString()} reviews)` : ""}
          {event.tripAdvisorPriceLevel ? ` · ${event.tripAdvisorPriceLevel}` : ""}
        </div>
      )}
      {(event.bookingUrl || event.tripAdvisorUrl) && (
        <div className="event-meta">
          {event.bookingUrl && (
            <a href={event.bookingUrl} target="_blank" rel="noopener noreferrer">
              {event.eventType === "ACCOMMODATION" ? "Book on Booking.com ↗" : "Book on GetYourGuide ↗"}
            </a>
          )}
          {event.bookingUrl && event.tripAdvisorUrl && " · "}
          {event.tripAdvisorUrl && (
            <a href={event.tripAdvisorUrl} target="_blank" rel="noopener noreferrer">
              View on TripAdvisor ↗
            </a>
          )}
        </div>
      )}
      {event.alternatives && event.alternatives.length > 0 && (
        <div className="event-meta">
          Other options nearby:
          <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>
            {event.alternatives.map((alt) => (
              <li key={alt.name}>
                {alt.webUrl ? (
                  <a href={alt.webUrl} target="_blank" rel="noopener noreferrer">
                    {alt.name}
                  </a>
                ) : (
                  alt.name
                )}
                {alt.rating ? ` — ⭐ ${alt.rating}` : ""}
                {alt.priceLevel ? ` · ${alt.priceLevel}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!editing && event.notes && <div className="event-meta">📝 {event.notes}</div>}
      {!editing && event.notifyWhatsapp && (
        <div className="event-meta">{event.whatsappNotifiedAt ? "✅ WhatsApp reminder sent" : "🔔 WhatsApp reminder set"}</div>
      )}

      {!editing && (
        <div className="event-meta">
          {formatTime(event.startTime)}
          {event.endTime ? ` – ${formatTime(event.endTime)}` : ""}{" "}
          <button className="secondary" onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
      )}

      {editing && (
        <div className="field">
          <label>Start time</label>
          <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <label>End time</label>
          <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          <label>Notes</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. book ahead, ask for a window seat"
          />
          <label style={{ display: "block", fontWeight: 400, marginTop: "0.5rem" }}>
            <input
              type="checkbox"
              checked={notifyWhatsapp}
              onChange={(e) => setNotifyWhatsapp(e.target.checked)}
              style={{ width: "auto", marginRight: "0.5rem" }}
            />
            Remind me on WhatsApp
          </label>
          <div style={{ marginTop: "0.5rem" }}>
            <button
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                await onSave(event.id, startTime, endTime, notes, notifyWhatsapp);
                setSaving(false);
                setEditing(false);
              }}
            >
              {saving ? "Saving..." : "Save"}
            </button>{" "}
            <button className="secondary" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TripDetailPage() {
  const { ready } = useRequireAuth();
  const params = useParams<{ id: string }>();
  const tripId = params.id;

  const [detail, setDetail] = useState<TripDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<TripDetail>(`/trips/${tripId}`);
      setDetail(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load trip");
    }
  }, [tripId]);

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, load]);

  useEffect(() => {
    if (!detail || detail.trip.status !== "GENERATING") return;
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [detail, load]);

  async function handleSaveEvent(id: string, startTime: string, endTime: string, notes: string, notifyWhatsapp: boolean) {
    await apiFetch(`/events/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        startTime: startTime ? new Date(startTime).toISOString() : undefined,
        endTime: endTime ? new Date(endTime).toISOString() : undefined,
        notes: notes || undefined,
        notifyWhatsapp,
      }),
    });
    await load();
  }

  async function handleExportKml() {
    const blob = await apiFetchBlob(`/trips/${tripId}/export.kml`);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `trip-${tripId}.kml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  if (!ready) return null;
  if (error) return <p className="error-text">{error}</p>;
  if (!detail) return <p>Loading...</p>;

  const { trip, days, tips, transportAdvice } = detail;

  return (
    <div>
      <Link href="/trips">&larr; Back to trips</Link>
      <div className="top-nav">
        <h1>{trip.destinations.join(" + ")}</h1>
        <span className={`status-badge status-${trip.status}`}>{trip.status}</span>
      </div>
      <p className="event-meta">
        {trip.startDate.slice(0, 10)} — {trip.endDate.slice(0, 10)}
      </p>

      {trip.status === "GENERATING" && <p>Generating your itinerary...</p>}
      {trip.status === "FAILED" && <p className="error-text">Itinerary generation failed. Try creating a new trip.</p>}

      {trip.status === "READY" && (
        <>
          <div className="day-group">
            <button className="secondary" onClick={handleExportKml}>
              Download for Google Maps
            </button>
            <p className="event-meta">Import this file at mymaps.google.com to create your own Google Maps list.</p>
            <TripMap events={days.flatMap((d) => d.events)} />
          </div>

          {days
            .filter((day) => day.date !== "unscheduled")
            .map((day) => (
              <div key={day.date} className="day-group">
                <h2>{day.date}</h2>
                {day.events.map((event) => (
                  <EventCard key={event.id} event={event} onSave={handleSaveEvent} />
                ))}
              </div>
            ))}

          {transportAdvice.length > 0 && (
            <div className="day-group">
              <h3>Transport advice</h3>
              {transportAdvice.map((event) => (
                <EventCard key={event.id} event={event} onSave={handleSaveEvent} />
              ))}
            </div>
          )}

          {tips.length > 0 && (
            <div className="day-group">
              <h3>Tips</h3>
              {tips.map((event) => (
                <EventCard key={event.id} event={event} onSave={handleSaveEvent} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
