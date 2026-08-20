"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import { clearToken, useRequireAuth } from "@/lib/auth";
import type { Me, Trip } from "@/lib/types";

function WhatsAppSettings() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ user: Me }>("/auth/me").then((data) => {
      if (data.user.phoneNumber) setPhoneNumber(data.user.phoneNumber);
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await apiFetch("/auth/me", { method: "PUT", body: JSON.stringify({ phoneNumber }) });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save phone number");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="field" style={{ marginBottom: "1.5rem" }}>
      <label>WhatsApp number (for event reminders)</label>
      <input
        type="tel"
        placeholder="+15551234567"
        value={phoneNumber}
        onChange={(e) => {
          setPhoneNumber(e.target.value);
          setSaved(false);
        }}
      />
      <div style={{ marginTop: "0.5rem" }}>
        <button className="secondary" onClick={handleSave} disabled={saving || !phoneNumber}>
          {saving ? "Saving..." : "Save"}
        </button>{" "}
        {saved && <span className="event-meta">Saved.</span>}
        {error && <span className="error-text">{error}</span>}
      </div>
    </div>
  );
}

export default function TripsPage() {
  const { ready } = useRequireAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    apiFetch<{ trips: Trip[] }>("/trips")
      .then((data) => setTrips(data.trips))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load trips"))
      .finally(() => setLoading(false));
  }, [ready]);

  if (!ready) return null;

  return (
    <div>
      <div className="top-nav">
        <h1>Your trips</h1>
        <button
          className="secondary"
          onClick={() => {
            clearToken();
            window.location.href = "/login";
          }}
        >
          Sign out
        </button>
      </div>

      <WhatsAppSettings />

      <Link href="/trips/new">
        <button>New trip</button>
      </Link>

      {loading && <p>Loading...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && trips.length === 0 && <p>No trips yet. Create your first one.</p>}

      <ul className="trip-list">
        {trips.map((trip) => (
          <li key={trip.id}>
            <Link href={`/trips/${trip.id}`}>
              <strong>{trip.destinations.join(" + ")}</strong>
            </Link>{" "}
            <span className={`status-badge status-${trip.status}`}>{trip.status}</span>
            <div className="event-meta">
              {trip.startDate.slice(0, 10)} — {trip.endDate.slice(0, 10)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
