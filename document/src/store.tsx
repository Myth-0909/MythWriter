import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import type { Document, DocumentCategory } from "@/types";
import { api, isLoggedIn } from "@/api";
import { useI18n } from "@/components/I18nProvider";

interface DocumentStore {
  documents: Document[];
  favorites: Document[];
  trash: Document[];
  loading: boolean;
  getDocument: (id: string) => Document | undefined;
  loadDocument: (id: string) => Promise<Document | undefined>;
  createDocument: (category?: DocumentCategory, title?: string, content?: string, groupId?: string | null) => Promise<string>;
  updateDocument: (id: string, updates: Partial<Pick<Document, "title" | "content" | "category" | "groupId">>) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  moveToTrash: (id: string) => Promise<void>;
  restoreFromTrash: (id: string) => Promise<void>;
  permanentlyDelete: (id: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  refreshDocuments: () => Promise<void>;
  refreshTrash: () => Promise<void>;
}

const DocumentStoreContext = createContext<DocumentStore>({
  documents: [],
  favorites: [],
  trash: [],
  loading: false,
  getDocument: () => undefined,
  loadDocument: async () => undefined,
  createDocument: async () => "",
  updateDocument: async () => {},
  toggleFavorite: async () => {},
  moveToTrash: async () => {},
  restoreFromTrash: async () => {},
  permanentlyDelete: async () => {},
  emptyTrash: async () => {},
  refreshDocuments: async () => {},
  refreshTrash: async () => {},
});

export function useDocuments() {
  return useContext(DocumentStoreContext);
}

export function DocumentStoreProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  const activeDocs = documents.filter((d) => !d.isDeleted);
  const favorites = activeDocs.filter((d) => d.isFavorite);
  const trashDocs = documents.filter((d) => d.isDeleted);

  const getDocument = useCallback(
    (id: string) => documents.find((d) => d.id === id),
    [documents]
  );

  const refreshDocuments = useCallback(async () => {
    if (!isLoggedIn()) return;
    setLoading(true);
    try {
      const docsRes = await api.listDocuments();
      setDocuments((prev) => {
        const trashDocs = prev.filter((d) => d.isDeleted);
        return [...docsRes.documents, ...trashDocs];
      });
    } catch (error) {
      console.error("Failed to fetch documents:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshTrash = useCallback(async () => {
    if (!isLoggedIn()) return;
    setLoading(true);
    try {
      const trashRes = await api.listTrash();
      setDocuments((prev) => {
        const activeDocs = prev.filter((d) => !d.isDeleted);
        return [...activeDocs, ...trashRes.documents];
      });
    } catch (error) {
      console.error("Failed to fetch trash:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch (page refresh with existing token)
  useEffect(() => {
    if (isLoggedIn()) {
      refreshDocuments();
    } else {
      setLoading(false);
    }
  }, [refreshDocuments]);

  // Optimistic update helper: replace a document in local state
  const updateLocalDoc = useCallback((updated: Document) => {
    setDocuments((prev) => {
      const idx = prev.findIndex((d) => d.id === updated.id);
      if (idx === -1) return [updated, ...prev];
      const next = [...prev];
      next[idx] = updated;
      return next;
    });
  }, []);

  const loadDocument = useCallback(async (id: string) => {
    if (!isLoggedIn()) return undefined;
    try {
      const { document: doc } = await api.getDocument(id);
      updateLocalDoc(doc);
      return doc;
    } catch (error) {
      console.error("Failed to fetch document:", error);
      return undefined;
    }
  }, [updateLocalDoc]);

  const createDocument = useCallback(async (category?: DocumentCategory, title?: string, content?: string, groupId?: string | null) => {
    const plainText = content ? content.replace(/<[^>]*>/g, "") : "";
    const { document: doc } = await api.createDocument({
      title: title || t("editor.untitled"),
      content: content || "",
      preview: plainText.slice(0, 80) + (plainText.length > 80 ? "..." : ""),
      category: category || "general",
      groupId: groupId || null,
    });
    setDocuments((prev) => [doc, ...prev]);
    return doc.id;
  }, [t]);

  const updateDocument = useCallback(
    async (id: string, updates: Partial<Pick<Document, "title" | "content" | "category" | "groupId">>) => {
      // Optimistic update
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === id
            ? {
                ...d,
                ...updates,
                preview: updates.content
                  ? updates.content.replace(/<[^>]*>/g, "").slice(0, 80) + (updates.content.replace(/<[^>]*>/g, "").length > 80 ? "..." : "")
                  : d.preview,
                updatedAt: new Date().toISOString(),
              }
            : d
        )
      );

      try {
        const { document: doc } = await api.updateDocument(id, updates);
        // Preserve optimistic preview - server won't update preview unless explicitly sent
        const optimisticPreview = updates.content
          ? updates.content.replace(/<[^>]*>/g, "").slice(0, 80) + (updates.content.replace(/<[^>]*>/g, "").length > 80 ? "..." : "")
          : undefined;
        setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, ...doc, ...(optimisticPreview ? { preview: optimisticPreview } : {}) } : d)));
      } catch (error) {
        console.error("Failed to update document:", error);
        // Revert on failure by refetching
        await refreshDocuments();
        throw error;
      }
    },
    [refreshDocuments]
  );

  const toggleFavorite = useCallback(async (id: string) => {
    const { document: doc } = await api.toggleFavorite(id);
    updateLocalDoc(doc);
  }, [updateLocalDoc]);

  const moveToTrash = useCallback(async (id: string) => {
    const { document: doc } = await api.moveToTrash(id);
    updateLocalDoc(doc);
  }, [updateLocalDoc]);

  const restoreFromTrash = useCallback(async (id: string) => {
    const { document: doc } = await api.restoreDocument(id);
    updateLocalDoc(doc);
  }, [updateLocalDoc]);

  const permanentlyDelete = useCallback(async (id: string) => {
    await api.deleteDocument(id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const emptyTrash = useCallback(async () => {
    await api.emptyTrash();
    setDocuments((prev) => prev.filter((d) => !d.isDeleted));
  }, []);

  return (
    <DocumentStoreContext.Provider
      value={{
        documents: activeDocs,
        favorites,
        trash: trashDocs,
        loading,
        getDocument,
        loadDocument,
        createDocument,
        updateDocument,
        toggleFavorite,
        moveToTrash,
        restoreFromTrash,
        permanentlyDelete,
        emptyTrash,
        refreshDocuments,
        refreshTrash,
      }}
    >
      {children}
    </DocumentStoreContext.Provider>
  );
}
