import { useEffect, useRef, useState } from "react";
import { Bot, Database, Eye, EyeOff, Loader2, Pencil, PlugZap, Trash2, X } from "lucide-react";
import { api } from "@/api";
import type { ApiKeyHistory } from "@/api";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useI18n } from "@/components/I18nProvider";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Scrollbar } from "@/components/ui/scrollbar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip } from "@/components/ui/tooltip";

const DEFAULT_BASE_URL = "http://172.16.76.112:8000/v1";
const DEFAULT_MODEL = "google/gemma-4-31B-it";
const DEFAULT_API_KEY_PLACEHOLDER = "sk-7d2a1b5c9e4f8a0b3c6d9e1f2a5b8c4d";
const DEFAULT_EMBEDDING_BASE_URL = "http://172.16.76.112:8001/v1";
const DEFAULT_EMBEDDING_MODEL = "Qwen/Qwen3-Embedding-8B";

function findCurrentHistoryId(histories: ApiKeyHistory[], current: { baseUrl: string; model: string; masked: string }) {
  return histories.find((item) => (
    item.baseUrl === current.baseUrl &&
    item.model === current.model &&
    item.masked === current.masked
  ))?.id || "";
}

export function ModelConfigPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [maskedKey, setMaskedKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [testReply, setTestReply] = useState("");
  const [applyingHistory, setApplyingHistory] = useState(false);
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [keyEditable, setKeyEditable] = useState(false);
  const [apiKeyHistories, setApiKeyHistories] = useState<ApiKeyHistory[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState("");
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [verifyPassword, setVerifyPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [noKeyHintDismissed, setNoKeyHintDismissed] = useState(
    () => localStorage.getItem("apikey-hint-dismissed") === "true"
  );

  const [embeddingApiKey, setEmbeddingApiKey] = useState("");
  const [embeddingMaskedKey, setEmbeddingMaskedKey] = useState("");
  const [embeddingBaseUrl, setEmbeddingBaseUrl] = useState(DEFAULT_EMBEDDING_BASE_URL);
  const [embeddingModel, setEmbeddingModel] = useState(DEFAULT_EMBEDDING_MODEL);
  const [showEmbeddingKey, setShowEmbeddingKey] = useState(false);
  const [embeddingEditable, setEmbeddingEditable] = useState(false);
  const [savingEmbedding, setSavingEmbedding] = useState(false);

  useEffect(() => {
    api.getApiKey().then((res) => {
      setMaskedKey(res.masked);
      setBaseUrl(res.baseUrl);
      setModel(res.model);
      setApiKey(res.masked);
      setApiKeyHistories(res.histories || []);
      setSelectedHistoryId(findCurrentHistoryId(res.histories || [], {
        baseUrl: res.baseUrl,
        model: res.model,
        masked: res.masked,
      }));
      if (!res.hasKey) setKeyEditable(true);
    }).catch(() => {});

    api.getEmbeddingConfig().then((res) => {
      setEmbeddingMaskedKey(res.masked);
      setEmbeddingBaseUrl(res.baseUrl);
      setEmbeddingModel(res.model);
      setEmbeddingApiKey(res.masked);
      setEmbeddingEditable(false);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (verifyDialogOpen && passwordInputRef.current) {
      const timer = setTimeout(() => passwordInputRef.current?.focus(), 150);
      return () => clearTimeout(timer);
    }
  }, [verifyDialogOpen]);

  const isLocked = !!maskedKey && !keyEditable;

  const handleVerifyPassword = async () => {
    if (!verifyPassword) return;
    setVerifying(true);
    try {
      await api.verifyPassword(verifyPassword);
      setKeyEditable(true);
      setVerifyDialogOpen(false);
      setVerifyPassword("");
    } catch {
      toast(t("apikey.wrongPassword"), "error");
    } finally {
      setVerifying(false);
    }
  };

  const handleApplyHistory = async (historyId: string) => {
    if (!historyId) return;
    setSelectedHistoryId(historyId);
    setApplyingHistory(true);
    try {
      const res = await api.applyApiKeyHistory(historyId);
      setMaskedKey(res.masked);
      setBaseUrl(res.baseUrl);
      setModel(res.model);
      setApiKey(res.masked);
      setApiKeyHistories(res.histories || []);
      setSelectedHistoryId(findCurrentHistoryId(res.histories || [], {
        baseUrl: res.baseUrl,
        model: res.model,
        masked: res.masked,
      }));
      setKeyEditable(false);
      setShowKey(false);
      toast(t("apikey.historyApplied"), "success");
    } catch {
      toast(t("apikey.historyApplyFailed"), "error");
    } finally {
      setApplyingHistory(false);
    }
  };

  const handleDeleteHistory = async (historyId: string) => {
    if (!historyId || deletingHistoryId) return;
    if (historyId === selectedHistoryId) {
      toast(t("apikey.historyCurrentCannotDelete"), "info");
      return;
    }

    setDeletingHistoryId(historyId);
    try {
      const res = await api.deleteApiKeyHistory(historyId);
      setApiKeyHistories(res.histories || []);
      toast(t("apikey.historyDeleted"), "success");
    } catch {
      toast(t("apikey.historyDeleteFailed"), "error");
    } finally {
      setDeletingHistoryId(null);
    }
  };

  const handleSaveChatConfig = async () => {
    if ((!maskedKey && !apiKey.trim()) || !baseUrl.trim() || !model.trim()) return;
    setSavingKey(true);
    try {
      await api.saveApiKey({
        ...(apiKey.trim() && { apiKey: apiKey.trim() }),
        baseUrl: baseUrl.trim(),
        model: model.trim(),
      });
      const res = await api.getApiKey();
      setMaskedKey(res.masked);
      setBaseUrl(res.baseUrl);
      setModel(res.model);
      setApiKeyHistories(res.histories || []);
      setSelectedHistoryId(findCurrentHistoryId(res.histories || [], {
        baseUrl: res.baseUrl,
        model: res.model,
        masked: res.masked,
      }));
      setApiKey("");
      setKeyEditable(false);
      toast(t("apikey.saved"), "success");
    } catch {
      toast(t("apikey.saveFailed"), "error");
    } finally {
      setSavingKey(false);
    }
  };

  const handleSaveEmbeddingConfig = async () => {
    if (!embeddingBaseUrl.trim() || !embeddingModel.trim()) return;
    setSavingEmbedding(true);
    try {
      await api.saveEmbeddingConfig({
        ...(embeddingApiKey.trim() && embeddingApiKey !== embeddingMaskedKey && { apiKey: embeddingApiKey.trim() }),
        baseUrl: embeddingBaseUrl.trim(),
        model: embeddingModel.trim(),
      });
      const res = await api.getEmbeddingConfig();
      setEmbeddingMaskedKey(res.masked);
      setEmbeddingBaseUrl(res.baseUrl);
      setEmbeddingModel(res.model);
      setEmbeddingApiKey(res.masked);
      setShowEmbeddingKey(false);
      setEmbeddingEditable(false);
      toast(t("modelConfig.embeddingSaved"), "success");
    } catch {
      toast(t("modelConfig.embeddingSaveFailed"), "error");
    } finally {
      setSavingEmbedding(false);
    }
  };

  const handleTestChatConfig = async () => {
    if ((!maskedKey && !apiKey.trim()) || !baseUrl.trim() || !model.trim()) return;
    setTestingKey(true);
    setTestReply("");
    try {
      const res = await api.testApiKey({
        ...(apiKey.trim() && apiKey !== maskedKey && { apiKey: apiKey.trim() }),
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        prompt: "你好！",
      });
      setTestReply(res.reply || t("apikey.testConnectivitySuccess"));
      toast(t("apikey.testConnectivitySuccess"), "success");
    } catch {
      toast(t("apikey.testConnectivityFailed"), "error");
    } finally {
      setTestingKey(false);
    }
  };

  return (
    <Scrollbar className="flex-1 bg-surface-50 dark:bg-surface-950">
      <div className="mx-auto max-w-[760px] px-20 py-20">
        <div className="mb-8">
          <h2 className="text-[28px] font-bold leading-tight text-surface-900 dark:text-surface-100">
            {t("modelConfig.title")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-surface-500 dark:text-surface-400">
            {t("modelConfig.subtitle")}
          </p>
        </div>

        <div className="flex flex-col gap-6">
          <section className="rounded-xl border border-surface-200 bg-white p-6 dark:border-surface-800 dark:bg-surface-900">
            <div className="mb-6 flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-surface-900 dark:text-surface-100">
                  {t("modelConfig.chatTitle")}
                </h3>
                <p className="mt-0.5 text-xs leading-relaxed text-surface-500">
                  {t("modelConfig.chatDesc")}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {!maskedKey && !noKeyHintDismissed && (
                <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950">
                  <span className="text-xs text-amber-700 dark:text-amber-300">
                    {t("apikey.noKeyHint")}
                  </span>
                  <button
                    onClick={() => {
                      setNoKeyHintDismissed(true);
                      localStorage.setItem("apikey-hint-dismissed", "true");
                    }}
                    className="ml-2 shrink-0 cursor-pointer text-amber-400 hover:text-amber-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-surface-500">
                  {t("apikey.history")}
                </label>
                <Select
                  value={selectedHistoryId}
                  onValueChange={handleApplyHistory}
                  disabled={isLocked || applyingHistory || apiKeyHistories.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={apiKeyHistories.length > 0 ? t("apikey.historyPlaceholder") : t("apikey.noHistory")} />
                  </SelectTrigger>
                  <SelectContent>
                    {apiKeyHistories.map((item, index) => {
                      const isCurrent = item.id === selectedHistoryId;
                      const isDeleting = deletingHistoryId === item.id;
                      const deleteDisabled = isLocked || isDeleting;
                      return (
                        <SelectItem
                          key={item.id}
                          value={item.id}
                          index={index}
                          rightSlot={
                            <Tooltip
                              content={isCurrent ? t("apikey.historyCurrentCannotDelete") : t("apikey.deleteHistory")}
                              delay={150}
                            >
                              <button
                                type="button"
                                disabled={deleteDisabled}
                                aria-label={t("apikey.deleteHistory")}
                                onPointerUp={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onPointerDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (deleteDisabled) return;
                                  setConfirmDeleteId(item.id);
                                }}
                                className="relative z-10 mr-1 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-surface-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-surface-400 dark:hover:bg-red-950/30"
                              >
                                {isDeleting ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </Tooltip>
                          }
                        >
                          <div className="grid w-full min-w-0 justify-items-start gap-1 py-0.5 text-left">
                            <span className="block max-w-full truncate text-left text-xs font-semibold leading-tight text-surface-800 dark:text-surface-100">
                              {item.model}
                            </span>
                            <span className="block max-w-full truncate text-left text-[10px] leading-tight text-surface-400">
                              {item.baseUrl}
                            </span>
                            <span className="w-fit rounded bg-surface-100 px-1.5 py-0.5 text-[10px] leading-none text-surface-500 dark:bg-surface-800 dark:text-surface-400">
                              {item.masked}
                            </span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-surface-500">
                  {t("apikey.baseUrl")}
                </label>
                <Input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder={t("apikey.baseUrlPlaceholder")}
                  disabled={isLocked}
                />
                <p className="mt-1 text-xs text-surface-500">{t("apikey.baseUrlDesc")}</p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-surface-500">
                  {t("apikey.model")}
                </label>
                <Input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={t("apikey.modelPlaceholder")}
                  disabled={isLocked}
                />
                <p className="mt-1 text-xs text-surface-500">{t("apikey.modelDesc")}</p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-surface-500">
                  {t("apikey.label")}
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={DEFAULT_API_KEY_PLACEHOLDER}
                      disabled={isLocked}
                      className="pr-9"
                    />
                    <button
                      onClick={() => setShowKey(!showKey)}
                      disabled={isLocked && !keyEditable}
                      className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-surface-400 hover:text-surface-600 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTestChatConfig}
                    disabled={(!maskedKey && !apiKey.trim()) || !baseUrl.trim() || !model.trim() || testingKey}
                  >
                    {testingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
                    <span>{testingKey ? t("apikey.testingConnectivity") : t("apikey.testConnectivity")}</span>
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveChatConfig}
                    disabled={isLocked || (!maskedKey && !apiKey.trim()) || !baseUrl.trim() || !model.trim() || savingKey}
                  >
                    {savingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : t("apikey.save")}
                  </Button>
                  {isLocked && (
                    <button
                      onClick={() => setVerifyDialogOpen(true)}
                      className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-surface-200 px-3 py-1.5 text-xs font-medium text-surface-600 transition-all hover:bg-surface-50 dark:border-surface-700 dark:text-surface-400 dark:hover:bg-surface-800"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {t("apikey.change")}
                    </button>
                  )}
                  {!isLocked && maskedKey && (
                    <button
                      onClick={() => { setKeyEditable(false); setApiKey(""); setShowKey(false); }}
                      className="cursor-pointer text-xs text-surface-400 hover:text-surface-600"
                    >
                      {t("apikey.cancel")}
                    </button>
                  )}
                </div>
                <div className="mt-2 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-xs dark:border-surface-800 dark:bg-surface-950">
                  <div className="font-medium text-surface-600 dark:text-surface-300">{t("apikey.testPrompt")}</div>
                  {testReply && (
                    <div className="mt-1 text-surface-500 dark:text-surface-400">
                      <span className="font-medium">{t("apikey.testReply")}{t("date.separator")}</span>
                      <span>{testReply}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-surface-200 bg-white p-6 dark:border-surface-800 dark:bg-surface-900">
            <div className="mb-6 flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-50 text-accent-600 dark:bg-accent-950/50 dark:text-accent-300">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-surface-900 dark:text-surface-100">
                  {t("modelConfig.embeddingTitle")}
                </h3>
                <p className="mt-0.5 text-xs leading-relaxed text-surface-500">
                  {t("modelConfig.embeddingDesc")}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 dark:border-surface-800 dark:bg-surface-950">
                <p className="text-xs font-medium text-surface-700 dark:text-surface-200">
                  {t("modelConfig.defaultIntranet")}
                </p>
                <p className="mt-1 text-xs text-surface-500">
                  {embeddingMaskedKey ? t("modelConfig.embeddingConfigured") : t("modelConfig.embeddingNotConfigured")}
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-surface-500">
                  {t("modelConfig.embeddingBaseUrl")}
                </label>
                <Input
                  type="url"
                  value={embeddingBaseUrl}
                  onChange={(e) => setEmbeddingBaseUrl(e.target.value)}
                  placeholder={DEFAULT_EMBEDDING_BASE_URL}
                  disabled={!embeddingEditable}
                />
                <p className="mt-1 text-xs text-surface-500">{t("modelConfig.embeddingBaseUrlDesc")}</p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-surface-500">
                  {t("modelConfig.embeddingModel")}
                </label>
                <Input
                  type="text"
                  value={embeddingModel}
                  onChange={(e) => setEmbeddingModel(e.target.value)}
                  placeholder={DEFAULT_EMBEDDING_MODEL}
                  disabled={!embeddingEditable}
                />
                <p className="mt-1 text-xs text-surface-500">{t("modelConfig.embeddingModelDesc")}</p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-surface-500">
                  {t("modelConfig.embeddingApiKey")}
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showEmbeddingKey ? "text" : "password"}
                      value={embeddingApiKey}
                      onChange={(e) => setEmbeddingApiKey(e.target.value)}
                      placeholder={t("apikey.placeholder")}
                      className="pr-9"
                      disabled={!embeddingEditable}
                    />
                    <button
                      onClick={() => setShowEmbeddingKey(!showEmbeddingKey)}
                      disabled={!embeddingEditable}
                      className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-surface-400 hover:text-surface-600 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {showEmbeddingKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {embeddingEditable ? (
                    <>
                      <Button
                        size="sm"
                        onClick={handleSaveEmbeddingConfig}
                        disabled={!embeddingBaseUrl.trim() || !embeddingModel.trim() || savingEmbedding}
                      >
                        {savingEmbedding ? <Loader2 className="h-4 w-4 animate-spin" /> : t("apikey.save")}
                      </Button>
                      <button
                        onClick={() => {
                          setEmbeddingEditable(false);
                          setShowEmbeddingKey(false);
                          api.getEmbeddingConfig().then((res) => {
                            setEmbeddingMaskedKey(res.masked);
                            setEmbeddingBaseUrl(res.baseUrl);
                            setEmbeddingModel(res.model);
                            setEmbeddingApiKey(res.masked);
                          }).catch(() => {});
                        }}
                        className="cursor-pointer text-xs text-surface-400 hover:text-surface-600"
                      >
                        {t("apikey.cancel")}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setEmbeddingEditable(true)}
                      className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-surface-200 px-3 py-1.5 text-xs font-medium text-surface-600 transition-all hover:bg-surface-50 dark:border-surface-700 dark:text-surface-400 dark:hover:bg-surface-800"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {t("apikey.change")}
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs text-surface-500">{t("modelConfig.embeddingApiKeyDesc")}</p>
              </div>
            </div>
          </section>
        </div>
      </div>

      <Dialog open={verifyDialogOpen} onOpenChange={setVerifyDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("apikey.verifyPassword")}</DialogTitle>
            <DialogDescription>{t("apikey.verifyPasswordDesc")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Input
              ref={passwordInputRef}
              type="password"
              value={verifyPassword}
              onChange={(e) => setVerifyPassword(e.target.value)}
              placeholder={t("apikey.passwordPlaceholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleVerifyPassword();
              }}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setVerifyDialogOpen(false);
                  setVerifyPassword("");
                }}
              >
                {t("apikey.cancel")}
              </Button>
              <Button
                size="sm"
                onClick={handleVerifyPassword}
                disabled={!verifyPassword || verifying}
              >
                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : t("apikey.verify")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={!!confirmDeleteId}
        onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}
        title={t("apikey.confirmDeleteTitle")}
        description={t("apikey.confirmDeleteDescription")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        onConfirm={() => {
          if (confirmDeleteId) handleDeleteHistory(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
      />
    </Scrollbar>
  );
}
