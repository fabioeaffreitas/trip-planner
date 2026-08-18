import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { putEvent } from "../controllers/events.controller";

export const eventsRouter = Router();

eventsRouter.use(requireAuth);
eventsRouter.put("/:id", asyncHandler(putEvent));
