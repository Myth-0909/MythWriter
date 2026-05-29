import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ForgotPasswordModal } from "@/components/ForgotPasswordModal";
import { AmbientBackground } from "@/components/AmbientBackground";
import { ShinyText } from "@/components/ShinyText";
import { BrandLogo } from "@/components/BrandLogo";
import { MagneticCard } from "@/components/MagneticCard";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, Mail, Lock, User, ArrowRight, Loader2, Globe, Sun, Moon, Monitor } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { useTheme } from "@/components/ThemeProvider";
import { useToast } from "@/components/Toast";
import { api, setToken } from "@/api";

type Mode = "login" | "register";

interface LoginPageProps {
  onLogin?: (user: { id: string; name: string; email: string; avatar: string | null }) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const { t, lang, toggleLang } = useI18n();
  const { themeMode, setThemeMode } = useTheme();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Forgot password
  const [forgotOpen, setForgotOpen] = useState(false);

  const switchMode = () => {
    setMode((prev) => (prev === "login" ? "register" : "login"));
    setPassword("");
  };

  const handleSubmit = async () => {
    if (submitting) return;

    if (!email || !password) {
      toast("请填写邮箱和密码", "error");
      return;
    }

    if (mode === "register" && !name) {
      toast("请填写姓名", "error");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "login") {
        const res = await api.login({ email, password });
        setToken(res.token);
        toast(`欢迎回来，${res.user.name}`, "success");
        onLogin?.(res.user);
      } else {
        const res = await api.register({ name, email, password });
        setToken(res.token);
        toast(`注册成功，欢迎你，${res.user.name}`, "success");
        onLogin?.(res.user);
      }
    } catch (error: any) {
      const errMsg = error.message || "操作失败";

      // Not registered → switch to register mode with email pre-filled
      if (mode === "login" && errMsg === "该邮箱尚未注册") {
        toast("该邮箱尚未注册，请先创建账户", "info");
        setMode("register");
        return;
      }

      toast(errMsg, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex h-screen w-full items-center justify-center overflow-hidden bg-surface-50 dark:bg-surface-950">
      <style>{`
        .magnetic-glow::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: radial-gradient(circle at var(--mx, 50%) var(--my, 50%), rgba(168,139,89,0.12) 0%, transparent 55%);
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.3s ease;
          z-index: 0;
        }
        .magnetic-glow:hover::after {
          opacity: 1;
        }
        .magnetic-glow > input {
          position: relative;
          z-index: 1;
        }
        .magnetic-glow > svg,
        .magnetic-glow > button {
          z-index: 2;
        }
      `}</style>
      {/* Ambient background — paper texture + AI light + subtle grid */}
      <AmbientBackground className="z-0" />

      {/* Top-right controls */}
      <div className="absolute top-6 right-6 z-20 flex items-center gap-3">
        {/* Theme switch — same as settings page */}
        <div className="relative grid w-[116px] grid-cols-3 gap-1 rounded-lg bg-white/70 p-1 backdrop-blur-md dark:bg-surface-900/70">
          <div
            className="absolute left-1 top-1 h-8 w-8 rounded-md bg-white shadow-sm transition-transform duration-300 ease-out dark:bg-surface-700"
            style={{ transform: `translateX(${themeMode === "system" ? 0 : themeMode === "light" ? 36 : 72}px)` }}
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

        {/* Language switch */}
        <button
          onClick={toggleLang}
          className="inline-flex items-center gap-1.5 rounded-full border border-surface-200/60 bg-white/70 backdrop-blur-md px-3 py-1.5 text-xs font-medium text-surface-600 shadow-sm transition-all duration-300 hover:bg-white hover:text-surface-900 hover:shadow-md active:scale-95 dark:border-surface-700/60 dark:bg-surface-900/70 dark:text-surface-400 dark:hover:bg-surface-900 dark:hover:text-surface-200"
        >
          <Globe className="h-3.5 w-3.5" />
          <span>{lang === "zh" ? "English" : "中文"}</span>
        </button>
      </div>

      {/* Login card — 3D magnetic tilt */}
      <MagneticCard className="z-10 w-full max-w-[420px]" intensity={4}>
        <div
          className="w-full rounded-2xl border border-surface-200/80 bg-white/85 p-8 shadow-xl backdrop-blur-xl dark:border-surface-700/80 dark:bg-surface-900/85"
        >
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mb-3 flex justify-center">
            <BrandLogo size="lg" />
          </div>
          <div>
            <ShinyText
              text={t("app.name")}
              color={themeMode === "dark" ? "#e2e8f0" : "#0f172a"}
              shineColor={themeMode === "dark" ? "#d8bd73" : "#b9954e"}
              speed={2.5}
              direction="right"
              className="text-2xl font-bold tracking-normal"
            />
          </div>
          <p className="mt-1 text-sm text-surface-500">
            {mode === "login" ? t("login.welcomeBack") : t("login.createAccount")}
          </p>
        </div>

        {/* Tabs */}
        <div
          className="mb-6 flex rounded-lg bg-surface-100 p-1 dark:bg-surface-800"
        >
          <button
            onClick={() => setMode("login")}
            className={cn(
              "flex-1 rounded-md py-2 text-sm font-medium transition-all duration-200 cursor-pointer",
              "active:scale-[0.97]",
              mode === "login"
                ? "bg-white text-surface-900 shadow-sm dark:bg-surface-700 dark:text-surface-100"
                : "text-surface-500 hover:text-surface-700 dark:hover:text-surface-300"
            )}
          >
            {t("login.signIn")}
          </button>
          <button
            onClick={() => setMode("register")}
            className={cn(
              "flex-1 rounded-md py-2 text-sm font-medium transition-all duration-200 cursor-pointer",
              "active:scale-[0.97]",
              mode === "register"
                ? "bg-white text-surface-900 shadow-sm dark:bg-surface-700 dark:text-surface-100"
                : "text-surface-500 hover:text-surface-700 dark:hover:text-surface-300"
            )}
          >
            {t("login.register")}
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
          className="flex flex-col gap-4"
        >
          {/* Name field — always rendered, height animated via grid */}
          <div
            className={cn(
              "grid transition-all duration-500 ease-out",
              mode === "register" ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            )}
          >
            <div className="overflow-hidden">
              <div
                className="relative rounded-md magnetic-glow"
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = ((e.clientX - rect.left) / rect.width) * 100;
                  const y = ((e.clientY - rect.top) / rect.height) * 100;
                  e.currentTarget.style.setProperty("--mx", `${x}%`);
                  e.currentTarget.style.setProperty("--my", `${y}%`);
                }}
              >
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
                <Input
                  type="text"
                  placeholder={t("login.fullName")}
                  className="pl-10 h-10 text-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={mode === "register"}
                />
              </div>
            </div>
          </div>

