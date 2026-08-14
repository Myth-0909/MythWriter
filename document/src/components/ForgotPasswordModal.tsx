import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Mail, Lock, KeyRound, Loader2, CheckCircle } from "lucide-react";
import { api } from "@/api";
import { useI18n } from "@/components/I18nProvider";
import { useTheme } from "@/components/ThemeProvider";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/utils";

interface ForgotPasswordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultEmail?: string;
}

export function ForgotPasswordModal({ open, onOpenChange, defaultEmail = "" }: ForgotPasswordModalProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const { theme } = useTheme();
  const isLight = theme === "light";

  const [phase, setPhase] = useState<"check" | "reset" | "done">("check");
  const [email, setEmail] = useState(defaultEmail);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [returnedCode, setReturnedCode] = useState("");

  const resetState = () => {
    setPhase("check");
    setEmail(defaultEmail);
    setCode("");
    setNewPassword("");
    setConfirmPassword("");
    setEmailError("");
    setReturnedCode("");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      onOpenChange(false);
      setTimeout(resetState, 200);
    } else {
      onOpenChange(true);
      resetState();
    }
  };

  const handleCheckEmail = async () => {
    if (!email.trim()) {
      setEmailError(t("forgot.emailPlaceholder"));
      return;
    }
    setLoading(true);
    setEmailError("");
    try {
      const res = await api.forgotPassword({ email: email.trim() });
      setReturnedCode(res.devCode || "");
      setPhase("reset");
    } catch (error: any) {
      setEmailError(error.message || t("toast.saveFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!code || code.length < 6) {
      toast(t("forgot.codePlaceholder"), "error");
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      toast(t("forgot.newPasswordPlaceholder"), "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast(t("forgot.passwordMismatch"), "error");
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword({ email: email.trim(), code, newPassword });
      toast(t("forgot.successMessage"), "success");
      setPhase("done");
      setTimeout(() => {
        onOpenChange(false);
        setTimeout(resetState, 200);
      }, 2000);
    } catch (error: any) {
      toast(error.message || t("toast.saveFailed"), "error");
    } finally {
      setLoading(false);
    }
  };

  // Input styling — matches LoginPage's uiverse-auth-field pattern
  const fieldClass = cn(
    "uiverse-auth-input peer relative z-[1] h-[58px] rounded-[1rem] border-0 bg-transparent px-12 pb-2.5 pt-6 text-[0.94rem] font-medium shadow-none outline-none transition-colors focus-visible:ring-0",
    isLight
      ? "text-surface-950 caret-[#17435f] placeholder:text-transparent"
      : "text-white caret-amber-200 placeholder:text-transparent"
  );
  const iconClass = cn(
    "pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 transition-all duration-300 group-focus-within:-translate-y-[1.05rem] group-focus-within:scale-90",
    isLight
      ? "text-surface-500 group-focus-within:text-[#17435f]"
      : "text-slate-300/60 group-focus-within:text-amber-200"
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="w-full max-w-[400px] p-0 gap-0 overflow-hidden"
        hideCloseButton={phase === "done"}
      >
        {phase === "done" ? (
          /* ===== SUCCESS STATE ===== */
          <div className="flex flex-col items-center text-center px-6 py-8">
            <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
            <DialogHeader className="items-center mb-2">
              <DialogTitle>{t("forgot.successTitle")}</DialogTitle>
              <DialogDescription>{t("forgot.successMessage")}</DialogDescription>
            </DialogHeader>
            <p className="text-xs text-surface-400 mt-2">{t("forgot.autoCloseHint")}</p>
          </div>
        ) : (
          /* ===== CHECK + RESET STATES ===== */
          <>
            <div className="px-6 pt-6 pb-2">
              <DialogHeader>
                <DialogTitle>{t("forgot.title")}</DialogTitle>
                <DialogDescription>
                  {phase === "check" ? t("forgot.subtitle") : t("forgot.resetSubtitle")}
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="px-6 pb-6">
              {/* ===== EMAIL FIELD (always visible) ===== */}
              <div className={cn("uiverse-auth-form", isLight && "uiverse-auth-form-light")}>
                <div className="uiverse-auth-field group">
                  <Mail className={iconClass} />
                  <Input
                    type="email"
                    placeholder=" "
                    aria-label={t("login.email")}
                    className={fieldClass}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setEmailError("");
                    }}
                    disabled={phase === "reset"}
                    required
                    autoFocus
                  />
                  <span className="uiverse-auth-label">{t("login.email")}</span>
                </div>
              </div>

              {/* Inline email error */}
              {emailError && (
                <p className="text-xs text-red-500 mt-1.5 ml-1">{emailError}</p>
              )}

              {/* ===== CHECK PHASE: "下一步" button ===== */}
              {phase === "check" && (
                <Button
                  type="button"
                  className="w-full h-12 mt-4"
                  onClick={handleCheckEmail}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t("forgot.checkEmailBtn")
                  )}
                </Button>
              )}

              {/* ===== RESET PHASE: expanding password form ===== */}
              {phase === "reset" && (
                <div className="mt-4 space-y-3 animate-[modalIn_0.35s_cubic-bezier(0.16,1,0.3,1)_forwards]">
                  <p className="rounded-lg bg-surface-100 px-3 py-2 text-xs leading-5 text-surface-600 dark:bg-surface-800 dark:text-surface-300">
                    {t("forgot.sentGeneric")}
                  </p>

                  {returnedCode && (
                    <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                      {t("forgot.devCodeLabel")}: {" "}
                      <span className="font-mono font-bold text-sm">{returnedCode}</span>
                      <span className="block mt-0.5 opacity-70">({t("forgot.devNotice")})</span>
                    </div>
                  )}

                  {/* Code input */}
                  <div className="uiverse-auth-field group">
                    <KeyRound className={iconClass} />
                    <Input
                      type="text"
                      placeholder=" "
                      aria-label={t("forgot.codePlaceholder")}
                      className={fieldClass}
                      value={code}
                      onChange={(e) =>
                        setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      maxLength={6}
                      required
                      autoFocus
                    />
                    <span className="uiverse-auth-label">{t("forgot.codePlaceholder")}</span>
                  </div>

                  {/* New password */}
                  <div className="uiverse-auth-field group">
                    <Lock className={iconClass} />
                    <Input
                      type="password"
                      placeholder=" "
                      aria-label={t("forgot.newPasswordPlaceholder")}
                      className={fieldClass}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                    <span className="uiverse-auth-label">{t("forgot.newPasswordPlaceholder")}</span>
                  </div>

                  {/* Confirm password */}
                  <div className="uiverse-auth-field group">
                    <Lock className={iconClass} />
                    <Input
                      type="password"
                      placeholder=" "
                      aria-label={t("forgot.confirmPasswordPlaceholder")}
                      className={fieldClass}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                    <span className="uiverse-auth-label">{t("forgot.confirmPasswordPlaceholder")}</span>
                  </div>

                  {/* Reset button */}
                  <Button
                    type="button"
                    className="w-full h-12 mt-2"
                    onClick={handleResetPassword}
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      t("forgot.resetBtn")
                    )}
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
