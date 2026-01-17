import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Bot,
  Plus,
  Loader2,
  Settings,
  Trash2,
  RefreshCw,
  Terminal,
  Globe,
  Smartphone,
  MoreVertical,
  Copy,
  Check,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TestAgent } from "@shared/schema";

const agentTypes = [
  { value: "browser", label: "Browser Agent", icon: Globe, description: "Web UI testing with Playwright/Selenium" },
  { value: "api", label: "API Agent", icon: Terminal, description: "REST/GraphQL API testing" },
  { value: "mobile", label: "Mobile Agent", icon: Smartphone, description: "Mobile app testing" },
];

const capabilities = [
  "screenshot",
  "video",
  "network-logging",
  "performance-metrics",
  "accessibility",
  "visual-regression",
];

export default function Agents() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentType, setNewAgentType] = useState("browser");
  const [newAgentDescription, setNewAgentDescription] = useState("");
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>(["screenshot"]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: agents = [], isLoading } = useQuery<TestAgent[]>({
    queryKey: ["/api/agents"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; type: string; description: string; capabilities: string[] }) => {
      const res = await apiRequest("POST", "/api/agents", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Agent Created", description: "New test agent has been configured." });
      setDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create agent.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/agents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Agent Deleted", description: "Test agent has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete agent.", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setNewAgentName("");
    setNewAgentType("browser");
    setNewAgentDescription("");
    setSelectedCapabilities(["screenshot"]);
  };

  const toggleCapability = (cap: string) => {
    setSelectedCapabilities((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    );
  };

  const handleCopyId = async (id: string) => {
    await navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const onlineAgents = agents.filter((a) => a.status === "online");
  const offlineAgents = agents.filter((a) => a.status !== "online");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            Agent Setup
          </h1>
          <p className="text-muted-foreground">
            Configure and manage your test execution agents
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-agent">
              <Plus className="h-4 w-4 mr-2" />
              New Agent
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Test Agent</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="agent-name">Agent Name</Label>
                <Input
                  id="agent-name"
                  placeholder="e.g., Chrome Browser Agent"
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  data-testid="input-agent-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="agent-type">Agent Type</Label>
                <Select value={newAgentType} onValueChange={setNewAgentType}>
                  <SelectTrigger id="agent-type" data-testid="select-agent-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {agentTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <type.icon className="h-4 w-4" />
                          {type.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="agent-description">Description (optional)</Label>
                <Textarea
                  id="agent-description"
                  placeholder="Describe this agent's purpose..."
                  value={newAgentDescription}
                  onChange={(e) => setNewAgentDescription(e.target.value)}
                  data-testid="textarea-agent-description"
                />
              </div>

              <div className="space-y-2">
                <Label>Capabilities</Label>
                <div className="grid grid-cols-2 gap-2">
                  {capabilities.map((cap) => (
                    <label
                      key={cap}
                      className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover-elevate cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedCapabilities.includes(cap)}
                        onCheckedChange={() => toggleCapability(cap)}
                        data-testid={`checkbox-capability-${cap}`}
                      />
                      <span className="text-sm capitalize">{cap.replace("-", " ")}</span>
                    </label>
                  ))}
                </div>
              </div>

              <Button
                onClick={() =>
                  createMutation.mutate({
                    name: newAgentName,
                    type: newAgentType,
                    description: newAgentDescription,
                    capabilities: selectedCapabilities,
                  })
                }
                disabled={!newAgentName.trim() || createMutation.isPending}
                className="w-full"
                data-testid="button-confirm-create-agent"
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Agent"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {agents.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="No agents configured"
          description="Create your first test agent to enable automated test execution."
          action={{ label: "Create Agent", onClick: () => setDialogOpen(true) }}
        />
      ) : (
        <div className="space-y-6">
          {onlineAgents.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse-status" />
                Online Agents ({onlineAgents.length})
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {onlineAgents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onDelete={() => deleteMutation.mutate(agent.id)}
                    onCopy={() => handleCopyId(agent.id)}
                    copied={copiedId === agent.id}
                  />
                ))}
              </div>
            </div>
          )}

          {offlineAgents.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-slate-400" />
                Offline Agents ({offlineAgents.length})
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {offlineAgents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onDelete={() => deleteMutation.mutate(agent.id)}
                    onCopy={() => handleCopyId(agent.id)}
                    copied={copiedId === agent.id}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Card className="bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
              <Terminal className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <h3 className="font-semibold">Local Agent Setup</h3>
              <p className="text-sm text-muted-foreground">
                Install the TestComet agent on your infrastructure for secure, local test execution. Your code never leaves your environment.
              </p>
            </div>
            <Button variant="outline" data-testid="button-view-setup-guide">
              View Setup Guide
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AgentCard({
  agent,
  onDelete,
  onCopy,
  copied,
}: {
  agent: TestAgent;
  onDelete: () => void;
  onCopy: () => void;
  copied: boolean;
}) {
  const typeConfig = agentTypes.find((t) => t.value === agent.type) || agentTypes[0];
  const Icon = typeConfig.icon;

  return (
    <Card className="hover-elevate">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold">{agent.name}</p>
              <p className="text-xs text-muted-foreground">{typeConfig.label}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <StatusBadge status={agent.status as any} showIcon={false} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" data-testid={`button-agent-menu-${agent.id}`}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onCopy}>
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Agent ID
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Agent
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {agent.description && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{agent.description}</p>
        )}

        {agent.capabilities && (agent.capabilities as string[]).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(agent.capabilities as string[]).slice(0, 3).map((cap) => (
              <Badge key={cap} variant="secondary" className="text-xs capitalize">
                {cap.replace("-", " ")}
              </Badge>
            ))}
            {(agent.capabilities as string[]).length > 3 && (
              <Badge variant="secondary" className="text-xs">
                +{(agent.capabilities as string[]).length - 3}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
