import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../utils/errors";
import { createTrip, getTripDetail, listTrips } from "../services/trips.service";
import { buildTripKml } from "../utils/kml";

const createTripSchema = z.object({
  destinations: z.array(z.string().min(1)).min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  preferences: z.record(z.unknown()).optional().nullable(),
});

export async function postTrip(req: Request, res: Response) {
  const userId = req.userId!;
  const input = createTripSchema.parse(req.body);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  if (input.startDate < todayStart) {
    throw new AppError(400, "startDate cannot be in the past", "INVALID_START_DATE");
  }

  if (input.endDate < input.startDate) {
    throw new AppError(400, "endDate must be on or after startDate", "INVALID_DATE_RANGE");
  }

  const trip = await createTrip(userId, input);
  res.status(201).json({ trip });
}

export async function getTrips(req: Request, res: Response) {
  const userId = req.userId!;
  const trips = await listTrips(userId);
  res.json({ trips });
}

export async function getTrip(req: Request, res: Response) {
  const userId = req.userId!;
  const { id } = req.params;
  const detail = await getTripDetail(userId, id);
  res.json(detail);
}

export async function getTripKmlExport(req: Request, res: Response) {
  const userId = req.userId!;
  const { id } = req.params;
  const { trip, days } = await getTripDetail(userId, id);
  const kml = buildTripKml(trip, days);
  res.setHeader("Content-Type", "application/vnd.google-earth.kml+xml");
  res.setHeader("Content-Disposition", `attachment; filename="trip-${id}.kml"`);
  res.send(kml);
}
