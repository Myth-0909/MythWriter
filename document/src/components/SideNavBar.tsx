import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  FileText,
  Star,
  Trash2,
  Settings,
  Brain,
  type LucideIcon,
} from "lucide-react";
import { ShinyText } from "@/components/ShinyText";
import { Tooltip } from "@/components/ui/tooltip";
import { useTheme } from "@/components/ThemeProvider";
import { useI18n } from "@/components/I18nProvider";
import { BrandLogo } from "@/components/BrandLogo";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export type NavId = "documents" | "favorites" | "trash" | "settings" | "brain";

interface NavItem {
  id: NavId;
  labelKey: "nav.documents" | "nav.favorites" | "nav.trash" | "nav.settings" | "nav.brain";
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { id: "documents", labelKey: "nav.documents", icon: FileText },
  { id: "favorites", labelKey: "nav.favorites", icon: Star },
  { id: "brain", labelKey: "nav.brain", icon: Brain },
  { id: "trash", labelKey: "nav.trash", icon: Trash2 },
  { id: "settings", labelKey: "nav.settings", icon: Settings },
];

interface SideNavBarProps {
  activeNav: NavId;
  onNavChange: (id: NavId) => void;
  collapsed?: boolean;
}

function NavButton({ item, isActive, collapsed, onClick }: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const { t } = useI18n();
  const label = t(item.labelKey);

  const button = (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-md text-sm font-medium cursor-pointer transition-all",
        collapsed
          ? "justify-center w-10 h-10 mx-auto"
          : "w-full px-3 py-2",
        isActive
          ? "bg-surface-200 text-surface-900 dark:bg-surface-800 dark:text-surface-100"
          : "text-surface-600 hover:bg-surface-100 hover:text-surface-900 dark:text-surface-400 dark:hover:bg-surface-800 dark:hover:text-surface-200"
      )}
    >
      <item.icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && <span>{label}</span>}
    </button>
  );

  if (collapsed) {
    return (
      <Tooltip content={<span>{label}</span>} side="right" delay={150}>
        {button}
      </Tooltip>
    );
  }

  return button;
}

export function SideNavBar({ activeNav, onNavChange, collapsed = false }: SideNavBarProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [logoPreviewOpen, setLogoPreviewOpen] = useState(false);

  return (
    <>
      <aside
        className={cn(
          "flex h-full shrink-0 flex-col border-r border-surface-200 bg-surface-50 transition-all duration-300 dark:border-surface-800 dark:bg-surface-950",
          collapsed ? "w-[64px]" : "w-[240px]"
        )}
      >
        {/* Logo Area */}
        <div className={cn("pt-6 pb-4", collapsed ? "px-3" : "px-6")}>
          {collapsed ? (
            <button
              onClick={() => setLogoPreviewOpen(true)}
              className="flex w-full justify-center rounded-lg p-0"
            >
              <BrandLogo size="md" />
            </button>
          ) : (
            <button
              onClick={() => setLogoPreviewOpen(true)}
              className="flex items-center gap-2 rounded-lg p-0 text-left"
            >
              <BrandLogo size="sm" />
              <ShinyText
                text={t("app.name")}
                color={theme === "dark" ? "#f1f5f9" : "#0f172a"}
                shineColor={theme === "dark" ? "#d8bd73" : "#b9954e"}
                speed={3}
                direction="right"
                className="text-lg font-bold tracking-normal"
              />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className={cn("flex-1 py-2", collapsed ? "px-2" : "px-3")}>
          <ul className="flex flex-col gap-1">
            {navItems.map((item) => {
              const isActive = item.id === activeNav;
              return (
                <li key={item.id}>
                  <NavButton
                    item={item}
                    isActive={isActive}
                    collapsed={collapsed}
                    onClick={() => onNavChange(item.id)}
                  />
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <Dialog open={logoPreviewOpen} onOpenChange={setLogoPreviewOpen}>
        <DialogContent
          hideCloseButton
          aria-describedby={undefined}
          className="max-w-[420px] border-0 bg-transparent p-0 shadow-none dark:bg-transparent"
        >
          <DialogTitle className="sr-only">{t("app.logoPreview")}</DialogTitle>
          <div className="flex flex-col items-center justify-center gap-6 px-8 py-10">
            <BrandLogo size="xl" />
            <ShinyText
              text={t("app.name")}
              color={theme === "dark" ? "#f8fafc" : "#0f172a"}
              shineColor={theme === "dark" ? "#d8bd73" : "#b9954e"}
              speed={3}
              direction="right"
              className="text-center text-5xl font-bold tracking-normal"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
