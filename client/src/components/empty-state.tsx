import { Button } from "@/components/ui/button";
import { LucideIcon, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-20 px-4 text-center", className)}>
      <div className="relative mb-5">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-muted to-muted/50 border border-border/60 shadow-sm">
          <Icon className="h-9 w-9 text-muted-foreground/60" />
        </div>
        <div className="absolute inset-0 rounded-2xl bg-primary/5 blur-xl" />
      </div>
      <h3 className="text-lg font-semibold mb-2 tracking-tight">{title}</h3>
      <p className="text-muted-foreground max-w-sm mb-6 text-sm leading-relaxed">{description}</p>
      {action && (
        <Button
          onClick={action.onClick}
          data-testid="button-empty-state-action"
          className="btn-glow"
        >
          <Plus className="h-4 w-4 mr-2" />
          {action.label}
        </Button>
      )}
    </div>
  );
}
