import OpenAI from "openai";
import { z } from "zod";
import type { GeneratedEvent, ItineraryInput, TripAdvisorCandidate } from "../types";

export interface LlmService {
  generateItinerary(input: ItineraryInput): Promise<GeneratedEvent[]>;
}

function dayCount(startDate: Date, endDate: Date): number {
  const ms = endDate.getTime() - startDate.getTime();
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)) + 1);
}

function atTime(day: Date, hour: number, minute = 0): Date {
  const d = new Date(day);
  d.setHours(hour, minute, 0, 0);
  return d;
}

interface DestinationBlock {
  destination: string;
  dayIndices: number[];
}

/**
 * Splits the trip's days across its destinations, in order, roughly evenly
 * (earlier destinations get any extra day). If there are more destinations
 * than days, only the first `numDays` destinations are used (one day each) —
 * a rare edge case, not worth a more elaborate allocation.
 */
function allocateDaysToDestinations(numDays: number, destinations: string[]): DestinationBlock[] {
  const usable = destinations.slice(0, Math.max(numDays, 1));
  const n = usable.length;
  const base = Math.floor(numDays / n);
  const remainder = numDays % n;
  const blocks: DestinationBlock[] = [];
  let cursor = 0;
  for (let i = 0; i < n; i++) {
    const count = base + (i < remainder ? 1 : 0);
    blocks.push({ destination: usable[i], dayIndices: Array.from({ length: count }, (_, k) => cursor + k) });
    cursor += count;
  }
  return blocks;
}

const ACTIVITY_BANK: Record<string, string[]> = {
  food: ["Guided food-market tour", "Cooking class with a local chef", "Street food crawl"],
  history: ["Old town walking tour", "Visit to the main cathedral", "Guided museum tour"],
  art: ["Contemporary art gallery visit", "Afternoon at the fine arts museum", "Street art walking tour"],
  nature: ["Sunrise hike at the nearest viewpoint", "Botanical garden stroll", "Riverside bike ride"],
  nightlife: ["Rooftop bar hopping", "Live music venue", "Night market visit"],
  default: ["Free morning to explore on foot", "Visit to the most-reviewed local landmark", "Neighborhood walking tour"],
};

const FAMILY_ACTIVITY_BANK = [
  "Visit to the local park/playground",
  "Interactive children's/science museum",
  "Zoo or aquarium visit",
];

function hasChildren(preferences: Record<string, unknown> | null | undefined): boolean {
  const travelers = (preferences as { travelers?: { children?: number } } | null | undefined)?.travelers;
  return Boolean(travelers?.children && travelers.children > 0);
}

function pickActivities(preferences: Record<string, unknown> | null | undefined, count: number): string[] {
  const interests = Array.isArray((preferences as { interests?: unknown })?.interests)
    ? ((preferences as { interests: unknown[] }).interests.filter((i) => typeof i === "string") as string[])
    : [];

  const pool = interests.length
    ? interests.flatMap((i) => ACTIVITY_BANK[i.toLowerCase()] ?? [])
    : [];

  // With kids along, lead with family-friendly picks rather than whatever
  // the interest bank would otherwise suggest first (e.g. nightlife/bars).
  const source = hasChildren(preferences)
    ? [...FAMILY_ACTIVITY_BANK, ...(pool.length ? pool : ACTIVITY_BANK.default)]
    : pool.length
      ? pool
      : ACTIVITY_BANK.default;

  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(source[i % source.length]);
  }
  return out;
}

function pickFromCandidates(
  candidates: TripAdvisorCandidate[] | undefined,
  index: number
): TripAdvisorCandidate | undefined {
  if (!candidates || candidates.length === 0) return undefined;
  return candidates[index % candidates.length];
}

/**
 * Deterministic stand-in for a real LLM call. Same interface as the eventual
 * OpenAI-backed implementation so swapping it in later is a one-line change.
 */
