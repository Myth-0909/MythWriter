import { NotebookTabs } from "lucide-react";
import { WorkRecordPanel } from "@/components/WorkRecordPanel";
import { Scrollbar } from "@/components/ui/scrollbar";
import { useI18n } from "@/components/I18nProvider";

export function WorkRecordsPage() {
  const { t } = useI18n();

  return (
    <Scrollbar
      className="flex-1 bg-surface-50 dark:bg-surface-950"
      options={{ scrollbars: { autoHide: "scroll" } }}
    >
      <div className="mx-auto w-full max-w-[1360px] px-8 py-8 xl:px-10">
        <section className="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm dark:border-surface-800 dark:bg-surface-900">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700 shadow-sm dark:bg-brand-500/15 dark:text-brand-300">
              <NotebookTabs className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold leading-tight text-surface-950 dark:text-surface-50">
                {t("records.title")}
              </h1>
              <p className="mt-2 max-w-[720px] text-sm leading-6 text-surface-500 dark:text-surface-400">
                {t("records.subtitle")}
              </p>
            </div>
          </div>
        </section>

        <WorkRecordPanel className="mt-5" />
      </div>
    </Scrollbar>
  );
}
