import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  [
    "relative w-full rounded-xl border p-4",
    "[&>svg~*]:pl-8 [&>svg+div]:translate-y-[-2px]",
    "[&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4",
    "shadow-xs",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-background/80 text-foreground border-border/60 [&>svg]:text-foreground",
        destructive:
          "bg-destructive/8 text-destructive border-destructive/30 [&>svg]:text-destructive",
        success:
          "bg-[hsl(142_71%_45%/0.08)] text-[hsl(142_71%_35%)] border-[hsl(142_71%_45%/0.3)] [&>svg]:text-[hsl(142_71%_45%)] dark:text-[hsl(142_71%_60%)]",
        warning:
          "bg-[hsl(45_93%_47%/0.08)] text-[hsl(38_92%_35%)] border-[hsl(45_93%_47%/0.3)] [&>svg]:text-[hsl(45_93%_47%)] dark:text-[hsl(45_93%_65%)]",
        info:
          "bg-primary/8 text-primary border-primary/25 [&>svg]:text-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
))
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none tracking-tight", className)}
    {...props}
  />
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
))
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription }
