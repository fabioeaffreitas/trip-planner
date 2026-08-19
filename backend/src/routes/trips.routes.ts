import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { getTrip, getTripKmlExport, getTrips, postTrip } from "../controllers/trips.controller";

export const tripsRouter = Router();

tripsRouter.use(requireAuth);
tripsRouter.post("/", asyncHandler(postTrip));
tripsRouter.get("/", asyncHandler(getTrips));
tripsRouter.get("/:id/export.kml", asyncHandler(getTripKmlExport));
tripsRouter.get("/:id", asyncHandler(getTrip));
