import prisma from "../lib/prisma";
import { documentIndexQueue } from "./documentIndexQueue";

export const TRASH_RETENTION_DAYS = 30;
const RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export async function purgeExpiredTrash(now = new Date()): Promise<{
  documents: number;
  spreadsheets: number;
}> {
  const cutoff = new Date(now.getTime() - RETENTION_MS);
  const expiredDocuments = await prisma.document.findMany({
    where: {
      isDeleted: true,
      OR: [{ deletedAt: { lt: cutoff } }, { deletedAt: null }],
    },
    select: { id: true },
  });

  const { documents, spreadsheets } = await prisma.$transaction(async (tx: typeof prisma) => {
    const documents = await tx.document.deleteMany({
      where: {
        isDeleted: true,
        OR: [{ deletedAt: { lt: cutoff } }, { deletedAt: null }],
      },
    });
    const spreadsheets = await tx.spreadsheet.deleteMany({
      where: {
        isDeleted: true,
        OR: [{ deletedAt: { lt: cutoff } }, { deletedAt: null }],
      },
    });
    return { documents, spreadsheets };
  });

  expiredDocuments.forEach(({ id }: { id: string }) => documentIndexQueue.remove(id));
  return { documents: documents.count, spreadsheets: spreadsheets.count };
}

export function startTrashCleanupScheduler() {
  const run = () => {
    void purgeExpiredTrash().then(({ documents, spreadsheets }) => {
      if (documents + spreadsheets > 0) {
        console.info(`[Trash] Purged ${documents} document(s) and ${spreadsheets} spreadsheet(s)`);
      }
    }).catch((error) => {
      console.warn("[Trash] Scheduled purge failed:", error instanceof Error ? error.message : error);
    });
  };

  const initialTimer = setTimeout(run, 15_000);
  initialTimer.unref?.();
  const interval = setInterval(run, 6 * 60 * 60 * 1000);
  interval.unref?.();
  return () => {
    clearTimeout(initialTimer);
    clearInterval(interval);
  };
}
