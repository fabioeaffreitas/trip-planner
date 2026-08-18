import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/errors";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { message: "Invalid request body", code: "VALIDATION_ERROR", issues: err.issues },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: { message: err.message, code: err.code } });
    return;
  }

  console.error(err);
  res.status(500).json({ error: { message: "Internal server error", code: "INTERNAL_ERROR" } });
}
