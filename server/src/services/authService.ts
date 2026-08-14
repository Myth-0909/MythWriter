import bcrypt from "bcryptjs";
import prisma from "../lib/prisma";
import { DEFAULT_FONT_FAMILY_KEY } from "../lib/fontPreferences";

export async function registerUser(name: string, email: string, password: string): Promise<UserResult | ErrorResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return { code: "EMAIL_IN_USE", status: 409 };
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    // `api_key` was non-nullable in early installations. Writing the empty
    // sentinel keeps registration compatible while secrets remain unconfigured.
    data: { name: name.trim(), email: normalizedEmail, password: hashedPassword, apiKey: "" },
  });

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      fontFamilyKey: user.fontFamilyKey || DEFAULT_FONT_FAMILY_KEY,
      sessionVersion: user.sessionVersion,
    },
  };
}

type UserResult = {
  user: {
    id: string;
    name: string;
    email: string;
    avatar: string | null;
    fontFamilyKey: string;
    sessionVersion: number;
  };
};
type ErrorResult = {
  code: "EMAIL_IN_USE" | "INVALID_CREDENTIALS" | "INVALID_RESET_CODE";
  status: number;
};

export async function loginUser(email: string, password: string): Promise<UserResult | ErrorResult> {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) {
    return { code: "INVALID_CREDENTIALS", status: 401 };
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return { code: "INVALID_CREDENTIALS", status: 401 };
  }

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      fontFamilyKey: user.fontFamilyKey || DEFAULT_FONT_FAMILY_KEY,
      sessionVersion: user.sessionVersion,
    },
  };
}

export async function generateResetCode(email: string): Promise<{
  accepted: true;
  challenge?: { email: string; code: string; lang: "zh" | "en" };
}> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  const crypto = await import("crypto");
  const code = crypto.randomInt(100000, 1_000_000).toString();
  const hashedCode = await bcrypt.hash(code, 10);
  const expires = new Date(Date.now() + 10 * 60 * 1000);

  // Keep the expensive work on both paths so response timing does not reveal
  // whether an account exists.
  if (!user) {
    return { accepted: true };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken: hashedCode, resetTokenExpires: expires },
  });

  return {
    accepted: true,
    challenge: {
      email: user.email,
      code,
      lang: user.lang === "en" ? "en" : "zh",
    },
  };
}

export async function resetPassword(email: string, code: string, newPassword: string): Promise<ErrorResult | { success: true }> {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) {
    return { code: "INVALID_RESET_CODE", status: 400 };
  }

  if (!user.resetToken || !user.resetTokenExpires) {
    return { code: "INVALID_RESET_CODE", status: 400 };
  }

  if (new Date() > user.resetTokenExpires) {
    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: null, resetTokenExpires: null },
    });
    return { code: "INVALID_RESET_CODE", status: 400 };
  }

  const validCode = await bcrypt.compare(code, user.resetToken);
  if (!validCode) {
    return { code: "INVALID_RESET_CODE", status: 400 };
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      resetToken: null,
      resetTokenExpires: null,
      sessionVersion: { increment: 1 },
    },
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

export async function checkEmailExists(email: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  return user !== null;
}
