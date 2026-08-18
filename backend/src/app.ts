import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.routes";
import { tripsRouter } from "./routes/trips.routes";
import { eventsRouter } from "./routes/events.routes";
import { placesRouter } from "./routes/places.routes";
import { errorHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:3000" }));
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRouter);
  app.use("/api/trips", tripsRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/places", placesRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: { message: "Not found", code: "NOT_FOUND" } });
  });

  app.use(errorHandler);

  return app;
}
