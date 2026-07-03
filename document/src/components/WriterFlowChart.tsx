import { useMemo } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart, HeatmapChart, LineChart, PieChart } from "echarts/charts";
import { GridComponent, LegendComponent, TitleComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import { useTheme } from "@/components/ThemeProvider";
import { useI18n } from "@/components/I18nProvider";
import type { TranslationKey } from "@/components/I18nProvider";

echarts.use([BarChart, LineChart, PieChart, HeatmapChart, GridComponent, LegendComponent, TitleComponent, TooltipComponent, VisualMapComponent, CanvasRenderer]);

interface WriterFlowChartProps {
  dayIndices: number[];
  words: number[];
  journalWords?: number[];
}

const dayI18nKeys: Record<number, TranslationKey> = {
  0: "day.sun",
  1: "day.mon",
  2: "day.tue",
  3: "day.wed",
  4: "day.thu",
  5: "day.fri",
  6: "day.sat",
};

function getTooltipFormatter(label: string, numberFormatter: Intl.NumberFormat) {
  return (params: unknown) => {
    const items = Array.isArray(params) ? params : [params];
    const first = items[0] as { axisValueLabel?: string; name?: string } | undefined;
    const rows = items
      .map((item) => {
        const point = item as { marker?: string; seriesName?: string; value?: number | string };
        const value = typeof point.value === "number" ? numberFormatter.format(point.value) : point.value;
        return `${point.marker || ""}${point.seriesName || label}: <strong>${value}</strong>`;
      })
      .join("<br/>");

    return `<strong>${first?.axisValueLabel || first?.name || ""}</strong><br/>${rows}`;
  };
}

export function WriterFlowChart({ dayIndices, words, journalWords = [] }: WriterFlowChartProps) {
  const { theme } = useTheme();
  const { t, lang } = useI18n();
  const isDark = theme === "dark";

  const option = useMemo<EChartsCoreOption>(() => {
    const numberFormatter = new Intl.NumberFormat(lang === "zh" ? "zh-CN" : "en-US");
    const labels = dayIndices.map((idx) => t(dayI18nKeys[idx]));
    const journalSeries = words.map((_, index) => journalWords[index] || 0);
    const totalWords = words.map((value, index) => value + journalSeries[index]);
    const accent = isDark ? "#d8b45f" : "#b8872e";
    const journalAccent = isDark ? "#67d2c8" : "#0f9f94";
    const textMuted = isDark ? "#8ea0b8" : "#64748b";
    const gridLine = isDark ? "rgba(148, 163, 184, 0.14)" : "rgba(148, 163, 184, 0.22)";

    return {
      backgroundColor: "transparent",
      animationDuration: 700,
      animationEasing: "cubicOut",
      title: {
        text: t("chart.words"),
        left: 8,
        top: 2,
        textStyle: {
          color: textMuted,
          fontSize: 11,
          fontWeight: 500,
        },
      },
      tooltip: {
        trigger: "axis",
        confine: true,
        backgroundColor: isDark ? "rgba(15, 23, 42, 0.96)" : "rgba(255, 255, 255, 0.96)",
        borderColor: isDark ? "rgba(216, 180, 95, 0.28)" : "rgba(184, 135, 46, 0.2)",
        borderWidth: 1,
        padding: [10, 12],
        textStyle: {
          color: isDark ? "#f8fafc" : "#0f172a",
          fontSize: 12,
        },
        extraCssText: "border-radius: 12px; box-shadow: 0 18px 45px rgba(2, 6, 23, 0.28);",
        formatter: getTooltipFormatter(t("chart.wordsWritten"), numberFormatter),
      },
      legend: {
        right: 6,
        top: 0,
        itemWidth: 9,
        itemHeight: 9,
        textStyle: {
          color: textMuted,
          fontSize: 10,
        },
        data: [t("chart.documentWords"), t("chart.journalWords"), t("chart.totalWords")],
      },
      grid: {
        left: 8,
        right: 10,
        top: 48,
        bottom: 8,
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: labels,
        boundaryGap: true,
        axisLine: { lineStyle: { color: isDark ? "rgba(148, 163, 184, 0.28)" : "#cbd5e1" } },
        axisTick: { show: false },
        axisLabel: {
          color: textMuted,
          fontSize: 11,
          margin: 12,
        },
      },
      yAxis: {
        type: "value",
        splitLine: {
          lineStyle: {
            color: gridLine,
            type: "dashed",
          },
        },
        axisLabel: {
          color: textMuted,
          fontSize: 10,
        },
      },
      series: [
        {
          name: t("chart.documentWords"),
          type: "bar",
          stack: "writing",
          data: words,
          barWidth: 18,
          showBackground: true,
          backgroundStyle: {
            color: isDark ? "rgba(148, 163, 184, 0.07)" : "rgba(148, 163, 184, 0.12)",
            borderRadius: [10, 10, 3, 3],
          },
          itemStyle: {
            borderRadius: [10, 10, 3, 3],
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: isDark ? "#f0cf75" : "#d5a142" },
              { offset: 0.52, color: accent },
              { offset: 1, color: isDark ? "#7a5d25" : "#f1d894" },
            ]),
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 14,
              shadowColor: "rgba(216, 180, 95, 0.32)",
            },
          },
        },
        {
          name: t("chart.journalWords"),
          type: "bar",
          stack: "writing",
          data: journalSeries,
          barWidth: 18,
          itemStyle: {
            borderRadius: [10, 10, 3, 3],
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: isDark ? "#8de7dd" : "#36c6ba" },
              { offset: 1, color: journalAccent },
            ]),
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 14,
              shadowColor: "rgba(15, 159, 148, 0.28)",
            },
          },
        },
        {
          name: t("chart.totalWords"),
          type: "line",
          data: totalWords,
          smooth: 0.42,
          symbol: "circle",
          symbolSize: 7,
          z: 4,
          lineStyle: {
            width: 2.5,
            color: accent,
          },
          itemStyle: {
            color: isDark ? "#ffe3a1" : "#9a6c19",
            borderColor: isDark ? "#111827" : "#ffffff",
            borderWidth: 2,
          },
          areaStyle: {
            opacity: 0.2,
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: isDark ? "rgba(216, 180, 95, 0.38)" : "rgba(184, 135, 46, 0.24)" },
              { offset: 1, color: "rgba(216, 180, 95, 0)" },
            ]),
          },
        },
      ],
    };
  }, [dayIndices, isDark, journalWords, lang, t, words]);

  return <ReactEChartsCore echarts={echarts} option={option} style={{ width: "100%", height: 224 }} notMerge lazyUpdate />;
}

