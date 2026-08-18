-- Add destinations (JSONB array), backfill from the existing single destination column, then drop it.
ALTER TABLE "trips" ADD COLUMN "destinations" JSONB;

UPDATE "trips" SET "destinations" = to_jsonb(ARRAY["destination"]);

ALTER TABLE "trips" ALTER COLUMN "destinations" SET NOT NULL;

ALTER TABLE "trips" DROP COLUMN "destination";
