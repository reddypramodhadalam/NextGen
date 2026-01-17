import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type PriorityType = "low" | "medium" | "high" | "critical";

interface PriorityBadgeProps {
  priority: PriorityType;
  className?: string;
  testId?: string;
}

const priorityConfig: Record<PriorityType, { label: string; className: string }> = {
  low: {
    label: "Low",
    className: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/20",
  },
  medium: {
    label: "Medium",
    className: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
  },
  high: {
    label: "High",
    className: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  critical: {
    label: "Critical",
    className: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
  },
};

export function PriorityBadge({ priority, className, testId }: PriorityBadgeProps) {
  const config = priorityConfig[priority] || priorityConfig.medium;

  return (
    <Badge
      variant="outline"
      className={cn("font-medium", config.className, className)}
      data-testid={testId || `badge-priority-${priority}`}
    >
      {config.label}
    </Badge>
  );
}
