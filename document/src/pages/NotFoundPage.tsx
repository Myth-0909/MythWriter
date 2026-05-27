import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/I18nProvider";
import { FileQuestion } from "lucide-react";

interface NotFoundPageProps {
  onGoHome: () => void;
}

export function NotFoundPage({ onGoHome }: NotFoundPageProps) {
  const { t } = useI18n();

  return (
    <div className="flex-1 flex items-center justify-center bg-surface-50 dark:bg-surface-950">
      <div className="text-center">
        <FileQuestion className="mx-auto h-16 w-16 text-surface-300 dark:text-surface-600" />
        <h1 className="mt-6 text-5xl font-bold text-surface-300 dark:text-surface-600">404</h1>
        <p className="mt-3 text-lg font-medium text-surface-700 dark:text-surface-300">
          {t("notfound.title")}
        </p>
        <p className="mt-1 text-sm text-surface-500">
          {t("notfound.desc")}
        </p>
        <Button onClick={onGoHome} className="mt-6">
          {t("notfound.backHome")}
        </Button>
      </div>
    </div>
  );
}
