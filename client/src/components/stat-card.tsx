import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon, TrendingUp, TrendingDown, ArrowUpRight } from "lucide-react";
import { Link } from "wouter";

/**
 * Baxter-grade KPI tile.
 *
 * Tones map to the Baxter brand palette (see index.css → BAXTER BRAND TOKENS).
 * When `href` is supplied the entire card becomes a navigable link with a
 * hover affordance (the arrow in the top-right) so users understand the metric
 * is a drill-down into the underlying section.
 */
type Tone = "blue" | "cyan" | "green" | "amber" | "violet";

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  trend?: { value: number; label: string };
  className?: string;
  testId?: string;
  /** Legacy gradient class (metric-blue, metric-green…). Optional now. */
  colorClass?: string;
  /** Brand tone for the icon chip + value accent. */
  tone?: Tone;
  /** When set, the whole card links here. */
  href?: string;
}

const TONE: Record<Tone, { chip: string; icon: string; value: string; ring: string }> = {
  blue: {
    chip: "bg-[color:var(--baxter-primary)]",
    icon: "text-white",
    value: "text-[color:var(--baxter-primary)] dark:text-blue-300",
    ring: "ring-[color:var(--baxter-primary)]/20",
  },
  cyan: {
    chip: "bg-[color:var(--baxter-accent)]",
    icon: "text-white",
    value: "text-[color:var(--baxter-accent)] dark:text-cyan-300",
    ring: "ring-[color:var(--baxter-accent)]/20",
  },
  green: {
    chip: "bg-[color:var(--baxter-success)]",
    icon: "text-white",
    value: "text-[color:var(--baxter-success)] dark:text-emerald-300",
    ring: "ring-[color:var(--baxter-success)]/20",
  },
  amber: {
    chip: "bg-[color:var(--baxter-warning)]",
    icon: "text-white",
    value: "text-[color:var(--baxter-warning)] dark:text-amber-300",
    ring: "ring-[color:var(--baxter-warning)]/20",
  },
  violet: {
    chip: "bg-[#6D28D9]",
    icon: "text-white",
    value: "text-[#6D28D9] dark:text-violet-300",
    ring: "ring-[#6D28D9]/20",
  },
};

export function StatCard({
  title, value, description, icon: Icon, trend, className, testId, colorClass, tone, href,
}: StatCardProps) {
  const id = testId || `stat-${title.toLowerCase().replace(/\s+/g, "-")}`;
  const t = tone ? TONE[tone] : null;

  const card = (
    <Card
      className={cn(
        "group relative h-full border bg-card transition-all duration-200 overflow-hidden",
        "hover:shadow-lg hover:-translate-y-0.5 animate-slide-up",
        href ? "cursor-pointer" : "cursor-default",
        // keep legacy gradient support when no tone is given
        !tone && colorClass,
        className
      )}
      data-testid={id}
    >
      {/* Left accent bar (brand tone) */}
      {tone && <span className={cn("absolute left-0 top-0 h-full w-1", t!.chip)} aria-hidden />}
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5 flex-1 min-w-0">
            <p
              className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
              data-testid={`${id}-title`}
            >
              {title}
            </p>
            <p
              className={cn("text-3xl font-bold tracking-tight tabular-nums", t?.value)}
              data-testid={`${id}-value`}
            >
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
                {trend.value >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {trend.value >= 0 ? "+" : ""}{trend.value}% {trend.label}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className={cn(
              "flex h-12 w-12 items-center justify-center rounded-xl shadow-sm ring-1",
              t ? cn(t.chip, t.ring) : "bg-primary/10 ring-primary/20"
            )}>
              <Icon className={cn("h-5 w-5", t ? t.icon : "text-primary")} />
            </div>
            {href && (
              <ArrowUpRight className="h-4 w-4 text-muted-foreground/40 transition-all group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full" data-testid={`${id}-link`}>
        {card}
      </Link>
    );
  }
  return card;
}
