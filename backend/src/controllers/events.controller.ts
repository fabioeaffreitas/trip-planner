import type { Request, Response } from "express";
import { z } from "zod";
import { updateEvent } from "../services/trips.service";

const updateEventSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  locationName: z.string().optional(),
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
  notes: z.string().optional(),
});

export async function putEvent(req: Request, res: Response) {
  const userId = req.userId!;
  const { id } = req.params;
  const patch = updateEventSchema.parse(req.body);
  const event = await updateEvent(userId, id, patch);
  res.json({ event });
}
