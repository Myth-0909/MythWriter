import { useState, useEffect } from "react";
import { TopAppBar } from "@/components/TopAppBar";
import { SideNavBar } from "@/components/SideNavBar";
import { PageTransition } from "@/components/PageTransition";
import { Editor } from "@/components/Editor";
import { DocumentList } from "@/components/DocumentList";
import { DocumentCenterPage } from "@/pages/DocumentCenterPage";
import { FavoritesPage } from "@/pages/FavoritesPage";
import { TrashPage } from "@/pages/TrashPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { LoginPage } from "@/pages/LoginPage";
import { ShareModal } from "@/components/ShareModal";
import { ConfirmModal } from "@/components/ConfirmModal";
import { AIChatWidget } from "@/components/AIChatWidget";
import { useDocuments } from "@/store";
import { useToast } from "@/components/Toast";
import { useI18n } from "@/components/I18nProvider";
import { useAuth } from "@/auth";
import { isLoggedIn as checkLoggedIn, clearToken, api } from "@/api";
import "./App.css";

export type NavId = "documents" | "favorites" | "trash" | "settings";
type Page = "editor" | "documents" | "favorites" | "share" | "login" | "trash" | "settings";

function EditorPageContent({ activeDocId, setActiveDocId }: { activeDocId: string; setActiveDocId: (id: string) => void }) {
  return (
    <>
      <DocumentList activeId={activeDocId} onSelect={setActiveDocId} />
      <div className="flex-1">
        <Editor documentId={activeDocId} />
      </div>
    </>
  );
}

export default function App() {
  const { toast } = useToast();
  const { t, lang } = useI18n();
  const { updateUser } = useAuth();

  // Sync language preference to DB
  useEffect(() => {
    api.updateProfile({ lang }).catch(() => {});
  }, [lang]);
  const { getDocument, refreshDocuments } = useDocuments();
  const [currentPage, setCurrentPage] = useState<Page>("documents");
  const [isLoggedIn, setIsLoggedIn] = useState(() => checkLoggedIn());
  const [activeNav, setActiveNav] = useState<NavId>("documents");
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [editorDocId, setEditorDocId] = useState<string>("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const handleNavChange = (id: NavId) => {
    setActiveNav(id);
    switch (id) {
      case "documents": setCurrentPage("documents"); break;
      case "favorites": setCurrentPage("favorites"); break;
      case "trash": setCurrentPage("trash"); break;
      case "settings": setCurrentPage("settings"); break;
    }
  };

  const handleOpenDoc = (docId: string) => {
    setEditorDocId(docId);
    setCurrentPage("editor");
    setActiveNav("documents");
  };

  const handleLogout = () => setLogoutConfirm(true);

  const confirmLogout = () => {
    clearToken();
    setIsLoggedIn(false);
    setCurrentPage("login");
    setEditorDocId("");
    toast(t("toast.logoutSuccess"), "success");
  };

  const handleLogin = (user: { id: string; name: string; email: string; avatar: string | null }) => {
    updateUser(user);
    setIsLoggedIn(true);
    setCurrentPage("documents");
    refreshDocuments();
  };

  const handleExport = (format: string) => {
    const doc = getDocument(editorDocId);
    if (!doc) {
      toast(t("editor.noContent"), "error");
      return;
    }

    const title = doc.title || "document";
    const dateStr = new Date(doc.updatedAt).toLocaleDateString("zh-CN");
    let content: string;
    let mime: string;
    let ext: string;

    if (format === "txt") {
      // Strip HTML tags
      const tmp = document.createElement("div");
      tmp.innerHTML = doc.content;
      content = `# ${title}\n${dateStr} · ${doc.category}\n\n${tmp.textContent || ""}`;
      mime = "text/plain;charset=utf-8";
      ext = "txt";
    } else if (format === "md") {
      // Simple HTML-to-Markdown (headings, paragraphs, bold, italic)
      let md = doc.content
        .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n")
        .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n")
        .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n")
        .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
        .replace(/<p[^>]*>/gi, "")
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**")
        .replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**")
        .replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*")
        .replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*")
        .replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`")
        .replace(/<pre[^>]*>(.*?)<\/pre>/gi, "```\n$1\n```\n")
        .replace(/<[^>]+>/g, "");
      content = `# ${title}\n${dateStr} · ${doc.category}\n\n${md.trim()}`;
      mime = "text/markdown;charset=utf-8";
      ext = "md";
    } else {
      // HTML (default)
      content = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { max-width: 720px; margin: 40px auto; padding: 0 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 16px; line-height: 1.8; color: #333; }
    h1 { font-size: 28px; margin-bottom: 8px; }
    .meta { color: #999; font-size: 13px; margin-bottom: 24px; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="meta">${dateStr} · ${doc.category}</div>
  ${doc.content}
</body>
</html>`;
      mime = "text/html;charset=utf-8";
      ext = "html";
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast(t("editor.exported"), "success");
  };

  const topBarVariant: "editor" | "documents" | "trash" | "settings" =
    currentPage === "editor" || currentPage === "share" ? "editor"
    : currentPage === "trash" ? "trash"
    : currentPage === "settings" ? "settings"
    : "documents";

  if (!isLoggedIn && currentPage !== "login") {
    return <LoginPage onLogin={handleLogin} />;
  }
  if (currentPage === "login") {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-white dark:bg-surface-950">
      <div className="flex h-full w-full flex-col">
        <TopAppBar
          variant={topBarVariant}
          onShare={currentPage === "editor" || currentPage === "share" ? () => setShareOpen(true) : undefined}
          onExport={currentPage === "editor" ? handleExport : undefined}
          onLogout={handleLogout}
          onSettings={() => handleNavChange("settings")}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        <div className="flex flex-1 overflow-hidden">
          <SideNavBar activeNav={activeNav} onNavChange={handleNavChange} collapsed={sidebarCollapsed} />

          <PageTransition pageKey={currentPage}>
            {currentPage === "editor" && (
              <EditorPageContent activeDocId={editorDocId} setActiveDocId={setEditorDocId} />
            )}
            {currentPage === "documents" && (
              <DocumentCenterPage onOpenDoc={handleOpenDoc} />
            )}
            {currentPage === "favorites" && (
              <FavoritesPage onOpenDoc={handleOpenDoc} />
            )}
            {currentPage === "trash" && (
              <TrashPage />
            )}
            {currentPage === "settings" && (
              <SettingsPage />
            )}
          </PageTransition>
        </div>
      </div>

      <AIChatWidget />

      <ShareModal open={shareOpen} onOpenChange={setShareOpen} />

      <ConfirmModal
        open={logoutConfirm}
        onOpenChange={setLogoutConfirm}
        title={t("confirm.logoutTitle")}
        description={t("confirm.logoutDesc")}
        confirmLabel={t("topbar.logout")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        onConfirm={confirmLogout}
      />
    </div>
  );
}
