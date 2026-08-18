import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/errors";

export async function loginWithEmail(email: string): Promise<{ token: string; userId: string }> {
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email },
  });

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new AppError(500, "Server misconfigured: JWT_SECRET not set", "SERVER_MISCONFIGURED");
  }

  const token = jwt.sign({ userId: user.id }, secret, { expiresIn: "30d" });
  return { token, userId: user.id };
}
