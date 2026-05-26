import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { AuthRequest, authMiddleware } from "../middleware/auth";

const router = Router();

router.use(authMiddleware);

// GET /api/stats/weekly - Get writing activity for last 7 days
router.get("/weekly", async (req: AuthRequest, res: Response) => {
  try {
    const days: string[] = [];
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    // Use UTC dates to avoid timezone issues
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    // Generate last 6 days + today (7 days total)
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayUTC);
      d.setUTCDate(d.getUTCDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }

    // Fetch documents updated in the last 7 days
    const sevenDaysAgo = new Date(todayUTC);
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);

    const documents = await prisma.document.findMany({
      where: {
        userId: req.user!.userId,
        isDeleted: false,
        updatedAt: { gte: sevenDaysAgo },
      },
      select: { content: true, updatedAt: true },
    });

    // Calculate word count per day
    const wordsPerDay: Record<string, number> = {};
    days.forEach((d) => (wordsPerDay[d] = 0));

    documents.forEach((doc: { content: string | null; updatedAt: Date }) => {
      // Use UTC date string for consistent grouping
      const day = doc.updatedAt.getUTCFullYear() + "-" +
        String(doc.updatedAt.getUTCMonth() + 1).padStart(2, "0") + "-" +
        String(doc.updatedAt.getUTCDate()).padStart(2, "0");
      if (wordsPerDay[day] !== undefined) {
        // Count words: split by whitespace, filter CJK characters as individual words
        const text = (doc.content || "").replace(/<[^>]*>/g, "");
        const latinWords = text.match(/[a-zA-Z]+/g) || [];
        const cjkChars = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || [];
        const wordCount = latinWords.length + cjkChars.length;
        wordsPerDay[day] += wordCount;
      }
    });

    const result = days.map((date, i) => ({
      day: dayNames[new Date(date + "T00:00:00").getDay()],
      date,
      words: wordsPerDay[date],
    }));

    res.json({ stats: result });
  } catch (error) {
    console.error("Get weekly stats error:", error);
    res.status(500).json({ error: "获取统计数据失败" });
  }
});

export default router;
