import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Bot, Plus, Loader2, RefreshCw, Cpu, HardDrive, Activity,
  Shield, ShieldCheck, ShieldAlert, Server, Cloud, Globe, Terminal,
  Smartphone, Database, Zap, Clock, AlertTriangle, CheckCircle2,
  XCircle, Timer, DollarSign, FileText, BarChart3, Settings,
  Play, Pause, ChevronRight, Lock, Unlock, History, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type AgentGroup = "QA" | "UAT" | "PROD";
type AgentTrustLevel = "HIGH" | "MEDIUM" | "LOW";
type AgentType = "LOCAL" | "BROWSER" | "API" | "JDE" | "SAP" | "MOBILE" | "CLOUD";

interface AgentCapabilities {
  web: boolean;
  api: boolean;
  jde: boolean;
  sap: boolean;
  mobile: boolean;
  database: boolean;
}

interface AgentHealth {
  status: "HEALTHY" | "DEGRADED" | "UNHEALTHY" | "OFFLINE";
  cpu?: number;
  memory?: number;
  disk?: number;
  lastHeartbeat: string | null;
  timeSinceHeartbeat: number | null;
  secureTunnel: boolean;
  errors: string[];
}

interface EnterpriseAgent {
  agentId: string;
  name: string;
  description?: string;
  type: AgentType;
  group: AgentGroup;
  trustLevel: AgentTrustLevel;
  capabilities: AgentCapabilities;
  environment: string;
  os?: string;
  status: "ONLINE" | "OFFLINE" | "BUSY" | "MAINTENANCE";
  health: AgentHealth;
  maxConcurrentExecutions: number;
  currentExecutions: number;
  tags: string[];
  registeredAt: string;
  lastSeenAt: string | null;
}

interface CostBudget {
  scope: string;
  scopeId: string;
  dailyBudgetUnits: number;
  usedUnits: number;
  lastResetAt: string;
  alertThreshold: number;
}

interface QueuedExecution {
  executionId: string;
  testCaseId: string;
  testCaseTitle: string;
  requiredCapabilities: string[];
  group: AgentGroup;
  priority: number;
  status: string;
  assignedAgentId: string | null;
  attempt: number;
  createdAt: string;
}

interface AuditLogEntry {
  auditId: string;
  timestamp: string;
  actorType: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  resourceName?: string;
  environment?: AgentGroup;
  severity: string;
  details: Record<string, any>;
  success: boolean;
}

