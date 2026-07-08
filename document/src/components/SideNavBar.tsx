import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  FileText,
  Star,
  Trash2,
  Settings,
  Bot,
  Brain,
  History,
  LayoutDashboard,
  NotebookTabs,
  Folder,
  Plus,
  type LucideIcon,
} from "lucide-react";
import Shuffle from "@/components/Shuffle";
import { Tooltip } from "@/components/ui/tooltip";
import { useI18n } from "@/components/I18nProvider";
import { BrandLogo } from "@/components/BrandLogo";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { LogoClickEffect } from "@/components/LogoClickEffect";

export type NavId = "workbench" | "documents" | "favorites" | "records" | "record-history" | "trash" | "settings" | "brain" | "model-config";

interface NavItem {
  id: NavId;
  labelKey: "nav.workbench" | "nav.documents" | "nav.favorites" | "nav.records" | "nav.recordHistory" | "nav.trash" | "nav.settings" | "nav.brain" | "nav.modelConfig";
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { id: "workbench", labelKey: "nav.workbench", icon: LayoutDashboard },
  { id: "documents", labelKey: "nav.documents", icon: FileText },
  { id: "favorites", labelKey: "nav.favorites", icon: Star },
  { id: "records", labelKey: "nav.records", icon: NotebookTabs },
  { id: "record-history", labelKey: "nav.recordHistory", icon: History },
  { id: "brain", labelKey: "nav.brain", icon: Brain },
  { id: "model-config", labelKey: "nav.modelConfig", icon: Bot },
  { id: "trash", labelKey: "nav.trash", icon: Trash2 },
  { id: "settings", labelKey: "nav.settings", icon: Settings },
];