export const mockLlmService: LlmService = {
  async generateItinerary(input: ItineraryInput): Promise<GeneratedEvent[]> {
    const { destinations, startDate, endDate, preferences, restaurantCandidatesByDestination, attractionCandidatesByDestination } = input;
    const numDays = dayCount(startDate, endDate);
    const blocks = allocateDaysToDestinations(numDays, destinations);
    const events: GeneratedEvent[] = [];

    blocks.forEach((block, blockIndex) => {
      const { destination } = block;
      const restaurantCandidates = restaurantCandidatesByDestination?.[destination];
      const attractionCandidates = attractionCandidatesByDestination?.[destination];
      const isFirstBlock = blockIndex === 0;
      const isLastBlock = blockIndex === blocks.length - 1;
      // Every event this block generates is tagged with its destination —
      // required for correct Places validation on multi-destination trips.
      const pushEvent = (e: Omit<GeneratedEvent, "destination">) => events.push({ ...e, destination });

      block.dayIndices.forEach((i, dayInBlockIndex) => {
        const day = new Date(startDate);
        day.setDate(day.getDate() + i);
        const isFirstDayOfBlock = dayInBlockIndex === 0;
        const isLastDayOfBlock = dayInBlockIndex === block.dayIndices.length - 1;
        const isFirstDayOfTrip = isFirstBlock && isFirstDayOfBlock;
        const isLastDayOfTrip = isLastBlock && isLastDayOfBlock;

        if (isFirstDayOfTrip) {
          pushEvent({
            eventType: "TRANSPORT",
            title: `Arrival in ${destination}`,
            description: "Airport/station transfer to accommodation.",
            locationName: `${destination} International Airport`,
            startTime: atTime(day, 10, 0),
            endTime: atTime(day, 11, 30),
          });
          pushEvent({
            eventType: "ACCOMMODATION",
            title: "Check-in at hotel",
            description: "Check in and drop off luggage.",
            locationName: `Central ${destination} Hotel`,
            startTime: atTime(day, 15, 0),
            endTime: atTime(day, 15, 30),
          });
        } else if (isFirstDayOfBlock) {
          const prevDestination = blocks[blockIndex - 1].destination;
          pushEvent({
            eventType: "TRANSPORT",
            title: `Travel from ${prevDestination} to ${destination}`,
            description: "Transfer between destinations.",
            startTime: atTime(day, 9, 0),
            endTime: atTime(day, 12, 0),
          });
          pushEvent({
            eventType: "ACCOMMODATION",
            title: "Check-in at hotel",
            description: "Check in and drop off luggage.",
            locationName: `Central ${destination} Hotel`,
            startTime: atTime(day, 15, 0),
            endTime: atTime(day, 15, 30),
          });
        }

        const activities = pickActivities(preferences, isFirstDayOfBlock || isLastDayOfBlock ? 1 : 2);
        activities.forEach((title, idx) => {
          const candidate = pickFromCandidates(attractionCandidates, dayInBlockIndex * 2 + idx);
          const chosenTitle = candidate?.name ?? title;
          pushEvent({
            eventType: "ACTIVITY",
            title: chosenTitle,
            description: candidate
              ? `${chosenTitle} — top-rated on TripAdvisor.`
              : `${title} in ${destination}.`,
            locationName: chosenTitle,
            startTime: atTime(day, 9 + idx * 4, 0),
            endTime: atTime(day, 11 + idx * 4, 0),
            estimatedPriceLabel: idx % 3 === 0 ? "Free" : "€15-€30 (estimate)",
          });
        });

        const lunchCandidate = pickFromCandidates(restaurantCandidates, dayInBlockIndex * 2);
        const dinnerCandidate = pickFromCandidates(restaurantCandidates, dayInBlockIndex * 2 + 1);
        pushEvent({
          eventType: "DINING",
          title: lunchCandidate ? `Lunch at ${lunchCandidate.name}` : "Lunch at a local favorite",
          description: "Recommended lunch spot near the day's activities.",
          locationName: lunchCandidate?.name ?? `${destination} bistro`,
          startTime: atTime(day, 13, 0),
          endTime: atTime(day, 14, 0),
        });
        pushEvent({
          eventType: "DINING",
          title: dinnerCandidate ? `Dinner at ${dinnerCandidate.name}` : "Dinner reservation",
          description: "Recommended dinner spot for the evening.",
          locationName: dinnerCandidate?.name ?? `${destination} restaurant`,
          startTime: atTime(day, 19, 30),
          endTime: atTime(day, 21, 0),
        });

        if (i % 2 === 0) {
          pushEvent({
            eventType: "TIP",
            title: "Local tip",
            description: "Carry small cash for markets and street vendors; card acceptance can be inconsistent.",
            startTime: atTime(day, 8, 0),
          });
        }

        if (isFirstDayOfTrip && hasChildren(preferences)) {
          pushEvent({
            eventType: "TIP",
            title: "Traveling with kids",
            description: "Pack snacks and entertainment for downtime; build in extra buffer between activities for a family pace.",
            startTime: atTime(day, 8, 30),
          });
        }

        if (isLastDayOfTrip) {
          pushEvent({
            eventType: "ACCOMMODATION",
            title: "Check-out",
            description: "Check out of hotel before departure.",
            locationName: `Central ${destination} Hotel`,
            startTime: atTime(day, 10, 0),
            endTime: atTime(day, 10, 30),
          });
          pushEvent({
            eventType: "TRANSPORT",
            title: `Departure from ${destination}`,
            description: "Transfer to airport/station for departure.",
            locationName: `${destination} International Airport`,
            startTime: atTime(day, 17, 0),
            endTime: atTime(day, 18, 30),
          });
        } else if (isLastDayOfBlock) {
          pushEvent({
            eventType: "ACCOMMODATION",
            title: "Check-out",
            description: "Check out of hotel before traveling to the next destination.",
            locationName: `Central ${destination} Hotel`,
            startTime: atTime(day, 10, 0),
            endTime: atTime(day, 10, 30),
          });
        }
      });
    });

    return events;
  },
};

