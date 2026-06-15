import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  [
    // Base
    "whitespace-nowrap inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5",
    "text-xs font-semibold tracking-wide",
    "transition-all duration-150",
    "border",
    "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  ].join(" "),
  {
    variants: {
      variant: {
        // Primary — vivid blue pill
        default:
          "bg-primary/15 text-primary border-primary/30 shadow-xs",

        // Secondary — muted neutral pill
        secondary:
          "bg-secondary text-secondary-foreground border-secondary-border/60",

        // Destructive — red pill
        destructive:
          "bg-destructive/15 text-destructive border-destructive/30 shadow-xs",

        // Outline — ghost pill with subtle border
        outline:
          "bg-transparent text-foreground [border-color:var(--badge-outline)] shadow-xs",

        // Success — green pill
        success:
          "bg-[hsl(142_71%_45%/0.15)] text-[hsl(142_71%_38%)] border-[hsl(142_71%_45%/0.35)] dark:text-[hsl(142_71%_55%)]",

        // Warning — amber pill
        warning:
          "bg-[hsl(45_93%_47%/0.15)] text-[hsl(38_92%_40%)] border-[hsl(45_93%_47%/0.35)] dark:text-[hsl(45_93%_60%)]",

        // Info — sky blue pill
        info:
          "bg-[hsl(200_100%_50%/0.12)] text-[hsl(200_100%_38%)] border-[hsl(200_100%_50%/0.3)] dark:text-[hsl(200_100%_65%)]",

        // Purple accent pill
        accent:
          "bg-accent/15 text-accent border-accent/30 shadow-xs",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants }
