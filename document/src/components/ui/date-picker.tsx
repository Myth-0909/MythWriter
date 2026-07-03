import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/components/I18nProvider";
import { cn } from "@/lib/utils";

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value?: string) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function getMonthDays(monthDate: Date) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const startOffset = first.getDay();
  const start = new Date(first);
  start.setDate(first.getDate() - startOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

interface DatePickerProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}

export function DatePicker({ value, onChange, placeholder, ariaLabel, className }: DatePickerProps) {
  const { t, lang } = useI18n();
  const selectedDate = parseDateKey(value);
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => selectedDate || new Date());
  const locale = lang === "zh" ? "zh-CN" : "en-US";
  const monthDays = useMemo(() => getMonthDays(viewDate), [viewDate]);
  const weekdayLabels = useMemo(() => {
    const base = new Date(2026, 1, 1);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(base);
      date.setDate(base.getDate() + index);
      return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date);
    });
  }, [locale]);
  const displayLabel = selectedDate
    ? new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(selectedDate)
    : placeholder || t("date.pickDate");

  const moveMonth = (offset: number) => {
    setViewDate((date) => new Date(date.getFullYear(), date.getMonth() + offset, 1));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("h-10 justify-between bg-white px-3 text-left text-xs font-medium dark:bg-[#0f1724]", className)}
          aria-label={ariaLabel || placeholder || t("date.pickDate")}
        >
          <span className={cn("truncate", !selectedDate && "text-surface-400")}>{displayLabel}</span>
          <CalendarDays className="h-4 w-4 text-surface-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[292px]">
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("date.previousMonth")}
            onClick={() => moveMonth(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-semibold text-surface-900 dark:text-surface-100">
            {new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(viewDate)}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("date.nextMonth")}
            onClick={() => moveMonth(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-surface-400">
          {weekdayLabels.map((label) => (
            <div key={label} className="py-1">{label}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {monthDays.map((date) => {
            const dateKey = toDateKey(date);
            const isSelected = value === dateKey;
            const isOutside = date.getMonth() !== viewDate.getMonth();
            const isToday = dateKey === toDateKey(new Date());
            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => {
                  onChange(dateKey);
                  setOpen(false);
                }}
                className={cn(
                  "flex h-8 items-center justify-center rounded-md text-xs font-medium transition-colors hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-500/10 dark:hover:text-brand-200",
                  isOutside && "text-surface-300 dark:text-surface-600",
                  isToday && "ring-1 ring-brand-300 dark:ring-brand-500/45",
                  isSelected && "bg-brand-500 text-white hover:bg-brand-500 hover:text-white dark:bg-brand-400 dark:text-surface-950"
                )}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-3 w-full justify-center gap-1.5 text-surface-500"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            <X className="h-3.5 w-3.5" />
            <span>{t("date.clearDate")}</span>
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
