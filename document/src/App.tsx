import { useState, useEffect, useCallback } from "react";
import { TopAppBar } from "@/components/TopAppBar";
import { SideNavBar, type NavId } from "@/components/SideNavBar";
import { PageTransition } from "@/components/PageTransition";
import { Editor } from "@/components/Editor";
import { DocumentList } from "@/components/DocumentList";
import { DocumentCenterPage } from "@/pages/DocumentCenterPage";
import { FavoritesPage } from "@/pages/FavoritesPage";
import { WorkRecordsPage } from "@/pages/WorkRecordsPage";
import { WorkRecordsListPage } from "@/pages/WorkRecordsListPage";
import { TrashPage } from "@/pages/TrashPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { ModelConfigPage } from "@/pages/ModelConfigPage";
import { BrainMemoryPage } from "@/pages/BrainMemoryPage";
import { LoginPage } from "@/pages/LoginPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { ShareModal } from "@/components/ShareModal";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AIChatWidget } from "@/components/AIChatWidget";
import { AgentWritePanel } from "@/components/AgentWritePanel";
import { XiaoAnPresence } from "@/components/AtmosphereShowcase";
import { useDocuments } from "@/store";
import { useToast } from "@/components/Toast";
import { useI18n } from "@/components/I18nProvider";
import { useAuth, type UserInfo } from "@/auth";
import { isLoggedIn as checkLoggedIn, clearToken, api } from "@/api";
import { formatFullDateTime } from "@/lib/date";
import { escapeHtml, sanitizeHtml } from "@/lib/html";
import "./App.css";

type Page = "editor" | "workbench" | "documents" | "favorites" | "records" | "record-history" | "share" | "login" | "trash" | "settings" | "model-config" | "brain" | "notfound";

const VALID_PAGES = new Set<string>(["workbench", "documents", "favorites", "records", "record-history", "trash", "settings", "model-config", "login", "brain"]);

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
  if (page === "editor") return editorDocId ? `#/editor/${editorDocId}` : "#/workbench";
  if (page === "share" || page === "notfound") return window.location.hash || "#/workbench";
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

