export type TripStatus = "GENERATING" | "READY" | "FAILED";
export type EventType = "ACCOMMODATION" | "DINING" | "TRANSPORT" | "ACTIVITY" | "TIP";

export interface Trip {
  id: string;
  destinations: string[];
  startDate: string;
  endDate: string;
  status: TripStatus;
  preferences?: Record<string, unknown> | null;
  createdAt: string;
}

export interface ItineraryEvent {
  id: string;
  tripId: string;
  eventType: EventType;
  title: string;
  description?: string | null;
  locationName?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  locationValidated?: boolean | null;
  startTime?: string | null;
  endTime?: string | null;
  notifyWhatsapp: boolean;
  estimatedPriceLabel?: string | null;
  bookingUrl?: string | null;
  tripAdvisorRating?: number | null;
  tripAdvisorReviewCount?: number | null;
  tripAdvisorPriceLevel?: string | null;
  tripAdvisorUrl?: string | null;
  notes?: string | null;
  alternatives?: DiningAlternative[] | null;
  whatsappNotifiedAt?: string | null;
}

export interface Me {
  id: string;
  email: string;
  phoneNumber?: string | null;
}

export interface DiningAlternative {
  name: string;
  rating?: number;
  numReviews?: number;
  priceLevel?: string;
  webUrl?: string;
}

export interface DestinationSuggestion {
  description: string;
  mainText: string;
  secondaryText?: string;
}

export interface DayGroup {
  date: string;
  events: ItineraryEvent[];
}

export interface TripDetail {
  trip: Trip;
  days: DayGroup[];
  tips: ItineraryEvent[];
  transportAdvice: ItineraryEvent[];
}
