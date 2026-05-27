import { useState, useEffect, useCallback } from "react";
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
import { NotFoundPage } from "@/pages/NotFoundPage";
import { ShareModal } from "@/components/ShareModal";
import { ConfirmModal } from "@/components/ConfirmModal";
import { AIChatWidget } from "@/components/AIChatWidget";
import { useDocuments } from "@/store";
import { useToast } from "@/components/Toast";
import { useI18n } from "@/components/I18nProvider";
import { useAuth } from "@/auth";
import { isLoggedIn as checkLoggedIn, clearToken, api } from "@/api";
import { formatFullDateTime } from "@/lib/date";
import { escapeHtml, sanitizeHtml } from "@/lib/html";
import "./App.css";

export type NavId = "documents" | "favorites" | "trash" | "settings";
type Page = "editor" | "documents" | "favorites" | "share" | "login" | "trash" | "settings" | "notfound";

const VALID_PAGES = new Set<string>(["documents", "favorites", "trash", "settings", "login"]);

function pageFromHash(hash: string): { page: Page; editorId?: string } | null {
  const name = hash.replace(/^#\//, "");
  if (VALID_PAGES.has(name)) return { page: name as Page };
  if (name.startsWith("editor/")) {
    const id = name.slice(7); // "editor/".length === 7
    return { page: "editor", editorId: id || undefined };
  }
  if (hash === "" || hash === "#" || hash === "#/") return null;
  return { page: "notfound" };
}

function hashFromPage(page: Page, editorDocId?: string): string {
  if (page === "editor") return editorDocId ? `#/editor/${editorDocId}` : "#/documents";
  if (page === "share" || page === "notfound") return window.location.hash || "#/documents";
  return `#/${page}`;
}

function safeFilename(value: string): string {
  return (value || "document").replace(/[\\/:*?"<>|]/g, "_");
}

function buildExportHtml(title: string, meta: string, content: string): string {
  const safeTitle = escapeHtml(title);
  const safeMeta = escapeHtml(meta);
  const safeContent = sanitizeHtml(content);
  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <title>${safeTitle}</title>
  <style>
    body { max-width: 720px; margin: 40px auto; padding: 0 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 16px; line-height: 1.8; color: #333; }
    h1 { font-size: 28px; margin-bottom: 8px; }
    .meta { color: #999; font-size: 13px; margin-bottom: 24px; }
    @media print { body { margin: 0 auto; } }
  </style>
</head>
<body>
  <h1>${safeTitle}</h1>
  <div class="meta">${safeMeta}</div>
  ${safeContent}
</body>
</html>`;
}

function printHtmlAsPdf(html: string): boolean {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
  return true;
}

function EditorPageContent({ activeDocId, onSelectDoc }: { activeDocId: string; onSelectDoc: (id: string) => void }) {
  return (
    <>
      <DocumentList activeId={activeDocId} onSelect={onSelectDoc} />
      <div className="flex-1">
        <Editor documentId={activeDocId} key={activeDocId} />
      </div>
    </>
  );
}

export default function App() {
  const { toast } = useToast();
  const { t, lang } = useI18n();
  const { updateUser } = useAuth();

  useEffect(() => {
    api.updateProfile({ lang }).catch(() => {});
  }, [lang]);

  const { getDocument, loadDocument, loading, refreshDocuments } = useDocuments();
  const [currentPage, setCurrentPage] = useState<Page>(() => {
    const fromHash = pageFromHash(window.location.hash);
    if (fromHash) return fromHash.page;
    return checkLoggedIn() ? "documents" : "login";
  });
  const [isLoggedIn, setIsLoggedIn] = useState(() => checkLoggedIn());
  const [activeNav, setActiveNav] = useState<NavId>(() => {
    const fromHash = pageFromHash(window.location.hash);
    if (fromHash && fromHash.page !== "login" && fromHash.page !== "notfound") return fromHash.page as NavId;
    return "documents";
  });
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [editorDocId, setEditorDocId] = useState<string>(() => {
    const fromHash = pageFromHash(window.location.hash);
    return fromHash?.page === "editor" ? fromHash.editorId || "" : "";
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  // Verify token validity on mount
  useEffect(() => {
    if (!checkLoggedIn()) return;
    api.getProfile().catch(() => {
      clearToken();
      setIsLoggedIn(false);
      setCurrentPage("login");
    });
  }, []);

  // Keep deep-linked editor pages valid after refreshes and trash moves.
  useEffect(() => {
    if (currentPage !== "editor" || !editorDocId) return;
    const doc = getDocument(editorDocId);
    if (doc?.isDeleted) {
      setEditorDocId("");
      setCurrentPage("documents");
      setActiveNav("documents");
      window.location.hash = "#/documents";
      return;
    }
    if (doc || loading) return;

    let cancelled = false;
    loadDocument(editorDocId).then((loadedDoc) => {
      if (cancelled || getDocument(editorDocId)) return;
      if (!loadedDoc || loadedDoc.isDeleted) {
        setEditorDocId("");
        setCurrentPage("documents");
        setActiveNav("documents");
        window.location.hash = "#/documents";
      }
    });

    return () => {
      cancelled = true;
    };
  }, [currentPage, editorDocId, getDocument, loadDocument, loading]);

  // Navigate to a page and update hash
  const navigateTo = useCallback((page: Page, navId?: NavId) => {
    setCurrentPage(page);
    if (navId) setActiveNav(navId);
    const hash = hashFromPage(page, editorDocId);
    if (hash !== window.location.hash) {
      window.location.hash = hash;
    }
  }, [editorDocId]);

  // Listen for browser back/forward
  useEffect(() => {
    const onHashChange = () => {
      const fromHash = pageFromHash(window.location.hash);
      if (fromHash) {
        setCurrentPage(fromHash.page);
        if (fromHash.page === "editor" && fromHash.editorId) {
          setEditorDocId(fromHash.editorId);
          setActiveNav("documents");
        } else if (fromHash.page !== "login" && fromHash.page !== "notfound") {
          setActiveNav(fromHash.page as NavId);
        }
        if (fromHash.page === "login" && checkLoggedIn()) {
          setCurrentPage("documents");
          window.location.hash = "#/documents";
        }
      } else {
        const defaultPage = checkLoggedIn() ? "documents" : "login";
        setCurrentPage(defaultPage);
        if (defaultPage === "documents") setActiveNav("documents");
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const handleNavChange = (id: NavId) => {
    navigateTo(id, id);
  };

  const handleOpenDoc = (docId: string) => {
    setEditorDocId(docId);
    setCurrentPage("editor");
    setActiveNav("documents");
    window.location.hash = `#/editor/${docId}`;
  };

  const handleLogout = () => setLogoutConfirm(true);

  const confirmLogout = () => {
    clearToken();
    setIsLoggedIn(false);
    setCurrentPage("login");
    setEditorDocId("");
    window.location.hash = "#/login";
    toast(t("toast.logoutSuccess"), "success");
  };

  const handleLogin = (user: { id: string; name: string; email: string; avatar: string | null }) => {
    updateUser(user);
    setIsLoggedIn(true);
    setCurrentPage("documents");
    setActiveNav("documents");
    window.location.hash = "#/documents";
    refreshDocuments();
  };

  const handleExport = (format: string) => {
    const doc = getDocument(editorDocId);
    if (!doc) {
      toast(t("editor.noContent"), "error");
      return;
    }

    const title = safeFilename(doc.title || "document");
    const dateStr = formatFullDateTime(doc.updatedAt, lang);
    const meta = `${dateStr}${t("date.separator")}${doc.category}`;
    let content: string;
    let mime: string;
    let ext: string;

    if (format === "pdf") {
      const html = buildExportHtml(title, meta, doc.content);
      if (!printHtmlAsPdf(html)) {
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${title}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      toast(t("editor.exported"), "success");
      return;
    }

    if (format === "txt") {
      const tmp = document.createElement("div");
      tmp.innerHTML = doc.content;
      content = `# ${title}\n${meta}\n\n${tmp.textContent || ""}`;
      mime = "text/plain;charset=utf-8";
      ext = "txt";
    } else if (format === "md") {
      let md = doc.content
        .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n")
        .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n")
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
      content = `# ${title}\n${meta}\n\n${md.trim()}`;
      mime = "text/markdown;charset=utf-8";
      ext = "md";
    } else if (format === "word") {
      content = buildExportHtml(title, meta, doc.content);
      mime = "application/msword;charset=utf-8";
      ext = "doc";
    } else {
      content = buildExportHtml(title, meta, doc.content);
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

  // Login page
  if (!isLoggedIn && currentPage !== "login") {
    return <LoginPage onLogin={handleLogin} />;
  }
  if (currentPage === "login") {
    return <LoginPage onLogin={handleLogin} />;
  }

  // Not logged in but trying to access protected pages — handled above, will show login

  return (
    <div className="h-screen w-screen overflow-hidden bg-white dark:bg-surface-950">
      <div className="flex h-full w-full flex-col">
        {currentPage !== "notfound" && (
          <TopAppBar
            variant={topBarVariant}
            onShare={currentPage === "editor" || currentPage === "share" ? () => setShareOpen(true) : undefined}
            onExport={currentPage === "editor" ? handleExport : undefined}
            onLogout={handleLogout}
            onSettings={() => handleNavChange("settings")}
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
        )}

        <div className="flex flex-1 overflow-hidden">
          {currentPage !== "notfound" && (
            <SideNavBar activeNav={activeNav} onNavChange={handleNavChange} collapsed={sidebarCollapsed} />
          )}

          <PageTransition pageKey={currentPage}>
            {currentPage === "editor" && (
              <EditorPageContent activeDocId={editorDocId} onSelectDoc={handleOpenDoc} />
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
            {currentPage === "notfound" && (
              <NotFoundPage onGoHome={() => navigateTo("documents", "documents")} />
            )}
          </PageTransition>
        </div>
      </div>

      {currentPage !== "notfound" && <AIChatWidget />}

      <ShareModal open={shareOpen} onOpenChange={setShareOpen} onExport={handleExport} />

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
