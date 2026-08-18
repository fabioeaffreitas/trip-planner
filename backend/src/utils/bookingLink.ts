/**
 * Builds a GetYourGuide search-results link — no partner/affiliate account
 * required. Not a deep link to a specific product (GetYourGuide has no public
 * unauthenticated API to resolve one), but it takes the user straight to
 * relevant, bookable results for the activity.
 */
export function buildGetYourGuideSearchUrl(query: string): string {
  return `https://www.getyourguide.com/s/?q=${encodeURIComponent(query)}`;
}
