/**
 * Maps a free-text budget preference (as typed in the trip form) to the
 * TripAdvisor price_level symbols ("$".."$$$$") it should accept. Returns
 * null when the budget is unrecognized/absent, meaning "don't filter".
 */
export function budgetToPriceLevels(budget: unknown): string[] | null {
  if (typeof budget !== "string" || !budget.trim()) return null;

  const normalized = budget.trim().toLowerCase();

  if (/(budget|cheap|low|inexpensive)/.test(normalized)) return ["$"];
  if (/(moderate|mid|medium)/.test(normalized)) return ["$", "$$"];
  if (/(luxury|high|expensive|upscale)/.test(normalized)) return ["$$$", "$$$$"];

  return null;
}
