import type { Document } from "@prisma/client";
import prisma from "../lib/prisma";

function buildPreview(content?: string | null) {
  const text = (content || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 80) + (text.length > 80 ? "..." : "");
}

async function checkOwnership(docId: string, userId: string): Promise<Document | null> {
  const doc = await prisma.document.findUnique({ where: { id: docId } });
  if (!doc || doc.userId !== userId) return null;
  return doc;
}

export async function listDocuments(userId: string) {
  return prisma.document.findMany({
    where: { userId, isDeleted: false },
    orderBy: { updatedAt: "desc" },
  });
}

export async function listFavorites(userId: string) {
  return prisma.document.findMany({
    where: { userId, isDeleted: false, isFavorite: true },
    orderBy: { updatedAt: "desc" },
  });
}

export async function listTrash(userId: string) {
  return prisma.document.findMany({
    where: { userId, isDeleted: true },
    orderBy: { deletedAt: "desc" },
  });
}

export async function getDocument(docId: string, userId: string): Promise<Document | null> {
  return checkOwnership(docId, userId);
}

export async function createDocument(userId: string, data: {
  title?: string; content?: string; preview?: string; category?: string; groupId?: string | null;
}) {
  const content = data.content || "";
  return prisma.document.create({
    data: {
      title: data.title || "无标题文档",
      content,
      preview: data.preview !== undefined ? data.preview : buildPreview(content),
      category: data.category || "general",
      userId,
      groupId: data.groupId || null,
    },
  });
}

export async function updateDocument(docId: string, userId: string, data: {
  title?: string; content?: string; preview?: string; category?: string; groupId?: string | null;
}): Promise<Document | null> {
  const doc = await checkOwnership(docId, userId);
  if (!doc) return null;

  return prisma.document.update({
    where: { id: docId },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.content !== undefined && { content: data.content }),
      ...(data.preview !== undefined
        ? { preview: data.preview }
        : data.content !== undefined
          ? { preview: buildPreview(data.content) }
          : {}),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.groupId !== undefined && { groupId: data.groupId }),
    },
  });
}

export async function toggleFavorite(docId: string, userId: string): Promise<Document | null> {
  const doc = await checkOwnership(docId, userId);
  if (!doc) return null;
  return prisma.document.update({
    where: { id: docId },
    data: { isFavorite: !doc.isFavorite },
  });
}

export async function moveToTrash(docId: string, userId: string): Promise<Document | null> {
  const doc = await checkOwnership(docId, userId);
  if (!doc) return null;
  return prisma.document.update({
    where: { id: docId },
    data: { isDeleted: true, deletedAt: new Date() },
  });
}

export async function restoreFromTrash(docId: string, userId: string): Promise<Document | null> {
  const doc = await checkOwnership(docId, userId);
  if (!doc) return null;
  return prisma.document.update({
    where: { id: docId },
    data: { isDeleted: false, deletedAt: null },
  });
}

export async function permanentlyDelete(docId: string, userId: string): Promise<boolean> {
  const doc = await checkOwnership(docId, userId);
  if (!doc) return false;
  await prisma.document.delete({ where: { id: docId } });
  return true;
}

export async function emptyTrash(userId: string) {
  await prisma.document.deleteMany({
    where: { userId, isDeleted: true },
  });
}
