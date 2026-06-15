import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        // Base layout
        "flex min-h-[90px] w-full rounded-lg",
        // Colors & border
        "border border-input bg-background",
        "px-3 py-2.5 text-sm text-foreground",
        // Placeholder
        "placeholder:text-muted-foreground/60",
        // Transition
        "transition-all duration-200",
        // Focus ring — primary glow
        "focus-visible:outline-none",
        "focus-visible:border-primary/70",
        "focus-visible:ring-2 focus-visible:ring-primary/25",
        "focus-visible:shadow-[0_0_0_3px_hsl(var(--primary)/0.12)]",
        // Hover
        "hover:border-primary/40",
        // Resize
        "resize-y",
        // Disabled
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/40",
        // Ring offset
        "ring-offset-background",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
