import { useRef, useEffect } from "react";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useTheme } from "@/components/ThemeProvider";
import { useI18n } from "@/components/I18nProvider";
import type { TranslationKey } from "@/components/I18nProvider";

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

interface WriterFlowChartProps {
  dayIndices: number[];
  words: number[];
}

const dayI18nKeys: Record<number, TranslationKey> = {
  0: "day.sun", 1: "day.mon", 2: "day.tue", 3: "day.wed",
  4: "day.thu", 5: "day.fri", 6: "day.sat",
};

export function WriterFlowChart({ dayIndices, words }: WriterFlowChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);
  const { theme } = useTheme();
  const { t, lang } = useI18n();
  const isDark = theme === "dark";

  useEffect(() => {
    if (!chartRef.current) return;

    if (!instanceRef.current) {
      instanceRef.current = echarts.init(chartRef.current);
    }

    const chart = instanceRef.current;

    const yAxisLabel = t("chart.words");
    const tooltipLabel = t("chart.wordsWritten");
    const numberFormatter = new Intl.NumberFormat(lang === "zh" ? "zh-CN" : "en-US");

    const option: echarts.EChartsCoreOption = {
      tooltip: {
        trigger: "axis",
        backgroundColor: isDark ? "#1e293b" : "#fff",
        borderColor: isDark ? "#334155" : "#e2e8f0",
        textStyle: {
          color: isDark ? "#f1f5f9" : "#0f172a",
          fontSize: 12,
        },
        formatter: (params: unknown) => {
          const p = params as { name: string; value: number }[];
          return `<strong>${p[0].name}</strong><br/>${tooltipLabel}: <strong>${numberFormatter.format(p[0].value)}</strong>`;
        },
      },
      grid: {
        left: "3%",
        right: "4%",
        bottom: "12%",
        top: "15%",
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: dayIndices.map((idx) => t(dayI18nKeys[idx])),
        axisLine: { lineStyle: { color: isDark ? "#475569" : "#cbd5e1" } },
        axisTick: { show: false },
        axisLabel: {
          color: isDark ? "#94a3b8" : "#64748b",
          fontSize: 10,
        },
      },
      yAxis: {
        type: "value",
        name: yAxisLabel,
        nameTextStyle: {
          color: isDark ? "#94a3b8" : "#64748b",
          fontSize: 11,
        },
        splitLine: {
          lineStyle: {
            color: isDark ? "#1e293b" : "#f1f5f9",
            type: "dashed",
          },
        },
        axisLabel: {
          color: isDark ? "#94a3b8" : "#64748b",
          fontSize: 10,
        },
      },
      series: [
        {
          type: "bar",
          data: words.map((val) => ({
            value: val,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: isDark ? "#60a5fa" : "#3b82f6" },
                { offset: 1, color: isDark ? "#1d4ed8" : "#93c5fd" },
              ]),
              borderRadius: [6, 6, 0, 0],
            },
          })),
          barWidth: "50%",
          emphasis: {
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: isDark ? "#93c5fd" : "#2563eb" },
                { offset: 1, color: isDark ? "#3b82f6" : "#60a5fa" },
              ]),
            },
          },
          animationDelay: (idx: number) => idx * 80,
        },
      ],
    };

    chart.setOption(option);

    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [dayIndices, words, isDark, lang, t]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      instanceRef.current?.dispose();
      instanceRef.current = null;
    };
  }, []);

  return <div ref={chartRef} style={{ width: "100%", height: "200px" }} />;
}
