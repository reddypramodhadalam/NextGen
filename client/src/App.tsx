import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Generator from "@/pages/generator";
import Repository from "@/pages/repository";
import Scripts from "@/pages/scripts";
import Executions from "@/pages/executions";
import Reports from "@/pages/reports";
import Agents from "@/pages/agents";
import Settings from "@/pages/settings";
import Environments from "@/pages/environments";
import Projects from "@/pages/projects";
import Landing from "@/pages/landing";
import Login from "@/pages/login";
import ChangePassword from "@/pages/change-password";
import Documentation from "@/pages/documentation";
import { Loader2 } from "lucide-react";

function AuthenticatedRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/generator" component={Generator} />
      <Route path="/repository" component={Repository} />
      <Route path="/scripts" component={Scripts} />
      <Route path="/executions" component={Executions} />
      <Route path="/reports" component={Reports} />
      <Route path="/agents" component={Agents} />
      <Route path="/environments" component={Environments} />
      <Route path="/projects" component={Projects} />
      <Route path="/settings" component={Settings} />
      <Route path="/docs" component={Documentation} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between gap-4 px-4 py-3 border-b shrink-0">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-y-auto">
            <AuthenticatedRouter />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function UnauthenticatedRouter() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/change-password" component={ChangePassword} />
      <Route path="/docs" component={Documentation} />
      <Route>
        <Redirect to="/" />
      </Route>
    </Switch>
  );
}

function AppContent() {
  const { isLoading, isAuthenticated, mustChangePassword } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If authenticated but must change password, only allow change-password page
  if (isAuthenticated && mustChangePassword) {
    if (location !== "/change-password") {
      return <Redirect to="/change-password" />;
    }
    return <ChangePassword />;
  }

  // If not authenticated, show unauthenticated routes
  if (!isAuthenticated) {
    return <UnauthenticatedRouter />;
  }

  // Redirect from login/change-password to home if already authenticated
  if (location === "/login" || location === "/change-password") {
    return <Redirect to="/" />;
  }

  return <AuthenticatedApp />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
