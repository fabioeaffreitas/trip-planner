/**
 * Fallback TripAdvisor search-results link — used when a specific event
 * couldn't be matched back to a real TripAdvisor candidate (see
 * tripAdvisor.ts). No API key required.
 */
export function buildTripAdvisorSearchUrl(query: string): string {
  return `https://www.tripadvisor.com/Search?q=${encodeURIComponent(query)}`;
}
