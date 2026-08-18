import type { Request, Response } from "express";
import { z } from "zod";
import { loginWithEmail } from "../services/auth.service";

const loginSchema = z.object({
  email: z.string().email(),
});

export async function login(req: Request, res: Response) {
  const { email } = loginSchema.parse(req.body);
  const { token } = await loginWithEmail(email);
  res.json({ token });
}
