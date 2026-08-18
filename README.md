# Trip Planner — Phase 1 Local Web MVP

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=next.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-5-2D3748?logo=prisma&logoColor=white)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-Railway-0B0D0E?logo=railway&logoColor=white)](https://frontend-production-242d.up.railway.app)

**Live demo:** https://frontend-production-242d.up.railway.app (deployed on [Railway](https://railway.com) — see `CLAUDE.md` → "Deployment" for the setup)

An AI-itinerary trip planner. This is the **Phase 1 Local Web MVP** scope only: create a trip, get a generated itinerary, view it grouped by day, edit an event's time. Payments (Stripe), WhatsApp notifications (Twilio/BullMQ), and the React Native mobile app are **not implemented** — see "Out of scope" below.

## Stack

- **Backend:** Node.js + Express + TypeScript, Prisma ORM, PostgreSQL.
- **Frontend:** Next.js (App Router) + TypeScript, plain CSS (no component library).
- **Itinerary generation & location data:** real OpenAI + Google Places calls when `USE_MOCKS=false` and API keys are set; falls back to a mock implementation otherwise. See "Mocked services" below.
- **Activity pricing & booking:** for `ACTIVITY` events, a rough LLM-estimated price range (`estimatedPriceLabel`, not authoritative — always labeled "estimate, verify before booking") and a GetYourGuide search link (`bookingUrl`, no partner account required — a plain search-results deep link).
- **TripAdvisor grounding:** before generating the itinerary, real top-rated restaurants and attractions matching the trip's budget preference are fetched from TripAdvisor and given to the LLM to choose from, so dining/activity picks are real, ranked, and budget-appropriate rather than invented. Matched events get a real rating, review count, price level, and TripAdvisor link; unmatched ones fall back to a plain TripAdvisor search link.
- **Travelers & family-aware planning:** the trip form collects adult/children counts (and optional children's ages). When children are present, the LLM is instructed to favor family-friendly activities and realistic pacing. The LLM also infers the season at the destination from the trip's calendar dates (accounting for hemisphere) and weights activities toward outdoor picks in warm weather, indoor picks in cold/rainy weather.
- **Destination autocomplete:** typing in the destination field suggests real places with disambiguating context (e.g. "Paris, France" vs "Paris, TX, USA") via `GET /api/places/destinations/autocomplete`, which proxies to Google Places so the API key never reaches the browser. Purely a typing aid — the field stays free text.
- **Map view:** the trip detail page plots every located event (real lat/lng from Google Places) on an OpenStreetMap map via Leaflet — no API key needed for the map itself.
- **Location accuracy safeguards:** the destination itself is geocoded once per trip and used to (a) bias each event's Google Places search toward that area and (b) reject a "match" that's implausibly far away (>100km) — this catches same-named places in the wrong city/state/country, which matters most for smaller/lesser-known destinations. A place that can't be found or is rejected gets no coordinates (never a fake `(0,0)`, which previously corrupted map centering) and is flagged `locationValidated: false` so the UI can show "location not independently verified" instead of silently trusting it. When Google *does* find a match, its own place name is used as the displayed `locationName` instead of the LLM's guess — the LLM can invent a plausible-but-wrong name even for a place it located correctly.
- **No past-dated trips:** `startDate` must be today or later, enforced both in the form (`min` on the date input) and on the backend (`POST /api/trips` rejects it with 400).
- **Multi-destination trips:** check "This trip visits multiple destinations" to plan across several cities on one shared date range (e.g. Paris then Rome) — the LLM splits the days across them and adds transport between each. Every generated event is tagged with which destination it belongs to (`GeneratedEvent.destination`), which is what lets Places validation avoid matching a same-themed landmark in the *wrong* city (confirmed bug this fixed: a search for "the Colosseum" while in Paris context matched Paris's own Roman arena "Arènes de Lutèce" instead of finding nothing).

## Prerequisites

- Node.js 18+ and npm
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for local Postgres)

## Setup

```bash
# 1. Start Postgres
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env
npm install
npx prisma migrate dev --name init
npx prisma db seed
npm run dev        # http://localhost:4000

# 3. Frontend (in a separate terminal)
cd frontend
cp .env.local.example .env.local
npm install
npm run dev         # http://localhost:3000
```

Or, from the repo root, `npm install && npm run dev` runs both concurrently once each has its own `.env`/`.env.local` and `node_modules` set up.

Sign in on `http://localhost:3000` with any email (no password — see "Auth" below), then create a trip.

## Mocked vs. real services

`backend/src/services/llm.ts`, `backend/src/services/places.ts`, and `backend/src/services/tripAdvisor.ts` each export a mock implementation and a real implementation behind the same interface, selected by `USE_MOCKS`:

- `mockLlmService` / `mockPlacesService` / `mockTripAdvisorService` (default, `USE_MOCKS=true`): deterministic, no network call, no API keys needed.
- `openAiLlmService` (real, via the OpenAI Chat Completions API, model configurable via `OPENAI_MODEL`, default `gpt-4o`) / `googlePlacesService` (real, via the Google Places API "Text Search" endpoint) / `tripAdvisorApiService` (real, via the TripAdvisor Content API's Location Search + Location Details endpoints): used when `USE_MOCKS=false`. Requires `OPENAI_API_KEY` / `GOOGLE_PLACES_API_KEY` / `TRIPADVISOR_API_KEY` in `backend/.env`.

The GetYourGuide and TripAdvisor *fallback* search links (`backend/src/utils/bookingLink.ts`, `backend/src/utils/tripAdvisorLink.ts`) are not mock/real-gated — they're plain search-URL builders that need no API key either way, used when an event can't be matched back to a real TripAdvisor candidate.

## Auth

Minimal but real: `POST /api/auth/login { email }` finds-or-creates a user by email and returns a JWT — no password. Every trip/event route is scoped to the authenticated user's `userId`; a resource belonging to another user returns 404.

## Out of scope (Phase 1)

Per the original technical spec, these are **not** built in this MVP:

- Stripe subscriptions / checkout / webhooks
- Twilio WhatsApp notifications + Redis/BullMQ scheduling
- React Native mobile app

The `stripe_customer_id`, `subscription_tier`, and `notify_whatsapp` columns exist in the schema (for fidelity with the spec) but are unused.

## Testing

```bash
cd backend
npm test          # unit tests for the mock LLM/Places services and day-grouping logic — no DB required
```

Full end-to-end verification (create trip → view itinerary → edit event) requires Postgres running via `docker compose up -d`.
