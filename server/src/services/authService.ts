import bcrypt from "bcryptjs";
import prisma from "../lib/prisma";

export async function registerUser(name: string, email: string, password: string): Promise<
  | { user: { id: string; name: string; email: string; avatar: string | null } }
  | { error: string; status: number }
> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "该邮箱已被注册", status: 409 };
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, password: hashedPassword },
  });

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
    },
  };
}

export async function verifyPassword(userId: string, password: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true },
  });
  if (!user) return false;
  return bcrypt.compare(password, user.password);
}
