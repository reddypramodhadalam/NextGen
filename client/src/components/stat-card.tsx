import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  trend?: { value: number; label: string };
  className?: string;
  testId?: string;
  colorClass?: string;
}

export function StatCard({ title, value, description, icon: Icon, trend, className, testId, colorClass }: StatCardProps) {
  const id = testId || `stat-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <Card
      className={cn(
        "border transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 animate-slide-up cursor-default",
        colorClass,
        className
      )}
      data-testid={id}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5 flex-1 min-w-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider" data-testid={`${id}-title`}>
              {title}
            </p>
            <p className="text-3xl font-bold tracking-tight tabular-nums" data-testid={`${id}-value`}>
              {value}
            </p>
            {description && (
              <p className="text-xs text-muted-foreground truncate">{description}</p>
            )}
            {trend && (
              <div className={cn(
                "flex items-center gap-1 text-xs font-semibold mt-1.5",
                trend.value >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
              )}>
                {trend.value >= 0
                  ? <TrendingUp className="h-3 w-3" />
                  : <TrendingDown className="h-3 w-3" />
                }
                {trend.value >= 0 ? "+" : ""}{trend.value}% {trend.label}
              </div>
            )}
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20 shadow-sm">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
