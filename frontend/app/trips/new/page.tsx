"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import type { Trip } from "@/lib/types";
import DestinationAutocompleteInput from "./DestinationAutocompleteInput";

const INTEREST_OPTIONS = ["food", "history", "art", "nature", "nightlife", "sports"];

function todayDateString(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function NewTripPage() {
  const { ready } = useRequireAuth();
  const router = useRouter();

  const [multiDestination, setMultiDestination] = useState(false);
  const [destinations, setDestinations] = useState<string[]>([""]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [budget, setBudget] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [adults, setAdults] = useState("2");
  const [children, setChildren] = useState("0");
  const [childrenAges, setChildrenAges] = useState("");
  const [arrivalMethod, setArrivalMethod] = useState<"flight" | "train" | "car">("flight");
  const [arrivalAirport, setArrivalAirport] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const todayStr = todayDateString();

  if (!ready) return null;

  function setDestinationAt(index: number, value: string) {
    setDestinations((prev) => prev.map((d, i) => (i === index ? value : d)));
  }

  function addDestination() {
    setDestinations((prev) => [...prev, ""]);
  }

  function removeDestination(index: number) {
    setDestinations((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleMultiDestination(checked: boolean) {
    setMultiDestination(checked);
    if (!checked) {
      setDestinations((prev) => [prev[0] ?? ""]);
    }
  }

  function toggleInterest(interest: string) {
    setInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanedDestinations = destinations.map((d) => d.trim()).filter(Boolean);
    if (cleanedDestinations.length === 0) {
      setError("Enter at least one destination");
      return;
    }

    setSubmitting(true);
    try {
      const numChildren = Number(children) || 0;
      const { trip } = await apiFetch<{ trip: Trip }>("/trips", {
        method: "POST",
        body: JSON.stringify({
          destinations: cleanedDestinations,
          startDate,
          endDate,
          preferences: {
            budget: budget || undefined,
            interests,
            arrival: {
              method: arrivalMethod,
              airport: arrivalMethod === "flight" && arrivalAirport.trim() ? arrivalAirport.trim() : undefined,
            },
            travelers: {
              adults: Number(adults) || 1,
              children: numChildren,
              childrenAges:
                numChildren > 0 && childrenAges.trim()
                  ? childrenAges.split(",").map((a) => a.trim()).filter(Boolean)
                  : undefined,
            },
          },
        }),
      });
      router.push(`/trips/${trip.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create trip");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1>New trip</h1>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label style={{ display: "block", fontWeight: 400 }}>
            <input
              type="checkbox"
              style={{ width: "auto", marginRight: "0.5rem" }}
              checked={multiDestination}
              onChange={(e) => toggleMultiDestination(e.target.checked)}
            />
            This trip visits multiple destinations
          </label>
        </div>

        {!multiDestination && (
          <div className="field">
            <label htmlFor="destination">Destination</label>
            <DestinationAutocompleteInput
              id="destination"
              value={destinations[0] ?? ""}
              onChange={(v) => setDestinationAt(0, v)}
              placeholder="Paris"
            />
          </div>
        )}

        {multiDestination && (
          <div className="field">
            <label>Destinations, in visiting order</label>
            {destinations.map((d, index) => (
              <div key={index} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                <div style={{ flex: 1 }}>
                  <DestinationAutocompleteInput
                    value={d}
                    onChange={(v) => setDestinationAt(index, v)}
                    placeholder={`Destination ${index + 1}`}
                  />
                </div>
                {destinations.length > 1 && (
                  <button type="button" className="secondary" onClick={() => removeDestination(index)}>
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="secondary" onClick={addDestination}>
              Add another destination
            </button>
          </div>
        )}

        <div className="field">
          <label htmlFor="startDate">Start date</label>
          <input
            id="startDate"
            type="date"
            required
            min={todayStr}
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              if (endDate && e.target.value > endDate) {
                setEndDate(e.target.value);
              }
            }}
          />
        </div>

        <div className="field">
          <label htmlFor="endDate">End date</label>
          <input
            id="endDate"
            type="date"
            required
            min={startDate || todayStr}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="arrivalMethod">Arriving by</label>
          <select
            id="arrivalMethod"
            value={arrivalMethod}
            onChange={(e) => setArrivalMethod(e.target.value as "flight" | "train" | "car")}
          >
            <option value="flight">Flight</option>
            <option value="train">Train</option>
            <option value="car">Car</option>
          </select>
        </div>

        {arrivalMethod === "flight" && (
          <div className="field">
            <label htmlFor="arrivalAirport">Arrival airport (optional)</label>
            <input
              id="arrivalAirport"
              value={arrivalAirport}
              onChange={(e) => setArrivalAirport(e.target.value)}
              placeholder="e.g. CDG, or Beauvais (BVA) — leave blank to let the planner pick"
            />
          </div>
        )}

        <div className="field">
          <label htmlFor="adults">Adults</label>
          <input
            id="adults"
            type="number"
            min={1}
            value={adults}
            onChange={(e) => setAdults(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="children">Children</label>
          <input
            id="children"
            type="number"
            min={0}
            value={children}
            onChange={(e) => setChildren(e.target.value)}
          />
        </div>

        {Number(children) > 0 && (
          <div className="field">
            <label htmlFor="childrenAges">Children&apos;s ages (optional, comma-separated)</label>
            <input
              id="childrenAges"
              value={childrenAges}
              onChange={(e) => setChildrenAges(e.target.value)}
              placeholder="e.g. 4, 8"
            />
          </div>
        )}

        <div className="field">
          <label htmlFor="budget">Budget (optional)</label>
          <input
            id="budget"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="e.g. moderate"
          />
        </div>

        <div className="field">
          <label>Interests</label>
          {INTEREST_OPTIONS.map((interest) => (
            <label key={interest} style={{ display: "block", fontWeight: 400 }}>
              <input
                type="checkbox"
                style={{ width: "auto", marginRight: "0.5rem" }}
                checked={interests.includes(interest)}
                onChange={() => toggleInterest(interest)}
              />
              {interest}
            </label>
          ))}
        </div>

        {error && <p className="error-text">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? "Generating itinerary..." : "Create trip"}
        </button>
      </form>
    </div>
  );
}
