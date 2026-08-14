import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileType, Code2 } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { Button } from "@/components/ui/button";

interface ShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (format: "word" | "md") => void;
}

const exportFormats = [
  { id: "word", label: "DOCX", descKey: "share.wordDesc" as const, icon: FileType, iconColor: "text-blue-600 dark:text-blue-400", iconBg: "bg-blue-50 dark:bg-blue-950" },
  { id: "md", label: "Markdown", descKey: "share.mdDesc" as const, icon: Code2, iconColor: "text-purple-600 dark:text-purple-400", iconBg: "bg-purple-50 dark:bg-purple-950" },
] as const;

export function ShareModal({ open, onOpenChange, onExport }: ShareModalProps) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] px-6 py-6">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-lg">{t("share.title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-surface-400 mb-4">
              {t("share.exportDocument")}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {exportFormats.map((format) => (
                <Button
                  type="button"
                  variant="outline"
                  key={format.id}
                  onClick={() => {
                    onExport(format.id);
                    onOpenChange(false);
                  }}
                  className="group h-auto flex-col items-center gap-3 rounded-xl bg-white p-4 text-center dark:bg-surface-900"
                >
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${format.iconBg} transition-transform duration-200 group-hover:scale-110`}>
                    <format.icon className={`h-6 w-6 ${format.iconColor}`} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-surface-800 dark:text-surface-200">{format.label}</span>
                    <span className="text-[10px] text-surface-400 leading-tight">{t(format.descKey)}</span>
                  </div>
                </Button>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
