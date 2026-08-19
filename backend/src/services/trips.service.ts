import type { Prisma, Trip } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { llmService } from "./llm";
import { placesService } from "./places";
import { tripAdvisorService } from "./tripAdvisor";
import type { GeoPoint, TripAdvisorCandidate } from "../types";
import { groupByDay } from "../utils/groupByDay";
import { buildGetYourGuideSearchUrl, buildBookingComSearchUrl } from "../utils/bookingLink";
import { buildTripAdvisorSearchUrl } from "../utils/tripAdvisorLink";
import { AppError } from "../utils/errors";

function findCandidate(candidates: TripAdvisorCandidate[], locationName: string | undefined): TripAdvisorCandidate | undefined {
  if (!locationName) return undefined;
  const normalized = locationName.trim().toLowerCase();
  return candidates.find((c) => c.name.trim().toLowerCase() === normalized);
}

export interface CreateTripInput {
  /** One or more destinations, in visiting order. */
  destinations: string[];
  startDate: Date;
  endDate: Date;
  preferences?: Record<string, unknown> | null;
}

/**
 * Creates the trip row as GENERATING and returns immediately — generation
 * itself runs fire-and-forget via generateItineraryForTrip(). This used to
 * run inline/awaited, back when only mocked calls were involved and had no
 * real latency; once real OpenAI/Places/TripAdvisor calls were wired in
 * (routinely 20-40s+ for a multi-day itinerary), that started exceeding
 * hosting-platform reverse-proxy timeouts (confirmed in production on
 * Railway: a synchronous request got killed mid-flight by the edge proxy
 * and the trip was left stuck in GENERATING forever). The frontend already
 * polls GET /api/trips/:id while status is GENERATING, so decoupling
 * generation from the request/response cycle needed no frontend change.
 */
export async function createTrip(userId: string, input: CreateTripInput): Promise<Trip> {
  const trip = await prisma.trip.create({
    data: {
      userId,
      destinations: input.destinations as Prisma.InputJsonValue,
      startDate: input.startDate,
      endDate: input.endDate,
      preferences: (input.preferences ?? undefined) as Prisma.InputJsonValue | undefined,
      status: "GENERATING",
    },
  });

  generateItineraryForTrip(trip, input).catch((err) => {
    console.error(`Unhandled error generating itinerary for trip ${trip.id}:`, err);
  });

  return trip;
}

