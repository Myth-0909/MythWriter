import { useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ForgotPasswordModal } from "@/components/ForgotPasswordModal";
import { DataCityLoginBackground } from "@/components/DataCityLoginBackground";
import { ShinyText } from "@/components/ShinyText";
import { BrandLogo } from "@/components/BrandLogo";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, Mail, Lock, User, ArrowRight, Loader2, Globe, Monitor, Moon, Sun } from "lucide-react";
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
  const { theme, themeMode, setThemeMode } = useTheme();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const isLight = theme === "light";
  const fieldClass = cn(
    "h-10 pl-10 text-sm",
    isLight
      ? "border-surface-200/70 bg-white/70 text-surface-900 placeholder:text-surface-400 focus:border-surface-400"
      : "border-white/10 bg-white/8 text-cyan-50 placeholder:text-cyan-100/34 focus:border-cyan-200/35"
  );
  const passwordFieldClass = cn(fieldClass, "pr-10");
  const iconClass = cn("absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2", isLight ? "text-surface-400" : "text-cyan-100/50");
  const subtleTextClass = isLight ? "text-surface-500" : "text-cyan-100/52";
  const linkTextClass = isLight ? "text-surface-800 hover:text-surface-950" : "text-amber-100 hover:text-amber-50";
  const registering = mode === "register";
  const cardPositionStyle = {
    "--login-card-left": registering ? "clamp(3.5rem, 5vw, 5rem)" : "calc(100% - 420px - clamp(3.5rem, 5vw, 5rem))",
  } as CSSProperties;

  // Form fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Forgot password
  const [forgotOpen, setForgotOpen] = useState(false);

  const showLogin = () => {
    setMode("login");
    setPassword("");
  };

  const showRegister = () => {
    setMode("register");
    setPassword("");
  };

  const handleSubmit = async () => {
    if (submitting) return;

    if (!email || !password) {
      toast(t("login.fillEmailPassword"), "error");
      return;
    }

    if (mode === "register" && !name) {
      toast(t("login.fillName"), "error");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "login") {
        const res = await api.login({ email, password });
        setToken(res.token);
        toast(t("login.welcomeUser").replace("{name}", res.user.name), "success");
        onLogin?.(res.user);
      } else {
        const res = await api.register({ name, email, password });
        setToken(res.token);
        toast(t("login.registerSuccessUser").replace("{name}", res.user.name), "success");
        onLogin?.(res.user);
      }
    } catch (error: any) {
      const errMsg = error.message || t("login.actionFailed");

      // Not registered → switch to register mode with email pre-filled
      if (mode === "login" && errMsg === t("login.emailNotRegistered")) {
        toast(t("login.emailNotRegisteredCreate"), "info");
        setMode("register");
        return;
      }

      toast(errMsg, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={cn("relative grid min-h-[100dvh] w-full overflow-hidden", isLight ? "bg-[#eef4fb] text-surface-950" : "bg-[#020612] text-white")}>
      <style>{`
        .magnetic-glow::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: radial-gradient(circle at var(--mx, 50%) var(--my, 50%), rgba(102,217,255,0.18) 0%, rgba(246,184,61,0.08) 32%, transparent 58%);
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
      <DataCityLoginBackground
        key={`${theme}-${registering ? "register" : "login"}`}
        theme={theme}
        stageSide={registering ? "right" : "left"}
        className="z-0"
      />

      <div className={cn("pointer-events-none absolute inset-0 z-[1]", isLight ? "bg-[linear-gradient(90deg,rgba(238,244,251,0.9)_0%,rgba(238,244,251,0.42)_44%,rgba(238,244,251,0.05)_100%)]" : "bg-[linear-gradient(90deg,rgba(2,6,18,0.9)_0%,rgba(2,6,18,0.38)_48%,rgba(2,6,18,0.1)_100%)]")} />
      <div
        className={cn(
          "pointer-events-none absolute top-0 z-[2] hidden h-full w-[34vw] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] lg:block",
          registering ? "left-[50%]" : "left-[16%]",
          isLight
            ? "bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.38),transparent)]"
            : "bg-[linear-gradient(90deg,transparent,rgba(102,217,255,0.1),transparent)]"
        )}
      />

      {/* Top-right controls */}
      <div className="absolute top-6 right-6 z-20 flex items-center gap-3">
        <div className={cn("relative grid w-[116px] grid-cols-3 gap-1 rounded-full p-1 backdrop-blur-md", isLight ? "border border-white/70 bg-white/55 shadow-[0_14px_40px_rgba(73,98,130,0.16)]" : "border border-white/12 bg-[#06101f]/70 shadow-[0_0_36px_rgba(74,144,217,0.16)]")}>
          <div
            className={cn("absolute left-1 top-1 h-8 w-8 rounded-full transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]", isLight ? "bg-white shadow-sm" : "bg-white/14 shadow-[0_0_22px_rgba(246,184,61,0.18)]")}
            style={{ transform: `translateX(${themeMode === "system" ? 0 : themeMode === "light" ? 36 : 72}px)` }}
          />
          <button
            type="button"
            onClick={() => setThemeMode("system")}
            className={cn(
              "relative z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-colors",
              themeMode === "system"
                ? isLight
                  ? "text-surface-950"
                  : "text-white"
                : isLight
                  ? "text-surface-500 hover:text-surface-950"
                  : "text-cyan-100/45 hover:text-cyan-50"
            )}
            title={t("nav.followSystem")}
          >
            <Monitor className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setThemeMode("light")}
            className={cn(
              "relative z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-colors",
              themeMode === "light"
                ? "text-amber-600"
                : isLight
                  ? "text-surface-500 hover:text-surface-950"
                  : "text-cyan-100/45 hover:text-cyan-50"
            )}
            title={t("nav.lightMode")}
          >
            <Sun className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setThemeMode("dark")}
            className={cn(
              "relative z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-colors",
              themeMode === "dark"
                ? isLight
                  ? "text-surface-950"
                  : "text-cyan-100"
                : isLight
                  ? "text-surface-500 hover:text-surface-950"
                  : "text-cyan-100/45 hover:text-cyan-50"
            )}
            title={t("nav.darkMode")}
          >
            <Moon className="h-4 w-4" />
          </button>
        </div>

        {/* Language switch */}
        <button
          type="button"
          onClick={toggleLang}
          className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-[0_0_28px_rgba(74,144,217,0.18)] backdrop-blur-md transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-95", isLight ? "border border-white/70 bg-white/55 text-surface-700 hover:text-surface-950" : "border border-cyan-200/20 bg-[#071326]/70 text-cyan-50 hover:border-amber-200/40 hover:text-amber-100")}
        >
          <Globe className="h-3.5 w-3.5" />
          <span>{lang === "zh" ? "English" : "中文"}</span>
        </button>
      </div>

      <main className="relative z-10 grid min-h-[100dvh] grid-cols-1 items-center gap-6 px-5 py-24 lg:grid-cols-[440px_minmax(0,1fr)] lg:gap-10 lg:px-14 xl:px-20">
        <section
          className={cn(
            "hidden max-w-[680px] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] lg:block",
            registering ? "lg:order-2 lg:justify-self-end lg:text-right" : "lg:order-1 lg:justify-self-start lg:text-left"
          )}
        >
          <h1 className={cn("max-w-[640px] text-5xl font-black leading-[0.95] tracking-normal xl:text-7xl", isLight ? "text-surface-950" : "text-white")}>
            {registering ? t("login.registerHeroTitle") : t("login.heroTitle")}
          </h1>
          <p className={cn("mt-6 max-w-[430px] text-sm leading-7", registering ? "lg:ml-auto" : "", isLight ? "text-surface-600" : "text-cyan-100/62")}>
            {registering ? t("login.registerHeroSubtitle") : t("login.heroSubtitle")}
          </p>
        </section>

      {/* Login card */}
      <div
        className={cn(
          "relative z-10 flex w-full justify-center transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] lg:absolute lg:top-1/2 lg:left-[var(--login-card-left)] lg:w-[420px] lg:-translate-y-1/2 lg:justify-start"
        )}
        style={cardPositionStyle}
      >
        <div
          className={cn("relative w-full max-w-[420px] overflow-hidden rounded-[2rem] p-1.5", isLight ? "bg-white/45 shadow-[0_24px_80px_rgba(73,98,130,0.2)] ring-1 ring-white/70" : "bg-white/8 shadow-[0_24px_80px_rgba(0,0,0,0.48),0_0_80px_rgba(74,144,217,0.16)] ring-1 ring-cyan-100/16")}
        >
        <div className={cn("relative overflow-hidden rounded-[calc(2rem-0.375rem)] p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(135deg,rgba(255,255,255,0.16),transparent_32%,rgba(246,184,61,0.08)_65%,transparent)] before:opacity-70", isLight ? "bg-white/76 text-surface-950" : "bg-[#07101f]/78 text-white")}>
        {/* Logo */}
        <div className="relative mb-8 text-center">
          <div className="mb-3 flex justify-center">
            <BrandLogo size="lg" />
          </div>
          <div>
            <ShinyText
              text={t("app.name")}
                color={isLight ? "#172033" : "#e7eefc"}
                shineColor={isLight ? "#b9954e" : "#f6b83d"}
              speed={2.5}
              direction="right"
              className="text-2xl font-bold tracking-normal"
            />
          </div>
          <p className={cn("mt-1 text-sm", isLight ? "text-surface-500" : "text-cyan-100/62")}>
            {mode === "login" ? t("login.welcomeBack") : t("login.createAccount")}
          </p>
        </div>

        {/* Tabs */}
        <div
          className={cn(
            "relative mb-6 grid grid-cols-2 gap-1 rounded-lg p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
            isLight ? "border border-surface-200/70 bg-surface-100/70" : "border border-white/8 bg-white/8"
          )}
        >
          <div
            className={cn(
              "absolute bottom-1 left-1 top-1 w-[calc(50%-6px)] rounded-md transition-transform duration-300 ease-out",
              isLight
                ? "bg-[linear-gradient(135deg,#17435f,#b46c08)] shadow-[0_12px_28px_rgba(23,67,95,0.18)]"
                : "bg-[linear-gradient(135deg,rgba(102,217,255,0.3),rgba(246,184,61,0.22))] shadow-[0_0_24px_rgba(102,217,255,0.16)]"
            )}
            style={{ transform: mode === "register" ? "translateX(calc(100% + 4px))" : "translateX(0)" }}
          />
          <button
            type="button"
            onPointerDown={showLogin}
            onMouseDown={showLogin}
            onClick={showLogin}
            className={cn(
              "relative z-10 rounded-md py-2 text-sm font-medium transition-colors duration-300 cursor-pointer",
              "active:scale-[0.97]",
              mode === "login"
                ? "text-white"
                : isLight
                  ? "text-surface-500 hover:text-surface-950"
                  : "text-cyan-100/52 hover:text-cyan-50"
            )}
          >
            {t("login.signIn")}
          </button>
          <button
            type="button"
            onPointerDown={showRegister}
            onMouseDown={showRegister}
            onClick={showRegister}
            className={cn(
              "relative z-10 rounded-md py-2 text-sm font-medium transition-colors duration-300 cursor-pointer",
              "active:scale-[0.97]",
              mode === "register"
                ? "text-white"
                : isLight
                  ? "text-surface-500 hover:text-surface-950"
                  : "text-cyan-100/52 hover:text-cyan-50"
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
                <User className={iconClass} />
                <Input
                  type="text"
                  placeholder={t("login.fullName")}
                  className={fieldClass}
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
            <Mail className={iconClass} />
            <Input
              type="email"
              placeholder={t("login.email")}
              className={fieldClass}
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
            <Lock className={iconClass} />
            <Input
              type={showPassword ? "text" : "password"}
              placeholder={t("login.password")}
              className={passwordFieldClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className={cn("absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer transition-transform active:scale-90", isLight ? "text-surface-400 hover:text-surface-700" : "text-cyan-100/45 hover:text-cyan-50")}
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
                  className={cn("cursor-pointer text-xs transition-transform hover:underline active:scale-[0.97]", isLight ? "text-surface-500 hover:text-surface-800" : "text-cyan-100/48 hover:text-cyan-50")}
                >
                  {t("login.forgot")}
                </button>
              </div>
            </div>
          </div>

          <div className="relative">
            <Button
              type="button"
              onClick={handleSubmit}
              className={cn(
                "relative mt-2 h-10 w-full cursor-pointer font-medium text-white transition-transform hover:brightness-110 active:scale-[0.98]",
                isLight
                  ? "bg-[linear-gradient(135deg,#10283d,#1f6ea6_48%,#b46c08)] shadow-[0_16px_34px_rgba(16,40,61,0.22)]"
                  : "bg-[linear-gradient(135deg,#0b2d45,#123526_48%,#6b4b16)] shadow-[0_14px_36px_rgba(0,0,0,0.35),0_0_28px_rgba(246,184,61,0.16)]"
              )}
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
          <p className={cn("mt-4 text-center text-xs", subtleTextClass)}>
            {mode === "login" ? (
              <>
                {t("login.noAccount")}{" "}
                <button
                  type="button"
                  onPointerDown={showRegister}
                  onMouseDown={showRegister}
                  onClick={showRegister}
                  className={cn("cursor-pointer font-medium transition-transform hover:underline active:scale-[0.97]", linkTextClass)}
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
                  onPointerDown={showLogin}
                  onMouseDown={showLogin}
                  onClick={showLogin}
                  className={cn("cursor-pointer font-medium transition-transform hover:underline active:scale-[0.97]", linkTextClass)}
                >
                  {t("login.signIn")}
                  <ArrowRight className="ml-1 inline-block h-3 w-3" />
                </button>
              </>
            )}
          </p>
        </form>
        </div>
	      </div>
      </div>
      </main>

      {/* Forgot Password Modal */}
      <ForgotPasswordModal
        open={forgotOpen}
        onOpenChange={setForgotOpen}
        defaultEmail={email}
      />
    </div>
  );
}
