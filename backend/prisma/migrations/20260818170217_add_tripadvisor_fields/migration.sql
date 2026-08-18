-- AlterTable
ALTER TABLE "itinerary_events" ADD COLUMN     "trip_advisor_price_level" TEXT,
ADD COLUMN     "trip_advisor_rating" DOUBLE PRECISION,
ADD COLUMN     "trip_advisor_review_count" INTEGER,
ADD COLUMN     "trip_advisor_url" TEXT;
