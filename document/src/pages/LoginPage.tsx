import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ForgotPasswordModal } from "@/components/ForgotPasswordModal";
import { Particles } from "@/components/Particles";
import { ShinyText } from "@/components/ShinyText";
import { BrandLogo } from "@/components/BrandLogo";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, Mail, Lock, User, ArrowRight, Loader2, Globe } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { useToast } from "@/components/Toast";
import { api, setToken } from "@/api";

type Mode = "login" | "register";

interface LoginPageProps {
  onLogin?: (user: { id: string; name: string; email: string; avatar: string | null }) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const { t, lang, toggleLang } = useI18n();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains("dark")
  );

  // Track dark mode changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

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
      {/* Particles network background */}
      <Particles
        particleColor={isDark ? "#60a5fa" : "#3b82f6"}
        lineColor={isDark ? "#3b82f6" : "#2563eb"}
        particleCount={90}
        connectDistance={150}
        moveSpeed={0.35}
        mouseRadius={200}
        mouseForce={0.35}
        className="absolute inset-0 z-0"
      />

      {/* Language switch */}
      <button
        onClick={toggleLang}
        className="absolute top-6 right-6 z-20 inline-flex items-center gap-1.5 rounded-full border border-surface-200/60 bg-white/70 backdrop-blur-md px-3 py-1.5 text-xs font-medium text-surface-600 shadow-sm transition-all duration-300 hover:bg-white hover:text-surface-900 hover:shadow-md active:scale-95 dark:border-surface-700/60 dark:bg-surface-900/70 dark:text-surface-400 dark:hover:bg-surface-900 dark:hover:text-surface-200"
      >
        <Globe className="h-3.5 w-3.5" />
        <span>{lang === "zh" ? "English" : "中文"}</span>
      </button>

      {/* Login card */}
      <div className="relative z-10 w-full max-w-[420px] rounded-2xl border border-surface-200/80 bg-white/85 backdrop-blur-xl p-8 shadow-xl dark:border-surface-700/80 dark:bg-surface-900/85">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mb-3 flex justify-center">
            <BrandLogo size="lg" />
          </div>
          <ShinyText
            text={t("app.name")}
            color={isDark ? "#e2e8f0" : "#0f172a"}
            shineColor={isDark ? "#d8bd73" : "#b9954e"}
            speed={2.5}
            direction="right"
            className="text-2xl font-bold tracking-normal"
          />
          <p className="mt-1 text-sm text-surface-500">
            {mode === "login" ? t("login.welcomeBack") : t("login.createAccount")}
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex rounded-lg bg-surface-100 p-1 dark:bg-surface-800">
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
              <div className="relative">
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

          <div className="relative">
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

          <div className="relative">
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

          <Button
            type="submit"
            className="mt-2 h-10 w-full font-medium active:scale-[0.98] transition-transform cursor-pointer"
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

      {/* Forgot Password Modal */}
      <ForgotPasswordModal
        open={forgotOpen}
        onOpenChange={setForgotOpen}
        defaultEmail={email}
      />
    </div>
  );
}
