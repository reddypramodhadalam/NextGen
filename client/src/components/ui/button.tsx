import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold",
    "transition-all duration-200 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-40",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    "cursor-pointer select-none",
    "active:scale-[0.97]",
  ].join(" "),
  {
    variants: {
      variant: {
        // Primary — vivid electric-blue with gradient + glow on hover
        default:
          [
            "bg-gradient-to-b from-primary to-[hsl(213_94%_50%)] text-primary-foreground",
            "border border-primary-border shadow-sm",
            "hover:brightness-110 hover:shadow-[0_0_18px_-4px_hsl(var(--primary)/0.55)]",
          ].join(" "),

        // Destructive — red gradient with glow
        destructive:
          [
            "bg-gradient-to-b from-destructive to-[hsl(0_86%_50%)] text-destructive-foreground",
            "border border-destructive-border shadow-sm",
            "hover:brightness-110 hover:shadow-[0_0_18px_-4px_hsl(var(--destructive)/0.55)]",
          ].join(" "),

        // Outline — glass-style with subtle border
        outline:
          [
            "border [border-color:var(--button-outline)] bg-transparent",
            "shadow-xs backdrop-blur-sm",
            "hover:bg-primary/8 hover:border-primary/40 hover:text-primary",
            "active:shadow-none",
          ].join(" "),

        // Secondary — muted fill, clean
        secondary:
          [
            "bg-secondary text-secondary-foreground",
            "border border-secondary-border shadow-xs",
            "hover:bg-secondary/80 hover:shadow-sm",
          ].join(" "),

        // Ghost — no background, subtle hover
        ghost:
          [
            "border border-transparent bg-transparent",
            "hover:bg-primary/8 hover:text-primary",
          ].join(" "),

        // Link — text-only, underline on hover
        link:
          [
            "border border-transparent bg-transparent text-primary underline-offset-4",
            "hover:underline hover:text-primary/80",
          ].join(" "),

        // Success — green gradient
        success:
          [
            "bg-gradient-to-b from-[hsl(142_71%_45%)] to-[hsl(142_71%_38%)] text-white",
            "border border-[hsl(142_71%_38%)] shadow-sm",
            "hover:brightness-110 hover:shadow-[0_0_18px_-4px_hsl(142_71%_45%/0.55)]",
          ].join(" "),

        // Warning — amber gradient
        warning:
          [
            "bg-gradient-to-b from-[hsl(45_93%_47%)] to-[hsl(45_93%_40%)] text-white",
            "border border-[hsl(45_93%_40%)] shadow-sm",
            "hover:brightness-110 hover:shadow-[0_0_18px_-4px_hsl(45_93%_47%/0.55)]",
          ].join(" "),
      },
      // Heights are set as "min" heights so buttons expand gracefully with content
      size: {
        default: "min-h-9 px-4 py-2",
        sm:      "min-h-8 rounded-md px-3 text-xs",
        lg:      "min-h-11 rounded-lg px-8 text-base",
        xl:      "min-h-12 rounded-xl px-10 text-base",
        icon:    "h-9 w-9 rounded-lg",
        "icon-sm": "h-7 w-7 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
