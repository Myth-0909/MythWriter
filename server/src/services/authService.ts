import bcrypt from "bcryptjs";
import prisma from "../lib/prisma";

export async function verifyPassword(userId: string, password: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true },
  });
  if (!user) return false;
  return bcrypt.compare(password, user.password);
}