          <div
            className="relative rounded-md magnetic-glow"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = ((e.clientX - rect.left) / rect.width) * 100;
              const y = ((e.clientY - rect.top) / rect.height) * 100;
              e.currentTarget.style.setProperty("--mx", `${x}%`);
              e.currentTarget.style.setProperty("--my", `${y}%`);
            }}
          >
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
            <Input
              type="email"
              placeholder={t("login.email")}
              className="pl-10 h-10 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div
            className="relative rounded-md magnetic-glow"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = ((e.clientX - rect.left) / rect.width) * 100;
              const y = ((e.clientY - rect.top) / rect.height) * 100;
              e.currentTarget.style.setProperty("--mx", `${x}%`);
              e.currentTarget.style.setProperty("--my", `${y}%`);
            }}
          >
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
            <Input
              type={showPassword ? "text" : "password"}
              placeholder={t("login.password")}
              className="pl-10 pr-10 h-10 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 cursor-pointer active:scale-90 transition-transform"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Forgot password link — always rendered, height animated via grid */}
          <div
            className={cn(
              "grid transition-all duration-500 ease-out",
              mode === "login" ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            )}
          >
            <div className="overflow-hidden">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setForgotOpen(true)}
                  className="text-xs text-surface-500 hover:text-surface-700 hover:underline cursor-pointer active:scale-[0.97] transition-transform dark:hover:text-surface-300"
                >
                  {t("login.forgot")}
                </button>
              </div>
            </div>
          </div>

          <div className="relative">
            <Button
              type="submit"
              className="relative mt-2 h-10 w-full font-medium shadow-[0_10px_22px_rgba(15,42,35,0.16)] active:scale-[0.98] transition-transform cursor-pointer"
              disabled={submitting}
            >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === "login" ? (
              t("login.signIn")
            ) : (
              t("login.createAccountBtn")
            )}
          </Button>
          </div>

          {/* Switch mode */}
          <p className="mt-4 text-center text-xs text-surface-500">
            {mode === "login" ? (
              <>
                {t("login.noAccount")}{" "}
                <button
                  type="button"
                  onClick={switchMode}
                  className="font-medium text-surface-900 hover:underline cursor-pointer active:scale-[0.97] transition-transform dark:text-surface-300"
                >
                  {t("login.register")}
                  <ArrowRight className="ml-1 inline-block h-3 w-3" />
                </button>
              </>
            ) : (
              <>
                {t("login.hasAccount")}{" "}
                <button
                  type="button"
                  onClick={switchMode}
                  className="font-medium text-surface-900 hover:underline cursor-pointer active:scale-[0.97] transition-transform dark:text-surface-300"
                >
                  {t("login.signIn")}
                  <ArrowRight className="ml-1 inline-block h-3 w-3" />
                </button>
              </>
            )}
          </p>
        </form>
        </div>
      </MagneticCard>

      {/* Forgot Password Modal */}
      <ForgotPasswordModal
        open={forgotOpen}
        onOpenChange={setForgotOpen}
        defaultEmail={email}
      />
    </div>
  );
}