async function generateItineraryForTrip(trip: Trip, input: CreateTripInput): Promise<void> {
  try {
    const budget = (input.preferences as { budget?: unknown } | null | undefined)?.budget;
    // TripAdvisor grounding is an enhancement, not a hard requirement — if it's
    // unavailable (no key, rate limit, network error), fall back to an empty
    // candidate list for that destination rather than failing the whole trip;
    // the LLM already knows to use its own knowledge when none are provided.
    const restaurantCandidatesByDestination: Record<string, TripAdvisorCandidate[]> = {};
    const attractionCandidatesByDestination: Record<string, TripAdvisorCandidate[]> = {};
    const hotelCandidatesByDestination: Record<string, TripAdvisorCandidate[]> = {};
    await Promise.all(
      input.destinations.map(async (destination) => {
        const [restaurants, attractions, hotels] = await Promise.all([
          tripAdvisorService.searchTopRated({ destination, category: "restaurants", budget }).catch((err) => {
            console.warn(`TripAdvisor restaurant lookup failed for "${destination}":`, err);
            return [];
          }),
          tripAdvisorService.searchTopRated({ destination, category: "attractions", budget }).catch((err) => {
            console.warn(`TripAdvisor attraction lookup failed for "${destination}":`, err);
            return [];
          }),
          tripAdvisorService.searchTopRated({ destination, category: "hotels", budget }).catch((err) => {
            console.warn(`TripAdvisor hotel lookup failed for "${destination}":`, err);
            return [];
          }),
        ]);
        restaurantCandidatesByDestination[destination] = restaurants;
        attractionCandidatesByDestination[destination] = attractions;
        hotelCandidatesByDestination[destination] = hotels;
      })
    );

    const generated = await llmService.generateItinerary({
      destinations: input.destinations,
      startDate: input.startDate,
      endDate: input.endDate,
      preferences: input.preferences,
      restaurantCandidatesByDestination,
      attractionCandidatesByDestination,
      hotelCandidatesByDestination,
    });

    // Geocode every destination once, so each event lookup can be biased
    // toward the right one and sanity-checked against it — without this, a
    // same-named place in a different city/state/country can silently
    // match and plot a wrong pin (see placesService.validateLocation).
    const destinationCoords: Record<string, GeoPoint | null> = {};
    await Promise.all(
      input.destinations.map(async (destination) => {
        destinationCoords[destination] = await placesService.geocodeDestination(destination).catch((err) => {
          console.warn(`Destination geocoding failed for "${destination}":`, err);
          return null;
        });
      })
    );

    const withCoords = await Promise.all(
      generated.map(async (event) => {
        // Every generated event is tagged with the specific destination it
        // belongs to (see llm.ts) — using that (rather than guessing across
        // all destinations) is what prevents a same-themed-but-wrong-city
        // landmark from matching (e.g. Paris's own Roman arena "winning" a
        // search for "the Colosseum" just because it's nearby and plausible).
        const eventDestination = event.destination ?? input.destinations[0];
        const location = await placesService.validateLocation(
          event.locationName,
          eventDestination,
          destinationCoords[eventDestination] ?? undefined
        );
        let bookingUrl: string | undefined;
        if (event.eventType === "ACTIVITY") {
          bookingUrl = buildGetYourGuideSearchUrl(`${event.locationName ?? event.title} ${eventDestination}`);
        } else if (event.eventType === "ACCOMMODATION") {
          bookingUrl = buildBookingComSearchUrl(`${event.locationName ?? event.title} ${eventDestination}`);
        }

        let tripAdvisorMatch: TripAdvisorCandidate | undefined;
        let alternatives: TripAdvisorCandidate[] | undefined;
        if (event.eventType === "DINING") {
          const restaurantCandidates = restaurantCandidatesByDestination[eventDestination] ?? [];
          tripAdvisorMatch = findCandidate(restaurantCandidates, event.locationName);
          // Offer the next-best-rated alternatives (already sorted by rating —
          // see tripAdvisor.ts) instead of discarding them once one is chosen,
          // so a diner who doesn't like the pick has a fallback close by.
          const chosenName = (event.locationName ?? "").trim().toLowerCase();
          alternatives = restaurantCandidates
            .filter((c) => c.name.trim().toLowerCase() !== chosenName)
            .slice(0, 2);
        } else if (event.eventType === "ACTIVITY") {
          tripAdvisorMatch = findCandidate(attractionCandidatesByDestination[eventDestination] ?? [], event.locationName);
        } else if (event.eventType === "ACCOMMODATION") {
          tripAdvisorMatch = findCandidate(hotelCandidatesByDestination[eventDestination] ?? [], event.locationName);
        }

        const tripAdvisorUrl =
          tripAdvisorMatch?.webUrl ??
          (event.eventType === "DINING" || event.eventType === "ACTIVITY" || event.eventType === "ACCOMMODATION"
            ? buildTripAdvisorSearchUrl(`${event.locationName ?? event.title} ${eventDestination}`)
            : undefined);

        return {
          tripId: trip.id,
          eventType: event.eventType,
          title: event.title,
          description: event.description,
          locationName: location?.matchedName ?? event.locationName,
          locationLat: location?.lat,
          locationLng: location?.lng,
          locationValidated: location?.validated ?? null,
          startTime: event.startTime,
          endTime: event.endTime,
          estimatedPriceLabel: event.eventType === "ACTIVITY" ? event.estimatedPriceLabel : undefined,
          bookingUrl,
          tripAdvisorRating: tripAdvisorMatch?.rating,
          tripAdvisorReviewCount: tripAdvisorMatch?.numReviews,
          tripAdvisorPriceLevel: tripAdvisorMatch?.priceLevel,
          tripAdvisorUrl,
          alternatives: alternatives?.length ? (alternatives as unknown as Prisma.InputJsonValue) : undefined,
        };
      })
    );

    await prisma.itineraryEvent.createMany({ data: withCoords });

    await prisma.trip.update({ where: { id: trip.id }, data: { status: "READY" } });
  } catch (err) {
    console.error(`Itinerary generation failed for trip ${trip.id}:`, err);
    await prisma.trip.update({ where: { id: trip.id }, data: { status: "FAILED" } });
  }
}

export async function listTrips(userId: string): Promise<Trip[]> {
  return prisma.trip.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}

export async function getTripDetail(userId: string, tripId: string) {
  const trip = await prisma.trip.findFirst({
    where: { id: tripId, userId },
    include: { events: true },
  });

  if (!trip) {
    throw new AppError(404, "Trip not found", "TRIP_NOT_FOUND");
  }

  const { events, ...tripFields } = trip;
  const days = groupByDay(events);
  const tips = events.filter((e) => e.eventType === "TIP");
  const transportAdvice = events.filter((e) => e.eventType === "TRANSPORT");

  return { trip: tripFields, days, tips, transportAdvice };
}

export interface UpdateEventInput {
  title?: string;
  description?: string;
  locationName?: string;
  startTime?: Date;
  endTime?: Date;
  notes?: string;
}

export async function updateEvent(userId: string, eventId: string, patch: UpdateEventInput) {
  const event = await prisma.itineraryEvent.findFirst({
    where: { id: eventId, trip: { userId } },
  });

  if (!event) {
    throw new AppError(404, "Event not found", "EVENT_NOT_FOUND");
  }

  return prisma.itineraryEvent.update({ where: { id: eventId }, data: patch });
}
