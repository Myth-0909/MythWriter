import type { Prisma, Spreadsheet } from "@prisma/client";
import prisma from "../lib/prisma";
import {
  buildSpreadsheetPreview,
  createDefaultSpreadsheetWorkbook,
  normalizeSpreadsheetWorkbook,
  type SpreadsheetWorkbook,
} from "./spreadsheetWorkbook";

interface SpreadsheetInput {
  title?: string;
  data?: unknown;
  groupId?: string | null;
}

function titleOrFallback(title: string | undefined, fallbackTitle: string) {
  const trimmed = title?.trim();
  return trimmed || fallbackTitle;
}

function workbookJson(workbook: SpreadsheetWorkbook): Prisma.InputJsonValue {
  return workbook as unknown as Prisma.InputJsonValue;
}

async function groupIdForUser(groupId: string | null | undefined, userId: string) {
  if (groupId === undefined) return undefined;
  if (!groupId) return null;

  const group = await prisma.documentGroup.findFirst({
    where: { id: groupId, userId },
    select: { id: true },
  });
  return group?.id || null;
}

async function checkOwnership(spreadsheetId: string, userId: string): Promise<Spreadsheet | null> {
  const spreadsheet = await prisma.spreadsheet.findUnique({ where: { id: spreadsheetId } });
  if (!spreadsheet || spreadsheet.userId !== userId) return null;
  return spreadsheet;
}

export async function listSpreadsheets(userId: string) {
  return prisma.spreadsheet.findMany({
    where: { userId, isDeleted: false },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getSpreadsheet(spreadsheetId: string, userId: string): Promise<Spreadsheet | null> {
  const spreadsheet = await checkOwnership(spreadsheetId, userId);
  if (!spreadsheet || spreadsheet.isDeleted) return null;
  return spreadsheet;
}

export async function createSpreadsheet(userId: string, data: SpreadsheetInput, fallbackTitle: string) {
  const workbook = normalizeSpreadsheetWorkbook(data.data || createDefaultSpreadsheetWorkbook());
  const groupId = await groupIdForUser(data.groupId, userId);

  return prisma.spreadsheet.create({
    data: {
      title: titleOrFallback(data.title, fallbackTitle),
      data: workbookJson(workbook),
      preview: buildSpreadsheetPreview(workbook),
      userId,
      groupId: groupId ?? null,
    },
  });
}

export async function updateSpreadsheet(
  spreadsheetId: string,
  userId: string,
  data: SpreadsheetInput,
  fallbackTitle: string
): Promise<Spreadsheet | null> {
  const spreadsheet = await checkOwnership(spreadsheetId, userId);
  if (!spreadsheet || spreadsheet.isDeleted) return null;

  const workbook =
    data.data === undefined
      ? undefined
      : normalizeSpreadsheetWorkbook(data.data);
  const groupId = await groupIdForUser(data.groupId, userId);

  return prisma.spreadsheet.update({
    where: { id: spreadsheetId },
    data: {
      ...(data.title !== undefined && { title: titleOrFallback(data.title, fallbackTitle) }),
      ...(workbook !== undefined && {
        data: workbookJson(workbook),
        preview: buildSpreadsheetPreview(workbook),
      }),
      ...(groupId !== undefined && { groupId }),
    },
  });
}

export async function moveSpreadsheetToTrash(spreadsheetId: string, userId: string): Promise<Spreadsheet | null> {
  const spreadsheet = await checkOwnership(spreadsheetId, userId);
  if (!spreadsheet || spreadsheet.isDeleted) return null;

  return prisma.spreadsheet.update({
    where: { id: spreadsheetId },
    data: { isDeleted: true, deletedAt: new Date() },
  });
}
