# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Trip Planner — Phase 1 Local Web MVP of an AI-itinerary trip planner. This is a scoped-down implementation of a larger technical spec: it covers trip creation, mocked itinerary generation, and itinerary viewing/editing only. Stripe payments, Twilio WhatsApp notifications (Redis/BullMQ), and the React Native mobile app are explicitly **not implemented** — see `README.md` for the full "out of scope" list. Do not add those features unless asked; the DB schema already reserves columns for them (`stripe_customer_id`, `subscription_tier`, `notify_whatsapp`) but they go unused.

Two independent npm projects, no monorepo tooling:
- `backend/` — Node.js + Express + TypeScript + Prisma, talking to PostgreSQL.
- `frontend/` — Next.js (App Router) + TypeScript, plain CSS (no component library).

This directory (`Trip_Planner/`) is unrelated to the sibling `gemini_course/` workspace one level up — different stack, different purpose, no shared code.

## Deployment

Deployed on [Railway](https://railway.com) — project `trip-planner`, three services in one project:
- **Postgres** — managed database plugin.
- **backend** — deployed via `railway up ./backend --path-as-root --service backend` from the repo root (not GitHub-auto-deploy; redeploy by re-running that command, or `railway redeploy --service backend --yes` to restart the existing image after a variable change). `DATABASE_URL=${{Postgres.DATABASE_URL}}` (Railway variable reference), plus `JWT_SECRET`, `USE_MOCKS=false`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `GOOGLE_PLACES_API_KEY`, `CORS_ORIGIN` (the frontend's Railway domain) set via `railway variable set`. No `TRIPADVISOR_API_KEY` set in production — TripAdvisor grounding degrades gracefully to "none provided" (see below), same as local dev without a key.
- **frontend** — deployed the same way from `./frontend`. `NEXT_PUBLIC_API_URL` set to the backend's Railway domain + `/api` — this must be set *before* deploying, since Next.js inlines `NEXT_PUBLIC_*` vars at build time, not runtime.

Both services got public domains via `railway domain --service <name>`. Changing a variable on a service that was deployed via `railway up` (rather than a connected GitHub branch) does **not** reliably auto-redeploy — after changing `CORS_ORIGIN` we had to explicitly run `railway redeploy --service backend --yes` to pick it up.

## Commands

**First-time setup:**
```bash
docker compose up -d                                  # from repo root — starts Postgres
cd backend && cp .env.example .env && npm install
npx prisma migrate dev --name init
npx prisma db seed                                     # seeds one demo user
cd ../frontend && cp .env.local.example .env.local && npm install
```

**Run both dev servers** (from repo root, after the above):
```bash
npm install   # only needed once, for the root `concurrently` devDependency
npm run dev   # backend on :4000, frontend on :3000
```
Or run them separately with `npm run dev` inside `backend/` and `frontend/`.

**Backend** (`cd backend`):
- `npm run dev` — start with hot reload (`tsx watch`)
- `npm run build` / `npm start` — compile to `dist/` and run. **Build uses `tsconfig.build.json`, not `tsconfig.json`** — the base config has `rootDir: "."` with `include: ["src", "prisma", "tests"]` (needed so `npm run typecheck` covers all three), which makes plain `tsc` emit `dist/src/index.js` instead of `dist/index.js`. `tsconfig.build.json` overrides `rootDir`/`include` to just `src`, so `dist/index.js` (what `start` actually runs) exists where expected. This is a real bug we hit deploying to Railway — don't "simplify" by pointing `build` back at `tsconfig.json`. `start` also runs `npm run build` itself (not just `prisma migrate deploy && node dist/index.js`) as a defense against a Railpack layer-caching quirk where a separately-cached build step's output didn't reliably carry into the runtime image — building again immediately before `node dist/index.js` runs guarantees the file exists in the same filesystem that reads it.
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — run all unit tests (Vitest); `npx vitest run tests/llm.test.ts` for a single file
- `npx prisma migrate dev --name <name>` — create/apply a migration after editing `prisma/schema.prisma`
- `npx prisma generate` — regenerate the Prisma client (no DB connection needed)
- `npx prisma db seed` — re-run the seed script

**Frontend** (`cd frontend`):
- `npm run dev` — Next.js dev server on port 3000
- `npm run build` — production build (also typechecks and lints all routes)
- `npm run lint` — ESLint (`next/core-web-vitals`)

**No DB required:** `npm run typecheck`, `npm run build`, `npm test` (backend), and `npm run build`/`lint` (frontend) all work without Postgres running — the mock LLM/Places services and day-grouping logic are pure functions. Only Prisma migrations and any route that touches the DB need `docker compose up -d` first.

## Architecture

### Backend request flow
Route → Controller → Service → Prisma. Controllers (`src/controllers/`) parse/validate with `zod` and shape responses; business logic lives in `src/services/` (the unit-testable layer, no Express types); `src/lib/prisma.ts` exports a singleton `PrismaClient`. Errors are thrown as `AppError` (`src/utils/errors.ts`) and caught centrally by `src/middleware/errorHandler.ts`; routes are wrapped in `asyncHandler` so thrown/rejected errors reach it.

### Auth
Minimal but real: `POST /api/auth/login { email }` finds-or-creates a `User` by email and returns a JWT — no password. `src/middleware/auth.ts` verifies the Bearer token and sets `req.userId`. Every trips/events query is scoped by `userId` (trips directly, events via a join through `trip.userId` in `src/services/trips.service.ts`); a resource that exists but belongs to another user returns **404**, not 403, to avoid leaking existence.

### Mocked vs. real external services (important — read before touching itinerary generation)
`src/services/llm.ts`, `src/services/places.ts`, and `src/services/tripAdvisor.ts` each export a mock implementation (`mockLlmService` / `mockPlacesService` / `mockTripAdvisorService`) and a real implementation (`openAiLlmService`, via OpenAI Chat Completions with `response_format: json_object`, model from `OPENAI_MODEL`; `googlePlacesService`, via the Google Places API "Text Search" endpoint; `tripAdvisorApiService`, via the TripAdvisor Content API's Location Search + Location Details endpoints) behind the same interface. Selection is via `USE_MOCKS` env var (default `true`, i.e. mocks). All three real implementations require their respective API key (`OPENAI_API_KEY` / `GOOGLE_PLACES_API_KEY` / `TRIPADVISOR_API_KEY`) and throw if it's missing. `trips.service.ts` calls only through the `llmService`/`placesService`/`tripAdvisorService` exports — never change the calling code when adjusting mock vs. real behavior, that's the whole point of the seam.

### TripAdvisor grounds the LLM before it runs, not after
Unlike Places (which validates/enriches the LLM's output *after* generation), TripAdvisor runs *before*: `createTrip()` calls `tripAdvisorService.searchTopRated()` per destination for both `restaurants` and `attractions` (filtered by `preferences.budget` via `src/utils/budget.ts#budgetToPriceLevels`, sorted by rating), building `restaurantCandidatesByDestination`/`attractionCandidatesByDestination` (`Record<string, TripAdvisorCandidate[]>`, keyed by destination) and passing them into `llmService.generateItinerary()`. Both `mockLlmService` and the OpenAI prompt are instructed to prefer these exact names for DINING/ACTIVITY `locationName`, scoped to the correct destination. After generation, `trips.service.ts` matches each DINING/ACTIVITY event's `locationName` back to a candidate **within that event's own destination's list** (case-insensitive exact match, `findCandidate()`) to attach the real rating/review count/price level/URL; an unmatched event falls back to a plain TripAdvisor search link (`src/utils/tripAdvisorLink.ts`, no API key needed) instead.

### Multi-destination trips: every event is tagged with its destination — this is load-bearing
`Trip.destinations` is a `Json` array (one or more destinations, in visiting order — a single-destination trip is just a length-1 array; see the `multi_destination` migration, which replaced the old single `destination` string column). `ItineraryInput.destinations: string[]` flows through `llmService.generateItinerary()`; `llm.ts#allocateDaysToDestinations()` splits the trip's days across them roughly evenly (mock only — the real LLM decides its own split per its prompt instructions), and both implementations add `TRANSPORT` legs between destinations plus per-destination `ACCOMMODATION` check-in/out.

**Critical:** every `GeneratedEvent` carries a `destination` field naming which of the trip's destinations it belongs to (mock: set directly from the block it was generated in; real: the OpenAI prompt requires it on every event, verbatim from the given list, resolved/fuzzy-matched back via `resolveDestination()` in case the model paraphrases it slightly). `trips.service.ts` uses **that specific destination** — not a guess-across-all-destinations — for `placesService.validateLocation()`'s search context and bias. This was a real, confirmed bug during development: an earlier version tried each destination in turn and accepted the first "nearby" match, which let a Rome-context search for "the Colosseum" match Paris's own Roman arena ("Arènes de Lutèce") because it was a plausible nearby result in the wrong city. If you touch multi-destination generation, preserve the per-event `destination` tag — removing it silently reintroduces that bug.

### Arrival method (flight/train/car) — read this before touching the first/last TRANSPORT events
`preferences.arrival: { method?: "flight" | "train" | "car"; airport?: string }` (set by the trip form, read via `llm.ts#getArrival()`) shapes the very first TRANSPORT event (arrival into `destinations[0]`) and the very last one (departure from `destinations[destinations.length - 1]`) — nothing else. Mock: `arrivalTransportDetails()`/`departureTransportDetails()` build the `{title, description, locationName}` directly. Real: the prompt gets an explicit `arrivalInstructions` block (train → a real named station, not an airport, e.g. Gare du Nord for a London arrival; car → no station/airport `locationName` at all; flight → a real, specific airport, using `arrival.airport` verbatim if given, otherwise the model picks the primary one).

**Same-city round trip reuses the same airport/station for departure as arrival** (`sameCityRoundTrip = firstDestination === lastDestination`, both in the mock's shared `arrival.airport` lookup and explicitly called out in the real prompt) — without this, the model (or the mock, before this was added) will happily pick a *different*, still-real airport/station for the return leg (confirmed live: Beauvais on arrival but CDG on departure; Gare du Nord on arrival but Gare de Lyon — a real Paris station, just serving different routes — on departure). Don't remove this without reintroducing that.

### Trip creation is fire-and-forget, not awaited in the request
`createTrip()` in `src/services/trips.service.ts` inserts the trip as `GENERATING` and returns immediately; the actual work (fetch TripAdvisor candidates, call `llmService.generateItinerary()`, validate/match each event's location, bulk-insert events, mark `READY`/`FAILED`) runs in `generateItineraryForTrip()`, called without `await` and with its own top-level `.catch()` as a last-resort safety net (the function already catches internally and marks the trip `FAILED` on error; the outer `.catch()` only guards against something escaping that, e.g. a bug in the catch block itself).

**This was originally awaited inline and had to be changed** — confirmed in production on Railway: with real OpenAI/Google Places/TripAdvisor calls in the loop (routinely 20-40s+ for a multi-day itinerary), the platform's reverse-proxy timeout killed the request before it finished, leaving the trip stuck in `GENERATING` forever with no way to retry. `POST /api/trips` now responds in well under a second regardless of how long generation takes. The frontend's trip-detail page already polled `GET /api/trips/:id` while status is `GENERATING` (built in from the start, anticipating exactly this), so no frontend change was needed.

### Data model
`prisma/schema.prisma` — `User` → `Trip` → `ItineraryEvent` (cascade delete). `Trip.status`: `GENERATING` | `READY` | `FAILED`. `ItineraryEvent.eventType`: `ACCOMMODATION` | `DINING` | `TRANSPORT` | `ACTIVITY` | `TIP`. Location is stored as separate nullable `locationLat`/`locationLng` floats (not a Postgres point type — simpler, sufficient for map pins). `estimatedPriceLabel` (LLM-estimated, `ACTIVITY` only, always non-authoritative) and `bookingUrl` (a `getyourguide.com` search link, `ACTIVITY`-only) are set at generation time in `trips.service.ts`. `tripAdvisorRating`/`tripAdvisorReviewCount`/`tripAdvisorPriceLevel`/`tripAdvisorUrl` (DINING and ACTIVITY, real data when matched to a candidate) are set the same way.

### Location accuracy: never trust a Places match blindly
`placesService.validateLocation()` (`src/services/places.ts`) never returns a fake `(0, 0)` when a place isn't found — it returns `{ validated: false }` with no coordinates. `trips.service.ts` calls `placesService.geocodeDestination()` once per trip and passes those coordinates as `near` into every subsequent `validateLocation()` call, which (a) biases Google's Text Search toward that area and (b) rejects any result more than `MAX_PLAUSIBLE_DISTANCE_KM` (100km, see `places.ts`) away via `haversineKm()` (`src/utils/geo.ts`) — this catches a same-named place matching in the wrong city/state/country, which is common for smaller/lesser-known destinations. The result is stored as `locationValidated` (`true`/`false`/`null` — `null` means there was no `locationName` to check at all, e.g. a `TIP`). If you add another geocoding-consuming feature, reuse this pattern rather than trusting a raw API match.

When Google *does* find a match, `validateLocation()` also returns `matchedName` (Google's `displayName` for that place), and `trips.service.ts` stores that as the event's `locationName` instead of the LLM's guess — the LLM can invent a wrong name for a real place it otherwise located correctly (confirmed case: it invented "Padre Atilio Library" for what Google correctly resolved to the real "Biblioteca Municipal 'Martinico Prado'"). `findCandidate()`'s TripAdvisor matching and the GetYourGuide/TripAdvisor fallback search-link queries still use the LLM's original `event.locationName`, not the corrected one — that's intentional, they need to match what the LLM was actually told to pick from.

### Date validation
`POST /api/trips` rejects a `startDate` before today (`trips.controller.ts`, compared at midnight local server time) with 400 `INVALID_START_DATE`. The frontend mirrors this with a `min` attribute on the date inputs (`app/trips/new/page.tsx`) purely as a UX nicety — the backend check is the real guard.

### `GET /api/trips/:id` response shape
Returns `{ trip, days, tips, transportAdvice }`. `days` (via `src/utils/groupByDay.ts`, a pure/unit-tested function) is the source of truth — all events grouped by calendar day of `startTime`, with a synthetic `"unscheduled"` bucket sorted last. `tips` and `transportAdvice` are convenience filters into the *same* event set (all `TIP` / `TRANSPORT` events across the trip), not a separate subset — the frontend renders them as extra sections without re-deriving.

### Frontend
Auth state lives in `localStorage` via `lib/auth.ts` (`getToken`/`setToken`/`clearToken`), with a `useRequireAuth()` hook that redirects to `/login` when unauthenticated — used at the top of every page under `app/trips/`. `lib/api.ts` is a thin fetch wrapper that attaches the Bearer token and throws `ApiError` on non-2xx responses. `app/trips/[id]/page.tsx` polls every 2s while the trip is `GENERATING`.

`app/trips/new/page.tsx` debounces (300ms) calls to `GET /api/places/destinations/autocomplete` as the user types a destination, showing a dropdown of disambiguated suggestions (e.g. "Paris" → "Paris, France" / "Paris, TX, USA"); selecting one just fills the still-free-text input, it doesn't constrain what can be submitted. `app/trips/[id]/TripMap.tsx` renders a Leaflet + OpenStreetMap map of every event with real coordinates; it's loaded via `next/dynamic({ ssr: false })` in the parent page because Leaflet touches `window` at import time. **Pinned to `react-leaflet@4` / React 18** — `react-leaflet@5` requires React 19, don't upgrade it without also upgrading React/Next.
