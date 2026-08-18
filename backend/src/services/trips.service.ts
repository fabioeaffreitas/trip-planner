import type { Prisma, Trip } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { llmService } from "./llm";
import { placesService } from "./places";
import { tripAdvisorService } from "./tripAdvisor";
import type { GeoPoint, TripAdvisorCandidate } from "../types";
import { groupByDay } from "../utils/groupByDay";
import { buildGetYourGuideSearchUrl } from "../utils/bookingLink";
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
 * Creates the trip row and runs generation inline (see plan: mocked LLM/Places
 * calls have no real latency today, so a queue would add complexity with no
 * payoff). If real API calls are wired in later and add latency, this function
 * can be called fire-and-forget from the controller instead — the GENERATING
 * status and the frontend's polling already support that.
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

  try {
    const budget = (input.preferences as { budget?: unknown } | null | undefined)?.budget;
    // TripAdvisor grounding is an enhancement, not a hard requirement — if it's
    // unavailable (no key, rate limit, network error), fall back to an empty
    // candidate list for that destination rather than failing the whole trip;
    // the LLM already knows to use its own knowledge when none are provided.
    const restaurantCandidatesByDestination: Record<string, TripAdvisorCandidate[]> = {};
    const attractionCandidatesByDestination: Record<string, TripAdvisorCandidate[]> = {};
    await Promise.all(
      input.destinations.map(async (destination) => {
        const [restaurants, attractions] = await Promise.all([
          tripAdvisorService.searchTopRated({ destination, category: "restaurants", budget }).catch((err) => {
            console.warn(`TripAdvisor restaurant lookup failed for "${destination}":`, err);
            return [];
          }),
          tripAdvisorService.searchTopRated({ destination, category: "attractions", budget }).catch((err) => {
            console.warn(`TripAdvisor attraction lookup failed for "${destination}":`, err);
            return [];
          }),
        ]);
        restaurantCandidatesByDestination[destination] = restaurants;
        attractionCandidatesByDestination[destination] = attractions;
      })
    );

    const generated = await llmService.generateItinerary({
      destinations: input.destinations,
      startDate: input.startDate,
      endDate: input.endDate,
      preferences: input.preferences,
      restaurantCandidatesByDestination,
      attractionCandidatesByDestination,
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
        const bookingUrl =
          event.eventType === "ACTIVITY"
            ? buildGetYourGuideSearchUrl(`${event.locationName ?? event.title} ${eventDestination}`)
            : undefined;

        let tripAdvisorMatch: TripAdvisorCandidate | undefined;
        if (event.eventType === "DINING") {
          tripAdvisorMatch = findCandidate(restaurantCandidatesByDestination[eventDestination] ?? [], event.locationName);
        } else if (event.eventType === "ACTIVITY") {
          tripAdvisorMatch = findCandidate(attractionCandidatesByDestination[eventDestination] ?? [], event.locationName);
        }

        const tripAdvisorUrl =
          tripAdvisorMatch?.webUrl ??
          (event.eventType === "DINING" || event.eventType === "ACTIVITY"
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
        };
      })
    );

    await prisma.itineraryEvent.createMany({ data: withCoords });

    return await prisma.trip.update({ where: { id: trip.id }, data: { status: "READY" } });
  } catch (err) {
    console.error(`Itinerary generation failed for trip ${trip.id}:`, err);
    return await prisma.trip.update({ where: { id: trip.id }, data: { status: "FAILED" } });
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
