import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ForgotPasswordModal } from "@/components/ForgotPasswordModal";
import { DataCityLoginBackground } from "@/components/DataCityLoginBackground";
import { ShinyText } from "@/components/ShinyText";
import { BrandLogo } from "@/components/BrandLogo";
import { MagneticCard } from "@/components/MagneticCard";
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
    <div className="relative flex h-screen w-full items-center justify-center overflow-hidden bg-[#020612]">
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
      {/* GPGPU data city background */}
      <DataCityLoginBackground className="z-0" />

      {/* Top-right controls */}
      <div className="absolute top-6 right-6 z-20 flex items-center gap-3">
        {/* Language switch */}
        <button
          onClick={toggleLang}
          className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200/25 bg-[#071326]/70 px-3 py-1.5 text-xs font-medium text-cyan-50 shadow-[0_0_28px_rgba(74,144,217,0.22)] backdrop-blur-md transition-all duration-300 hover:border-amber-200/40 hover:bg-[#0b1e38]/80 hover:text-amber-100 active:scale-95"
        >
          <Globe className="h-3.5 w-3.5" />
          <span>{lang === "zh" ? "English" : "中文"}</span>
        </button>
      </div>

      {/* Login card — 3D magnetic tilt */}
      <MagneticCard className="z-10 w-full max-w-[420px] px-4 sm:px-0" intensity={5}>
        <div
          className="relative w-full overflow-hidden rounded-2xl border border-cyan-100/16 bg-[#07101f]/72 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.48),0_0_80px_rgba(74,144,217,0.16),inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-2xl before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(135deg,rgba(255,255,255,0.16),transparent_32%,rgba(246,184,61,0.08)_65%,transparent)] before:opacity-70"
        >
        {/* Logo */}
        <div className="relative mb-8 text-center">
          <div className="mb-3 flex justify-center">
            <BrandLogo size="lg" />
          </div>
          <div>
            <ShinyText
              text={t("app.name")}
                color="#e7eefc"
                shineColor="#f6b83d"
              speed={2.5}
              direction="right"
              className="text-2xl font-bold tracking-normal"
            />
          </div>
          <p className="mt-1 text-sm text-cyan-100/62">
            {mode === "login" ? t("login.welcomeBack") : t("login.createAccount")}
          </p>
        </div>

        {/* Tabs */}
        <div
          className="relative mb-6 grid grid-cols-2 gap-1 rounded-lg border border-white/8 bg-white/8 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
        >
          <div
            className="absolute bottom-1 left-1 top-1 w-[calc(50%-6px)] rounded-md bg-[linear-gradient(135deg,rgba(102,217,255,0.3),rgba(246,184,61,0.22))] shadow-[0_0_24px_rgba(102,217,255,0.16)] transition-transform duration-300 ease-out"
            style={{ transform: mode === "register" ? "translateX(calc(100% + 4px))" : "translateX(0)" }}
          />
          <button
            onClick={() => setMode("login")}
            className={cn(
              "relative z-10 rounded-md py-2 text-sm font-medium transition-colors duration-300 cursor-pointer",
              "active:scale-[0.97]",
              mode === "login"
                ? "text-white"
                : "text-cyan-100/52 hover:text-cyan-50"
            )}
          >
            {t("login.signIn")}
          </button>
          <button
            onClick={() => setMode("register")}
            className={cn(
              "relative z-10 rounded-md py-2 text-sm font-medium transition-colors duration-300 cursor-pointer",
              "active:scale-[0.97]",
              mode === "register"
                ? "text-white"
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
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-100/50" />
                <Input
                  type="text"
                  placeholder={t("login.fullName")}
                  className="h-10 border-white/10 bg-white/8 pl-10 text-sm text-cyan-50 placeholder:text-cyan-100/34 focus:border-cyan-200/35"
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
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-100/50" />
            <Input
              type="email"
              placeholder={t("login.email")}
              className="h-10 border-white/10 bg-white/8 pl-10 text-sm text-cyan-50 placeholder:text-cyan-100/34 focus:border-cyan-200/35"
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
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-100/50" />
            <Input
              type={showPassword ? "text" : "password"}
              placeholder={t("login.password")}
              className="h-10 border-white/10 bg-white/8 pl-10 pr-10 text-sm text-cyan-50 placeholder:text-cyan-100/34 focus:border-cyan-200/35"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-cyan-100/45 transition-transform hover:text-cyan-50 active:scale-90"
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
	                  className="cursor-pointer text-xs text-cyan-100/48 transition-transform hover:text-cyan-50 hover:underline active:scale-[0.97]"
                >
                  {t("login.forgot")}
                </button>
              </div>
            </div>
          </div>

          <div className="relative">
            <Button
              type="submit"
	              className="relative mt-2 h-10 w-full cursor-pointer bg-[linear-gradient(135deg,#0b2d45,#123526_48%,#6b4b16)] font-medium text-white shadow-[0_14px_36px_rgba(0,0,0,0.35),0_0_28px_rgba(246,184,61,0.16)] transition-transform hover:brightness-110 active:scale-[0.98]"
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
	          <p className="mt-4 text-center text-xs text-cyan-100/52">
            {mode === "login" ? (
              <>
                {t("login.noAccount")}{" "}
                <button
                  type="button"
                  onClick={switchMode}
	                  className="cursor-pointer font-medium text-amber-100 transition-transform hover:underline active:scale-[0.97]"
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
	                  className="cursor-pointer font-medium text-amber-100 transition-transform hover:underline active:scale-[0.97]"
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
