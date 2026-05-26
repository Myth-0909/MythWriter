import { cn } from "@/lib/utils";
import { useI18n } from "@/components/I18nProvider";

interface BrandLogoProps {
  size?: "sm" | "md" | "lg";
  showWordmark?: boolean;
  className?: string;
}

const sizeClass = {
  sm: "h-7 w-7",
  md: "h-9 w-9",
  lg: "h-12 w-12",
};

export function BrandLogo({ size = "md", showWordmark = false, className }: BrandLogoProps) {
  const { t } = useI18n();
  const appName = t("app.name");

  return (
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        viewBox="0 0 64 64"
        role="img"
        aria-label={appName}
        className={cn(sizeClass[size], "shrink-0")}
      >
        <defs>
          <linearGradient id="zn-logo-gold" x1="12" y1="8" x2="54" y2="58" gradientUnits="userSpaceOnUse">
            <stop stopColor="#E8D39A" />
            <stop offset="0.45" stopColor="#B9954E" />
            <stop offset="1" stopColor="#6E5626" />
          </linearGradient>
          <linearGradient id="zn-logo-ink" x1="10" y1="10" x2="52" y2="56" gradientUnits="userSpaceOnUse">
            <stop stopColor="#12332D" />
            <stop offset="1" stopColor="#071512" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill="#F8F6EF" />
        <path
          d="M12 45L35 17H17V10h33L27 38h23v7H12Z"
          fill="url(#zn-logo-ink)"
        />
        <path
          d="M18 48h28c5.2 0 9.4-4.2 9.4-9.4V16h-7.2v22.1c0 2.1-1.7 3.8-3.8 3.8H18V48Z"
          fill="url(#zn-logo-gold)"
        />
        <path
          d="M22 52h21.5c7.9 0 14.3-6.4 14.3-14.3V21"
          fill="none"
          stroke="#C9A85B"
          strokeLinecap="round"
          strokeWidth="2.6"
        />
        <path
          d="M25 23h18M21 30h18M17 37h18"
          stroke="#F8F6EF"
          strokeLinecap="round"
          strokeWidth="2"
          opacity="0.9"
        />
      </svg>
      {showWordmark && (
        <span className="text-lg font-bold tracking-normal text-surface-900 dark:text-surface-100">
          {appName}
        </span>
      )}
    </div>
  );
}
