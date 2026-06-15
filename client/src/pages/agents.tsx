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
  Play,
  Square,
  Zap,
  Clock,
  Target,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { TestSuite } from "@shared/schema";
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
  const [isAutonomous, setIsAutonomous] = useState(false);
  const [targetUrl, setTargetUrl] = useState("");
  const [selectedSuiteId, setSelectedSuiteId] = useState("");
  const [scheduleInterval, setScheduleInterval] = useState("5");
  const [selfHealingEnabled, setSelfHealingEnabled] = useState(true);

  const { data: agents = [], isLoading } = useQuery<TestAgent[]>({
    queryKey: ["/api/agents"],
  });

  const { data: suites = [] } = useQuery<TestSuite[]>({
    queryKey: ["/api/suites"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
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

  const startAgentMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/agents/${id}/start`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Agent Started", description: "Autonomous agent is now running." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to start agent.", variant: "destructive" });
    },
  });

  const stopAgentMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/agents/${id}/stop`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Agent Stopped", description: "Autonomous agent has stopped." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to stop agent.", variant: "destructive" });
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
    setIsAutonomous(false);
    setTargetUrl("");
    setSelectedSuiteId("");
    setScheduleInterval("5");
    setSelfHealingEnabled(true);
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

              <div className="border-t pt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      Scheduled Monitoring (Optional)
                    </Label>
                    <p className="text-xs text-muted-foreground">Auto-run tests on a schedule for production monitoring</p>
                  </div>
                  <Switch
                    checked={isAutonomous}
                    onCheckedChange={setIsAutonomous}
                    data-testid="switch-autonomous-mode"
                  />
                </div>

                {isAutonomous && (
                  <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                    <div className="space-y-2">
                      <Label htmlFor="target-url" className="flex items-center gap-2">
                        <Target className="h-3.5 w-3.5" />
                        Target URL
                      </Label>
                      <Input
                        id="target-url"
                        placeholder="https://example.com"
                        value={targetUrl}
                        onChange={(e) => setTargetUrl(e.target.value)}
                        data-testid="input-target-url"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Bot className="h-3.5 w-3.5" />
                        Test Suite
                      </Label>
                      <Select value={selectedSuiteId} onValueChange={setSelectedSuiteId}>
                        <SelectTrigger data-testid="select-suite">
                          <SelectValue placeholder="Select a test suite" />
                        </SelectTrigger>
                        <SelectContent>
                          {suites.map((suite) => (
                            <SelectItem key={suite.id} value={suite.id}>
                              {suite.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5" />
                        Run Interval (minutes)
                      </Label>
                      <Select value={scheduleInterval} onValueChange={setScheduleInterval}>
                        <SelectTrigger data-testid="select-interval">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Every 1 minute</SelectItem>
                          <SelectItem value="5">Every 5 minutes</SelectItem>
                          <SelectItem value="15">Every 15 minutes</SelectItem>
                          <SelectItem value="30">Every 30 minutes</SelectItem>
                          <SelectItem value="60">Every hour</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm">Self-Healing</Label>
                        <p className="text-xs text-muted-foreground">AI repairs failing tests</p>
                      </div>
                      <Switch
                        checked={selfHealingEnabled}
                        onCheckedChange={setSelfHealingEnabled}
                        data-testid="switch-self-healing"
                      />
                    </div>
                  </div>
                )}
              </div>

              <Button
                onClick={() =>
                  createMutation.mutate({
                    name: newAgentName,
                    type: newAgentType,
                    description: newAgentDescription,
                    capabilities: selectedCapabilities,
                    isAutonomous,
                    targetUrl: targetUrl || undefined,
                    suiteId: selectedSuiteId || undefined,
                    scheduleInterval: isAutonomous ? parseInt(scheduleInterval) : undefined,
                    selfHealingEnabled,
                  })
                }
                disabled={!newAgentName.trim() || (isAutonomous && (!targetUrl || !selectedSuiteId)) || createMutation.isPending}
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
                    onStart={() => startAgentMutation.mutate(agent.id)}
                    onStop={() => stopAgentMutation.mutate(agent.id)}
                    copied={copiedId === agent.id}
                    isStarting={startAgentMutation.isPending}
                    isStopping={stopAgentMutation.isPending}
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
                    onStart={() => startAgentMutation.mutate(agent.id)}
                    onStop={() => stopAgentMutation.mutate(agent.id)}
                    copied={copiedId === agent.id}
                    isStarting={startAgentMutation.isPending}
                    isStopping={stopAgentMutation.isPending}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Card colorSeed="agents-local-setup" className="bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
              <Terminal className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <h3 className="font-semibold">Local Agent Setup</h3>
              <p className="text-sm text-muted-foreground">
                Install the AITAS agent on your infrastructure for secure, local test execution. Your code never leaves your environment.
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
  onStart,
  onStop,
  copied,
  isStarting,
  isStopping,
}: {
  agent: TestAgent;
  onDelete: () => void;
  onCopy: () => void;
  onStart: () => void;
  onStop: () => void;
  copied: boolean;
  isStarting?: boolean;
  isStopping?: boolean;
}) {
  const typeConfig = agentTypes.find((t) => t.value === agent.type) || agentTypes[0];
  const Icon = typeConfig.icon;
  const isRunning = agent.status === "running" || agent.status === "online";

  return (
    <Card colorSeed={`agent-card-${agent.id}`} className="hover-elevate">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold">{agent.name}</p>
                {agent.isAutonomous && (
                  <Badge variant="outline" className="text-xs">
                    <Zap className="h-3 w-3 mr-1" />
                    Auto
                  </Badge>
                )}
              </div>
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

        {agent.isAutonomous && agent.targetUrl && (
          <div className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
            <Target className="h-3 w-3" />
            <span className="truncate">{agent.targetUrl}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          {agent.capabilities && (agent.capabilities as string[]).length > 0 && (
            <div className="flex flex-wrap gap-1 flex-1">
              {(agent.capabilities as string[]).slice(0, 2).map((cap) => (
                <Badge key={cap} variant="secondary" className="text-xs capitalize">
                  {cap.replace("-", " ")}
                </Badge>
              ))}
              {(agent.capabilities as string[]).length > 2 && (
                <Badge variant="secondary" className="text-xs">
                  +{(agent.capabilities as string[]).length - 2}
                </Badge>
              )}
            </div>
          )}

          {agent.isAutonomous && (
            <div className="flex gap-1">
              {isRunning ? (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={onStop}
                  disabled={isStopping}
                  data-testid={`button-stop-agent-${agent.id}`}
                >
                  {isStopping ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <Square className="h-3.5 w-3.5 mr-1" />
                      Stop
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={onStart}
                  disabled={isStarting}
                  data-testid={`button-start-agent-${agent.id}`}
                >
                  {isStarting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 mr-1" />
                      Start
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