const parseableDateTime = z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), {
  message: "Invalid datetime",
});

const openAiEventSchema = z.object({
  eventType: z.enum(["ACCOMMODATION", "DINING", "TRANSPORT", "ACTIVITY", "TIP"]),
  title: z.string().min(1),
  description: z.string().optional(),
  locationName: z.string().optional(),
  startTime: parseableDateTime,
  endTime: parseableDateTime.optional(),
  estimatedPriceLabel: z.string().optional(),
  destination: z.string().optional(),
});

const openAiResponseShape = z.object({
  events: z.array(z.unknown()).min(1),
});

function dayDateStrings(startDate: Date, endDate: Date): string[] {
  const n = dayCount(startDate, endDate);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

let openAiClient: OpenAI | null = null;
function getOpenAiClient(): OpenAI {
  if (!openAiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    openAiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openAiClient;
}

/**
 * Resolves the LLM's (hopefully verbatim) "destination" tag on an event back
 * to one of the trip's actual destination strings, tolerating minor
 * deviations (e.g. it wrote "Rome" instead of "Rome, Italy"). Falls back to
 * the first destination if nothing matches, rather than leaving it unset —
 * an event with no destination can't be reliably geo-validated at all.
 */
function resolveDestination(raw: string | undefined, destinations: string[]): string {
  if (raw) {
    const normalized = raw.trim().toLowerCase();
    const exact = destinations.find((d) => d.trim().toLowerCase() === normalized);
    if (exact) return exact;
    const partial = destinations.find((d) => {
      const dNormalized = d.trim().toLowerCase();
      return dNormalized.includes(normalized) || normalized.includes(dNormalized.split(",")[0].trim());
    });
    if (partial) return partial;
  }
  return destinations[0];
}

function formatCandidates(candidates: TripAdvisorCandidate[] | undefined): string {
  if (!candidates || candidates.length === 0) return "(none provided — use your own knowledge of this destination)";
  return candidates
    .map((c) => {
      const bits = [c.rating ? `${c.rating}★` : null, c.numReviews ? `${c.numReviews} reviews` : null, c.priceLevel ?? null].filter(Boolean);
      return `- "${c.name}"${bits.length ? ` (${bits.join(", ")})` : ""}`;
    })
    .join("\n");
}

function formatDestinationSections(
  destinations: string[],
  restaurantCandidatesByDestination: Record<string, TripAdvisorCandidate[]> | undefined,
  attractionCandidatesByDestination: Record<string, TripAdvisorCandidate[]> | undefined
): string {
  return destinations
    .map(
      (destination) => `For ${destination}:
Real, top-rated restaurants matching the trip's budget (from TripAdvisor) — prefer these exact names as "locationName" for DINING events while in ${destination}:
${formatCandidates(restaurantCandidatesByDestination?.[destination])}

Real, top-rated attractions matching the trip's budget (from TripAdvisor) — prefer these exact names as "locationName" for ACTIVITY events while in ${destination}:
${formatCandidates(attractionCandidatesByDestination?.[destination])}`
    )
    .join("\n\n");
}

/**
 * Real itinerary generation via the OpenAI Chat Completions API (spec
 * section 6.1). Requires OPENAI_API_KEY; selected when USE_MOCKS=false.
 */
export const openAiLlmService: LlmService = {
  async generateItinerary(input: ItineraryInput): Promise<GeneratedEvent[]> {
    const { destinations, startDate, endDate, preferences, restaurantCandidatesByDestination, attractionCandidatesByDestination } = input;
    const days = dayDateStrings(startDate, endDate);
    const model = process.env.OPENAI_MODEL ?? "gpt-4o";
    const isMultiDestination = destinations.length > 1;

    const travelers = (preferences as { travelers?: { adults?: number; children?: number; childrenAges?: string[] } } | null | undefined)
      ?.travelers;
    const hasChildrenTraveling = Boolean(travelers?.children && travelers.children > 0);

    const multiDestinationInstructions = isMultiDestination
      ? `This is a multi-destination trip covering, in order: ${destinations.join(" → ")}. Split the ${days.length} available day(s) across these destinations sensibly (doesn't need to be exactly equal — a more significant destination can get more days), covering every day with no gaps and no overlap. Include one TRANSPORT event for arrival into ${destinations[0]} on the first day, one TRANSPORT event moving between each consecutive pair of destinations (on the day of transition, titled e.g. "Travel from X to Y"), and one TRANSPORT event for final departure from ${destinations[destinations.length - 1]} on the last day. Include an ACCOMMODATION check-in on the first day in each destination and an ACCOMMODATION check-out on the last day in each destination (a separate hotel per destination).`
      : "";

    const prompt = `Create a detailed day-by-day trip itinerary covering exactly these calendar days: ${days.join(", ")}.
${isMultiDestination ? `Destinations, in visiting order: ${destinations.join(", ")}.` : `Destination: ${destinations[0]}.`}
Preferences: ${JSON.stringify(preferences ?? {})}.

${multiDestinationInstructions}

${hasChildrenTraveling
  ? `This trip includes ${travelers!.children} child(ren)${travelers?.childrenAges?.length ? ` (ages ${travelers.childrenAges.join(", ")})` : ""} alongside ${travelers?.adults ?? "the"} adult(s). Prioritize family-friendly activities suitable for those ages (parks, playgrounds, hands-on/interactive museums, shorter attraction visits); avoid activities unsuitable for children (e.g. late-night venues, very long queues/tours, adults-only experiences) unless the preferences explicitly ask for them. Keep daily pacing realistic for a family with kids (fewer, shorter activities rather than a packed schedule).`
  : ""}

For each destination, infer its actual season from the calendar dates above (accounting for hemisphere — e.g. December is winter in Europe but summer in the Southern Hemisphere) and weight activity choices toward what's weather-appropriate for that season: outdoor activities (parks, gardens, walking tours, viewpoints) when the season is warm/pleasant, indoor activities (museums, galleries, indoor markets) when it's cold, rainy, or otherwise outdoor-unfriendly.

${formatDestinationSections(destinations, restaurantCandidatesByDestination, attractionCandidatesByDestination)}

If a destination's lists don't have enough entries to fill its days, you may add other real, well-known places for that destination — but prefer the provided lists first, and copy names exactly as given (don't paraphrase them).

For small or lesser-known destinations you're not confident about: do not invent specific fictional business names (e.g. a made-up restaurant or bar name) — you have no way to know these are correct and getting them wrong is worse than being generic. Instead, prefer real, verifiable landmarks/institutions you're confident exist (a town's main square, a well-known local market, a notable church, a real museum), or fall back to an honest generic description without a specific proper name (e.g. "a local restaurant downtown" as the title/description with no "locationName", rather than inventing "Restaurante Example Name").

Return ONLY a JSON object of the form {"events": [...]}. Each event must have:
- "eventType": one of ACCOMMODATION, DINING, TRANSPORT, ACTIVITY, TIP
- "title": short human-readable title
- "description": one or two sentences
- "locationName": a specific, real, bookable place name (e.g. "Eiffel Tower"), when applicable
- "startTime": ISO 8601 UTC datetime with a "Z" suffix (e.g. "2026-09-10T09:00:00Z"), on one of the trip's days, using the local wall-clock time at the destination but written with a "Z" suffix regardless of actual timezone
- "endTime": same format as startTime, optional
- "estimatedPriceLabel": for ACTIVITY events only, a rough entry-ticket price range in local currency (e.g. "€20-€30") or "Free" if no cost — this is a rough estimate, not authoritative pricing
- "destination": REQUIRED on every event — which destination this event belongs to, copied EXACTLY (character-for-character) from the destinations list given above. This is critical for looking up the real location correctly; never leave it out, and never invent a value not in the given list. For a "Travel from X to Y" transport event between two destinations, use the arrival destination (Y).

Include arrival/departure transport, hotel check-in/check-out, 2-3 activities per day at real named landmarks/attractions matching the preferences, lunch and dinner recommendations, and the occasional practical tip.`;

    const client = getOpenAiClient();
    const completion = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a meticulous travel planner that only responds with valid JSON matching the requested schema.",
        },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      throw new Error("OpenAI returned an empty response");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("OpenAI response was not valid JSON");
    }

    const shapeResult = openAiResponseShape.safeParse(parsed);
    if (!shapeResult.success) {
      throw new Error(`OpenAI response did not match the expected shape: ${shapeResult.error.message}`);
    }

    // Validate each event individually and drop the ones that don't match,
    // rather than failing the whole trip over one malformed event — the LLM
    // occasionally omits a field on a single item even when the rest of the
    // response is fine.
    const validEvents: z.infer<typeof openAiEventSchema>[] = [];
    shapeResult.data.events.forEach((rawEvent, index) => {
      const eventResult = openAiEventSchema.safeParse(rawEvent);
      if (eventResult.success) {
        validEvents.push(eventResult.data);
      } else {
        console.warn(`Dropping malformed itinerary event at index ${index}:`, eventResult.error.message);
      }
    });

    if (validEvents.length === 0) {
      throw new Error("OpenAI response contained no valid events");
    }

    return validEvents.map((e) => ({
      eventType: e.eventType,
      title: e.title,
      description: e.description,
      locationName: e.locationName,
      startTime: new Date(e.startTime),
      endTime: e.endTime ? new Date(e.endTime) : undefined,
      estimatedPriceLabel: e.eventType === "ACTIVITY" ? e.estimatedPriceLabel : undefined,
      destination: resolveDestination(e.destination, destinations),
    }));
  },
};

export const llmService: LlmService =
  process.env.USE_MOCKS === "false" ? openAiLlmService : mockLlmService;
