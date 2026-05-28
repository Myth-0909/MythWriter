import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Scrollbar } from "@/components/ui/scrollbar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useTheme } from "@/components/ThemeProvider";
import { useI18n } from "@/components/I18nProvider";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/auth";
import { api } from "@/api";
import type { ApiKeyHistory } from "@/api";
import { Sun, Moon, Monitor, Languages, User, Camera, Info, Loader2, Key, Eye, EyeOff, Pencil, X } from "lucide-react";

const DEFAULT_BASE_URL = "http://172.16.76.112:8000/v1";
const DEFAULT_MODEL = "google/gemma-4-31B-it";
const DEFAULT_API_KEY_PLACEHOLDER = "sk-7d2a1b5c9e4f8a0b3c6d9e1f2a5b8c4d";

function findCurrentHistoryId(histories: ApiKeyHistory[], current: { baseUrl: string; model: string; masked: string }) {
  return histories.find((item) => (
    item.baseUrl === current.baseUrl &&
    item.model === current.model &&
    item.masked === current.masked
  ))?.id || "";
}

export function SettingsPage() {
  const { theme, themeMode, setThemeMode } = useTheme();
  const { t, lang, toggleLang } = useI18n();
  const { toast } = useToast();
  const { user, updateUser } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [maskedKey, setMaskedKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [applyingHistory, setApplyingHistory] = useState(false);
  const [keyEditable, setKeyEditable] = useState(false);
  const [apiKeyHistories, setApiKeyHistories] = useState<ApiKeyHistory[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState("");
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [verifyPassword, setVerifyPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [noKeyHintDismissed, setNoKeyHintDismissed] = useState(
    () => localStorage.getItem("apikey-hint-dismissed") === "true"
  );

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
  }, []);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
    }
  }, [user]);

  useEffect(() => {
    if (verifyDialogOpen && passwordInputRef.current) {
      // Small delay to let the dialog animation finish
      const timer = setTimeout(() => passwordInputRef.current?.focus(), 150);
      return () => clearTimeout(timer);
    }
  }, [verifyDialogOpen]);

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

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateProfile({ name });
      updateUser({ name });
      toast(t("settings.saved"), "success");
    } catch (error: any) {
      toast(error.message || t("toast.saveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast(t("toast.avatarTooBig"), "error");
      return;
    }

    setUploading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await api.uploadAvatar(base64);
      updateUser({ avatar: res.user.avatar });
      toast(t("toast.avatarSuccess"), "success");
    } catch (error: any) {
      toast(error.message || t("toast.avatarFailed"), "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const avatarUrl = user?.avatar
    ? `http://localhost:3000/uploads/${user.avatar}`
    : null;

  const isLocked = !!maskedKey && !keyEditable;
  const themeModeIndex = { system: 0, light: 1, dark: 2 }[themeMode];

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

  return (
    <Scrollbar className="flex-1 bg-surface-50 dark:bg-surface-950">
      <div className="mx-auto max-w-[720px] px-20 py-20">
        <h2 className="text-[28px] font-bold leading-tight text-surface-900 dark:text-surface-100 mb-8">
          {t("settings.title")}
        </h2>

        <div className="flex flex-col gap-6">
          {/* Profile Section */}
          <section className="rounded-xl border border-surface-200 bg-white p-6 dark:border-surface-800 dark:bg-surface-900">
            <div className="flex items-center gap-3 mb-6">
              <User className="h-5 w-5 text-surface-500" />
              <h3 className="text-base font-semibold text-surface-900 dark:text-surface-100">
                {t("settings.profile")}
              </h3>
            </div>

            {/* Avatar */}
            <div className="flex items-center gap-4 mb-6">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="group relative cursor-pointer rounded-full"
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="avatar"
                    className="h-16 w-16 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xl font-bold text-white">
                    {initials || "?"}
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  {uploading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  ) : (
                    <Camera className="h-5 w-5 text-white" />
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
              </button>
              <div>
                <p className="text-xs text-surface-500 mt-0.5">
                  {t(avatarUrl ? "settings.avatarChangeHint" : "settings.avatarHint")}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-medium text-surface-500 mb-1 block">
                  {t("settings.name")}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-surface-300 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-surface-500 mb-1 block">
                  {t("settings.email")}
                </label>
                <input
                  type="email"
                  value={email}
                  disabled
                  className="w-full rounded-lg border border-surface-200 bg-surface-100 px-3 py-2 text-sm text-surface-500 cursor-not-allowed dark:border-surface-700 dark:bg-surface-800 dark:text-surface-500"
                />
              </div>
            </div>
          </section>

          {/* Appearance Section */}
          <section className="rounded-xl border border-surface-200 bg-white p-6 dark:border-surface-800 dark:bg-surface-900">
            <div className="flex items-center gap-3 mb-6">
              {theme === "light" ? (
                <Sun className="h-5 w-5 text-surface-500" />
              ) : (
                <Moon className="h-5 w-5 text-surface-500" />
              )}
              <h3 className="text-base font-semibold text-surface-900 dark:text-surface-100">
                {t("settings.appearance")}
              </h3>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-surface-800 dark:text-surface-200">
                    {t("settings.theme")}
                  </p>
                  <p className="text-xs text-surface-500 mt-0.5">{t("settings.themeDesc")}</p>
                </div>
                <div className="relative grid w-[116px] grid-cols-3 gap-1 rounded-lg bg-surface-100 p-1 dark:bg-surface-800">
                  <div
                    className="absolute left-1 top-1 h-8 w-8 rounded-md bg-white shadow-sm transition-transform duration-300 ease-out dark:bg-surface-700"
                    style={{ transform: `translateX(${themeModeIndex * 36}px)` }}
                  />
                  <button
                    onClick={() => setThemeMode("system")}
                    className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-md transition-colors cursor-pointer ${
                      themeMode === "system"
                        ? "text-surface-900 dark:text-surface-100"
                        : "text-surface-400 hover:text-surface-600 dark:hover:text-surface-300"
                    }`}
                    title={t("nav.followSystem")}
                  >
                    <Monitor className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setThemeMode("light")}
                    className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-md transition-colors cursor-pointer ${
                      themeMode === "light"
                        ? "text-amber-500"
                        : "text-surface-400 hover:text-surface-600 dark:hover:text-surface-300"
                    }`}
                    title={t("nav.lightMode")}
                  >
                    <Sun className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setThemeMode("dark")}
                    className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-md transition-colors cursor-pointer ${
                      themeMode === "dark"
                        ? "text-brand-500 dark:text-brand-400"
                        : "text-surface-400 hover:text-surface-600 dark:hover:text-surface-300"
                    }`}
                    title={t("nav.darkMode")}
                  >
                    <Moon className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-surface-800 dark:text-surface-200">
                    {t("settings.language")}
                  </p>
                  <p className="text-xs text-surface-500 mt-0.5">{t("settings.languageDesc")}</p>
                </div>
                <button
                  onClick={toggleLang}
                  className="flex items-center gap-2 rounded-lg border border-surface-200 px-3 py-1.5 text-sm font-medium text-surface-700 hover:bg-surface-50 active:scale-[0.97] transition-all cursor-pointer dark:border-surface-700 dark:text-surface-300 dark:hover:bg-surface-800"
                >
                  <Languages className="h-4 w-4" />
                  {lang === "zh" ? "中文" : "English"}
                </button>
              </div>
            </div>
          </section>

          {/* AI Service Section */}
          <section className="rounded-xl border border-surface-200 bg-white p-6 dark:border-surface-800 dark:bg-surface-900">
            <div className="flex items-center gap-3 mb-6">
              <Key className="h-5 w-5 text-surface-500" />
              <h3 className="text-base font-semibold text-surface-900 dark:text-surface-100">
                {t("apikey.title")}
              </h3>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-sm font-medium text-surface-800 dark:text-surface-200">
                  {t("apikey.label")}
                </p>
                <p className="text-xs text-surface-500 mt-0.5">
                  {maskedKey ? t("apikey.configured") : t("apikey.desc")}
                </p>
              </div>

              {/* Hint when no API key configured */}
              {!maskedKey && !noKeyHintDismissed && (
                <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 dark:bg-amber-950 dark:border-amber-800">
                  <span className="text-xs text-amber-700 dark:text-amber-300">
                    {t("apikey.noKeyHint")}
                  </span>
                  <button
                    onClick={() => {
                      setNoKeyHintDismissed(true);
                      localStorage.setItem("apikey-hint-dismissed", "true");
                    }}
                    className="text-amber-400 hover:text-amber-600 cursor-pointer ml-2 shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Config inputs */}
              <div className="flex flex-col gap-4">
                {/* Saved configs */}
                <div>
                  <label className="text-xs font-medium text-surface-500 mb-1 block">
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
                      {apiKeyHistories.map((item, index) => (
                        <SelectItem key={item.id} value={item.id} index={index}>
                          <div className="grid min-w-0 gap-1 py-0.5">
                            <span className="truncate text-xs font-semibold leading-tight text-surface-800 dark:text-surface-100">
                              {item.model}
                            </span>
                            <span className="truncate text-[10px] leading-tight text-surface-400">
                              {item.baseUrl}
                            </span>
                            <span className="w-fit rounded bg-surface-100 px-1.5 py-0.5 text-[10px] leading-none text-surface-500 dark:bg-surface-800 dark:text-surface-400">
                              {item.masked}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Base URL */}
                <div>
                  <label className="text-xs font-medium text-surface-500 mb-1 block">
                    {t("apikey.baseUrl")}
                  </label>
                  <input
                    type="url"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder={t("apikey.baseUrlPlaceholder")}
                    disabled={isLocked}
                    className="w-full rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-60 disabled:cursor-not-allowed dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100"
                  />
                </div>

                {/* Model */}
                <div>
                  <label className="text-xs font-medium text-surface-500 mb-1 block">
                    {t("apikey.model")}
                  </label>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder={t("apikey.modelPlaceholder")}
                    disabled={isLocked}
                    className="w-full rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-60 disabled:cursor-not-allowed dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100"
                  />
                  <p className="mt-1 text-xs text-surface-500">{t("apikey.modelDesc")}</p>
                </div>

                {/* API Key */}
                <div>
                  <label className="text-xs font-medium text-surface-500 mb-1 block">
                    {t("apikey.label")}
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showKey ? "text" : "password"}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={DEFAULT_API_KEY_PLACEHOLDER}
                        disabled={isLocked}
                        className="w-full rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 pr-9 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-60 disabled:cursor-not-allowed dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100"
                      />
                      <button
                        onClick={() => {
                          if (showKey) {
                            setShowKey(false);
                            return;
                          }
                          setShowKey(true);
                        }}
                        disabled={isLocked && !keyEditable}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <Button
                      size="sm"
                      onClick={async () => {
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
                      }}
                      disabled={isLocked || (!maskedKey && !apiKey.trim()) || !baseUrl.trim() || !model.trim() || savingKey}
                    >
                      {savingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : t("apikey.save")}
                    </Button>
                    {isLocked && (
                      <button
                        onClick={() => setVerifyDialogOpen(true)}
                        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-surface-200 px-3 py-1.5 text-xs font-medium text-surface-600 hover:bg-surface-50 transition-all cursor-pointer dark:border-surface-700 dark:text-surface-400 dark:hover:bg-surface-800"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        {t("apikey.change")}
                      </button>
                    )}
                    {!isLocked && maskedKey && (
                      <button
                        onClick={() => { setKeyEditable(false); setApiKey(""); setShowKey(false); }}
                        className="text-xs text-surface-400 hover:text-surface-600 cursor-pointer"
                      >
                        {t("apikey.cancel")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* About Section */}
          <section className="rounded-xl border border-surface-200 bg-white p-6 dark:border-surface-800 dark:bg-surface-900">
            <div className="flex items-center gap-3 mb-6">
              <Info className="h-5 w-5 text-surface-500" />
              <h3 className="text-base font-semibold text-surface-900 dark:text-surface-100">
                {t("settings.about")}
              </h3>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-surface-700 dark:text-surface-300">{t("app.name")}</span>
              <span className="text-sm text-surface-500">{t("settings.version")} 1.0.0</span>
            </div>
          </section>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("settings.save")}
            </Button>
          </div>
        </div>
      </div>

      {/* Password Verification Dialog */}
      <Dialog open={verifyDialogOpen} onOpenChange={setVerifyDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("apikey.verifyPassword")}</DialogTitle>
            <DialogDescription>{t("apikey.verifyPasswordDesc")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <input
              ref={passwordInputRef}
              type="password"
              value={verifyPassword}
              onChange={(e) => setVerifyPassword(e.target.value)}
              placeholder={t("apikey.passwordPlaceholder")}
              className="w-full rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-amber-300 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100"
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
    </Scrollbar>
  );
}
