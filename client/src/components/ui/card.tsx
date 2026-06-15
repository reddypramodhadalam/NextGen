import * as React from "react"

import { cn } from "@/lib/utils"
import { getCardColorVars } from "@/lib/cardColor"

// Accent color map for Tailwind classes
const accentColorMap: Record<string, string> = {
  primary: "border-l-4 border-primary",
  accent: "border-l-4 border-accent",
  secondary: "border-l-4 border-secondary",
  'chart-1': "border-l-4 border-chart-1",
  'chart-2': "border-l-4 border-chart-2",
  'chart-3': "border-l-4 border-chart-3",
  'chart-4': "border-l-4 border-chart-4",
  'chart-5': "border-l-4 border-chart-5",
}

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  colorSeed?: string;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, colorSeed = "default", ...props }, ref) => {
    // Detect theme (light/dark) from document or fallback to light
    const [theme, setTheme] = React.useState<'light' | 'dark'>('light');
    React.useEffect(() => {
      if (typeof window !== 'undefined') {
        setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
      }
    }, []);
    const colorVars = getCardColorVars(colorSeed, theme);
    return (
      <div
        ref={ref}
        className={cn(
          "shadcn-card rounded-xl border shadow-sm",
          "transition-shadow duration-200",
          className
        )}
        style={{
          background: colorVars.bg,
          borderColor: colorVars.border,
          color: colorVars.text,
        }}
        {...props}
      />
    );
  }
);
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "text-xl font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground leading-relaxed", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
}
