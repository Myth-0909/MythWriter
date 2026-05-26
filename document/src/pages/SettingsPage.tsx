import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Scrollbar } from "@/components/ui/scrollbar";
import { useTheme } from "@/components/ThemeProvider";
import { useI18n } from "@/components/I18nProvider";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/auth";
import { api } from "@/api";
import { Sun, Moon, Monitor, Languages, User, Camera, Info, Loader2, Key, Eye, EyeOff, Pencil, X, RefreshCw } from "lucide-react";

const DEFAULT_BASE_URL = "http://172.16.76.112:8000/v1";
const DEFAULT_MODEL = "google/gemma-4-31B-it";

const BASE_URL_OPTIONS = [
  { id: "intranet", labelKey: "apikey.providerIntranet", url: DEFAULT_BASE_URL },
  { id: "deepseek", labelKey: "apikey.providerDeepSeek", url: "https://api.deepseek.com/v1" },
  { id: "openai", labelKey: "apikey.providerOpenAI", url: "https://api.openai.com/v1" },
  { id: "qwen", labelKey: "apikey.providerQwen", url: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  { id: "kimi", labelKey: "apikey.providerKimi", url: "https://api.moonshot.cn/v1" },
  { id: "custom", labelKey: "apikey.providerCustom", url: "" },
] as const;

type BaseUrlProvider = typeof BASE_URL_OPTIONS[number]["id"];

function getProviderForBaseUrl(baseUrl: string): BaseUrlProvider {
  return BASE_URL_OPTIONS.find((option) => option.url && option.url === baseUrl)?.id || "custom";
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
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [baseUrlProvider, setBaseUrlProvider] = useState<BaseUrlProvider>("intranet");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [modelOptions, setModelOptions] = useState<string[]>([DEFAULT_MODEL]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [maskedKey, setMaskedKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [changingKey, setChangingKey] = useState(false);
  const [verifyPassword, setVerifyPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [keyEditable, setKeyEditable] = useState(false);
  const [noKeyHintDismissed, setNoKeyHintDismissed] = useState(
    () => localStorage.getItem("apikey-hint-dismissed") === "true"
  );

  useEffect(() => {
    api.getApiKey().then((res) => {
      setMaskedKey(res.masked);
      setBaseUrl(res.baseUrl);
      setBaseUrlProvider(getProviderForBaseUrl(res.baseUrl));
      setModel(res.model);
      setModelOptions((prev) => Array.from(new Set([res.model, ...prev])));
      // If no key configured, input is editable by default
      if (!res.hasKey) setKeyEditable(true);
    }).catch(() => {});
  }, []);

  const handleFetchModels = async (targetBaseUrl = baseUrl, silent = false) => {
    if (!targetBaseUrl.trim() || fetchingModels) return;

    setFetchingModels(true);
    try {
      const res = await api.fetchModels({
        baseUrl: targetBaseUrl.trim(),
        ...(apiKey.trim() && { apiKey: apiKey.trim() }),
      });
      setModelOptions(res.models);
      if (res.models.length > 0) {
        setModel(res.models[0]);
        if (!silent) toast(t("apikey.modelsFetched"), "success");
      } else if (!silent) {
        toast(t("apikey.noModels"), "info");
      }
    } catch {
      if (!silent) toast(t("apikey.fetchModelsFailed"), "error");
    } finally {
      setFetchingModels(false);
    }
  };

  const handleProviderChange = (provider: BaseUrlProvider) => {
    setBaseUrlProvider(provider);
    const option = BASE_URL_OPTIONS.find((item) => item.id === provider);
    if (!option || provider === "custom") return;

    setBaseUrl(option.url);
    void handleFetchModels(option.url, true);
  };

  useEffect(() => {
    if (!baseUrl.trim()) return;
    const timer = window.setTimeout(() => {
      void handleFetchModels(baseUrl, true);
    }, 600);
    return () => window.clearTimeout(timer);
    // Base URL changes should refresh the model list automatically.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl]);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
    }
  }, [user]);

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
                <p className="text-sm font-medium text-surface-800 dark:text-surface-200">
                  {t("settings.name")}
                </p>
                <p className="text-xs text-surface-500 mt-0.5">{t("settings.avatarHint")}</p>
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
                <div className="flex items-center gap-1 rounded-lg bg-surface-100 p-1 dark:bg-surface-800">
                  <button
                    onClick={() => setThemeMode("system")}
                    className={`flex items-center justify-center h-8 w-8 rounded-md transition-all cursor-pointer ${
                      themeMode === "system"
                        ? "bg-white text-surface-900 shadow-sm dark:bg-surface-700 dark:text-surface-100"
                        : "text-surface-400 hover:text-surface-600 dark:hover:text-surface-300"
                    }`}
                    title={t("nav.followSystem")}
                  >
                    <Monitor className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setThemeMode("light")}
                    className={`flex items-center justify-center h-8 w-8 rounded-md transition-all cursor-pointer ${
                      themeMode === "light"
                        ? "bg-white text-amber-500 shadow-sm dark:bg-surface-700"
                        : "text-surface-400 hover:text-surface-600 dark:hover:text-surface-300"
                    }`}
                    title={t("nav.lightMode")}
                  >
                    <Sun className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setThemeMode("dark")}
                    className={`flex items-center justify-center h-8 w-8 rounded-md transition-all cursor-pointer ${
                      themeMode === "dark"
                        ? "bg-white text-brand-500 shadow-sm dark:bg-surface-700 dark:text-brand-400"
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

          {/* API Key Section */}
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

              {/* Password verification for changing existing key */}
              {maskedKey && !keyEditable && changingKey && (
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={verifyPassword}
                    onChange={(e) => setVerifyPassword(e.target.value)}
                    placeholder={t("apikey.passwordPlaceholder")}
                    className="flex-1 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-amber-300 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100"
                    onKeyDown={async (e) => {
                      if (e.key === "Enter" && verifyPassword) {
                        setVerifying(true);
                        try {
                          await api.verifyPassword(verifyPassword);
                          setKeyEditable(true);
                          setChangingKey(false);
                          setVerifyPassword("");
                        } catch {
                          toast(t("apikey.wrongPassword"), "error");
                        } finally {
                          setVerifying(false);
                        }
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={async () => {
                      if (!verifyPassword) return;
                      setVerifying(true);
                      try {
                        await api.verifyPassword(verifyPassword);
                        setKeyEditable(true);
                        setChangingKey(false);
                        setVerifyPassword("");
                      } catch {
                        toast(t("apikey.wrongPassword"), "error");
                      } finally {
                        setVerifying(false);
                      }
                    }}
                    disabled={!verifyPassword || verifying}
                  >
                    {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : t("apikey.verify")}
                  </Button>
                  <button
                    onClick={() => { setChangingKey(false); setVerifyPassword(""); }}
                    className="text-xs text-surface-400 hover:text-surface-600 cursor-pointer"
                  >
                    {t("apikey.cancel")}
                  </button>
                </div>
              )}

              {/* Change button when key exists but not editing */}
              {maskedKey && !keyEditable && !changingKey && (
                <div className="flex flex-col gap-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 dark:border-surface-700 dark:bg-surface-800">
                      <p className="text-[11px] font-medium text-surface-400">{t("apikey.label")}</p>
                      <p className="mt-1 truncate text-sm text-surface-700 dark:text-surface-200">{maskedKey}</p>
                    </div>
                    <div className="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 dark:border-surface-700 dark:bg-surface-800">
                      <p className="text-[11px] font-medium text-surface-400">{t("apikey.baseUrl")}</p>
                      <p className="mt-1 truncate text-sm text-surface-700 dark:text-surface-200">{baseUrl}</p>
                    </div>
                    <div className="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 dark:border-surface-700 dark:bg-surface-800">
                      <p className="text-[11px] font-medium text-surface-400">{t("apikey.model")}</p>
                      <p className="mt-1 truncate text-sm text-surface-700 dark:text-surface-200">{model}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setChangingKey(true)}
                    className="flex w-fit items-center gap-1.5 rounded-lg border border-surface-200 px-3 py-1.5 text-xs font-medium text-surface-600 hover:bg-surface-50 transition-all cursor-pointer dark:border-surface-700 dark:text-surface-400 dark:hover:bg-surface-800"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {t("apikey.change")}
                  </button>
                </div>
              )}

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

              {/* API settings inputs - always visible when editable */}
              {(keyEditable || !maskedKey) && (
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="text-xs font-medium text-surface-500 mb-1 block">
                      {t("apikey.provider")}
                    </label>
                    <select
                      value={baseUrlProvider}
                      onChange={(e) => handleProviderChange(e.target.value as BaseUrlProvider)}
                      className="w-full rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-300 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100"
                    >
                      {BASE_URL_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {t(option.labelKey)}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-surface-500">{t("apikey.baseUrlDesc")}</p>
                  </div>

                  {baseUrlProvider === "custom" && (
                    <div>
                      <label className="text-xs font-medium text-surface-500 mb-1 block">
                        {t("apikey.customBaseUrl")}
                      </label>
                      <input
                        type="url"
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        onBlur={() => void handleFetchModels(baseUrl, true)}
                        placeholder={t("apikey.baseUrlPlaceholder")}
                        className="w-full rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-300 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-medium text-surface-500 mb-1 block">
                      {t("apikey.model")}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        list="ai-model-options"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        placeholder={t("apikey.modelPlaceholder")}
                        className="min-w-0 flex-1 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-300 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100"
                      />
                      <datalist id="ai-model-options">
                        {modelOptions.map((option) => (
                          <option key={option} value={option} />
                        ))}
                      </datalist>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleFetchModels()}
                        disabled={!baseUrl.trim() || fetchingModels}
                        className="shrink-0 gap-1.5"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${fetchingModels ? "animate-spin" : ""}`} />
                        {fetchingModels ? t("apikey.fetchingModels") : t("apikey.fetchModels")}
                      </Button>
                    </div>
                    <p className="mt-1 text-xs text-surface-500">{t("apikey.modelDesc")}</p>
                  </div>

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
                          placeholder={maskedKey ? maskedKey : t("apikey.placeholder")}
                          className="w-full rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 pr-9 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-300 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100"
                        />
                        <button
                          onClick={() => setShowKey(!showKey)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 cursor-pointer"
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
                            setApiKey("");
                            setKeyEditable(false);
                            toast(t("apikey.saved"), "success");
                          } catch {
                            toast(t("apikey.saveFailed"), "error");
                          } finally {
                            setSavingKey(false);
                          }
                        }}
                        disabled={(!maskedKey && !apiKey.trim()) || !baseUrl.trim() || !model.trim() || savingKey}
                      >
                        {savingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : t("apikey.save")}
                      </Button>
                      {maskedKey && (
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
              )}
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
    </Scrollbar>
  );
}
