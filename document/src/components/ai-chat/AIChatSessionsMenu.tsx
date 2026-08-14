import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { MessagesSquare, Trash2 } from "lucide-react";

export type AIChatSessionItem = {
  id: string;
  title: string;
  updatedAt?: string;
};

type AIChatSessionsMenuProps = {
  open: boolean;
  sessions: AIChatSessionItem[];
  activeConversationId: string | null;
  buttonClassName: string;
  activeButtonClassName: string;
  disabled?: boolean;
  labels: {
    sessions: string;
    sessionsEmpty: string;
    deleteAria: string;
  };
  onToggle: () => void;
  onClose: () => void;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
};

export function AIChatSessionsMenu({
  open,
  sessions,
  activeConversationId,
  buttonClassName,
  activeButtonClassName,
  disabled = false,
  labels,
  onToggle,
  onClose,
  onSwitch,
  onDelete,
}: AIChatSessionsMenuProps) {
  return (
    <div className="relative">
      <Tooltip content={labels.sessions} delay={150}>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          aria-label={labels.sessions}
          disabled={disabled}
          onClick={onToggle}
          className={cn(buttonClassName, open && activeButtonClassName)}
        >
          <MessagesSquare className="h-4 w-4" />
        </Button>
      </Tooltip>
      {open && (
        <>
          <Button
            type="button"
            variant="ghost"
            aria-label={labels.sessions}
            className="fixed inset-0 z-10 h-auto w-auto rounded-none p-0"
            onClick={onClose}
          />
          <div className="absolute right-0 top-full mt-1 z-20 w-56 max-h-64 overflow-y-auto rounded-lg border border-surface-200 bg-white py-1 shadow-lg dark:border-surface-700 dark:bg-surface-900">
            {sessions.length === 0 ? (
              <div className="px-3 py-2 text-xs text-surface-500">{labels.sessionsEmpty}</div>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  className={cn(
                    "group flex items-center gap-1 px-2 py-1.5 text-xs hover:bg-surface-50 dark:hover:bg-surface-800",
                    activeConversationId === session.id && "bg-brand-50 dark:bg-brand-950"
                  )}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto min-w-0 flex-1 justify-start truncate px-1 py-0.5 text-left font-normal text-surface-700 dark:text-surface-300"
                    onClick={() => onSwitch(session.id)}
                  >
                    {session.title}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="h-6 w-6 shrink-0 p-1 text-surface-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(session.id);
                    }}
                    aria-label={labels.deleteAria}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
