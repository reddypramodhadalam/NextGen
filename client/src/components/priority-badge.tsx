import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowRight, ArrowUp, AlertTriangle } from "lucide-react";

type PriorityType = "low" | "medium" | "high" | "critical";

interface PriorityBadgeProps {
  priority: PriorityType;
  className?: string;
  testId?: string;
}

const priorityConfig: Record<PriorityType, { label: string; className: string; Icon: typeof ArrowDown }> = {
  low: {
    label: "Low",
    className: "bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20",
    Icon: ArrowDown,
  },
  medium: {
    label: "Medium",
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    Icon: ArrowRight,
  },
  high: {
    label: "High",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 font-semibold",
    Icon: ArrowUp,
  },
  critical: {
    label: "Critical",
    className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 font-bold",
    Icon: AlertTriangle,
  },
};

export function PriorityBadge({ priority, className, testId }: PriorityBadgeProps) {
  const config = priorityConfig[priority] || priorityConfig.medium;
  const Icon = config.Icon;

  return (
    <Badge
      variant="outline"
      className={cn("gap-1 text-xs px-2 py-0.5 rounded-full", config.className, className)}
      data-testid={testId || `badge-priority-${priority}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {config.label}
    </Badge>
  );
}
