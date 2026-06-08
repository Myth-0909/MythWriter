import { cn } from "@/lib/utils";
import { useI18n } from "@/components/I18nProvider";

interface BrandLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showWordmark?: boolean;
  className?: string;
}

const sizeClass = {
  sm: "h-7 w-7",
  md: "h-9 w-9",
  lg: "h-12 w-12",
  xl: "h-28 w-28",
};

export function BrandLogo({ size = "md", showWordmark = false, className }: BrandLogoProps) {
  const { t } = useI18n();
  const appName = t("app.name");

  return (
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      <img
        src="/Logo.png"
        alt={appName}
        className={cn(sizeClass[size], "shrink-0 rounded-lg object-cover")}
      />
      {showWordmark && (
        <span className="text-lg font-bold tracking-normal text-surface-900 dark:text-surface-100">
          {appName}
        </span>
      )}
    </div>
  );
}
