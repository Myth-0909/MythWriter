import prisma from "../lib/prisma";

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
