import type { Request, Response } from "express";
import { z } from "zod";
import { placesService } from "../services/places";

const autocompleteQuerySchema = z.object({
  query: z.string().min(1),
});

export async function getDestinationSuggestions(req: Request, res: Response) {
  const { query } = autocompleteQuerySchema.parse(req.query);
  const suggestions = await placesService.suggestDestinations(query);
  res.json({ suggestions });
}
