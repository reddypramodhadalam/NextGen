import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/status-badge";
import {
  Cloud, Database, Monitor, Zap, Play, Loader2, Plus, Clock,
  CheckCircle2, XCircle, RefreshCw, Eye, Trash2, ToggleLeft,
  ToggleRight, Calendar, Globe, Settings2, AlertCircle,
  Smartphone, AppWindow, Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TestSuite, TestExecution } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScheduleConfig {
  id: string; name: string; suiteId: string; targetUrl: string;
  framework: string; environment: string; frequency: string;
  enabled: boolean; notifyOnFail: boolean; notifyOnPass: boolean;
  maxRetries: number; lastRun?: string; nextRun?: string;
  lastStatus?: string; consecutiveFailures: number;
  createdAt: string; updatedAt: string;
}

interface FrequencyOption { value: string; label: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelative(date?: string): string {
  if (!date) return "Never";
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}

function formatNext(date?: string): string {
  if (!date) return "Not scheduled";
  const d = new Date(date);
  const diff = d.getTime() - Date.now();
  if (diff < 0) return "Overdue";
  if (diff < 60000) return "< 1 min";
  if (diff < 3600000) return `in ${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `in ${Math.floor(diff / 3600000)}h`;
  return d.toLocaleDateString();
}

// ─── SAP Fiori Form ───────────────────────────────────────────────────────────

function SAPFioriForm({ suites }: { suites: TestSuite[] }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    suiteId: "", baseUrl: "", username: "", password: "",
    client: "100", language: "EN", odataBaseUrl: "/sap/opu/odata/sap/",
    environment: "production",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/executions/sap-fiori", form);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/executions"] });
      toast({ title: "SAP Fiori Execution Started", description: "Tests are running against your SAP Fiori system." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label>Fiori Launchpad URL</Label>
          <Input placeholder="https://mycompany.hana.ondemand.com/sap/bc/ui5_ui5/ui2/ushell/shells/abap/FioriLaunchpad.html"
            value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Username</Label>
          <Input placeholder="S-User or P-User" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Password</Label>
          <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>SAP Client</Label>
          <Input placeholder="100" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Language</Label>
          <Select value={form.language} onValueChange={(v) => setForm({ ...form, language: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="EN">English</SelectItem>
              <SelectItem value="DE">German</SelectItem>
              <SelectItem value="FR">French</SelectItem>
              <SelectItem value="ES">Spanish</SelectItem>
              <SelectItem value="ZH">Chinese</SelectItem>
              <SelectItem value="JA">Japanese</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>OData Base Path (optional)</Label>
          <Input placeholder="/sap/opu/odata/sap/" value={form.odataBaseUrl} onChange={(e) => setForm({ ...form, odataBaseUrl: e.target.value })} />
          <p className="text-xs text-muted-foreground">Used for OData validation steps. Leave blank to skip API validation.</p>
        </div>
        <div className="space-y-2">
          <Label>Test Suite</Label>
          <Select value={form.suiteId} onValueChange={(v) => setForm({ ...form, suiteId: v })}>
            <SelectTrigger><SelectValue placeholder="Select suite..." /></SelectTrigger>
            <SelectContent>
              {suites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Environment</Label>
          <Select value={form.environment} onValueChange={(v) => setForm({ ...form, environment: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="development">Development</SelectItem>
              <SelectItem value="staging">Staging / QA</SelectItem>
              <SelectItem value="production">Production</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.baseUrl || !form.suiteId} className="w-full">
        {mutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Starting SAP Fiori Tests...</> : <><Play className="h-4 w-4 mr-2" />Run SAP Fiori Tests</>}
      </Button>
    </div>
  );
}

// ─── SAP GUI Form ─────────────────────────────────────────────────────────────

function SAPGUIForm({ suites }: { suites: TestSuite[] }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    suiteId: "", systemId: "", client: "100", username: "", password: "",
    language: "EN", connectionString: "", environment: "production",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/executions/sap-gui", form);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/executions"] });
      toast({ title: "SAP GUI Execution Started", description: "VBScript automation is running against SAP GUI." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-700 dark:text-amber-400">
          SAP GUI Scripting requires SAP GUI for Windows to be installed on the test machine with scripting enabled.
          The executor generates VBScript that runs via COM automation.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>System ID</Label>
          <Input placeholder="S4H or PRD" value={form.systemId} onChange={(e) => setForm({ ...form, systemId: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Client</Label>
          <Input placeholder="100" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Username</Label>
          <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Password</Label>
          <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Connection String (optional)</Label>
          <Input placeholder="/H/sap-server.company.com/S/3200" value={form.connectionString} onChange={(e) => setForm({ ...form, connectionString: e.target.value })} />
          <p className="text-xs text-muted-foreground">Override the default connection. Leave blank to use System ID.</p>
        </div>
        <div className="space-y-2">
          <Label>Test Suite</Label>
          <Select value={form.suiteId} onValueChange={(v) => setForm({ ...form, suiteId: v })}>
            <SelectTrigger><SelectValue placeholder="Select suite..." /></SelectTrigger>
            <SelectContent>
              {suites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Environment</Label>
          <Select value={form.environment} onValueChange={(v) => setForm({ ...form, environment: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="development">Development</SelectItem>
              <SelectItem value="staging">Staging / QA</SelectItem>
              <SelectItem value="production">Production</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.systemId || !form.suiteId} className="w-full">
        {mutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating & Running VBScript...</> : <><Monitor className="h-4 w-4 mr-2" />Run SAP GUI Tests</>}
      </Button>
    </div>
  );
}

// ─── Scheduler Panel ──────────────────────────────────────────────────────────

function SchedulerPanel({ suites }: { suites: TestSuite[] }) {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", suiteId: "", targetUrl: "", framework: "playwright",
    environment: "staging", frequency: "daily", enabled: true,
    notifyOnFail: true, notifyOnPass: false, maxRetries: 2,
  });

  const { data: schedules = [], isLoading } = useQuery<ScheduleConfig[]>({
    queryKey: ["/api/schedules"],
    refetchInterval: 30000,
  });

  const { data: frequencies = [] } = useQuery<FrequencyOption[]>({
    queryKey: ["/api/schedules/frequencies"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/schedules", form);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
      toast({ title: "Schedule Created", description: `"${form.name}" will run ${form.frequency}.` });
      setCreateOpen(false);
      setForm({ name: "", suiteId: "", targetUrl: "", framework: "playwright", environment: "staging", frequency: "daily", enabled: true, notifyOnFail: true, notifyOnPass: false, maxRetries: 2 });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await apiRequest("PATCH", `/api/schedules/${id}`, { enabled });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/schedules"] }),
  });

  const runNowMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/schedules/${id}/run-now`, {});
      return res.json();
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
      toast({ title: "Manual Run Triggered", description: "Schedule is running now." });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/schedules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
      toast({ title: "Schedule Deleted" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Automated Test Schedules</p>
          <p className="text-xs text-muted-foreground">{schedules.filter((s) => s.enabled).length} active of {schedules.length} total</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-2" />New Schedule</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Test Schedule</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Schedule Name</Label>
                <Input placeholder="e.g., Nightly Regression" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid gap-4 grid-cols-2">
                <div className="space-y-2">
                  <Label>Test Suite</Label>
                  <Select value={form.suiteId} onValueChange={(v) => setForm({ ...form, suiteId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {suites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Frequency</Label>
                  <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {frequencies.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Target URL</Label>
                <Input placeholder="https://app.example.com" value={form.targetUrl} onChange={(e) => setForm({ ...form, targetUrl: e.target.value })} />
              </div>
              <div className="grid gap-4 grid-cols-2">
                <div className="space-y-2">
                  <Label>Framework</Label>
                  <Select value={form.framework} onValueChange={(v) => setForm({ ...form, framework: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="playwright">Playwright</SelectItem>
                      <SelectItem value="selenium">Selenium</SelectItem>
                      <SelectItem value="puppeteer">Puppeteer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Environment</Label>
                  <Select value={form.environment} onValueChange={(v) => setForm({ ...form, environment: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="development">Development</SelectItem>
                      <SelectItem value="staging">Staging</SelectItem>
                      <SelectItem value="production">Production</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div><Label>Notify on Failure</Label><p className="text-xs text-muted-foreground">Send alert when tests fail</p></div>
                <Switch checked={form.notifyOnFail} onCheckedChange={(v) => setForm({ ...form, notifyOnFail: v })} />
              </div>
              <div className="flex items-center justify-between">
                <div><Label>Notify on Pass</Label><p className="text-xs text-muted-foreground">Send alert when tests pass</p></div>
                <Switch checked={form.notifyOnPass} onCheckedChange={(v) => setForm({ ...form, notifyOnPass: v })} />
              </div>
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.name || !form.suiteId || !form.targetUrl} className="w-full">
                {createMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</> : <><Calendar className="h-4 w-4 mr-2" />Create Schedule</>}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : schedules.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No schedules yet</p>
          <p className="text-sm mt-1">Create a schedule to automate your test runs</p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((schedule) => (
            <div key={schedule.id} className={cn("p-4 rounded-xl border transition-all", schedule.enabled ? "bg-card border-border/60" : "bg-muted/30 border-border/30 opacity-70")}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{schedule.name}</span>
                    {schedule.lastStatus && (
                      <Badge variant={schedule.lastStatus === "passed" ? "default" : schedule.lastStatus === "failed" ? "destructive" : "secondary"} className="text-xs h-5">
                        {schedule.lastStatus}
                      </Badge>
                    )}
                    {schedule.consecutiveFailures > 0 && (
                      <Badge variant="destructive" className="text-xs h-5">
                        {schedule.consecutiveFailures} consecutive fails
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{frequencies.find((f) => f.value === schedule.frequency)?.label || schedule.frequency}</span>
                    <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{schedule.environment}</span>
                    <span>Last: {formatRelative(schedule.lastRun)}</span>
                    <span className={cn("font-medium", schedule.enabled ? "text-emerald-600 dark:text-emerald-400" : "")}>
                      Next: {schedule.enabled ? formatNext(schedule.nextRun) : "Paused"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" title="Run now"
                    onClick={() => runNowMutation.mutate(schedule.id)} disabled={runNowMutation.isPending}>
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" title={schedule.enabled ? "Pause" : "Enable"}
                    onClick={() => toggleMutation.mutate({ id: schedule.id, enabled: !schedule.enabled })}>
                    {schedule.enabled ? <ToggleRight className="h-4 w-4 text-emerald-500" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="Delete"
                    onClick={() => deleteMutation.mutate(schedule.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EnterpriseExecutions() {
  const { data: suites = [] } = useQuery<TestSuite[]>({ queryKey: ["/api/test-suites"] });
  const { data: executions = [] } = useQuery<TestExecution[]>({
    queryKey: ["/api/executions"],
    refetchInterval: 5000,
  });

  const recentEnterprise = executions
    .filter((e) => ["playwright", "selenium", "sap-gui", "api"].includes(e.framework || ""))
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 8);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
          <Settings2 className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Enterprise Executions</h1>
          <p className="text-sm text-muted-foreground">SAP Fiori, SAP GUI, Salesforce, JDE — and automated scheduling</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Executor Tabs */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Run Enterprise Tests</CardTitle>
              <CardDescription>Select your platform and configure the connection</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="sap-fiori">
                <TabsList className="grid grid-cols-3 mb-1">
                  <TabsTrigger value="sap-fiori" className="gap-1.5 text-xs">
                    <Database className="h-3.5 w-3.5" />SAP Fiori
                  </TabsTrigger>
                  <TabsTrigger value="sap-gui" className="gap-1.5 text-xs">
                    <Monitor className="h-3.5 w-3.5" />SAP GUI
                  </TabsTrigger>
                  <TabsTrigger value="salesforce" className="gap-1.5 text-xs">
                    <Cloud className="h-3.5 w-3.5" />Salesforce
                  </TabsTrigger>
                </TabsList>
                <TabsList className="grid grid-cols-3 mb-6">
                  <TabsTrigger value="jde" className="gap-1.5 text-xs">
                    <Zap className="h-3.5 w-3.5" />JDE
                  </TabsTrigger>
                  <TabsTrigger value="dotnet" className="gap-1.5 text-xs">
                    <AppWindow className="h-3.5 w-3.5" />.NET Desktop
                  </TabsTrigger>
                  <TabsTrigger value="mobile" className="gap-1.5 text-xs">
                    <Smartphone className="h-3.5 w-3.5" />Mobile
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="sap-fiori">
                  <SAPFioriForm suites={suites} />
                </TabsContent>

                <TabsContent value="sap-gui">
                  <SAPGUIForm suites={suites} />
                </TabsContent>

                <TabsContent value="salesforce">
                  <SalesforceForm suites={suites} />
                </TabsContent>

                <TabsContent value="jde">
                  <JDEForm suites={suites} />
                </TabsContent>

                <TabsContent value="dotnet">
                  <DotNetForm suites={suites} />
                </TabsContent>

                <TabsContent value="mobile">
                  <MobileForm suites={suites} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Right: Recent Executions */}
        <div>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />Recent Runs
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentEnterprise.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Play className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No enterprise executions yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentEnterprise.map((exec) => (
                    <div key={exec.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors">
                      <StatusBadge status={exec.status as any} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{exec.targetUrl}</p>
                        <p className="text-xs text-muted-foreground">{exec.framework} · {exec.environment}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-emerald-600">{exec.passedTests || 0}✓</p>
                        <p className="text-xs text-red-500">{exec.failedTests || 0}✗</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Scheduler */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Test Scheduler
          </CardTitle>
          <CardDescription>Automate test runs on a schedule — daily, hourly, or custom</CardDescription>
        </CardHeader>
        <CardContent>
          <SchedulerPanel suites={suites} />
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Salesforce Form (inline) ─────────────────────────────────────────────────

function SalesforceForm({ suites }: { suites: TestSuite[] }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    suiteId: "", instanceUrl: "", username: "", password: "",
    securityToken: "", isSandbox: false, environment: "production",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/executions/salesforce", form);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/executions"] });
      toast({ title: "Salesforce Execution Started", description: "Tests are running against your Salesforce org." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label>Instance URL</Label>
          <Input placeholder="https://myorg.salesforce.com" value={form.instanceUrl} onChange={(e) => setForm({ ...form, instanceUrl: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Username</Label>
          <Input placeholder="user@company.com" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Password</Label>
          <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Security Token (optional)</Label>
          <Input placeholder="Appended to password" value={form.securityToken} onChange={(e) => setForm({ ...form, securityToken: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Test Suite</Label>
          <Select value={form.suiteId} onValueChange={(v) => setForm({ ...form, suiteId: v })}>
            <SelectTrigger><SelectValue placeholder="Select suite..." /></SelectTrigger>
            <SelectContent>{suites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3 pt-6">
          <Switch checked={form.isSandbox} onCheckedChange={(v) => setForm({ ...form, isSandbox: v })} />
          <Label>Sandbox org (test.salesforce.com)</Label>
        </div>
      </div>
      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.instanceUrl || !form.suiteId} className="w-full">
        {mutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Starting...</> : <><Cloud className="h-4 w-4 mr-2" />Run Salesforce Tests</>}
      </Button>
    </div>
  );
}

// ─── JDE Form (inline) ────────────────────────────────────────────────────────

function JDEForm({ suites }: { suites: TestSuite[] }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    suiteId: "", baseUrl: "", aisUrl: "", username: "", password: "",
    environment: "JDV920", role: "*ALL", execEnvironment: "production",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/executions/jde", form);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/executions"] });
      toast({ title: "JDE Execution Started", description: "Tests are running against JDE EnterpriseOne." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label>JDE HTML Web Client URL</Label>
          <Input placeholder="https://jde.company.com/jde/owhtml" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>AIS Server URL (optional)</Label>
          <Input placeholder="https://jde.company.com/jderest" value={form.aisUrl} onChange={(e) => setForm({ ...form, aisUrl: e.target.value })} />
          <p className="text-xs text-muted-foreground">Enables direct data validation via JDE AIS REST API</p>
        </div>
        <div className="space-y-2">
          <Label>Username</Label>
          <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Password</Label>
          <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>JDE Environment</Label>
          <Input placeholder="JDV920" value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Role</Label>
          <Input placeholder="*ALL" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Test Suite</Label>
          <Select value={form.suiteId} onValueChange={(v) => setForm({ ...form, suiteId: v })}>
            <SelectTrigger><SelectValue placeholder="Select suite..." /></SelectTrigger>
            <SelectContent>{suites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Exec Environment</Label>
          <Select value={form.execEnvironment} onValueChange={(v) => setForm({ ...form, execEnvironment: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="development">Development</SelectItem>
              <SelectItem value="staging">Staging</SelectItem>
              <SelectItem value="production">Production</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.baseUrl || !form.suiteId} className="w-full">
        {mutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Starting JDE Tests...</> : <><Zap className="h-4 w-4 mr-2" />Run JDE Tests</>}
      </Button>
    </div>
  );
}

// ─── .NET Desktop Form ────────────────────────────────────────────────────────

function DotNetForm({ suites }: { suites: TestSuite[] }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    suiteId: "", appPath: "", appArguments: "", appWorkingDir: "",
    winAppDriverUrl: "http://127.0.0.1:4723", launchDelay: 3000,
    environment: "production",
  });
  const mutation = useMutation({
    mutationFn: async () => { const res = await apiRequest("POST", "/api/executions/dotnet", form); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/executions"] }); toast({ title: ".NET Execution Started", description: "WinAppDriver is automating your desktop app." }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  return (
    <div className="space-y-4">
      <div className="p-3 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-violet-600 mt-0.5 shrink-0" />
        <p className="text-xs text-violet-700 dark:text-violet-400">Requires WinAppDriver running as Administrator on the test machine. Enable Developer Mode in Windows Settings.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label>Application Path (.exe)</Label>
          <Input placeholder="C:\\Program Files\\MyApp\\MyApp.exe" value={form.appPath} onChange={(e) => setForm({ ...form, appPath: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>App Arguments (optional)</Label>
          <Input placeholder="--mode=test" value={form.appArguments} onChange={(e) => setForm({ ...form, appArguments: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Working Directory (optional)</Label>
          <Input placeholder="C:\\Program Files\\MyApp" value={form.appWorkingDir} onChange={(e) => setForm({ ...form, appWorkingDir: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>WinAppDriver URL</Label>
          <Input value={form.winAppDriverUrl} onChange={(e) => setForm({ ...form, winAppDriverUrl: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Launch Delay (ms)</Label>
          <Input type="number" value={form.launchDelay} onChange={(e) => setForm({ ...form, launchDelay: parseInt(e.target.value) || 3000 })} />
        </div>
        <div className="space-y-2">
          <Label>Test Suite</Label>
          <Select value={form.suiteId} onValueChange={(v) => setForm({ ...form, suiteId: v })}>
            <SelectTrigger><SelectValue placeholder="Select suite..." /></SelectTrigger>
            <SelectContent>{suites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Environment</Label>
          <Select value={form.environment} onValueChange={(v) => setForm({ ...form, environment: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="development">Development</SelectItem>
              <SelectItem value="staging">Staging</SelectItem>
              <SelectItem value="production">Production</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.appPath || !form.suiteId} className="w-full">
        {mutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Starting .NET Tests...</> : <><AppWindow className="h-4 w-4 mr-2" />Run .NET Desktop Tests</>}
      </Button>
    </div>
  );
}

// ─── Mobile Form ──────────────────────────────────────────────────────────────

function MobileForm({ suites }: { suites: TestSuite[] }) {
  const { toast } = useToast();
  const [platform, setPlatform] = useState<"ios" | "android">("android");
  const [form, setForm] = useState({
    suiteId: "", deviceName: "", platformVersion: "",
    appPath: "", bundleId: "", appPackage: "", appActivity: "",
    udid: "", appiumUrl: "http://127.0.0.1:4723",
    noReset: false, autoGrantPermissions: true,
    orientation: "PORTRAIT" as "PORTRAIT" | "LANDSCAPE",
    environment: "staging",
  });
  const mutation = useMutation({
    mutationFn: async () => { const res = await apiRequest("POST", "/api/executions/mobile", { ...form, platform }); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/executions"] }); toast({ title: "Mobile Execution Started", description: `Appium is running ${platform === "ios" ? "iOS" : "Android"} tests.` }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["android", "ios"] as const).map((p) => (
          <button key={p} onClick={() => setPlatform(p)}
            className={cn("flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-all",
              platform === p ? "bg-primary text-primary-foreground border-primary" : "bg-muted/30 border-border/50 hover:border-border")}>
            {p === "ios" ? "🍎 iOS (XCUITest)" : "🤖 Android (UIAutomator2)"}
          </button>
        ))}
      </div>
      <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
        <p className="text-xs text-emerald-700 dark:text-emerald-400">
          {platform === "ios" ? "Requires macOS with Xcode and Appium XCUITest driver installed." : "Requires Android SDK, ADB, and Appium UIAutomator2 driver. Enable USB debugging."}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Device Name</Label>
          <Input placeholder={platform === "ios" ? "iPhone 14 Pro" : "Pixel 7"} value={form.deviceName} onChange={(e) => setForm({ ...form, deviceName: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Platform Version</Label>
          <Input placeholder={platform === "ios" ? "17.0" : "13"} value={form.platformVersion} onChange={(e) => setForm({ ...form, platformVersion: e.target.value })} />
        </div>
        {platform === "ios" ? (
          <>
            <div className="space-y-2"><Label>Bundle ID</Label><Input placeholder="com.company.myapp" value={form.bundleId} onChange={(e) => setForm({ ...form, bundleId: e.target.value })} /></div>
            <div className="space-y-2"><Label>Device UDID (real device)</Label><Input placeholder="00008110-000A1234" value={form.udid} onChange={(e) => setForm({ ...form, udid: e.target.value })} /></div>
          </>
        ) : (
          <>
            <div className="space-y-2"><Label>App Package</Label><Input placeholder="com.company.myapp" value={form.appPackage} onChange={(e) => setForm({ ...form, appPackage: e.target.value })} /></div>
            <div className="space-y-2"><Label>App Activity</Label><Input placeholder=".MainActivity" value={form.appActivity} onChange={(e) => setForm({ ...form, appActivity: e.target.value })} /></div>
          </>
        )}
        <div className="space-y-2 md:col-span-2">
          <Label>App Path (.ipa / .apk) — optional if already installed</Label>
          <Input placeholder={platform === "ios" ? "/path/to/app.ipa" : "/path/to/app.apk"} value={form.appPath} onChange={(e) => setForm({ ...form, appPath: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Appium Server URL</Label>
          <Input value={form.appiumUrl} onChange={(e) => setForm({ ...form, appiumUrl: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Test Suite</Label>
          <Select value={form.suiteId} onValueChange={(v) => setForm({ ...form, suiteId: v })}>
            <SelectTrigger><SelectValue placeholder="Select suite..." /></SelectTrigger>
            <SelectContent>{suites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.deviceName || !form.platformVersion || !form.suiteId} className="w-full">
        {mutation.isPending
          ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Starting {platform === "ios" ? "iOS" : "Android"} Tests...</>
          : <><Smartphone className="h-4 w-4 mr-2" />Run {platform === "ios" ? "iOS" : "Android"} Tests</>}
      </Button>
    </div>
  );
}
