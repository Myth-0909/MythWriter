import bcrypt from "bcryptjs";
import prisma from "../lib/prisma";

export async function registerUser(name: string, email: string, password: string): Promise<UserResult | ErrorResult> {
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

type UserResult = { user: { id: string; name: string; email: string; avatar: string | null } };
type ErrorResult = { error: string; code?: string; status: number };

export async function loginUser(email: string, password: string): Promise<UserResult | ErrorResult> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return { error: "该邮箱尚未注册", code: "NOT_REGISTERED", status: 404 };
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return { error: "密码错误，请重试", code: "WRONG_PASSWORD", status: 401 };
  }

  return {
    user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar },
  };
}

export async function generateResetCode(email: string): Promise<ErrorResult | { code: string }> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return { error: "该邮箱尚未注册", code: "NOT_REGISTERED", status: 404 };
  }

  const crypto = await import("crypto");
  const code = crypto.randomInt(100000, 999999).toString();
  const expires = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken: code, resetTokenExpires: expires },
  });

  return { code };
}

export async function resetPassword(email: string, code: string, newPassword: string): Promise<ErrorResult | { success: true }> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return { error: "该邮箱尚未注册", status: 404 };
  }

  if (!user.resetToken || !user.resetTokenExpires) {
    return { error: "请先获取验证码", status: 400 };
  }

  if (new Date() > user.resetTokenExpires) {
    return { error: "验证码已过期，请重新获取", status: 400 };
  }

  if (user.resetToken !== code) {
    return { error: "验证码错误", status: 400 };
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword, resetToken: null, resetTokenExpires: null },
  });

  return { success: true };
}

export async function verifyPassword(userId: string, password: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true },
  });
  if (!user) return false;
  return bcrypt.compare(password, user.password);
}
