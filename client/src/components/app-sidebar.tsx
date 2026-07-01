import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard,
  Sparkles,
  FolderOpen,
  Code2,
  Play,
  FileText,
  Bot,
  Settings,
  Zap,
  FileUp,
  Server,
  LogOut,
  ChevronUp,
  FolderKanban,
  Shield,
  AppWindow,
  Bell,
  Building2,
  HeartPulse,
  Gauge,
  FlaskConical,
  GitMerge,
  Target,
  ShieldAlert,
  Database,
  Brain,
} from "lucide-react";

const mainNavItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
    description: "Overview & metrics",
  },
  {
    title: "Import Test Cases",
    url: "/upload",
    icon: FileUp,
    description: "Import CSV, Excel, JSON",
    badge: "NEW",
  },
  {
    title: "AI Test Generator",
    url: "/generator",
    icon: Sparkles,
    description: "Generate from requirements",
    badge: "AI",
  },
  {
    title: "AI Knowledge Hub",
    url: "/knowledge",
    icon: Database,
    description: "RAG-powered knowledge",
    badge: "NEW",
  },
  {
    title: "Learning & Analytics",
    url: "/learning",
    icon: Brain,
    description: "Self-improving locator intelligence",
    badge: "AI",
  },
  {
    title: "Test Repository",
    url: "/repository",
    icon: FolderOpen,
    description: "Manage test cases",
  },
  {
    title: "Script Generator",
    url: "/scripts",
    icon: Code2,
    description: "Auto-generate scripts",
    badge: "AI",
  },
];

const executionNavItems = [
  {
    title: "Executions",
    url: "/executions",
    icon: Play,
    description: "Run & monitor tests",
  },
  {
    title: "Enterprise",
    url: "/enterprise",
    icon: Building2,
    description: "SAP, Salesforce, JDE",
    badge: "NEW",
  },
  {
    title: "Multi-Agent AI",
    url: "/multi-agent",
    icon: Bot,
    description: "DOM-capture + auto-execute",
    badge: "AI",
  },
  {
    title: "AI Healer",
    url: "/healer",
    icon: HeartPulse,
    description: "Auto-fix broken tests · Standard + Pro",
    badge: "AI",
  },
  {
    title: "AI Healer Pro",
    url: "/healer/enterprise",
    icon: HeartPulse,
    description: "Enterprise healing with rollback",
    badge: "PRO",
  },
  {
    title: "Performance",
    url: "/performance",
    icon: Gauge,
    description: "Load testing & benchmarks",
    badge: "NEW",
  },
  {
    title: "CI/CD",
    url: "/cicd",
    icon: GitMerge,
    description: "Pipeline integrations",
    badge: "NEW",
  },
  {
    title: "Coverage",
    url: "/coverage",
    icon: Target,
    description: "Requirements coverage",
    badge: "NEW",
  },
  {
    title: "Reports",
    url: "/reports",
    icon: FileText,
    description: "Analytics & insights",
  },
];

