import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/I18nProvider";

export function LoadErrorState({
  message,
  onRetry,
  compact = false,
}: {
  message: string;
  onRetry: () => void;
  compact?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      role="alert"
      className={`mx-auto flex max-w-xl flex-col items-center rounded-2xl border border-red-200 bg-red-50/70 text-center dark:border-red-900/70 dark:bg-red-950/30 ${compact ? "gap-2 px-4 py-5" : "gap-3 px-6 py-10"}`}
    >
      <AlertCircle className="h-6 w-6 text-red-500" />
      <p className="text-sm font-medium text-red-800 dark:text-red-200">{message}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry} className="gap-2">
        <RefreshCw className="h-4 w-4" />
        {t("common.retry")}
      </Button>
    </div>
  );
}