interface SideNavBarProps {
  activeNav: NavId;
  onNavChange: (id: NavId) => void;
  collapsed?: boolean;
  groups?: any[];
  activeGroupId?: string | null;
  onSelectGroup?: (groupId: string | null) => void;
  onAddGroup?: () => void;
  onRenameGroup?: (id: string, name: string) => void;
  onDeleteGroup?: (id: string) => void;
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
          ? "bg-surface-200 text-surface-900 dark:bg-surface-800 dark:text-surface-50 dark:ring-1 dark:ring-white/10"
          : "text-surface-600 hover:bg-surface-100 hover:text-surface-900 dark:text-surface-400 dark:hover:bg-surface-800/90 dark:hover:text-surface-50 dark:hover:ring-1 dark:hover:ring-white/10"
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

export function SideNavBar({
  activeNav,
  onNavChange,
  collapsed = false,
  groups = [],
  activeGroupId = null,
  onSelectGroup = () => {},
  onAddGroup = () => {},
  onRenameGroup = () => {},
  onDeleteGroup = () => {},
}: SideNavBarProps) {
  const { t } = useI18n();
  const [logoPreviewOpen, setLogoPreviewOpen] = useState(false);
  const [logoEffectActive, setLogoEffectActive] = useState(false);

  const handleLogoClick = () => {
    if (!logoEffectActive) {
      setLogoEffectActive(true);
      // Effect will reset itself via onComplete after animation finishes
    }
  };

  return (
    <>
      <aside
        className={cn(
          "flex h-full shrink-0 flex-col border-r border-surface-200 bg-surface-50 transition-all duration-300 dark:border-surface-800 dark:bg-surface-950",
          collapsed ? "w-[64px]" : "w-[240px]"
        )}
      >
        {/* Logo Area */}
        <div className={cn("relative pt-6 pb-4", collapsed ? "px-3" : "px-6")}>
          {collapsed ? (
            <button
              onClick={handleLogoClick}
              className="relative flex w-full justify-center rounded-lg p-0 cursor-pointer"
            >
              <BrandLogo size="md" />
            </button>
          ) : (
            <button
              onClick={handleLogoClick}
              className="relative flex w-full items-center gap-2 rounded-lg p-0 text-left cursor-pointer"
            >
              <BrandLogo size="sm" />
              <Shuffle
                text={t("app.name")}
                shuffleDirection="up"
                duration={1.5}
                loop
                loopDelay={1.2}
                shuffleTimes={1}
                stagger={0.03}
                triggerOnHover={false}
                className="text-lg font-bold tracking-[0.14em] text-surface-950 dark:text-surface-50 font-[var(--font-zn-display)]"
              />
            </button>
          )}

          {/* GSAP click effect overlay */}
          <LogoClickEffect
            active={logoEffectActive}
            onComplete={() => setLogoEffectActive(false)}
          />
        </div>

        {/* Navigation */}
        <nav className={cn("flex-1 py-2", collapsed ? "px-2" : "px-3")}>
          <ul className="flex flex-col gap-1">
            {navItems.map((item) => {
              const isActive = item.id === activeNav;
              return (
                <li key={item.id} className="flex flex-col gap-0.5">
                  <NavButton
                    item={item}
                    isActive={isActive && (item.id !== "documents" || activeGroupId === null)}
                    collapsed={collapsed}
                    onClick={() => {
                      if (item.id === "documents") {
                        onSelectGroup(null);
                      }
                      onNavChange(item.id);
                    }}
                  />
                  {/* Under documents item, show the group sub-menu */}
                  {item.id === "documents" && !collapsed && (
                    <div className="pl-6 pr-2 py-1 flex flex-col gap-1">
                      {/* Section Header */}
                      <div className="flex items-center justify-between px-2 py-1 text-[11px] font-bold text-surface-400 dark:text-surface-500 tracking-wider uppercase">
                        <span>{t("group.title")}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddGroup();
                          }}
                          className="rounded p-0.5 transition-colors hover:bg-surface-100 hover:text-surface-700 dark:hover:bg-brand-500/15 dark:hover:text-brand-200 cursor-pointer"
                          title={t("group.newGroup")}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      
                      {/* Groups List */}
                      {groups.length === 0 ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddGroup();
                          }}
                          className="w-full text-left px-2 py-1.5 text-[11px] text-brand-500 hover:text-brand-600 hover:bg-surface-100 dark:text-brand-300 dark:hover:bg-brand-500/15 dark:hover:text-brand-100 rounded-md cursor-pointer border border-dashed border-brand-200 dark:border-brand-500/25 transition-colors"
                        >
                          {t("group.noGroups")}
                        </button>
                      ) : (
                        <div className="flex flex-col gap-0.5 max-h-[220px] overflow-y-auto custom-scrollbar">
                          {groups.map((group) => {
                            const isGroupActive = activeNav === "documents" && activeGroupId === group.id;
                            return (
                              <div
                                key={group.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectGroup(group.id);
                                }}
                                className={cn(
                                  "group/item relative flex items-center justify-between px-2 py-1 rounded-md text-[12px] font-medium cursor-pointer transition-all min-w-0",
                                  isGroupActive
                                    ? "bg-surface-200 text-surface-900 dark:bg-surface-800 dark:text-surface-50 dark:ring-1 dark:ring-brand-400/25"
                                    : "text-surface-600 hover:bg-surface-100 hover:text-surface-900 dark:text-surface-400 dark:hover:bg-surface-800/90 dark:hover:text-surface-50 dark:hover:ring-1 dark:hover:ring-white/10"
                                )}
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <Folder
                                    className={cn(
                                      "h-3.5 w-3.5 shrink-0 transition-colors",
                                      isGroupActive
                                        ? "text-brand-500"
                                        : "text-surface-400 group-hover/item:text-brand-500 dark:group-hover/item:text-brand-300"
                                    )}
                                    fill={isGroupActive ? "currentColor" : "none"}
                                  />
                                  <span className="truncate pr-4">{group.name}</span>
                                </div>
                                
                                {/* Dropdown menu for folder actions */}
                                <div className="opacity-0 group-hover/item:opacity-100 focus-within:opacity-100 transition-opacity duration-150 shrink-0">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        onClick={(e) => e.stopPropagation()}
                                        className="rounded p-0.5 text-surface-400 transition-all hover:bg-surface-200 hover:text-surface-700 dark:text-surface-500 dark:hover:bg-brand-500/15 dark:hover:text-brand-100 dark:hover:ring-1 dark:hover:ring-brand-400/25 cursor-pointer"
                                      >
                                        <Settings className="h-3 w-3" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-[128px] dark:border-surface-700 dark:bg-surface-900 dark:shadow-[0_18px_45px_rgba(0,0,0,0.38)]">
                                      <DropdownMenuItem
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onRenameGroup(group.id, group.name);
                                        }}
                                        className="dark:hover:bg-brand-500/15 dark:hover:text-brand-100"
                                      >
                                        <span>{t("group.renameGroup")}</span>
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onDeleteGroup(group.id);
                                        }}
                                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                                      >
                                        <span>{t("group.deleteGroup")}</span>
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
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
            <Shuffle
              text={t("app.name")}
              shuffleDirection="up"
              duration={1.5}
              loop
              loopDelay={1.2}
              shuffleTimes={1}
              stagger={0.03}
              triggerOnHover={false}
              className="text-center text-5xl font-bold tracking-[0.14em] text-surface-950 dark:text-surface-50 font-[var(--font-zn-display)]"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
