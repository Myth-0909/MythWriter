import { useState, useEffect } from "react";
import { SideNavBar } from "@/components/SideNavBar";
import { DocumentList } from "@/components/DocumentList";
import { TopAppBar } from "@/components/TopAppBar";
import { Editor } from "@/components/Editor";
import { ShareModal } from "@/components/ShareModal";
import { useDocuments } from "@/store";
import { useI18n } from "@/components/I18nProvider";
import { useToast } from "@/components/Toast";
import type { NavId } from "@/components/SideNavBar";
import { formatFullDateTime } from "@/lib/date";

interface EditorPageProps {
  activeNav?: NavId;
  onNavChange?: (id: NavId) => void;
  onLogout?: () => void;
  activeDoc?: string;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export function EditorPage({ activeNav = "documents", onNavChange, onLogout, activeDoc = "", sidebarCollapsed = false, onToggleSidebar }: EditorPageProps) {
  const [activeDocId, setActiveDocId] = useState(activeDoc);
  const [shareOpen, setShareOpen] = useState(false);
  const { t, lang } = useI18n();
  const { getDocument } = useDocuments();
  const { toast } = useToast();

  useEffect(() => {
    setActiveDocId(activeDoc);
  }, [activeDoc]);

  const handleExport = () => {
    const doc = getDocument(activeDocId);
    if (!doc) {
      toast(t("editor.noContent"), "error");
      return;
    }

    const html = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <title>${doc.title}</title>
  <style>
    body { max-width: 720px; margin: 40px auto; padding: 0 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 16px; line-height: 1.8; color: #333; }
    h1 { font-size: 28px; margin-bottom: 8px; }
    .meta { color: #999; font-size: 13px; margin-bottom: 24px; }
  </style>
</head>
<body>
  <h1>${doc.title}</h1>
  <div class="meta">${formatFullDateTime(doc.updatedAt, lang)}${t("date.separator")}${doc.category}</div>
  ${doc.content}
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.title || "document"}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast(t("editor.exported"), "success");
  };

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-white dark:bg-surface-950">
      <TopAppBar
        variant="editor"
        onShare={() => setShareOpen(true)}
        onExport={handleExport}
        onLogout={onLogout}
        onSettings={() => onNavChange?.("settings")}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={onToggleSidebar}
      />

      <div className="flex flex-1 overflow-hidden">
        <SideNavBar activeNav={activeNav} onNavChange={onNavChange ?? (() => {})} collapsed={sidebarCollapsed} />
        <DocumentList activeId={activeDocId} onSelect={setActiveDocId} />
        <div className="flex-1">
          <Editor documentId={activeDocId} />
        </div>
      </div>

      <ShareModal open={shareOpen} onOpenChange={setShareOpen} onExport={handleExport} />
    </div>
  );
}