function buildExportWordHtml(title: string, meta: string, content: string): string {
  const safeTitle = escapeHtml(title);
  const safeMeta = escapeHtml(meta);
  const safeContent = sanitizeHtml(content);
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8">
  <title>${safeTitle}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    body { max-width: 720px; margin: 40px auto; padding: 0 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 16px; line-height: 1.8; color: #333; }
    h1 { font-size: 28px; margin-bottom: 8px; }
    .meta { color: #999; font-size: 13px; margin-bottom: 24px; }
  </style>
</head>
<body>
  <h1>${safeTitle}</h1>
  <div class="meta">${safeMeta}</div>
  ${safeContent}
</body>
</html>`;
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

  const { documents, getDocument, loadDocument, loading, refreshDocuments } = useDocuments();
  const [isLoggedIn, setIsLoggedIn] = useState(() => checkLoggedIn());

  // Grouping state
  const [groups, setGroups] = useState<any[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  // Folder Dialog state
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [isEditingFolder, setIsEditingFolder] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [folderFormName, setFolderFormName] = useState("");

  // Delete folder confirmation state
  const [deleteFolderTargetId, setDeleteFolderTargetId] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await api.listGroups();
      setGroups(res.groups || []);
    } catch (err) {
      console.error("Failed to fetch groups:", err);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      fetchGroups();
    }
  }, [isLoggedIn, documents, fetchGroups]);

  // Folder CRUD actions
  const handleOpenCreateFolder = () => {
    setIsEditingFolder(false);
    setEditingFolderId(null);
    setFolderFormName("");
    setFolderModalOpen(true);
  };

  const handleOpenRenameFolder = (id: string, name: string) => {
    setIsEditingFolder(true);
    setEditingFolderId(id);
    setFolderFormName(name);
    setFolderModalOpen(true);
  };

  const handleSaveFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderFormName.trim()) return;

    try {
      if (isEditingFolder && editingFolderId) {
        await api.renameGroup(editingFolderId, { name: folderFormName });
        toast(t("group.renamed"), "success");
      } else {
        await api.createGroup({ name: folderFormName });
        toast(t("group.created"), "success");
      }
      setFolderModalOpen(false);
      fetchGroups();
    } catch (err: any) {
      toast(err.message || t("login.actionFailed"), "error");
    }
  };

  const handleDeleteFolder = async () => {
    if (!deleteFolderTargetId) return;
    try {
      await api.deleteGroup(deleteFolderTargetId);
      toast(t("group.deleted"), "success");
      setDeleteFolderTargetId(null);
      if (activeGroupId === deleteFolderTargetId) {
        setActiveGroupId(null);
      }
      fetchGroups();
      refreshDocuments();
    } catch (err: any) {
      toast(err.message || t("toast.deleteFailed"), "error");
    }
  };
  const [currentPage, setCurrentPage] = useState<Page>(() => {
    const fromHash = pageFromHash(window.location.hash);
    if (fromHash) return fromHash.page;
    return checkLoggedIn() ? "workbench" : "login";
  });
  const [activeNav, setActiveNav] = useState<NavId>(() => {
    const fromHash = pageFromHash(window.location.hash);
    if (fromHash?.page === "editor") return "documents";
    if (fromHash && fromHash.page !== "login" && fromHash.page !== "notfound") return fromHash.page as NavId;
    return "workbench";
  });
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [editorDocId, setEditorDocId] = useState<string>(() => {
    const fromHash = pageFromHash(window.location.hash);
    return fromHash?.page === "editor" ? fromHash.editorId || "" : "";
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [agentWriteOpen, setAgentWriteOpen] = useState(false);

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
      setCurrentPage("workbench");
      setActiveNav("workbench");
      window.location.hash = "#/workbench";
      return;
    }
    if (doc || loading) return;

    let cancelled = false;
    loadDocument(editorDocId).then((loadedDoc) => {
      if (cancelled || getDocument(editorDocId)) return;
      if (!loadedDoc || loadedDoc.isDeleted) {
        setEditorDocId("");
        setCurrentPage("workbench");
        setActiveNav("workbench");
        window.location.hash = "#/workbench";
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
          setCurrentPage("workbench");
          setActiveNav("workbench");
          window.location.hash = "#/workbench";
        }
      } else {
        const defaultPage = checkLoggedIn() ? "workbench" : "login";
        setCurrentPage(defaultPage);
        if (defaultPage === "workbench") setActiveNav("workbench");
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const handleNavChange = (id: NavId) => {
    if (id === "workbench") {
      setActiveGroupId(null);
    }
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

  const handleLogin = (user: UserInfo) => {
    updateUser(user);
    setIsLoggedIn(true);
    setActiveGroupId(null);
    setCurrentPage("workbench");
    setActiveNav("workbench");
    window.location.hash = "#/workbench";
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
      content = buildExportWordHtml(title, meta, doc.content);
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
    : currentPage === "settings" || currentPage === "model-config" ? "settings"
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
    <div className="h-screen min-w-[1024px] overflow-x-auto bg-white dark:bg-surface-950">
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
            <SideNavBar
              activeNav={activeNav}
              onNavChange={handleNavChange}
              collapsed={sidebarCollapsed}
              groups={groups}
              activeGroupId={activeGroupId}
              onSelectGroup={(id) => {
                setActiveGroupId(id);
                navigateTo("documents", "documents");
              }}
              onAddGroup={handleOpenCreateFolder}
              onRenameGroup={handleOpenRenameFolder}
              onDeleteGroup={(id) => setDeleteFolderTargetId(id)}
            />
          )}

          <PageTransition pageKey={currentPage}>
            {currentPage === "editor" && (
              <EditorPageContent activeDocId={editorDocId} onSelectDoc={handleOpenDoc} />
            )}
            {currentPage === "workbench" && (
              <DocumentCenterPage
                mode="workbench"
                onOpenDoc={handleOpenDoc}
                onOpenAgentWrite={() => setAgentWriteOpen(true)}
                onOpenBrain={() => handleNavChange("brain")}
                groups={groups}
              />
            )}
            {currentPage === "documents" && (
              <DocumentCenterPage
                mode="documents"
                onOpenDoc={handleOpenDoc}
                onOpenAgentWrite={() => setAgentWriteOpen(true)}
                onOpenBrain={() => handleNavChange("brain")}
                groups={groups}
                activeGroupId={activeGroupId}
                setActiveGroupId={setActiveGroupId}
              />
            )}
            {currentPage === "favorites" && (
              <FavoritesPage onOpenDoc={handleOpenDoc} />
            )}
            {currentPage === "records" && (
              <WorkRecordsPage />
            )}
            {currentPage === "record-history" && (
              <WorkRecordsListPage />
            )}
            {currentPage === "trash" && (
              <TrashPage />
            )}
            {currentPage === "settings" && (
              <SettingsPage />
            )}
            {currentPage === "model-config" && (
              <ModelConfigPage />
            )}
            {currentPage === "brain" && (
              <BrainMemoryPage />
            )}
            {currentPage === "notfound" && (
              <NotFoundPage onGoHome={() => navigateTo("workbench", "workbench")} />
            )}
          </PageTransition>
        </div>
      </div>

      {currentPage !== "notfound" && (
        <AIChatWidget currentDocumentId={currentPage === "editor" ? editorDocId ?? undefined : undefined} />
      )}
      {currentPage !== "notfound" && (
        <XiaoAnPresence
          currentPage={currentPage}
          onOpenAgentWrite={() => setAgentWriteOpen(true)}
          onOpenBrain={() => handleNavChange("brain")}
        />
      )}

      <ShareModal open={shareOpen} onOpenChange={setShareOpen} onExport={handleExport} />
      <AgentWritePanel open={agentWriteOpen} onOpenChange={setAgentWriteOpen} onOpenDocument={handleOpenDoc} currentDocumentId={currentPage === "editor" ? editorDocId ?? undefined : undefined} />

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

      {/* Create / Rename Folder Modal */}
      <Dialog open={folderModalOpen} onOpenChange={setFolderModalOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogTitle>{isEditingFolder ? t("group.renameGroup") : t("group.newGroup")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("group.formDesc")}
          </DialogDescription>
          <form onSubmit={handleSaveFolder} className="flex flex-col gap-4 mt-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-surface-600 dark:text-surface-300">
                {t("group.groupName")}
              </label>
              <Input
                type="text"
                required
                value={folderFormName}
                onChange={(e) => setFolderFormName(e.target.value)}
                placeholder={t("group.groupNamePlaceholder")}
                className="h-9 text-xs dark:border-surface-850 dark:bg-surface-900 dark:text-surface-100"
              />
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <Button
                type="button"
                onClick={() => setFolderModalOpen(false)}
                variant="outline"
                size="sm"
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-brand-500 text-white hover:bg-brand-600 dark:bg-brand-500 dark:text-white dark:hover:bg-brand-600"
              >
                {t("common.confirm")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Folder Modal */}
      <ConfirmModal
        open={!!deleteFolderTargetId}
        onOpenChange={(open) => !open && setDeleteFolderTargetId(null)}
        title={t("group.deleteGroup")}
        description={t("group.deleteGroupDesc")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        onConfirm={handleDeleteFolder}
      />
    </div>
  );
}
