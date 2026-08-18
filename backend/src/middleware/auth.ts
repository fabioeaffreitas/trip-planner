import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../utils/errors";

interface TokenPayload {
  userId: string;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new AppError(401, "Missing or invalid Authorization header", "UNAUTHENTICATED");
  }

  const token = header.slice("Bearer ".length);
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new AppError(500, "Server misconfigured: JWT_SECRET not set", "SERVER_MISCONFIGURED");
  }

  try {
    const payload = jwt.verify(token, secret) as TokenPayload;
    req.userId = payload.userId;
    next();
  } catch {
    throw new AppError(401, "Invalid or expired token", "UNAUTHENTICATED");
  }
}
