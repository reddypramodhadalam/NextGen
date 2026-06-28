/**
 * ReviewRequiredBadge
 * ─────────────────────────────────────────────────────────────────────────────
 * Small colored pill displayed on test case rows / cards to show review state.
 */

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getReviewStatusBadge } from "@/hooks/useGovernance";
import { cn } from "@/lib/utils";

interface ReviewRequiredBadgeProps {
  status?: string | null;
  className?: string;
}

export function ReviewRequiredBadge({ status, className }: ReviewRequiredBadgeProps) {
  const badge = getReviewStatusBadge(status);
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn("font-medium border", badge.className, className)}
            data-testid={`review-badge-${status?.toLowerCase() || "none"}`}
          >
            {badge.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-sm">{badge.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
