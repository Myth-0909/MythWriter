import type { Document } from "@prisma/client";
import prisma from "../lib/prisma";
import { countDocumentWords } from "../lib/documentWordCount";
import { netWordDelta } from "./writingStats";
import { recordWritingDelta } from "./writingActivityService";
import { TRASH_RETENTION_DAYS } from "./trashCleanupService";
import { invalidateTodayWritingCache } from "./chatUserContext";

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
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  return prisma.document.findMany({
    where: { userId, isDeleted: true, deletedAt: { gte: cutoff } },
    orderBy: { deletedAt: "desc" },
  });
}

export async function getDocument(docId: string, userId: string): Promise<Document | null> {
  return checkOwnership(docId, userId);
}

export async function createDocument(userId: string, data: {
  title?: string; content?: string; preview?: string; category?: string; groupId?: string | null; trackWriting?: boolean;
}) {
  const content = data.content || "";
  const wordCount = countDocumentWords(content);
  const document = await prisma.document.create({
    data: {
      title: data.title || "无标题文档",
      content,
      preview: data.preview !== undefined ? data.preview : buildPreview(content),
      wordCount,
      category: data.category || "general",
      userId,
      groupId: data.groupId || null,
    },
  });
  if (data.trackWriting !== false) {
    await recordWritingDelta(userId, { documentWords: wordCount });
    invalidateTodayWritingCache(userId);
  }
  return document;
}

export async function updateDocument(docId: string, userId: string, data: {
  title?: string; content?: string; preview?: string; category?: string; groupId?: string | null;
}): Promise<Document | null> {
  const doc = await checkOwnership(docId, userId);
  if (!doc) return null;

  const nextWordCount = data.content !== undefined ? countDocumentWords(data.content) : null;
  const document = await prisma.document.update({
    where: { id: docId },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.content !== undefined && {
        content: data.content,
        wordCount: nextWordCount!,
      }),
      ...(data.preview !== undefined
        ? { preview: data.preview }
        : data.content !== undefined
          ? { preview: buildPreview(data.content) }
          : {}),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.groupId !== undefined && { groupId: data.groupId }),
    },
  });

  if (nextWordCount !== null) {
    const growth = netWordDelta(doc.wordCount, nextWordCount);
    if (growth !== 0) {
      await recordWritingDelta(userId, { documentWords: growth });
      invalidateTodayWritingCache(userId);
    }
  }

  return document;
}

export async function createDocumentVersion(docId: string, userId: string, source = "manual") {
  const doc = await checkOwnership(docId, userId);
  if (!doc || doc.isDeleted) return null;

  return prisma.documentVersion.create({
    data: {
      documentId: doc.id,
      userId,
      title: doc.title,
      content: doc.content,
      preview: doc.preview,
      source,
    },
  });
}

export async function listDocumentVersions(docId: string, userId: string) {
  const doc = await checkOwnership(docId, userId);
  if (!doc) return null;

  return prisma.documentVersion.findMany({
    where: { documentId: docId, userId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
}

export async function restoreDocumentVersion(docId: string, versionId: string, userId: string): Promise<Document | null> {
  const doc = await checkOwnership(docId, userId);
  if (!doc || doc.isDeleted) return null;

  const version = await prisma.documentVersion.findFirst({
    where: { id: versionId, documentId: docId, userId },
  });
  if (!version) return null;

  const restoredWordCount = countDocumentWords(version.content);
  const [, restored] = await prisma.$transaction([
    prisma.documentVersion.create({
      data: {
        documentId: doc.id,
        userId,
        title: doc.title,
        content: doc.content,
        preview: doc.preview,
        source: "restore",
      },
    }),
    prisma.document.update({
      where: { id: docId },
      data: {
        title: version.title,
        content: version.content,
        wordCount: restoredWordCount,
        preview: version.preview !== undefined ? version.preview : buildPreview(version.content),
      },
    }),
  ]);

  return restored;
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
