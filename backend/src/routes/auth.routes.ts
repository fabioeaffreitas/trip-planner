import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { login, getMe, putMe } from "../controllers/auth.controller";

export const authRouter = Router();

authRouter.post("/login", asyncHandler(login));
authRouter.get("/me", requireAuth, asyncHandler(getMe));
authRouter.put("/me", requireAuth, asyncHandler(putMe));
