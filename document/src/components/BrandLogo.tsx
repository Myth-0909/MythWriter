import { cn } from "@/lib/utils";
import { useI18n } from "@/components/I18nProvider";

interface BrandLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showWordmark?: boolean;
  className?: string;
}

const sizeClass = {
  sm: "h-9 w-9",
  md: "h-11 w-11",
  lg: "h-16 w-16",
  xl: "h-36 w-36",
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
