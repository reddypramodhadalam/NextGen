import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Shield, Users, Key, Activity, AlertTriangle, CheckCircle2,
  XCircle, Loader2, Plus, Trash2, Edit2, RefreshCw, Server,
  Database, Cpu, HardDrive, MemoryStick, Clock, Zap,
  FileText, TrendingUp, AlertCircle, Lock, Unlock,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Role {
  id: string; name: string; displayName: string;
  description?: string; permissions: string[]; isSystem?: boolean;
  createdAt: string;
}

interface AuditEntry {
  id: string; timestamp: string; action: string; severity: string;
  userId?: string; userEmail?: string; resourceType?: string;
  resourceName?: string; success: boolean; errorMessage?: string;
  details?: Record<string, any>;
}

interface AuditStats {
  total: number;
  byAction: Record<string, number>;
  bySeverity: Record<string, number>;
  recentErrors: AuditEntry[];
  topUsers: Array<{ userId: string; email: string; count: number }>;
}

interface HealthReport {
  status: string; timestamp: string;
  services: Array<{ name: string; status: string; latencyMs?: number; message?: string }>;
  resources: {
    cpu: { usage: number; cores: number; model: string; loadAvg: number[] };
    memory: { total: number; used: number; free: number; usagePercent: number };
    disk: { total: number; used: number; free: number; usagePercent: number };
    uptime: number; nodeVersion: string; platform: string; arch: string;
  };
  database: { status: string; tableCount: number; latencyMs: number };
  executionStats: { total: number; running: number; passed: number; failed: number; passRate: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALL_PERMISSIONS = [
  "view", "create", "edit", "delete", "execute",
  "admin", "manage_users", "manage_roles", "view_audit",
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const SEVERITY_CONFIG: Record<string, { color: string; bg: string }> = {
  info:     { color: "text-blue-600 dark:text-blue-400",    bg: "bg-blue-500/10" },
  warning:  { color: "text-amber-600 dark:text-amber-400",  bg: "bg-amber-500/10" },
  error:    { color: "text-red-600 dark:text-red-400",      bg: "bg-red-500/10" },
  critical: { color: "text-red-700 dark:text-red-300",      bg: "bg-red-600/15" },
};

const STATUS_CONFIG: Record<string, { icon: any; color: string; bg: string }> = {
  healthy:  { icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  degraded: { icon: AlertTriangle, color: "text-amber-600 dark:text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20" },
  down:     { icon: XCircle,       color: "text-red-600 dark:text-red-400",        bg: "bg-red-500/10 border-red-500/20" },
  unknown:  { icon: AlertCircle,   color: "text-slate-500",                        bg: "bg-slate-500/10 border-slate-500/20" },
};

// ─── Roles Tab ────────────────────────────────────────────────────────────────

function RolesTab() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editRole, setEditRole] = useState<Role | null>(null);
  const [form, setForm] = useState({ name: "", displayName: "", description: "", permissions: [] as string[] });

  const { data: roles = [], refetch } = useQuery<Role[]>({ queryKey: ["/api/admin/roles"] });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/roles", form);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/roles"] });
      toast({ title: "Role Created", description: `${form.displayName} role created.` });
      setCreateOpen(false);
      setForm({ name: "", displayName: "", description: "", permissions: [] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/roles/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/roles"] });
      toast({ title: "Role Updated" });
      setEditRole(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/admin/roles/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/roles"] }); toast({ title: "Role Deleted" }); },
  });

  const togglePermission = (perm: string, current: string[], setter: (p: string[]) => void) => {
    setter(current.includes(perm) ? current.filter((p) => p !== perm) : [...current, perm]);
  };

  const RoleForm = ({ perms, setPerms }: { perms: string[]; setPerms: (p: string[]) => void }) => (
    <div className="space-y-2">
      <Label className="text-xs font-semibold">Permissions</Label>
      <div className="flex flex-wrap gap-2">
        {ALL_PERMISSIONS.map((perm) => (
          <button key={perm} onClick={() => togglePermission(perm, perms, setPerms)}
            className={cn("px-2.5 py-1 rounded-full text-xs font-medium border transition-all", perms.includes(perm) ? "bg-primary text-primary-foreground border-primary" : "bg-muted/30 border-border/50 hover:border-border")}>
            {perm}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{roles.length} roles configured</p>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" />New Role</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Create Role</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Name (slug)</Label><Input placeholder="qa_lead" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Display Name</Label><Input placeholder="QA Lead" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></div>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Description</Label><Input placeholder="Can manage and execute tests" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <RoleForm perms={form.permissions} setPerms={(p) => setForm({ ...form, permissions: p })} />
              <Button className="w-full" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.name || !form.displayName}>
                {createMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</> : "Create Role"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {roles.map((role) => (
          <div key={role.id} className="p-4 rounded-xl border bg-card">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Key className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">{role.displayName}</p>
                    {role.isSystem && <Badge variant="secondary" className="text-xs h-5">System</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{role.description || role.name}</p>
                </div>
              </div>
              {!role.isSystem && (
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditRole(role)}><Edit2 className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(role.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {(role.permissions || []).map((perm) => (
                <Badge key={perm} variant="outline" className="text-xs h-5">{perm}</Badge>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Edit Dialog */}
      {editRole && (
        <Dialog open={!!editRole} onOpenChange={() => setEditRole(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Edit Role: {editRole.displayName}</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5"><Label className="text-xs">Description</Label>
                <Input value={editRole.description || ""} onChange={(e) => setEditRole({ ...editRole, description: e.target.value })} />
              </div>
              <RoleForm perms={editRole.permissions || []} setPerms={(p) => setEditRole({ ...editRole, permissions: p })} />
              <Button className="w-full" onClick={() => updateMutation.mutate({ id: editRole.id, data: { description: editRole.description, permissions: editRole.permissions } })} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save Changes"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Audit Log Tab ────────────────────────────────────────────────────────────

function AuditLogTab() {
  const [filter, setFilter] = useState("all");
  const { data: entries = [], refetch, isFetching } = useQuery<AuditEntry[]>({
    queryKey: ["/api/admin/audit-log", filter],
    queryFn: async () => {
      const params = filter !== "all" ? `?severity=${filter}` : "";
      const res = await apiRequest("GET", `/api/admin/audit-log${params}`);
      return res.json();
    },
  });
  const { data: stats } = useQuery<AuditStats>({ queryKey: ["/api/admin/audit-log/stats"] });

  return (
    <div className="space-y-4">
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Events", value: stats.total, color: "text-blue-600" },
            { label: "Info", value: stats.bySeverity.info || 0, color: "text-blue-500" },
            { label: "Warnings", value: stats.bySeverity.warning || 0, color: "text-amber-500" },
            { label: "Errors", value: (stats.bySeverity.error || 0) + (stats.bySeverity.critical || 0), color: "text-red-500" },
          ].map((s) => (
            <div key={s.label} className="p-3 rounded-xl border bg-card text-center">
              <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {["all", "info", "warning", "error", "critical"].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={cn("px-3 py-1 rounded-full text-xs font-medium border transition-all capitalize", filter === s ? "bg-primary text-primary-foreground border-primary" : "bg-muted/30 border-border/50 hover:border-border")}>
            {s}
          </button>
        ))}
        <Button variant="ghost" size="sm" className="h-7 ml-auto gap-1.5" onClick={() => refetch()}>
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />Refresh
        </Button>
      </div>

      <div className="space-y-1.5 max-h-96 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No audit events yet</p>
          </div>
        ) : entries.map((entry) => {
          const sev = SEVERITY_CONFIG[entry.severity] || SEVERITY_CONFIG.info;
          return (
            <div key={entry.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors">
              <div className={cn("h-5 w-5 rounded-full flex items-center justify-center shrink-0 mt-0.5", sev.bg)}>
                <div className={cn("h-1.5 w-1.5 rounded-full", entry.severity === "error" || entry.severity === "critical" ? "bg-red-500" : entry.severity === "warning" ? "bg-amber-500" : "bg-blue-500")} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono font-medium">{entry.action}</span>
                  {entry.userEmail && <span className="text-xs text-muted-foreground">{entry.userEmail}</span>}
                  {entry.resourceName && <span className="text-xs text-muted-foreground">→ {entry.resourceName}</span>}
                  {!entry.success && <Badge variant="destructive" className="text-xs h-4">Failed</Badge>}
                </div>
                {entry.errorMessage && <p className="text-xs text-destructive mt-0.5">{entry.errorMessage}</p>}
              </div>
              <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Health Monitor Tab ───────────────────────────────────────────────────────

function HealthTab() {
  const { data: health, refetch, isFetching } = useQuery<HealthReport>({
    queryKey: ["/api/admin/health"],
    refetchInterval: 30000,
  });

  if (!health) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  const overallCfg = STATUS_CONFIG[health.status] || STATUS_CONFIG.unknown;
  const OverallIcon = overallCfg.icon;

  return (
    <div className="space-y-4">
      {/* Overall Status */}
      <div className={cn("p-4 rounded-xl border flex items-center gap-3", overallCfg.bg)}>
        <OverallIcon className={cn("h-6 w-6 shrink-0", overallCfg.color)} />
        <div>
          <p className={cn("font-bold text-lg capitalize", overallCfg.color)}>{health.status}</p>
          <p className="text-xs text-muted-foreground">Last checked: {new Date(health.timestamp).toLocaleTimeString()}</p>
        </div>
        <Button variant="ghost" size="sm" className="ml-auto gap-1.5" onClick={() => refetch()}>
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />Refresh
        </Button>
      </div>

      {/* Services */}
      <div className="grid gap-2 sm:grid-cols-2">
        {health.services.map((svc) => {
          const cfg = STATUS_CONFIG[svc.status] || STATUS_CONFIG.unknown;
          const SvcIcon = cfg.icon;
          return (
            <div key={svc.name} className={cn("p-3 rounded-xl border flex items-center gap-3", cfg.bg)}>
              <SvcIcon className={cn("h-4 w-4 shrink-0", cfg.color)} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{svc.name}</p>
                <p className="text-xs text-muted-foreground truncate">{svc.message}</p>
              </div>
              {svc.latencyMs !== undefined && (
                <span className="text-xs tabular-nums text-muted-foreground shrink-0">{svc.latencyMs}ms</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Resources */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* CPU */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">CPU</span>
              <span className="ml-auto text-sm font-bold tabular-nums">{health.resources.cpu.usage}%</span>
            </div>
            <Progress value={health.resources.cpu.usage} className="h-2" />
            <p className="text-xs text-muted-foreground">{health.resources.cpu.cores} cores · Load: {health.resources.cpu.loadAvg.map((l) => l.toFixed(2)).join(", ")}</p>
          </CardContent>
        </Card>

        {/* Memory */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <MemoryStick className="h-4 w-4 text-violet-500" />
              <span className="text-sm font-medium">Memory</span>
              <span className="ml-auto text-sm font-bold tabular-nums">{health.resources.memory.usagePercent}%</span>
            </div>
            <Progress value={health.resources.memory.usagePercent} className="h-2" />
            <p className="text-xs text-muted-foreground">{formatBytes(health.resources.memory.used)} / {formatBytes(health.resources.memory.total)}</p>
          </CardContent>
        </Card>

        {/* Disk */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium">Disk</span>
              <span className="ml-auto text-sm font-bold tabular-nums">{health.resources.disk.usagePercent}%</span>
            </div>
            <Progress value={health.resources.disk.usagePercent} className="h-2" />
            <p className="text-xs text-muted-foreground">{formatBytes(health.resources.disk.used)} / {formatBytes(health.resources.disk.total)}</p>
          </CardContent>
        </Card>

        {/* System Info */}
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <Server className="h-4 w-4 text-emerald-500" />
              <span className="text-sm font-medium">System</span>
            </div>
            {[
              ["Uptime", formatUptime(health.resources.uptime)],
              ["Node.js", health.resources.nodeVersion],
              ["Platform", `${health.resources.platform} ${health.resources.arch}`],
              ["DB Tables", String(health.database.tableCount)],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium tabular-nums">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Execution Stats */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Execution Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Total", value: health.executionStats.total, color: "text-foreground" },
              { label: "Running", value: health.executionStats.running, color: "text-blue-500" },
              { label: "Passed", value: health.executionStats.passed, color: "text-emerald-500" },
              { label: "Failed", value: health.executionStats.failed, color: "text-red-500" },
              { label: "Pass Rate", value: `${health.executionStats.passRate}%`, color: health.executionStats.passRate >= 80 ? "text-emerald-500" : "text-amber-500" },
            ].map((s) => (
              <div key={s.label} className="text-center p-2 rounded-lg bg-muted/30">
                <p className={cn("text-xl font-bold", s.color)}>{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Admin Page ──────────────────────────────────────────────────────────

export default function AdminPage() {
  const { user } = useAuth();

  if (!user?.isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center">
          <Lock className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
          <h2 className="text-xl font-bold">Access Restricted</h2>
          <p className="text-muted-foreground mt-2">Admin panel requires Super Admin privileges.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-lg">
          <Shield className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Panel</h1>
          <p className="text-sm text-muted-foreground">RBAC management, audit logs, and system health</p>
        </div>
        <Badge className="ml-auto bg-red-500/15 text-red-700 dark:text-red-400 border-0">Super Admin</Badge>
      </div>

      <Tabs defaultValue="health">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="health" className="gap-1.5"><Activity className="h-3.5 w-3.5" />Health</TabsTrigger>
          <TabsTrigger value="roles" className="gap-1.5"><Key className="h-3.5 w-3.5" />Roles</TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5"><FileText className="h-3.5 w-3.5" />Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="health" className="mt-4"><HealthTab /></TabsContent>
        <TabsContent value="roles" className="mt-4"><RolesTab /></TabsContent>
        <TabsContent value="audit" className="mt-4"><AuditLogTab /></TabsContent>
      </Tabs>
    </div>
  );
}
