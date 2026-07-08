import { useState, useMemo, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ForgotPasswordModal } from "@/components/ForgotPasswordModal";
import { DataCityLoginBackground } from "@/components/DataCityLoginBackground";
import { ShinyText } from "@/components/ShinyText";
import { BrandLogo } from "@/components/BrandLogo";
import { TextType } from "@/components/TextType";
import { TargetCursor } from "@/components/TargetCursor";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, Mail, Lock, User, ArrowRight, Loader2, Globe, Monitor, Moon, Sun } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { useTheme } from "@/components/ThemeProvider";
import { useToast } from "@/components/Toast";
import { api, setToken } from "@/api";
import type { UserInfo } from "@/auth";

type Mode = "login" | "register";

interface LoginPageProps {
  onLogin?: (user: UserInfo) => void;
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
    "uiverse-auth-input peer relative z-[1] h-[58px] rounded-[1rem] border-0 bg-transparent px-12 pb-2.5 pt-6 text-[0.94rem] font-medium shadow-none outline-none transition-colors focus-visible:ring-0",
    isLight
      ? "text-surface-950 caret-[#17435f] placeholder:text-transparent"
      : "text-white caret-amber-200 placeholder:text-transparent"
  );
  const passwordFieldClass = cn(fieldClass, "pr-10");
  const iconClass = cn(
    "pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 transition-all duration-300 group-focus-within:-translate-y-[1.05rem] group-focus-within:scale-90",
    isLight ? "text-surface-500 group-focus-within:text-[#17435f]" : "text-slate-300/60 group-focus-within:text-amber-200"
  );
  const subtleTextClass = isLight ? "text-surface-500" : "text-slate-300/62";
  const linkTextClass = isLight ? "text-surface-800 hover:text-surface-950" : "text-indigo-200 hover:text-white";
  const registering = mode === "register";
  const heroTitles = useMemo(() => registering
    ? [t("login.registerHeroTitle"), t("login.registerHeroTitle2"), t("login.registerHeroTitle3"), t("login.registerHeroTitle4"), t("login.registerHeroTitle5")]
    : [t("login.heroTitle"), t("login.heroTitle2"), t("login.heroTitle3"), t("login.heroTitle4"), t("login.heroTitle5")],
    [t, registering]
  );
  const heroSubtitles = useMemo(() => registering
    ? [t("login.registerHeroSubtitle"), t("login.registerHeroSubtitle2"), t("login.registerHeroSubtitle3"), t("login.registerHeroSubtitle4"), t("login.registerHeroSubtitle5")]
    : [t("login.heroSubtitle"), t("login.heroSubtitle2"), t("login.heroSubtitle3"), t("login.heroSubtitle4"), t("login.heroSubtitle5")],
    [t, registering]
  );
  const heroTitleTypingSpeed = lang === "zh" ? 54 : 24;
  const heroSubtitleTypingSpeed = lang === "zh" ? 18 : 11;
  const heroSubtitleDelay = 420 + Math.min(1800, Array.from(heroTitles[0]).length * heroTitleTypingSpeed);
  const titleCursorClass = cn(
    "text-[0.76em] font-light",
    isLight ? "text-[#b46c08]" : "text-amber-200"
  );
  const subtitleCursorClass = cn(
    "text-[0.92em] font-light",
    isLight ? "text-[#17435f]" : "text-indigo-200"
  );
  const authLayoutStyle = {
    "--login-card-left": registering ? "clamp(3.5rem, 5vw, 5rem)" : "calc(100% - 420px - clamp(3.5rem, 5vw, 5rem))",
    "--login-hero-width": "min(760px, calc(100% - 560px))",
    "--login-hero-left": registering ? "calc(100% - var(--login-hero-width) - clamp(3.5rem, 5vw, 5rem))" : "clamp(3.5rem, 5vw, 5rem)",
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
    <div className={cn("relative grid min-h-[100dvh] w-full overflow-hidden", isLight ? "bg-[#eef4fb] text-surface-950" : "bg-[#030712] text-white")}>
      <style>{`
        .uiverse-auth-form {
          --uiverse-field-bg: rgba(33, 33, 33, 0.9);
          --uiverse-field-edge: rgba(255, 255, 255, 0.16);
          --uiverse-field-shadow: rgba(0, 0, 0, 0.42);
          --uiverse-field-line: rgba(246, 184, 61, 0.9);
          --uiverse-field-line-alt: rgba(165, 180, 252, 0.88);
          --uiverse-label: rgba(226, 232, 240, 0.64);
          --uiverse-label-active: rgba(255, 255, 255, 0.92);
        }
        .uiverse-auth-form-light {
          --uiverse-field-bg: rgba(255, 255, 255, 0.82);
          --uiverse-field-edge: rgba(16, 40, 61, 0.16);
          --uiverse-field-shadow: rgba(23, 67, 95, 0.14);
          --uiverse-field-line: rgba(180, 108, 8, 0.86);
          --uiverse-field-line-alt: rgba(23, 67, 95, 0.86);
          --uiverse-label: rgba(71, 85, 105, 0.7);
          --uiverse-label-active: rgba(15, 23, 42, 0.94);
        }
        .uiverse-auth-field {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          border-radius: 1rem;
          border: 1px solid var(--uiverse-field-edge);
          background: var(--uiverse-field-bg);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.1),
            0 14px 0 -10px var(--uiverse-field-shadow),
            0 18px 34px rgba(0, 0, 0, 0.18);
          transform: translateZ(0);
          transition: transform 260ms ease, box-shadow 260ms ease, background 260ms ease;
        }
        .uiverse-auth-field::before {
          content: '';
          position: absolute;
          inset: 0;
          z-index: 0;
          border-radius: inherit;
          background:
            radial-gradient(circle at 14% 0%, rgba(255, 255, 255, 0.22), transparent 34%),
            linear-gradient(135deg, rgba(255, 255, 255, 0.08), transparent 48%);
          opacity: 0.86;
          pointer-events: none;
        }
        .uiverse-auth-field::after {
          content: '';
          position: absolute;
          left: 1rem;
          right: 1rem;
          bottom: 0.54rem;
          height: 2px;
          border-radius: 999px;
          background: linear-gradient(90deg, transparent, var(--uiverse-field-line), var(--uiverse-field-line-alt), transparent);
          opacity: 0.54;
          transform: scaleX(0.22);
          transform-origin: left center;
          transition: transform 320ms cubic-bezier(0.32, 0.72, 0, 1), opacity 320ms ease;
        }
        .uiverse-auth-field:hover,
        .uiverse-auth-field:focus-within {
          transform: translateY(-2px);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.14),
            0 18px 0 -11px var(--uiverse-field-shadow),
            0 22px 44px rgba(0, 0, 0, 0.24);
        }
        .uiverse-auth-field:focus-within::after {
          opacity: 1;
          transform: scaleX(1);
        }
        .uiverse-auth-label {
          position: absolute;
          left: 3rem;
          top: 50%;
          z-index: 10;
          max-width: calc(100% - 5.4rem);
          overflow: hidden;
          color: var(--uiverse-label);
          font-size: 0.86rem;
          font-weight: 500;
          letter-spacing: 0.02em;
          line-height: 1;
          pointer-events: none;
          text-overflow: ellipsis;
          transform: translate3d(0, -50%, 0);
          transform-origin: left top;
          transition: transform 260ms cubic-bezier(0.32, 0.72, 0, 1), color 260ms ease, font-size 260ms ease, letter-spacing 260ms ease;
          white-space: nowrap;
        }
        .uiverse-auth-input:focus ~ .uiverse-auth-label,
        .uiverse-auth-input:not(:placeholder-shown) ~ .uiverse-auth-label {
          color: var(--uiverse-label-active);
          font-size: 0.72rem;
          letter-spacing: 0.08em;
          transform: translate3d(0, -1.15rem, 0);
        }
        .uiverse-auth-input:-webkit-autofill {
          -webkit-text-fill-color: ${isLight ? "#0f172a" : "#ffffff"};
          box-shadow: 0 0 0 1000px transparent inset;
          transition: background-color 9999s ease-out;
        }
        .uiverse-auth-submit::before {
          content: '';
          position: absolute;
          inset: 1px;
          border-radius: inherit;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.18), transparent 42%, rgba(255, 255, 255, 0.08));
          opacity: 0.82;
          pointer-events: none;
        }
      `}</style>
      <DataCityLoginBackground
        key={`${theme}-${registering ? "register" : "login"}`}
        theme={theme}
        stageSide={registering ? "right" : "left"}
        className="z-0"
      />
      <TargetCursor theme={theme} respectReducedMotion={false} />

      <div className={cn("pointer-events-none absolute inset-0 z-[1]", isLight ? "bg-[linear-gradient(90deg,rgba(238,244,251,0.9)_0%,rgba(238,244,251,0.42)_44%,rgba(238,244,251,0.05)_100%)]" : "bg-[linear-gradient(90deg,rgba(3,7,18,0.92)_0%,rgba(15,23,42,0.48)_48%,rgba(3,7,18,0.12)_100%)]")} />
      <div
        className={cn(
          "pointer-events-none absolute top-0 z-[2] hidden h-full w-[34vw] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] lg:block",
          registering ? "left-[50%]" : "left-[16%]",
          isLight
            ? "bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.38),transparent)]"
            : "bg-[linear-gradient(90deg,transparent,rgba(129,140,248,0.12),transparent)]"
        )}
      />

      {/* Top-right controls */}
      <div className="absolute top-6 right-6 z-20 flex items-center gap-3">
        <div className={cn("relative grid w-[116px] grid-cols-3 gap-1 rounded-full p-1 backdrop-blur-md", isLight ? "border border-white/70 bg-white/55 shadow-[0_14px_40px_rgba(73,98,130,0.16)]" : "border border-white/12 bg-slate-950/70 shadow-[0_0_36px_rgba(99,102,241,0.16)]")}>
          <div
            className={cn("absolute left-1 top-1 h-8 w-8 rounded-full transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]", isLight ? "bg-white shadow-sm" : "bg-white/14 shadow-[0_0_22px_rgba(129,140,248,0.26)]")}
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
                  : "text-slate-300/55 hover:text-white"
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
                  : "text-slate-300/55 hover:text-white"
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
                  : "text-indigo-100"
                : isLight
                  ? "text-surface-500 hover:text-surface-950"
                  : "text-slate-300/55 hover:text-white"
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
          className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-[0_0_28px_rgba(99,102,241,0.18)] backdrop-blur-md transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-95", isLight ? "border border-white/70 bg-white/55 text-surface-700 hover:text-surface-950" : "border border-indigo-200/20 bg-slate-950/70 text-slate-100 hover:border-indigo-200/45 hover:text-white")}
        >
          <Globe className="h-3.5 w-3.5" />
          <span>{lang === "zh" ? "English" : "中文"}</span>
        </button>
      </div>

      <main className="relative z-10 grid min-h-[100dvh] grid-cols-1 items-center gap-6 px-5 py-24 lg:grid-cols-[440px_minmax(0,1fr)] lg:gap-10 lg:px-14 xl:px-20">
        <section
          className={cn(
            "hidden max-w-[680px] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] lg:absolute lg:top-1/2 lg:left-[var(--login-hero-left)] lg:block lg:w-[var(--login-hero-width)] lg:-translate-y-1/2",
            registering ? "lg:text-right" : "lg:text-left"
          )}
          style={authLayoutStyle}
        >
          <h1 className={cn("max-w-[760px] [font-family:var(--font-zn-display)] [font-weight:650] text-[clamp(2.85rem,4.35vw,4.85rem)] leading-[1.14] tracking-[0.022em]", registering ? "lg:ml-auto" : "", isLight ? "text-surface-950" : "text-white")}>
            <TextType
              key={`title-type-${mode}-${lang}`}
              text={heroTitles}
              typingSpeed={heroTitleTypingSpeed}
              initialDelay={220}
              pauseDuration={2200}
              deletingSpeed={18}
              loop
              showCursor
              cursorClassName={titleCursorClass}
              cursorBlinkDuration={0.58}
              respectReducedMotion={false}
              className="block"
              aria-label={heroTitles[0]}
            />
          </h1>
          <p className={cn("mt-8 max-w-[600px] [font-family:var(--font-zn-sans)] [font-weight:450] text-[clamp(1rem,1.28vw,1.18rem)] leading-[1.95] tracking-[0.055em]", registering ? "lg:ml-auto" : "", isLight ? "text-surface-600" : "text-slate-300/78")}>
            <TextType
              key={`subtitle-type-${mode}-${lang}`}
              text={heroSubtitles}
              typingSpeed={heroSubtitleTypingSpeed}
              initialDelay={heroSubtitleDelay}
              pauseDuration={2400}
              deletingSpeed={12}
              loop
              showCursor
              cursorClassName={subtitleCursorClass}
              cursorBlinkDuration={0.7}
              respectReducedMotion={false}
              className="block"
              aria-label={heroSubtitles[0]}
            />
          </p>
        </section>

      {/* Login card */}
      <div
        className={cn(
          "relative z-10 flex w-full justify-center transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] lg:absolute lg:top-1/2 lg:left-[var(--login-card-left)] lg:w-[420px] lg:-translate-y-1/2 lg:justify-start"
        )}
        style={authLayoutStyle}
      >
        <div
          className={cn("relative w-full max-w-[420px] overflow-hidden rounded-[2rem] p-1.5", isLight ? "bg-white/45 shadow-[0_24px_80px_rgba(73,98,130,0.2)] ring-1 ring-white/70" : "bg-white/8 shadow-[0_24px_80px_rgba(0,0,0,0.48),0_0_80px_rgba(99,102,241,0.16)] ring-1 ring-indigo-100/16")}
        >
        <div className={cn("relative overflow-hidden rounded-[calc(2rem-0.375rem)] p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(135deg,rgba(255,255,255,0.16),transparent_32%,rgba(129,140,248,0.1)_65%,transparent)] before:opacity-70", isLight ? "bg-white/76 text-surface-950" : "bg-slate-950/78 text-white")}>
        {/* Logo */}
        <div className="relative mb-8 text-center">
          <div className="mb-3 flex justify-center">
            <BrandLogo size="lg" />
          </div>
          <div>
            <ShinyText
              text={t("app.name")}
                color={isLight ? "#172033" : "#e7eefc"}
                shineColor={isLight ? "#b9954e" : "#a5b4fc"}
              speed={2.5}
              direction="right"
              className="text-2xl font-bold tracking-normal"
            />
          </div>
          <p className={cn("mt-1 text-sm", isLight ? "text-surface-500" : "text-slate-300/70")}>
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
                : "bg-[linear-gradient(135deg,rgba(200,164,87,0.55),rgba(185,149,78,0.38))] shadow-[0_0_26px_rgba(185,149,78,0.22)]"
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
                  : "text-slate-300/62 hover:text-white"
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
                  : "text-slate-300/62 hover:text-white"
            )}
          >
            {t("login.register")}
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
          className={cn("uiverse-auth-form flex flex-col gap-4", isLight && "uiverse-auth-form-light")}
        >
          {/* Name field — always rendered, height animated via grid */}
          <div
            className={cn(
              "grid transition-all duration-500 ease-out",
              mode === "register" ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            )}
          >
            <div className={cn(mode === "register" ? "overflow-visible" : "overflow-hidden")}>
              <div className="uiverse-auth-field group">
                <User className={iconClass} />
                <Input
                  type="text"
                  placeholder=" "
                  aria-label={t("login.fullName")}
                  className={fieldClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={mode === "register"}
                />
                <span className="uiverse-auth-label">{t("login.fullName")}</span>
              </div>
            </div>
          </div>

          <div className="uiverse-auth-field group">
            <Mail className={iconClass} />
            <Input
              type="email"
              placeholder=" "
              aria-label={t("login.email")}
              className={fieldClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <span className="uiverse-auth-label">{t("login.email")}</span>
          </div>

          <div className="uiverse-auth-field group">
            <Lock className={iconClass} />
            <Input
              type={showPassword ? "text" : "password"}
              placeholder=" "
              aria-label={t("login.password")}
              className={passwordFieldClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <span className="uiverse-auth-label">{t("login.password")}</span>
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className={cn("absolute right-4 top-1/2 z-20 -translate-y-1/2 cursor-pointer transition-transform active:scale-90", isLight ? "text-surface-500 hover:text-[#17435f]" : "text-slate-300/60 hover:text-amber-100")}
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
                  className={cn("cursor-pointer text-xs transition-transform hover:underline active:scale-[0.97]", isLight ? "text-surface-500 hover:text-surface-800" : "text-slate-300/55 hover:text-white")}
                >
                  {t("login.forgot")}
                </button>
              </div>
            </div>
          </div>

          <div className="relative">
            <Button
              type="submit"
              className={cn(
                "uiverse-auth-submit relative mt-1 h-12 w-full cursor-pointer overflow-hidden rounded-[1.05rem] border font-semibold tracking-[0.02em] transition-all hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]",
                isLight
                  ? "border-[#10283d]/20 bg-[#212121] text-white shadow-[0_16px_0_-10px_rgba(23,67,95,0.22),0_18px_36px_rgba(23,67,95,0.22)] hover:shadow-[0_18px_0_-10px_rgba(23,67,95,0.28),0_24px_44px_rgba(23,67,95,0.26)]"
                  : "border-white/18 bg-[#f5f7fb] text-[#111827] shadow-[0_16px_0_-10px_rgba(246,184,61,0.32),0_18px_44px_rgba(99,102,241,0.24),0_0_34px_rgba(246,184,61,0.16)] hover:border-white/55 hover:shadow-[0_18px_0_-10px_rgba(246,184,61,0.42),0_24px_52px_rgba(129,140,248,0.3),0_0_40px_rgba(246,184,61,0.2)]"
              )}
              disabled={submitting}
            >
            <span className="relative z-10 inline-flex items-center justify-center">
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === "login" ? (
                t("login.signIn")
              ) : (
                t("login.createAccountBtn")
              )}
            </span>
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
