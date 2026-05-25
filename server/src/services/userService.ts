import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import prisma from "../lib/prisma";

const UPLOADS_DIR = path.join(__dirname, "../../uploads");

export async function getProfile(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      createdAt: true,
      _count: { select: { documents: true } },
    },
  });
}

export async function updateProfile(userId: string, data: {
  name?: string; lang?: string; password?: string; newPassword?: string;
}): Promise<{ error: string; status: number } | { user: NonNullable<Awaited<ReturnType<typeof getProfile>>> }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "用户不存在", status: 404 };

  if (data.newPassword) {
    if (!data.password) return { error: "请输入当前密码", status: 400 };
    const valid = await bcrypt.compare(data.password, user.password);
    if (!valid) return { error: "当前密码错误", status: 401 };
    if (data.newPassword.length < 6) return { error: "新密码至少6位", status: 400 };
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.lang !== undefined && { lang: data.lang }),
      ...(data.newPassword && { password: await bcrypt.hash(data.newPassword, 10) }),
    },
    select: { id: true, name: true, email: true, avatar: true, createdAt: true },
  });

  return { user: updated };
}

export async function uploadAvatar(userId: string, image: string): Promise<
  { error: string; status: number } | { user: { id: string; name: string; email: string; avatar: string | null; createdAt: Date }; avatarUrl: string }
> {
  const matches = image.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
  if (!matches) return { error: "图片格式不正确", status: 400 };

  const ext = matches[1] === "png" ? "png" : "jpg";
  const filename = `avatar-${userId}-${Date.now()}.${ext}`;
  const filepath = path.join(UPLOADS_DIR, filename);

  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: userId }, select: { avatar: true },
  });
  if (currentUser?.avatar) {
    const oldPath = path.join(UPLOADS_DIR, currentUser.avatar);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  fs.writeFileSync(filepath, Buffer.from(matches[2], "base64"));

  const user = await prisma.user.update({
    where: { id: userId },
    data: { avatar: filename },
    select: { id: true, name: true, email: true, avatar: true, createdAt: true },
  });

  return { user, avatarUrl: `/uploads/${filename}` };
}

export async function getApiKey(userId: string): Promise<{ hasKey: boolean; masked: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId }, select: { apiKey: true },
  });
  const key = user?.apiKey || "";
  return {
    hasKey: !!key,
    masked: key ? key.slice(0, 3) + "****" + key.slice(-4) : "",
  };
}

export async function saveApiKey(userId: string, apiKey: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { apiKey: apiKey.trim() },
  });
}

