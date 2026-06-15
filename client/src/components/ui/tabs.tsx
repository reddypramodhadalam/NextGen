import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      // Premium pill-style tab bar with glass background
      "inline-flex h-11 items-center justify-start gap-1",
      "rounded-xl bg-muted/60 backdrop-blur-sm p-1",
      "border border-border/50 shadow-xs",
      "text-muted-foreground",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      // Base styles
      "inline-flex items-center justify-center gap-2 whitespace-nowrap",
      "rounded-lg px-4 py-2 text-sm font-medium",
      "transition-all duration-200 ease-out",
      "cursor-pointer select-none",
      // Focus
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
      // Disabled
      "disabled:pointer-events-none disabled:opacity-40",
      // Inactive hover
      "hover:bg-background/60 hover:text-foreground",
      // Active state — elevated card look with primary accent underline
      "data-[state=active]:bg-background data-[state=active]:text-foreground",
      "data-[state=active]:shadow-sm data-[state=active]:font-semibold",
      "data-[state=active]:border data-[state=active]:border-border/60",
      // Active primary color indicator
      "relative after:absolute after:bottom-0.5 after:left-1/2 after:-translate-x-1/2",
      "after:h-0.5 after:w-0 after:rounded-full after:bg-primary after:transition-all after:duration-200",
      "data-[state=active]:after:w-4/5",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-3",
      "ring-offset-background",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      "data-[state=active]:animate-fade-in",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
