import { type ReactNode, useMemo } from "react";
import { ConfigProvider, theme as antdTheme } from "antd";
import { XProvider } from "@ant-design/x";
import { useTheme } from "@/components/ThemeProvider";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import { useI18n } from "@/components/I18nProvider";

export function AntdThemeProvider({ children }: { children: ReactNode }) {
  const { theme: appTheme } = useTheme();
  const { lang } = useI18n();
  const isDark = appTheme === "dark";

  const themeConfig = useMemo(() => ({
    algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: "#b9954e",
      colorInfo: "#b9954e",
      colorSuccess: "#10b981",
      colorWarning: "#f59e0b",
      colorError: "#ef4444",
      borderRadius: 8,
      borderRadiusLG: 12,
      borderRadiusSM: 6,
      fontFamily: "var(--font-zn-sans)",
      fontSize: 14,
      colorBorder: isDark ? "#334155" : "#e2e8f0",
      colorBgContainer: isDark ? "#0f172a" : "#ffffff",
      colorBgElevated: isDark ? "#1e293b" : "#ffffff",
    },
  }), [isDark]);

  return (
    <ConfigProvider theme={themeConfig} locale={lang === "zh" ? zhCN : enUS}>
      <XProvider
        theme={{
          algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          token: {
            colorPrimary: "#b9954e",
            borderRadius: 8,
            borderRadiusLG: 12,
            fontFamily: "var(--font-zn-sans)",
          },
        }}
      >
        {children}
      </XProvider>
    </ConfigProvider>
  );
}
