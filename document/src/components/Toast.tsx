import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/I18nProvider";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  exiting?: boolean;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType>({ toast: (_message: string, _type?: ToastType) => {} });

export function useToast() {
  return useContext(ToastContext);
}

const icons: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};

const colors: Record<ToastType, string> = {
  success: "border-green-400 bg-green-50 text-green-800 dark:bg-green-950 dark:border-green-700 dark:text-green-300",
  error: "border-red-400 bg-red-50 text-red-800 dark:bg-red-950 dark:border-red-700 dark:text-red-300",
  info: "border-blue-400 bg-blue-50 text-blue-800 dark:bg-blue-950 dark:border-blue-700 dark:text-blue-300",
};

function ToastItem({ t, onRemove }: { t: Toast; onRemove: (id: number) => void }) {
  const { t: translate } = useI18n();
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRemove = () => {
    setExiting(true);
    timerRef.current = setTimeout(() => onRemove(t.id), 300);
  };

  useEffect(() => {
    const autoRemove = setTimeout(handleRemove, 2500);
    return () => {
      clearTimeout(autoRemove);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const Icon = icons[t.type];

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-center gap-3 rounded-xl border px-5 py-3 shadow-lg min-w-[300px]",
        exiting ? "toast-exit" : "toast-enter",
        colors[t.type]
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-sm font-medium">{t.message}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={translate("common.close")}
        onClick={handleRemove}
        className="shrink-0 opacity-60 hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed top-6 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} t={t} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
