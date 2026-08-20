import type { Request, Response } from "express";
import { z } from "zod";
import { loginWithEmail, getUser, updatePhoneNumber } from "../services/auth.service";

const loginSchema = z.object({
  email: z.string().email(),
});

export async function login(req: Request, res: Response) {
  const { email } = loginSchema.parse(req.body);
  const { token } = await loginWithEmail(email);
  res.json({ token });
}

function toMe(user: { id: string; email: string; phoneNumber: string | null }) {
  return { id: user.id, email: user.email, phoneNumber: user.phoneNumber };
}

export async function getMe(req: Request, res: Response) {
  const user = await getUser(req.userId!);
  res.json({ user: toMe(user) });
}

// E.164: optional leading "+", 7-15 digits total, no spaces/dashes — Twilio
// requires this exact shape for the WhatsApp "to" number.
const updateMeSchema = z.object({
  phoneNumber: z.string().regex(/^\+?[1-9]\d{6,14}$/, "Phone number must be in E.164 format, e.g. +15551234567"),
});

export async function putMe(req: Request, res: Response) {
  const { phoneNumber } = updateMeSchema.parse(req.body);
  const user = await updatePhoneNumber(req.userId!, phoneNumber);
  res.json({ user: toMe(user) });
}