const configNavItems = [
  {
    title: "App Profiles",
    url: "/app-profiles",
    icon: AppWindow,
    description: "JDE, SAP, Salesforce...",
    badge: "NEW",
  },
  {
    title: "Data Factory",
    url: "/data-factory",
    icon: FlaskConical,
    description: "Synthetic test data",
    badge: "NEW",
  },
  {
    title: "Agent Setup",
    url: "/agents",
    icon: Bot,
    description: "Autonomous agents",
  },
  // NOTE: "Enterprise Agents" (/agents/enterprise) is intentionally hidden from the
  // sidebar. The feature is a non-functional placeholder — its 7 "agents" are
  // hardcoded/in-memory with simulated health, and all executions actually run
  // locally via aiTestExecutor regardless of the agent shown. The page + route in
  // App.tsx are kept so this can be re-enabled later by restoring this entry.
  {
    title: "Compliance",
    url: "/compliance",
    icon: ShieldAlert,
    description: "Approvals, audits, flaky tests",
    badge: "NEW",
  },
  {
    title: "LLM Tests",
    url: "/llm-tests",
    icon: Brain,
    description: "5-layer LLM evaluation",
    badge: "NEW",
  },
  {
    title: "Enterprise Agents",
    url: "/agents/enterprise",
    icon: Server,
    description: "Agent groups & orchestration",
    badge: "NEW",
  },
  {
    title: "Compliance",
    url: "/compliance",
    icon: ShieldAlert,
    description: "Approvals, audits, flaky tests",
    badge: "NEW",
  },
  {
    title: "LLM Tests",
    url: "/llm-tests",
    icon: Brain,
    description: "5-layer LLM evaluation",
    badge: "NEW",
  },
  {
    title: "Environments",
    url: "/environments",
    icon: Server,
    description: "Dev, staging, prod",
  },
  {
    title: "Projects",
    url: "/projects",
    icon: FolderKanban,
    description: "Team workspaces",
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
    description: "Platform config",
  },
  {
    title: "Admin",
    url: "/admin",
    icon: ShieldAlert,
    description: "RBAC & system health",
    badge: "ADMIN",
  },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout, isLoggingOut } = useAuth();

  const userInitials = user?.firstName && user?.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`
    : user?.email?.substring(0, 2).toUpperCase() || "U";

  return (
    <Sidebar>
      {/* Brand Header */}
      <SidebarHeader className="p-0 border-b border-sidebar-border">
        <Link href="/" className="flex items-center gap-3 px-4 py-4 group">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg group-hover:shadow-blue-500/30 transition-shadow">
            <Zap className="h-5 w-5 text-white" />
            <div className="absolute inset-0 rounded-xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sidebar-foreground tracking-tight text-base leading-none">AITAS</span>
            <span className="text-[10px] text-sidebar-foreground/50 font-medium tracking-widest uppercase mt-0.5">AI Test Automation</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3 gap-1">
        {/* Main Navigation */}
        <SidebarGroup className="p-0">
          <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] font-semibold uppercase tracking-widest px-3 mb-1">
            Core
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {mainNavItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className={`group/item relative h-9 rounded-lg transition-all duration-150 ${
                        isActive
                          ? "bg-sidebar-primary/18 text-sidebar-primary font-semibold shadow-sm"
                          : "text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                      }`}
                      data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <Link href={item.url} className="flex items-center gap-3 px-3">
                        {isActive && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-sidebar-primary shadow-[0_0_10px_hsl(var(--sidebar-primary)/0.9)]" />
                        )}
                        <item.icon className={`h-4 w-4 shrink-0 transition-transform duration-150 group-hover/item:scale-110 ${
                          isActive ? "text-sidebar-primary" : ""
                        }`} />
                        <span className="flex-1 text-sm">{item.title}</span>
                        {item.badge && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white leading-none tracking-wide ${
                            item.badge === "NEW"
                              ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                              : "bg-gradient-to-r from-blue-500 to-violet-500"
                          }`}>
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Execution Navigation */}
        <SidebarGroup className="p-0 mt-3">
          <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] font-semibold uppercase tracking-widest px-3 mb-1">
            Execution
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {executionNavItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className={`group/item relative h-9 rounded-lg transition-all duration-150 ${
                        isActive
                          ? "bg-sidebar-primary/18 text-sidebar-primary font-semibold shadow-sm"
                          : "text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                      }`}
                      data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <Link href={item.url} className="flex items-center gap-3 px-3">
                        {isActive && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-sidebar-primary shadow-[0_0_10px_hsl(var(--sidebar-primary)/0.9)]" />
                        )}
                        <item.icon className={`h-4 w-4 shrink-0 transition-transform duration-150 group-hover/item:scale-110 ${isActive ? "text-sidebar-primary" : ""}`} />
                        <span className="flex-1 text-sm">{item.title}</span>
                        {(item as any).badge && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white leading-none tracking-wide ${
                            (item as any).badge === "NEW"
                              ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                              : "bg-gradient-to-r from-blue-500 to-violet-500"
                          }`}>
                            {(item as any).badge}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Config Navigation */}
        <SidebarGroup className="p-0 mt-3">
          <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] font-semibold uppercase tracking-widest px-3 mb-1">
            Configuration
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {configNavItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className={`group/item relative h-9 rounded-lg transition-all duration-150 ${
                        isActive
                          ? "bg-sidebar-primary/18 text-sidebar-primary font-semibold shadow-sm"
                          : "text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                      }`}
                      data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <Link href={item.url} className="flex items-center gap-3 px-3">
                        {isActive && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-sidebar-primary shadow-[0_0_10px_hsl(var(--sidebar-primary)/0.9)]" />
                        )}
                        <item.icon className={`h-4 w-4 shrink-0 transition-transform duration-150 group-hover/item:scale-110 ${
                          isActive ? "text-sidebar-primary" : ""
                        }`} />
                        <span className="flex-1 text-sm">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* User Footer */}
      <SidebarFooter className="p-2 border-t border-sidebar-border">
        {/* Version badge */}
        <div className="flex items-center justify-between px-3 py-1.5 mb-1">
          <div className="flex items-center gap-1.5">
            <Shield className="h-3 w-3 text-sidebar-foreground/30" />
            <span className="text-[10px] text-sidebar-foreground/30 font-medium">v2.0.0 Enterprise</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-emerald-400/70 font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.8)]" />
            Online
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-11 px-3 rounded-xl hover:bg-sidebar-accent text-sidebar-foreground/80 hover:text-sidebar-foreground transition-all duration-150"
              data-testid="button-user-menu"
            >
              <Avatar className="h-7 w-7 ring-2 ring-sidebar-primary/40 shadow-sm">
                <AvatarImage src={user?.profileImageUrl || undefined} />
                <AvatarFallback className="text-xs bg-gradient-to-br from-blue-500 to-violet-600 text-white font-bold">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start text-left overflow-hidden flex-1">
                <span className="text-sm font-semibold truncate w-full text-sidebar-foreground">
                  {user?.firstName && user?.lastName
                    ? `${user.firstName} ${user.lastName}`
                    : user?.email || "User"}
                </span>
                <span className="text-[10px] text-sidebar-foreground/40 truncate w-full">
                  {user?.isSuperAdmin ? "Super Admin" : "Team Member"}
                </span>
              </div>
              <ChevronUp className="h-3.5 w-3.5 text-sidebar-foreground/30 shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <div className="px-3 py-2.5">
              <p className="text-sm font-bold">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{user?.email}</p>
              <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 mt-2">
                <div className="h-1.5 w-1.5 rounded-full neon-dot-green" />
                <span className="font-semibold">System Online</span>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => logout()}
              disabled={isLoggingOut}
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4 mr-2" />
              {isLoggingOut ? "Signing out..." : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