interface DashboardData {
  agents: {
    total: number;
    online: number;
    offline: number;
    busy: number;
    byGroup: Record<AgentGroup, { total: number; online: number }>;
    byType: Record<AgentType, number>;
  };
  queue: {
    total: number;
    queued: number;
    assigned: number;
    byGroup: Record<string, number>;
  };
  budgets: CostBudget[];
  recentAudit: AuditLogEntry[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const GROUP_COLORS: Record<AgentGroup, string> = {
  QA: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  UAT: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  PROD: "bg-red-500/10 text-red-600 border-red-500/20",
};

const TRUST_COLORS: Record<AgentTrustLevel, { bg: string; icon: any }> = {
  HIGH: { bg: "bg-emerald-500/10 text-emerald-600", icon: ShieldCheck },
  MEDIUM: { bg: "bg-amber-500/10 text-amber-600", icon: Shield },
  LOW: { bg: "bg-slate-500/10 text-slate-600", icon: ShieldAlert },
};

const TYPE_ICONS: Record<AgentType, any> = {
  LOCAL: Server,
  BROWSER: Globe,
  API: Terminal,
  JDE: Database,
  SAP: Database,
  MOBILE: Smartphone,
  CLOUD: Cloud,
};

const STATUS_CONFIG = {
  ONLINE: { color: "bg-emerald-500", label: "Online", icon: CheckCircle2 },
  OFFLINE: { color: "bg-slate-400", label: "Offline", icon: XCircle },
  BUSY: { color: "bg-amber-500", label: "Busy", icon: Loader2 },
  MAINTENANCE: { color: "bg-blue-500", label: "Maintenance", icon: Settings },
};

const HEALTH_STATUS_CONFIG = {
  HEALTHY: { color: "text-emerald-500", bg: "bg-emerald-500/10" },
  DEGRADED: { color: "text-amber-500", bg: "bg-amber-500/10" },
  UNHEALTHY: { color: "text-red-500", bg: "bg-red-500/10" },
  OFFLINE: { color: "text-slate-400", bg: "bg-slate-500/10" },
};

function formatTimeSince(ms: number | null): string {
  if (ms === null) return "Never";
  if (ms < 1000) return "Just now";
  if (ms < 60000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
  return `${Math.floor(ms / 3600000)}h ago`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function AgentCard({ agent, onRefresh }: { agent: EnterpriseAgent; onRefresh: () => void }) {
  const StatusIcon = STATUS_CONFIG[agent.status]?.icon || XCircle;
  const TypeIcon = TYPE_ICONS[agent.type] || Server;
  const TrustIcon = TRUST_COLORS[agent.trustLevel]?.icon || Shield;

  return (
    <Card className={cn(
      "relative overflow-hidden transition-all hover:shadow-md",
      agent.status === "ONLINE" ? "border-emerald-500/30" : "",
      agent.status === "BUSY" ? "border-amber-500/30" : ""
    )}>
      {/* Status indicator bar */}
      <div className={cn("absolute top-0 left-0 right-0 h-1", STATUS_CONFIG[agent.status]?.color)} />
      
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "h-10 w-10 rounded-lg flex items-center justify-center",
              HEALTH_STATUS_CONFIG[agent.health.status]?.bg
            )}>
              <TypeIcon className={cn("h-5 w-5", HEALTH_STATUS_CONFIG[agent.health.status]?.color)} />
            </div>
            <div>
              <CardTitle className="text-base">{agent.name}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className={cn("text-xs", GROUP_COLORS[agent.group])}>
                  {agent.group}
                </Badge>
                <Badge variant="outline" className={cn("text-xs", TRUST_COLORS[agent.trustLevel]?.bg)}>
                  <TrustIcon className="h-3 w-3 mr-1" />
                  {agent.trustLevel}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusIcon className={cn(
              "h-5 w-5",
              agent.status === "ONLINE" ? "text-emerald-500" : 
              agent.status === "BUSY" ? "text-amber-500 animate-pulse" : "text-slate-400"
            )} />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Capabilities */}
        <div className="flex flex-wrap gap-1">
          {agent.capabilities.web && <Badge variant="secondary" className="text-xs">Web</Badge>}
          {agent.capabilities.api && <Badge variant="secondary" className="text-xs">API</Badge>}
          {agent.capabilities.jde && <Badge variant="secondary" className="text-xs">JDE</Badge>}
          {agent.capabilities.sap && <Badge variant="secondary" className="text-xs">SAP</Badge>}
          {agent.capabilities.mobile && <Badge variant="secondary" className="text-xs">Mobile</Badge>}
          {agent.capabilities.database && <Badge variant="secondary" className="text-xs">DB</Badge>}
        </div>

        {/* Health Metrics */}
        {agent.status !== "OFFLINE" && (
          <div className="grid grid-cols-3 gap-2 text-xs">
            {agent.health.cpu !== undefined && (
              <div className="flex items-center gap-1">
                <Cpu className="h-3 w-3 text-muted-foreground" />
                <span className={agent.health.cpu > 80 ? "text-red-500" : ""}>{agent.health.cpu}%</span>
              </div>
            )}
            {agent.health.memory !== undefined && (
              <div className="flex items-center gap-1">
                <Activity className="h-3 w-3 text-muted-foreground" />
                <span className={agent.health.memory > 80 ? "text-amber-500" : ""}>{agent.health.memory}%</span>
              </div>
            )}
            {agent.health.disk !== undefined && (
              <div className="flex items-center gap-1">
                <HardDrive className="h-3 w-3 text-muted-foreground" />
                <span>{agent.health.disk}%</span>
              </div>
            )}
          </div>
        )}

        {/* Execution Info */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{formatTimeSince(agent.health.timeSinceHeartbeat)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Zap className="h-3 w-3" />
            <span>{agent.currentExecutions}/{agent.maxConcurrentExecutions}</span>
          </div>
          {agent.health.secureTunnel && (
            <div className="flex items-center gap-1 text-emerald-500">
              <Lock className="h-3 w-3" />
              <span>Secure</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function BudgetCard({ budget }: { budget: CostBudget }) {
  const usagePercent = Math.round((budget.usedUnits / budget.dailyBudgetUnits) * 100);
  const isWarning = usagePercent >= budget.alertThreshold;
  const isOverBudget = usagePercent >= 100;

  return (
    <Card className={cn(
      "relative overflow-hidden",
      isOverBudget ? "border-red-500/50" : isWarning ? "border-amber-500/50" : ""
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            {budget.scopeId} Budget
          </CardTitle>
          <Badge variant={isOverBudget ? "destructive" : isWarning ? "outline" : "secondary"}>
            {usagePercent}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Progress 
          value={Math.min(usagePercent, 100)} 
          className={cn(
            "h-2",
            isOverBudget ? "[&>div]:bg-red-500" : isWarning ? "[&>div]:bg-amber-500" : ""
          )}
        />
        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
          <span>{budget.usedUnits.toFixed(0)} used</span>
          <span>{(budget.dailyBudgetUnits - budget.usedUnits).toFixed(0)} remaining</span>
        </div>
      </CardContent>
    </Card>
  );
}

function QueueItem({ execution }: { execution: QueuedExecution }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
      <div className="flex items-center gap-3">
        <div className={cn(
          "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold",
          execution.priority >= 8 ? "bg-red-500/20 text-red-500" :
          execution.priority >= 5 ? "bg-amber-500/20 text-amber-500" :
          "bg-slate-500/20 text-slate-500"
        )}>
          P{execution.priority}
        </div>
        <div>
          <p className="text-sm font-medium">{execution.testCaseTitle}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className={cn("text-xs", GROUP_COLORS[execution.group])}>
              {execution.group}
            </Badge>
            <span>Attempt {execution.attempt}</span>
          </div>
        </div>
      </div>
      <div className="text-right text-xs text-muted-foreground">
        {execution.status === "QUEUED" ? (
          <Badge variant="secondary">Waiting</Badge>
        ) : (
          <Badge variant="outline">Assigned</Badge>
        )}
      </div>
    </div>
  );
}

function AuditLogItem({ log }: { log: AuditLogEntry }) {
  const isSuccess = log.success;
  const time = new Date(log.timestamp).toLocaleTimeString();

  return (
    <div className="flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
      <div className={cn(
        "h-6 w-6 rounded-full flex items-center justify-center mt-0.5",
        isSuccess ? "bg-emerald-500/20" : "bg-red-500/20"
      )}>
        {isSuccess ? (
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
        ) : (
          <XCircle className="h-3 w-3 text-red-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{log.action}</span>
          {log.environment && (
            <Badge variant="outline" className={cn("text-xs", GROUP_COLORS[log.environment])}>
              {log.environment}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {log.resourceType}: {log.resourceName || log.resourceId}
        </p>
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">{time}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function EnterpriseAgents() {
  const { toast } = useToast();
  const [selectedGroup, setSelectedGroup] = useState<AgentGroup | "ALL">("ALL");
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);
  
  // Form state for new agent
  const [newAgent, setNewAgent] = useState({
    name: "",
    type: "BROWSER" as AgentType,
    group: "QA" as AgentGroup,
    trustLevel: "LOW" as AgentTrustLevel,
    capabilities: { web: true, api: true, jde: false, sap: false, mobile: false, database: false },
    maxConcurrentExecutions: 5,
  });

  // Fetch dashboard data
  const { data: dashboard, isLoading: dashboardLoading, refetch: refetchDashboard } = useQuery<DashboardData>({
    queryKey: ["/api/enterprise/agents/dashboard"],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Fetch all agents
  const { data: agentsData, isLoading: agentsLoading, refetch: refetchAgents } = useQuery<{ agents: EnterpriseAgent[] }>({
    queryKey: ["/api/enterprise/agents", selectedGroup],
    queryFn: async () => {
      const url = selectedGroup === "ALL" 
        ? "/api/enterprise/agents" 
        : `/api/enterprise/agents?group=${selectedGroup}`;
      const res = await apiRequest("GET", url);
      return res.json();
    },
  });

  // Register agent mutation
  const registerMutation = useMutation({
    mutationFn: async (data: typeof newAgent) => {
      const res = await apiRequest("POST", "/api/enterprise/agents/register", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/agents/dashboard"] });
      setRegisterDialogOpen(false);
      toast({
        title: "Agent Registered",
        description: `${newAgent.name} has been registered. API Key: ${data.apiKey.substring(0, 20)}...`,
      });
      setNewAgent({
        name: "",
        type: "BROWSER",
        group: "QA",
        trustLevel: "LOW",
        capabilities: { web: true, api: true, jde: false, sap: false, mobile: false, database: false },
        maxConcurrentExecutions: 5,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Registration Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const agents = agentsData?.agents || [];
  const stats = dashboard?.agents;
  const budgets = dashboard?.budgets || [];
  const queueStats = dashboard?.queue;
  const recentAudit = dashboard?.recentAudit || [];

  const isLoading = dashboardLoading || agentsLoading;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
            <Bot className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Enterprise Agent Setup</h1>
            <p className="text-sm text-muted-foreground">
              Configure and manage your test execution agents with enterprise-grade controls
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetchDashboard(); refetchAgents(); }}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
            Refresh
          </Button>
          <Dialog open={registerDialogOpen} onOpenChange={setRegisterDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Register Agent
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Register New Agent</DialogTitle>
                <DialogDescription>
                  Add a new execution agent to your infrastructure
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Agent Name</Label>
                  <Input 
                    value={newAgent.name}
                    onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })}
                    placeholder="e.g., Chrome Browser Agent QA"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={newAgent.type} onValueChange={(v) => setNewAgent({ ...newAgent, type: v as AgentType })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LOCAL">Local Agent</SelectItem>
                        <SelectItem value="BROWSER">Browser Agent</SelectItem>
                        <SelectItem value="API">API Agent</SelectItem>
                        <SelectItem value="JDE">JDE Agent</SelectItem>
                        <SelectItem value="SAP">SAP Agent</SelectItem>
                        <SelectItem value="MOBILE">Mobile Agent</SelectItem>
                        <SelectItem value="CLOUD">Cloud Agent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Group</Label>
                    <Select value={newAgent.group} onValueChange={(v) => setNewAgent({ ...newAgent, group: v as AgentGroup })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="QA">QA</SelectItem>
                        <SelectItem value="UAT">UAT</SelectItem>
                        <SelectItem value="PROD">PROD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Trust Level</Label>
                  <Select value={newAgent.trustLevel} onValueChange={(v) => setNewAgent({ ...newAgent, trustLevel: v as AgentTrustLevel })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low (QA only)</SelectItem>
                      <SelectItem value="MEDIUM">Medium (QA + UAT)</SelectItem>
                      <SelectItem value="HIGH">High (All environments)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Capabilities</Label>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(newAgent.capabilities).map(([key, value]) => (
                      <Badge 
                        key={key}
                        variant={value ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => setNewAgent({
                          ...newAgent,
                          capabilities: { ...newAgent.capabilities, [key]: !value }
                        })}
                      >
                        {key.toUpperCase()}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Max Concurrent Executions</Label>
                  <Input 
                    type="number"
                    min={1}
                    max={20}
                    value={newAgent.maxConcurrentExecutions}
                    onChange={(e) => setNewAgent({ ...newAgent, maxConcurrentExecutions: parseInt(e.target.value) || 5 })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRegisterDialogOpen(false)}>Cancel</Button>
                <Button 
                  onClick={() => registerMutation.mutate(newAgent)}
                  disabled={!newAgent.name || registerMutation.isPending}
                >
                  {registerMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Register Agent
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Agents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-emerald-600">Online</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{stats?.online || 0}</div>
          </CardContent>
        </Card>
        <Card className="border-amber-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-600">Busy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{stats?.busy || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Offline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.offline || 0}</div>
          </CardContent>
        </Card>
        <Card className="border-violet-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-violet-600">Queued Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-violet-600">{queueStats?.queued || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="agents" className="space-y-4">
        <TabsList>
          <TabsTrigger value="agents" className="gap-2">
            <Bot className="h-4 w-4" />
            Agents
          </TabsTrigger>
          <TabsTrigger value="budgets" className="gap-2">
            <DollarSign className="h-4 w-4" />
            Cost Budgets
          </TabsTrigger>
          <TabsTrigger value="queue" className="gap-2">
            <Timer className="h-4 w-4" />
            Execution Queue
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2">
            <History className="h-4 w-4" />
            Audit Logs
          </TabsTrigger>
        </TabsList>

        {/* Agents Tab */}
        <TabsContent value="agents" className="space-y-4">
          {/* Group Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Filter by Group:</span>
            <div className="flex gap-1">
              {["ALL", "QA", "UAT", "PROD"].map((group) => (
                <Button
                  key={group}
                  variant={selectedGroup === group ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedGroup(group as any)}
                  className={cn(
                    selectedGroup === group && group !== "ALL" && GROUP_COLORS[group as AgentGroup]
                  )}
                >
                  {group}
                  {group !== "ALL" && stats?.byGroup && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {stats.byGroup[group as AgentGroup]?.total || 0}
                    </Badge>
                  )}
                </Button>
              ))}
            </div>
          </div>

          {/* Agent Grid */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : agents.length === 0 ? (
            <Card className="p-12 text-center">
              <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Agents Found</h3>
              <p className="text-muted-foreground mb-4">
                {selectedGroup === "ALL" 
                  ? "Register your first agent to start executing tests"
                  : `No agents in ${selectedGroup} group`}
              </p>
              <Button onClick={() => setRegisterDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Register Agent
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {agents.map((agent) => (
                <AgentCard key={agent.agentId} agent={agent} onRefresh={refetchAgents} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Budgets Tab */}
        <TabsContent value="budgets">
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
            {budgets.map((budget) => (
              <BudgetCard key={`${budget.scope}:${budget.scopeId}`} budget={budget} />
            ))}
          </div>
          <Card className="mt-4 p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4" />
              <span>Budgets reset daily at 00:00 UTC. When budget is exceeded, only high-priority tests will execute.</span>
            </div>
          </Card>
        </TabsContent>

        {/* Queue Tab */}
        <TabsContent value="queue">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Execution Queue</CardTitle>
                <Button variant="outline" size="sm" onClick={() => apiRequest("POST", "/api/enterprise/queue/process")}>
                  <Play className="h-4 w-4 mr-2" />
                  Process Queue
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {queueStats?.queued === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Timer className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No executions in queue</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground mb-4">
                    {queueStats?.queued || 0} queued, {queueStats?.assigned || 0} assigned
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit Tab */}
        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Recent Audit Logs</CardTitle>
                <Badge variant="secondary">{recentAudit.length} entries</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-1">
                  {recentAudit.map((log) => (
                    <AuditLogItem key={log.auditId} log={log} />
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Security Notice */}
      <Card className="bg-gradient-to-r from-emerald-500/5 to-blue-500/5 border-emerald-500/20">
        <CardContent className="flex items-center gap-4 py-4">
          <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
          </div>
          <div className="flex-1">
            <h4 className="font-medium">🔐 Secure Local Execution</h4>
            <p className="text-sm text-muted-foreground">
              ✔ No source code upload &nbsp;&nbsp; ✔ No screenshots leave network &nbsp;&nbsp; ✔ Only execution metadata shared
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
