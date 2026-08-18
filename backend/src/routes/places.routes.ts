import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { getDestinationSuggestions } from "../controllers/places.controller";

export const placesRouter = Router();

placesRouter.use(requireAuth);
placesRouter.get("/destinations/autocomplete", asyncHandler(getDestinationSuggestions));
