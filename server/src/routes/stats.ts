import { Router, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware/auth";
import { t } from "../lib/i18n";
import { getLocalCalendarWeekRange } from "../services/writingStats";
import { listWritingDayStats } from "../services/writingActivityService";

const router = Router();

router.use(authMiddleware);

function requestLang(req: AuthRequest) {
  return String(req.headers["accept-language"] || "").toLowerCase().startsWith("en") ? "en" : "zh";
}

// GET /api/stats/weekly — calendar week (Mon–Sun) incremental word deltas
router.get("/weekly", async (req: AuthRequest, res: Response) => {
  try {
    const week = getLocalCalendarWeekRange(new Date());
    const rows = await listWritingDayStats(req.user!.userId, week.days);

    const stats = rows.map((row) => {
      const [year, month, day] = row.dateKey.split("-").map(Number);
      const localDate = new Date(year, month - 1, day);
      return {
        dayIndex: localDate.getDay(),
        date: row.dateKey,
        documentWords: row.documentWords,
        journalWords: row.journalWords,
        words: row.documentWords,
      };
    });

    res.json({
      stats,
      week: {
        start: week.days[0],
        end: week.days[week.days.length - 1],
      },
    });
  } catch (error) {
    console.error("Get weekly stats error:", error);
    res.status(500).json({
      error: t(requestLang(req), "获取统计数据失败", "Failed to load writing stats"),
    });
  }
});

export default router;
