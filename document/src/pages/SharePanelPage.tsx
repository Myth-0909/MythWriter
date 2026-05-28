import { useState } from "react";
import { SideNavBar } from "@/components/SideNavBar";
import { TopAppBar } from "@/components/TopAppBar";
import { ShareModal } from "@/components/ShareModal";
import { Search } from "lucide-react";
import type { NavId } from "@/components/SideNavBar";

const notes = [
  {
    id: "1",
    title: "Modern Minimalist Writing",
    preview:
      "Exploring the intersections of cognitive ease and aesthetic purity in digital editor design...",
    category: "Research",
    date: "2 hours ago",
    active: true,
  },
  {
    id: "2",
    title: "Product Roadmap Q4",
    preview:
      "The focus for the upcoming quarter remains on stability and collaborative features...",
    category: "Planning",
    date: "Yesterday",
  },
];

interface SharePanelPageProps {
  activeNav?: NavId;
  onNavChange?: (id: NavId) => void;
  onLogout?: () => void;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export function SharePanelPage({ activeNav = "documents", onNavChange, onLogout, sidebarCollapsed = false, onToggleSidebar }: SharePanelPageProps) {
  const [shareOpen, setShareOpen] = useState(true);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-white dark:bg-surface-950">
      <TopAppBar
        variant="editor"
        onShare={() => setShareOpen(true)}
        onLogout={onLogout}
        onSettings={() => onNavChange?.("settings")}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={onToggleSidebar}
      />

      <div className="flex flex-1 overflow-hidden">
        <SideNavBar activeNav={activeNav} onNavChange={onNavChange ?? (() => {})} collapsed={sidebarCollapsed} />

        <div className="flex w-[320px] shrink-0 flex-col border-r border-surface-200 dark:border-surface-800">
          <div className="border-b border-surface-200 px-4 py-4 dark:border-surface-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                placeholder="Search notes..."
                className="w-full rounded-md border border-surface-200 bg-surface-50 py-2 pl-9 pr-3 text-sm text-surface-900 placeholder:text-surface-400 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-surface-300 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-100"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {notes.map((note) => (
              <button
                key={note.id}
                className={`w-full border-b border-surface-100 px-4 py-4 text-left transition-all duration-200 hover:bg-surface-50 active:scale-[0.98] cursor-pointer dark:border-surface-800 dark:hover:bg-surface-900 ${
                  note.active ? "bg-surface-50 dark:bg-surface-900" : ""
                }`}
              >
                <h3 className="mb-1 text-sm font-semibold text-surface-900 dark:text-surface-100">
                  {note.title}
                </h3>
                <p className="mb-2 text-xs leading-relaxed text-surface-500 line-clamp-2">
                  {note.preview}
                </p>
                <div className="flex items-center gap-2 text-[10px] text-surface-400">
                  <span>{note.category}</span>
                  <span>·</span>
                  <span>{note.date}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-white dark:bg-surface-950">
          <div className="mx-auto max-w-[720px] px-16 py-24">
            <h1 className="mb-12 text-[32px] font-bold leading-tight text-surface-900 dark:text-surface-100">
              Modern Minimalist Writing
            </h1>
            <div className="space-y-6 text-[15px] leading-relaxed text-surface-600 dark:text-surface-300">
              <p>
                The essence of high-end digital design for writers lies in the concept of
                "Frameless" environments. When we strip away the redundant toolbars and heavy
                shadows, we allow the mind to occupy the space entirely.
              </p>
              <p>
                Consider the placement of the cursor—a 2px Electric Blue line pulsing softly.
                It is the only point of active intent in a sea of pristine whitespace.
              </p>
            </div>
          </div>
        </div>
      </div>

      <ShareModal open={shareOpen} onOpenChange={setShareOpen} onExport={() => {}} />
    </div>
  );
}
