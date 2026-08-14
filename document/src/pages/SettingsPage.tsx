import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Scrollbar } from "@/components/ui/scrollbar";
import { useTheme } from "@/components/ThemeProvider";
import { useFont } from "@/components/FontProvider";
import { useI18n } from "@/components/I18nProvider";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/auth";
import { api } from "@/api";
import { getServerAssetUrl } from "@/lib/apiBase";
import { getFontOption, isFontFamilyKey } from "@/lib/fontCatalog";
import { hasProfileChanges } from "@/lib/interactionState";
import { InlineLoading } from "@/components/LoadingSpinner";
import { Check, Sparkles, Sun, Moon, Monitor, Languages, User, Camera, Info, Loader2 } from "lucide-react";

export function SettingsPage() {
  const { theme, themeMode, setThemeMode } = useTheme();
  const { fontFamilyKey, fontOptions, kitConfigured, kitStatus, setFontFamilyKey } = useFont();
  const { t, lang, toggleLang } = useI18n();
  const { toast } = useToast();
  const { user, updateUser } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingFont, setSavingFont] = useState(false);
  const [fontModalOpen, setFontModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
    }
  }, [user]);

  const profileDirty = hasProfileChanges(name, user?.name || "");

  const handleSave = async () => {
    if (!profileDirty) {
      toast(t("settings.noChanges"), "info");
      return;
    }

    setSaving(true);
    try {
      const nextName = name.trim();
      await api.updateProfile({ name: nextName });
      updateUser({ name: nextName });
      setName(nextName);
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
      e.target.value = "";
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast(t("toast.avatarUnsupported"), "error");
      e.target.value = "";
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

  const handleFontChange = async (value: string) => {
    if (!isFontFamilyKey(value) || value === fontFamilyKey || savingFont) return;

    const previous = fontFamilyKey;
    setFontFamilyKey(value);
    setSavingFont(true);
    try {
      const res = await api.updateProfile({ fontFamilyKey: value });
      updateUser({ fontFamilyKey: res.user.fontFamilyKey });
      setFontFamilyKey(res.user.fontFamilyKey);
      toast(t("settings.fontSaved"), "success");
    } catch (error: any) {
      setFontFamilyKey(previous);
      toast(error.message || t("settings.fontSaveFailed"), "error");
    } finally {
      setSavingFont(false);
    }
  };

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const avatarUrl = getServerAssetUrl(user?.avatar ? `/uploads/${user.avatar}` : null);

  const themeModeIndex = { system: 0, light: 1, dark: 2 }[themeMode];
  const selectedFont = getFontOption(fontFamilyKey);

  const fontSourceLabel = (source: "current" | "adobe" | "local") => {
    if (source === "adobe") return t("settings.fontAdobe");
    if (source === "local") return t("settings.fontLocal");
    return t("settings.fontBuiltIn");
  };

  return (
    <Scrollbar className="flex-1 bg-surface-50 dark:bg-surface-950">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
        <h2 className="text-[28px] font-bold leading-tight text-surface-900 dark:text-surface-100 mb-8">
          {t("settings.title")}
        </h2>

        <div className="grid gap-6 2xl:grid-cols-[minmax(300px,0.72fr)_minmax(0,1.28fr)] 2xl:items-start">
          {/* Profile Section */}
          <section className="rounded-xl border border-surface-200 bg-white p-4 sm:p-6 2xl:col-start-1 2xl:row-start-1 dark:border-surface-800 dark:bg-surface-900">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <User className="h-5 w-5 text-surface-500" />
                <h3 className="text-base font-semibold text-surface-900 dark:text-surface-100">
                  {t("settings.profile")}
                </h3>
              </div>
              {profileDirty && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                  {t("settings.unsavedChanges")}
                </span>
              )}
            </div>

            {/* Avatar */}
            <div className="flex items-center gap-4 mb-6">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("settings.avatarAction")}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="group relative h-16 w-16 shrink-0 cursor-pointer rounded-full p-0"
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={t("settings.avatarAction")}
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
              </Button>
              <Input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={handleAvatarUpload}
              />
              <div>
                <p className="text-xs text-surface-500 mt-0.5">
                  {t(avatarUrl ? "settings.avatarChangeHint" : "settings.avatarHint")}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label htmlFor="settings-name" className="text-xs font-medium text-surface-500 mb-1 block">
                  {t("settings.name")}
                </label>
                <Input
                  id="settings-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-surface-50 dark:bg-surface-800"
                />
              </div>
              <div>
                <label htmlFor="settings-email" className="text-xs font-medium text-surface-500 mb-1 block">
                  {t("settings.email")}
                </label>
                <Input
                  id="settings-email"
                  type="email"
                  value={email}
                  disabled
                  className="w-full cursor-not-allowed bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-500"
                />
              </div>
            </div>
          </section>

          {/* Appearance Section */}
          <section className="rounded-xl border border-surface-200 bg-white p-4 sm:p-6 2xl:col-start-2 2xl:row-span-3 2xl:row-start-1 dark:border-surface-800 dark:bg-surface-900">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {theme === "light" ? (
                  <Sun className="h-5 w-5 text-surface-500" />
                ) : (
                  <Moon className="h-5 w-5 text-surface-500" />
                )}
                <h3 className="text-base font-semibold text-surface-900 dark:text-surface-100">
                  {t("settings.appearance")}
                </h3>
              </div>
              <span className="rounded-full border border-surface-200 bg-surface-50 px-2.5 py-1 text-[11px] font-semibold text-surface-500 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-400">
                {t("settings.autoSaved")}
              </span>
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
                    className="absolute left-1 top-1 h-8 w-8 rounded-md bg-brand-50 shadow-sm ring-1 ring-brand-200 transition-transform duration-300 ease-out dark:bg-brand-500/15 dark:ring-brand-400/25"
                    style={{ transform: `translateX(${themeModeIndex * 36}px)` }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setThemeMode("system")}
                    className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-md transition-colors cursor-pointer ${
                      themeMode === "system"
                        ? "text-brand-700 hover:text-brand-700 dark:text-brand-200 dark:hover:text-brand-200"
                        : "text-surface-400 hover:text-brand-600 dark:hover:text-brand-300"
                    }`}
                    title={t("nav.followSystem")}
                  >
                    <Monitor className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setThemeMode("light")}
                    className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-md transition-colors cursor-pointer ${
                      themeMode === "light"
                        ? "text-brand-700 hover:text-brand-700 dark:text-brand-200 dark:hover:text-brand-200"
                        : "text-surface-400 hover:text-brand-600 dark:hover:text-brand-300"
                    }`}
                    title={t("nav.lightMode")}
                  >
                    <Sun className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setThemeMode("dark")}
                    className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-md transition-colors cursor-pointer ${
                      themeMode === "dark"
                        ? "text-brand-700 hover:text-brand-700 dark:text-brand-200 dark:hover:text-brand-200"
                        : "text-surface-400 hover:text-brand-600 dark:hover:text-brand-300"
                    }`}
                    title={t("nav.darkMode")}
                  >
                    <Moon className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="flex flex-col gap-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-surface-800 dark:text-surface-200">
                    {t("settings.font")}
                  </p>
                  <p className="text-xs text-surface-500 mt-0.5">{t("settings.fontDesc")}</p>
                </div>
                <div className="flex w-full min-w-0 items-center gap-3 sm:w-[320px] sm:shrink-0">
                  <div
                    className="min-w-0 flex-1 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 dark:border-surface-700 dark:bg-surface-800"
                    style={{ fontFamily: selectedFont.cssFamily }}
                  >
                    <div className="truncate text-sm font-semibold text-surface-900 dark:text-surface-100">
                      {t(selectedFont.labelKey)}
                    </div>
                    <div className="truncate text-[11px] text-surface-500">
                      {t(selectedFont.previewKey)}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFontModalOpen(true)}
                    className="h-10 shrink-0"
                  >
                    <Sparkles className="h-4 w-4" />
                    {t("settings.fontChange")}
                  </Button>
                </div>
              </div>

              <div
                className="overflow-hidden rounded-xl border border-surface-200 bg-[linear-gradient(135deg,rgba(185,149,78,0.08),transparent_36%),linear-gradient(90deg,rgba(15,23,42,0.035)_1px,transparent_1px),linear-gradient(0deg,rgba(15,23,42,0.035)_1px,transparent_1px)] bg-white bg-[size:auto,28px_28px,28px_28px] p-4 shadow-sm transition-colors dark:border-surface-700 dark:bg-surface-950 dark:bg-[linear-gradient(135deg,rgba(185,149,78,0.12),transparent_34%),linear-gradient(90deg,rgba(148,163,184,0.045)_1px,transparent_1px),linear-gradient(0deg,rgba(148,163,184,0.045)_1px,transparent_1px)]"
                style={{ fontFamily: selectedFont.cssFamily }}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase text-brand-600 dark:text-brand-300">
                      {t("settings.previewTitle")}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-surface-500">
                      {theme === "dark" ? t("settings.previewThemeDark") : t("settings.previewThemeLight")} · {t(selectedFont.labelKey)}
                    </p>
                  </div>
                  <span className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-[11px] font-semibold text-brand-700 dark:border-brand-500/30 dark:bg-brand-950/40 dark:text-brand-200">
                    {fontSourceLabel(selectedFont.source)}
                  </span>
                </div>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(160px,0.8fr)]">
                  <div className="rounded-lg border border-surface-200/80 bg-white/82 p-4 dark:border-surface-700/80 dark:bg-surface-900/82">
                    <h4 className="text-xl font-semibold leading-snug text-surface-950 dark:text-surface-50">
                      {t("settings.previewHeadline")}
                    </h4>
                    <p className="mt-2 text-sm leading-7 text-surface-600 dark:text-surface-300">
                      {t("settings.previewBody")}
                    </p>
                  </div>
                  <div className="flex flex-col justify-between gap-3 rounded-lg border border-surface-200/80 bg-surface-50/86 p-4 dark:border-surface-700/80 dark:bg-surface-900/72">
                    <blockquote className="border-l-2 border-brand-400 pl-3 text-sm leading-6 text-surface-700 dark:text-surface-300">
                      {t("settings.previewQuote")}
                    </blockquote>
                    <span className="inline-flex h-9 w-fit items-center rounded-lg bg-surface-900 px-3 text-xs font-semibold text-white shadow-sm dark:bg-brand-400 dark:text-surface-950">
                      {t("settings.previewAction")}
                    </span>
                  </div>
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={toggleLang}
                  className="gap-2"
                >
                  <Languages className="h-4 w-4" />
                  {lang === "zh" ? t("nav.switchToEnglish") : t("nav.switchToChinese")}
                </Button>
              </div>
            </div>
          </section>

          {/* About Section */}
          <section className="rounded-xl border border-surface-200 bg-white p-4 sm:p-6 2xl:col-start-1 2xl:row-start-2 dark:border-surface-800 dark:bg-surface-900">
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
          <div className="flex justify-end 2xl:col-start-1 2xl:row-start-3">
            <Button onClick={handleSave} disabled={saving || !profileDirty}>
              {saving ? <InlineLoading variant="cursor" size="sm" label={t("settings.save")} /> : t("settings.save")}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={fontModalOpen} onOpenChange={setFontModalOpen}>
        <DialogContent className="max-h-[86vh] max-w-[920px] overflow-hidden p-0">
          <div className="border-b border-surface-200 px-6 py-5 dark:border-surface-800">
            <div className="flex items-start justify-between gap-6 pr-8">
              <div>
                <DialogTitle className="text-xl">{t("settings.fontGalleryTitle")}</DialogTitle>
                <DialogDescription className="mt-2 max-w-[560px] leading-6">
                  {t("settings.fontGalleryDesc")}
                </DialogDescription>
              </div>
              <div className="hidden rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-right dark:border-brand-800 dark:bg-brand-950/40 sm:block">
                <div className="text-[11px] font-semibold text-brand-700 dark:text-brand-300">
                  {t("settings.fontCurrent")}
                </div>
                <div className="mt-1 max-w-[180px] truncate text-sm text-surface-900 dark:text-surface-100">
                  {t(selectedFont.labelKey)}
                </div>
              </div>
            </div>
            <p className="mt-3 text-[12px] leading-5 text-surface-500">
              {kitConfigured
                ? kitStatus === "ready"
                  ? t("settings.fontKitReady")
                  : kitStatus === "error"
                    ? t("settings.fontKitError")
                    : t("settings.fontKitLoading")
                : t("settings.fontKitMissing")}
            </p>
          </div>

          <div className="max-h-[62vh] overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {fontOptions.map((option) => {
                const active = option.key === fontFamilyKey;
                const disabled = savingFont && !active;
                return (
                  <Button
                    key={option.key}
                    type="button"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => handleFontChange(option.key)}
                    className={`group h-auto min-h-[168px] w-full items-stretch justify-start whitespace-normal rounded-xl border p-4 text-left transition-all duration-200 ${
                      active
                        ? "border-brand-400 bg-brand-50 shadow-sm dark:border-brand-500 dark:bg-brand-950/35"
                        : "border-surface-200 bg-white hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md dark:border-surface-800 dark:bg-surface-900 dark:hover:border-brand-600"
                    } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer active:scale-[0.99]"}`}
                  >
                    <div className="mb-4 grid grid-cols-[minmax(0,1fr)_32px] items-start gap-3">
                      <div className="flex min-w-0 flex-wrap gap-2">
                        <span className="max-w-full truncate rounded-full bg-surface-100 px-2.5 py-1 text-[11px] font-semibold text-surface-500 dark:bg-surface-800 dark:text-surface-400">
                          {fontSourceLabel(option.source)}
                        </span>
                        <span className="max-w-full truncate rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-surface-500 shadow-sm dark:bg-surface-800 dark:text-surface-300">
                          {t(option.moodKey)}
                        </span>
                      </div>
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 ${
                          active
                            ? "bg-brand-500 text-white shadow-sm"
                            : "border border-transparent text-transparent group-hover:border-surface-200 group-hover:text-surface-300 dark:group-hover:border-surface-700"
                        }`}
                        aria-hidden={!active}
                      >
                        {active && (savingFont ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />)}
                      </span>
                    </div>
                    <div style={{ fontFamily: option.cssFamily }}>
                      <div className="text-[28px] font-semibold leading-tight text-surface-950 dark:text-surface-50">
                        {t("settings.font.preview.sample")}
                      </div>
                      <div className="mt-2 text-base leading-7 text-surface-700 dark:text-surface-300">
                        {t(option.previewKey)}
                      </div>
                      <div className="mt-4 truncate text-sm font-semibold text-surface-900 dark:text-surface-100">
                        {t(option.labelKey)}
                      </div>
                    </div>
                  </Button>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </Scrollbar>
  );
}
