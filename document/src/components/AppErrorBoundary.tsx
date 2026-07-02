import { Component, useState, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/I18nProvider";

type ErrorBoundaryShellProps = {
  children: ReactNode;
  fallback: ReactNode;
};

type ErrorBoundaryShellState = {
  hasError: boolean;
};

class ErrorBoundaryShell extends Component<ErrorBoundaryShellProps, ErrorBoundaryShellState> {
  state: ErrorBoundaryShellState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryShellState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App render error:", error, info);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

export function AppErrorBoundary({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [resetKey, setResetKey] = useState(0);

  return (
    <ErrorBoundaryShell
      key={resetKey}
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-surface-50 px-6 text-surface-900 dark:bg-surface-950 dark:text-surface-100">
          <div className="w-full max-w-[420px] rounded-xl border border-surface-200 bg-white p-6 text-center shadow-sm dark:border-surface-800 dark:bg-surface-900">
            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h1 className="text-lg font-semibold">{t("errorBoundary.title")}</h1>
            <p className="mt-2 text-sm leading-6 text-surface-500 dark:text-surface-400">
              {t("errorBoundary.description")}
            </p>
            <div className="mt-5 flex items-center justify-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setResetKey((key) => key + 1)}>
                <RotateCcw className="h-4 w-4" />
                <span>{t("errorBoundary.retry")}</span>
              </Button>
              <Button type="button" size="sm" onClick={() => window.location.reload()}>
                <RefreshCw className="h-4 w-4" />
                <span>{t("errorBoundary.reload")}</span>
              </Button>
            </div>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundaryShell>
  );
}