export function WriterRhythmChart({ dayIndices, words }: WriterFlowChartProps) {
  const { theme } = useTheme();
  const { t, lang } = useI18n();
  const isDark = theme === "dark";

  const option = useMemo<EChartsCoreOption>(() => {
    const numberFormatter = new Intl.NumberFormat(lang === "zh" ? "zh-CN" : "en-US");
    const labels = dayIndices.map((idx) => t(dayI18nKeys[idx]));
    const maxWords = Math.max(...words, 1);

    return {
      backgroundColor: "transparent",
      animationDuration: 500,
      tooltip: {
        trigger: "item",
        confine: true,
        backgroundColor: isDark ? "rgba(15, 23, 42, 0.96)" : "rgba(255, 255, 255, 0.96)",
        borderColor: isDark ? "rgba(216, 180, 95, 0.28)" : "rgba(184, 135, 46, 0.2)",
        textStyle: {
          color: isDark ? "#f8fafc" : "#0f172a",
          fontSize: 12,
        },
        extraCssText: "border-radius: 12px; box-shadow: 0 18px 45px rgba(2, 6, 23, 0.22);",
        formatter: (params: unknown) => {
          const point = params as { name?: string; value?: [number, number, number] };
          return `<strong>${point.name || ""}</strong><br/>${t("chart.totalWords")}: <strong>${numberFormatter.format(point.value?.[2] || 0)}</strong>`;
        },
      },
      grid: {
        left: 0,
        right: 0,
        top: 6,
        bottom: 24,
        containLabel: false,
      },
      xAxis: {
        type: "category",
        data: labels,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: isDark ? "#8ea0b8" : "#64748b",
          fontSize: 10,
          margin: 10,
        },
      },
      yAxis: {
        type: "category",
        data: [""],
        show: false,
      },
      visualMap: {
        show: false,
        min: 0,
        max: maxWords,
        inRange: {
          color: isDark
            ? ["rgba(30, 41, 59, 0.72)", "rgba(132, 102, 39, 0.82)", "#e1b75f"]
            : ["#f1f5f9", "#edd494", "#b8872e"],
        },
      },
      series: [
        {
          type: "heatmap",
          data: dayIndices.map((dayIndex, index) => ({
            name: t(dayI18nKeys[dayIndex]),
            value: [index, 0, words[index] || 0],
          })),
          itemStyle: {
            borderColor: isDark ? "#111827" : "#ffffff",
            borderWidth: 3,
            borderRadius: 10,
          },
          emphasis: {
            itemStyle: {
              borderColor: isDark ? "#f0cf75" : "#b8872e",
              borderWidth: 2,
            },
          },
        },
      ],
    };
  }, [dayIndices, isDark, lang, t, words]);

  return <ReactEChartsCore echarts={echarts} option={option} style={{ width: "100%", height: 92 }} notMerge lazyUpdate />;
}

