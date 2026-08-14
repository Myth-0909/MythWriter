import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import {
  Share2,
  Download,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  Languages,
  Sun,
  Moon,
  Monitor,
  ChevronDown,
} from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { useI18n } from "@/components/I18nProvider";
import { useAuth } from "@/auth";
import { getServerAssetUrl } from "@/lib/apiBase";

interface TopAppBarProps {
  variant?: "editor" | "documents" | "trash" | "settings";
  title?: string;
  onShare?: () => void;
  onExport?: (format: string) => void;
  onLogout?: () => void;
  onSettings?: () => void;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export function TopAppBar({
  variant = "editor",
  onShare,
  onExport,
  onLogout,
  sidebarCollapsed = false,
  onToggleSidebar,
}: TopAppBarProps) {
  const { t, lang, toggleLang } = useI18n();
  const { themeMode, setThemeMode } = useTheme();
  const { user } = useAuth();

  const themeModeIndex = { system: 0, light: 1, dark: 2 }[themeMode];

  const avatarUrl = getServerAssetUrl(user?.avatar ? `/uploads/${user.avatar}` : null);

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <header className="flex h-14 items-center justify-between border-b border-surface-200 bg-white px-6 dark:border-surface-800 dark:bg-surface-950">
      {/* Left: Sidebar Toggle only */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          className="h-8 w-8 text-surface-600 hover:text-surface-900 dark:text-surface-300 dark:hover:text-surface-100"
          title={sidebarCollapsed ? t("nav.expand") : t("nav.collapse")}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Right */}
      <div className="flex items-center justify-end gap-2">
        {variant === "editor" && (
          <>
            <Button variant="ghost" size="sm" className="h-9 gap-2 text-surface-600 hover:text-surface-900 dark:text-surface-300 dark:hover:text-surface-100" onClick={onShare}>
              <Share2 className="h-4 w-4" />
              <span className="text-sm">{t("topbar.share")}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-9 gap-2 text-surface-600 hover:text-surface-900 dark:text-surface-300 dark:hover:text-surface-100">
                  <Download className="h-4 w-4" />
                  <span className="text-sm">{t("topbar.export")}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[160px]">
                <DropdownMenuItem onClick={() => onExport?.("html")}>
                  <span>HTML</span>
                  <span className="ml-auto text-[10px] text-surface-400">.html</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onExport?.("txt")}>
                  <span>TXT</span>
                  <span className="ml-auto text-[10px] text-surface-400">.txt</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onExport?.("md")}>
                  <span>Markdown</span>
                  <span className="ml-auto text-[10px] text-surface-400">.md</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}

        {/* Language toggle */}
        <Tooltip
          content={lang === "zh" ? t("nav.switchToEnglish") : t("nav.switchToChinese")}
          delay={150}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleLang}
            className="h-8 w-8 text-surface-500 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-100"
            aria-label={lang === "zh" ? t("nav.switchToEnglish") : t("nav.switchToChinese")}
          >
            <Languages className="h-4 w-4" />
          </Button>
        </Tooltip>

        {/* Theme switcher (matches settings page) */}
        <div className="relative grid w-[116px] grid-cols-3 gap-1 rounded-lg bg-surface-100 p-1 dark:bg-surface-800">
          <div
            className="absolute left-1 top-1 h-8 w-8 rounded-md bg-brand-50 shadow-sm ring-1 ring-brand-200 transition-transform duration-300 ease-out dark:bg-brand-500/15 dark:ring-brand-400/25"
            style={{ transform: `translateX(${themeModeIndex * 36}px)` }}
          />
          <Tooltip content={t("nav.followSystem")} delay={150}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setThemeMode("system")}
              className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-md transition-colors cursor-pointer ${
                themeMode === "system"
                  ? "text-brand-700 hover:text-brand-700 dark:text-brand-200 dark:hover:text-brand-200"
                  : "text-surface-400 hover:text-brand-600 dark:hover:text-brand-300"
              }`}
              aria-label={t("nav.followSystem")}
            >
              <Monitor className="h-4 w-4" />
            </Button>
          </Tooltip>
          <Tooltip content={t("nav.lightMode")} delay={150}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setThemeMode("light")}
              className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-md transition-colors cursor-pointer ${
                themeMode === "light"
                  ? "text-brand-700 hover:text-brand-700 dark:text-brand-200 dark:hover:text-brand-200"
                  : "text-surface-400 hover:text-brand-600 dark:hover:text-brand-300"
              }`}
              aria-label={t("nav.lightMode")}
            >
              <Sun className="h-4 w-4" />
            </Button>
          </Tooltip>
          <Tooltip content={t("nav.darkMode")} delay={150}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setThemeMode("dark")}
              className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-md transition-colors cursor-pointer ${
                themeMode === "dark"
                  ? "text-brand-700 hover:text-brand-700 dark:text-brand-200 dark:hover:text-brand-200"
                  : "text-surface-400 hover:text-brand-600 dark:hover:text-brand-300"
              }`}
              aria-label={t("nav.darkMode")}
            >
              <Moon className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              aria-label={t("common.openUserMenu")}
              className="h-auto gap-1.5 rounded-full py-1 pl-1.5 pr-2 text-sm"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={user?.name || t("common.user")}
                  className="h-7 w-7 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-[10px] font-semibold text-white">
                  {initials}
                </div>
              )}
              <ChevronDown className="h-3.5 w-3.5 text-surface-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[160px]">
            {/* Logout */}
            {onLogout && (
              <DropdownMenuItem
                onClick={onLogout}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950"
              >
                <LogOut className="h-4 w-4" />
                <span>{t("topbar.logout")}</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
