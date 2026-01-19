import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/empty-state";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Server,
  Plus,
  MoreVertical,
  Trash2,
  Globe,
  Settings,
  CheckCircle2,
  XCircle,
  Edit2,
  Loader2,
  Variable,
} from "lucide-react";
import type { Environment } from "@shared/schema";

export default function Environments() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEnv, setEditingEnv] = useState<Environment | null>(null);
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isDefault, setIsDefault] = useState(false);
  const [variablesText, setVariablesText] = useState("");

  const { data: environments = [], isLoading } = useQuery<Environment[]>({
    queryKey: ["/api/environments"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/environments", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/environments"] });
      toast({ title: "Environment Created", description: "New environment has been added." });
      handleCloseDialog();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create environment.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/environments/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/environments"] });
      toast({ title: "Environment Updated", description: "Environment has been updated." });
      handleCloseDialog();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update environment.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/environments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/environments"] });
      toast({ title: "Environment Deleted", description: "Environment has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete environment.", variant: "destructive" });
    },
  });

  const parseVariables = (text: string): Record<string, string> => {
    const result: Record<string, string> = {};
    const lines = text.split("\n").filter((l) => l.trim());
    for (const line of lines) {
      const [key, ...valueParts] = line.split("=");
      if (key && valueParts.length > 0) {
        result[key.trim()] = valueParts.join("=").trim();
      }
    }
    return result;
  };

  const formatVariables = (vars: Record<string, string> | null): string => {
    if (!vars) return "";
    return Object.entries(vars).map(([k, v]) => `${k}=${v}`).join("\n");
  };

  const handleOpenEdit = (env: Environment) => {
    setEditingEnv(env);
    setName(env.name);
    setDisplayName(env.displayName || "");
    setBaseUrl(env.baseUrl || "");
    setIsActive(env.isActive ?? true);
    setIsDefault(env.isDefault ?? false);
    setVariablesText(formatVariables(env.variables as Record<string, string>));
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingEnv(null);
    setName("");
    setDisplayName("");
    setBaseUrl("");
    setIsActive(true);
    setIsDefault(false);
    setVariablesText("");
  };

  const handleSubmit = () => {
    const variables = parseVariables(variablesText);
    const data = {
      name,
      displayName: displayName || name,
      baseUrl,
      isActive,
      isDefault,
      variables,
    };
    if (editingEnv) {
      updateMutation.mutate({ id: editingEnv.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Server className="h-6 w-6 text-primary" />
            Environments
          </h1>
          <p className="text-muted-foreground">
            Manage testing environments with different configurations
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-environment">
              <Plus className="h-4 w-4 mr-2" />
              Add Environment
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingEnv ? "Edit Environment" : "Add Environment"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="env-name">Name</Label>
                <Input
                  id="env-name"
                  placeholder="e.g., production"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  data-testid="input-env-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="env-display-name">Display Name</Label>
                <Input
                  id="env-display-name"
                  placeholder="e.g., Production Server"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  data-testid="input-env-display-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="env-base-url">Base URL</Label>
                <Input
                  id="env-base-url"
                  placeholder="https://example.com"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  data-testid="input-env-base-url"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="env-variables">
                  Environment Variables
                  <span className="text-xs text-muted-foreground ml-2">(one per line: KEY=value)</span>
                </Label>
                <textarea
                  id="env-variables"
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="API_URL=https://api.example.com&#10;API_KEY=secret"
                  value={variablesText}
                  onChange={(e) => setVariablesText(e.target.value)}
                  data-testid="input-env-variables"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="env-active">Active</Label>
                <Switch
                  id="env-active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                  data-testid="switch-env-active"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="env-default">Default Environment</Label>
                <Switch
                  id="env-default"
                  checked={isDefault}
                  onCheckedChange={setIsDefault}
                  data-testid="switch-env-default"
                />
              </div>
              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={!name || createMutation.isPending || updateMutation.isPending}
                data-testid="button-submit-environment"
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {editingEnv ? "Update Environment" : "Create Environment"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {environments.length === 0 ? (
        <EmptyState
          icon={Server}
          title="No environments configured"
          description="Create environments to test your application in different configurations."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {environments.map((env) => {
            const variableCount = env.variables ? Object.keys(env.variables).length : 0;
            return (
              <Card key={env.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      env.isActive
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      <Globe className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {env.displayName || env.name}
                        {env.isDefault && (
                          <Badge variant="secondary" className="text-xs">Default</Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="text-xs">{env.name}</CardDescription>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" data-testid={`button-env-menu-${env.id}`}>
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleOpenEdit(env)}>
                        <Edit2 className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-600"
                        onClick={() => deleteMutation.mutate(env.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardHeader>
                <CardContent className="space-y-3">
                  {env.baseUrl && (
                    <div className="flex items-center gap-2 text-sm">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground truncate">{env.baseUrl}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <Variable className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      {variableCount} variable{variableCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {env.isActive ? (
                      <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/20">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-muted text-muted-foreground">
                        <XCircle className="h-3 w-3 mr-1" />
                        Inactive
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
