import type { EventType } from "@prisma/client";

export interface AuthedRequestUser {
  userId: string;
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export interface TripAdvisorCandidate {
  name: string;
  rating?: number;
  numReviews?: number;
  priceLevel?: string;
  webUrl?: string;
}

export interface ItineraryInput {
  /** One or more destinations, in visiting order. A single-destination trip is just a length-1 array. */
  destinations: string[];
  startDate: Date;
  endDate: Date;
  preferences?: Record<string, unknown> | null;
  /** Real, budget-filtered, top-rated restaurants from TripAdvisor, keyed by destination — the LLM should prefer these for DINING events in that destination. */
  restaurantCandidatesByDestination?: Record<string, TripAdvisorCandidate[]>;
  /** Real, budget-filtered, top-rated attractions from TripAdvisor, keyed by destination — the LLM should prefer these for ACTIVITY events in that destination. */
  attractionCandidatesByDestination?: Record<string, TripAdvisorCandidate[]>;
}

export interface GeneratedEvent {
  eventType: EventType;
  title: string;
  description?: string;
  locationName?: string;
  startTime: Date;
  endTime?: Date;
  /** Rough entry-ticket price estimate, e.g. "€20-€30" or "Free". ACTIVITY events only. Not authoritative. */
  estimatedPriceLabel?: string;
  /**
   * Which of the trip's destinations this event belongs to (one of ItineraryInput.destinations,
   * verbatim where possible). Required for correct Places validation on multi-destination trips —
   * without it, a same-named-but-wrong-city landmark (e.g. Paris's own "Arènes de Lutèce" arena
   * matching a search for "the Colosseum") can pass a same-country distance check undetected.
   */
  destination?: string;
}

export interface ValidatedLocation {
  /** Absent when the location couldn't be found or was rejected as implausibly far from the destination. */
  lat?: number;
  lng?: number;
  validated: boolean;
  /** Google's own name for the matched place — the LLM's guessed name can be wrong even when the match is real; prefer this when present. */
  matchedName?: string;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export {};