export function WriterSourceMixChart({ documentWords, journalWords }: { documentWords: number; journalWords: number }) {
  const { theme } = useTheme();
  const { t, lang } = useI18n();
  const isDark = theme === "dark";

  const option = useMemo<EChartsCoreOption>(() => {
    const numberFormatter = new Intl.NumberFormat(lang === "zh" ? "zh-CN" : "en-US");
    const textMuted = isDark ? "#8ea0b8" : "#64748b";
    const hasData = documentWords > 0 || journalWords > 0;
    const data = hasData
      ? [
          { name: t("chart.documentWords"), value: documentWords, itemStyle: { color: isDark ? "#d8b45f" : "#b8872e" } },
          { name: t("chart.journalWords"), value: journalWords, itemStyle: { color: isDark ? "#67d2c8" : "#0f9f94" } },
        ]
      : [
          { name: t("chart.documentWords"), value: 1, itemStyle: { color: isDark ? "rgba(148, 163, 184, 0.18)" : "#e2e8f0" } },
          { name: t("chart.journalWords"), value: 1, itemStyle: { color: isDark ? "rgba(148, 163, 184, 0.1)" : "#f1f5f9" } },
        ];

    return {
      backgroundColor: "transparent",
      animationDuration: 600,
      title: {
        text: t("chart.sourceMix"),
        left: 0,
        top: 0,
        textStyle: {
          color: textMuted,
          fontSize: 11,
          fontWeight: 500,
        },
      },
      tooltip: {
        trigger: "item",
        confine: true,
        backgroundColor: isDark ? "rgba(15, 23, 42, 0.96)" : "rgba(255, 255, 255, 0.96)",
        borderColor: isDark ? "rgba(216, 180, 95, 0.28)" : "rgba(184, 135, 46, 0.2)",
        textStyle: {
          color: isDark ? "#f8fafc" : "#0f172a",
          fontSize: 12,
        },
        extraCssText: "border-radius: 12px; box-shadow: 0 18px 45px rgba(2, 6, 23, 0.22);",
        formatter: (params: unknown) => {
          const point = params as { name?: string; value?: number; percent?: number };
          const value = hasData ? point.value || 0 : 0;
          const percent = hasData ? point.percent || 0 : 0;
          return `${point.name || ""}: <strong>${numberFormatter.format(value)}</strong><br/>${percent}%`;
        },
      },
      legend: {
        bottom: 0,
        left: "center",
        itemWidth: 9,
        itemHeight: 9,
        textStyle: {
          color: textMuted,
          fontSize: 10,
        },
      },
      series: [
        {
          type: "pie",
          radius: ["48%", "72%"],
          center: ["50%", "48%"],
          avoidLabelOverlap: true,
          label: {
            color: isDark ? "#f8fafc" : "#0f172a",
            formatter: hasData ? "{d}%" : "",
            fontSize: 11,
            fontWeight: 600,
          },
          labelLine: {
            length: 8,
            length2: 6,
          },
          data,
        },
      ],
    };
  }, [documentWords, isDark, journalWords, lang, t]);

  return <ReactEChartsCore echarts={echarts} option={option} style={{ width: "100%", height: 168 }} notMerge lazyUpdate />;
}
