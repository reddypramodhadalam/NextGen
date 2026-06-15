import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Clock, Loader2, MinusCircle, AlertCircle } from "lucide-react";

type StatusType = "passed" | "failed" | "running" | "pending" | "skipped" | "cancelled" | "active" | "deprecated" | "draft" | "online" | "offline" | "busy";

interface StatusBadgeProps {
  status: StatusType;
  showIcon?: boolean;
  className?: string;
  testId?: string;
}

const statusConfig: Record<StatusType, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  passed: {
    label: "Passed",
    className: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-semibold",
    Icon: CheckCircle2,
  },
  failed: {
    label: "Failed",
    className: "bg-red-500/12 text-red-600 dark:text-red-400 border-red-500/30 font-semibold",
    Icon: XCircle,
  },
  running: {
    label: "Running",
    className: "bg-blue-500/12 text-blue-600 dark:text-blue-400 border-blue-500/30 font-semibold",
    Icon: Loader2,
  },
  pending: {
    label: "Pending",
    className: "bg-amber-500/12 text-amber-600 dark:text-amber-400 border-amber-500/30 font-semibold",
    Icon: Clock,
  },
  skipped: {
    label: "Skipped",
    className: "bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20",
    Icon: MinusCircle,
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20",
    Icon: XCircle,
  },
  active: {
    label: "Active",
    className: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-semibold",
    Icon: CheckCircle2,
  },
  deprecated: {
    label: "Deprecated",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25",
    Icon: AlertCircle,
  },
  draft: {
    label: "Draft",
    className: "bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20",
    Icon: Clock,
  },
  online: {
    label: "Online",
    className: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-semibold",
    Icon: CheckCircle2,
  },
  offline: {
    label: "Offline",
    className: "bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20",
    Icon: MinusCircle,
  },
  busy: {
    label: "Busy",
    className: "bg-amber-500/12 text-amber-600 dark:text-amber-400 border-amber-500/30 font-semibold",
    Icon: Loader2,
  },
};

export function StatusBadge({ status, showIcon = true, className, testId }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.Icon;

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 text-xs px-2.5 py-0.5 rounded-full font-medium",
        "border transition-none",
        config.className,
        className
      )}
      data-testid={testId || `badge-status-${status}`}
    >
      {showIcon && (
        <Icon
          className={cn(
            "h-3 w-3 shrink-0",
            (status === "running" || status === "busy") && "animate-spin"
          )}
        />
      )}
      {config.label}
    </Badge>
  );
}
