/**
 * Builds a GetYourGuide search-results link — no partner/affiliate account
 * required. Not a deep link to a specific product (GetYourGuide has no public
 * unauthenticated API to resolve one), but it takes the user straight to
 * relevant, bookable results for the activity.
 */
export function buildGetYourGuideSearchUrl(query: string): string {
  return `https://www.getyourguide.com/s/?q=${encodeURIComponent(query)}`;
}

/**
 * Builds a Booking.com search-results link — same rationale as
 * buildGetYourGuideSearchUrl: no partner/affiliate account required, not a
 * deep link to a specific listing, but takes the user straight to relevant,
 * bookable results for the accommodation.
 */
export function buildBookingComSearchUrl(query: string): string {
  return `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(query)}`;
}
