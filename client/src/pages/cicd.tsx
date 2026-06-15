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
import {
  GitBranch, Loader2, Plus, Play, Trash2, CheckCircle2,
  XCircle, Copy, RefreshCw, Webhook, Settings2, Zap,
  Github, Server, Cloud, GitMerge, Check, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TestSuite, CicdWebhook } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Provider {
  value: string; label: string; icon: string; color: string; description: string;
}

interface TriggerResult {
  success: boolean; provider: string; pipelineName: string;
  triggeredAt: string; runUrl?: string; runId?: string; message: string;
}

// ─── Provider Icon ────────────────────────────────────────────────────────────

function ProviderIcon({ provider, className }: { provider: string; className?: string }) {
  const icons: Record<string, any> = {
    github_actions: Github, jenkins: Server, azure_devops: Cloud,
    gitlab_ci: GitMerge, bitbucket: GitBranch, circleci: RefreshCw, generic: Webhook,
  };
  const Icon = icons[provider] || Webhook;
  return <Icon className={className} />;
}

const PROVIDER_COLORS: Record<string, string> = {
  github_actions: "bg-gray-900 text-white",
  jenkins:        "bg-red-600 text-white",
  azure_devops:   "bg-blue-600 text-white",
  gitlab_ci:      "bg-orange-600 text-white",
  bitbucket:      "bg-blue-500 text-white",
  circleci:       "bg-green-600 text-white",
  generic:        "bg-violet-600 text-white",
};

// ─── Webhook Card ─────────────────────────────────────────────────────────────

function WebhookCard({
  webhook, providers, onDelete, onToggle, onTrigger,
}: {
  webhook: CicdWebhook;
  providers: Provider[];
  onDelete: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
  onTrigger: (webhook: CicdWebhook) => void;
}) {
  const [copied, setCopied] = useState(false);
  const provider = providers.find((p) => p.value === webhook.provider);
  const inboundUrl = `${window.location.origin}/api/cicd/webhook/${webhook.provider.replace("_actions", "").replace("_ci", "").replace("_devops", "")}`;

  const copyUrl = () => {
    navigator.clipboard.writeText(inboundUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("p-4 rounded-xl border transition-all", webhook.isActive ? "bg-card border-border/60" : "bg-muted/20 border-border/30 opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", PROVIDER_COLORS[webhook.provider] || "bg-muted")}>
            <ProviderIcon provider={webhook.provider} className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm">{webhook.name}</p>
              <Badge variant={webhook.isActive ? "default" : "secondary"} className="text-xs h-5">
                {webhook.isActive ? "Active" : "Paused"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {provider?.label || webhook.provider}
              {webhook.lastTriggered && ` · Last: ${new Date(webhook.lastTriggered).toLocaleDateString()}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Trigger now" onClick={() => onTrigger(webhook)}>
            <Play className="h-3.5 w-3.5" />
          </Button>
          <Switch checked={!!webhook.isActive} onCheckedChange={(v) => onToggle(webhook.id, v)} />
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(webhook.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Inbound URL */}
      <div className="mt-3 flex items-center gap-2 p-2 rounded-lg bg-muted/40">
        <code className="text-xs flex-1 truncate text-muted-foreground font-mono">{inboundUrl}</code>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={copyUrl}>
          {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>

      {(webhook.triggerOn as string[] || []).length > 0 && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {(webhook.triggerOn as string[]).map((t) => (
            <Badge key={t} variant="outline" className="text-xs h-5">{t}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CICDPage() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [triggerResult, setTriggerResult] = useState<TriggerResult | null>(null);
  const [form, setForm] = useState({
    name: "", provider: "github_actions", webhookUrl: "", secretToken: "",
    apiToken: "", projectId: "", pipelineId: "", branch: "main",
    suiteId: "", environment: "staging",
    triggerOn: ["push"] as string[],
  });
  const [triggerForm, setTriggerForm] = useState({
    provider: "github_actions", name: "Manual Trigger",
    webhookUrl: "", apiToken: "", branch: "main",
    suiteId: "", environment: "staging",
  });

  const { data: providers = [] } = useQuery<Provider[]>({ queryKey: ["/api/cicd/providers"] });
  const { data: webhooks = [], refetch } = useQuery<CicdWebhook[]>({ queryKey: ["/api/cicd/webhooks"] });
  const { data: suites = [] } = useQuery<TestSuite[]>({ queryKey: ["/api/test-suites"] });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/cicd/webhooks", form);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cicd/webhooks"] });
      toast({ title: "Integration Created", description: `${form.name} is now configured.` });
      setCreateOpen(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/cicd/webhooks/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/cicd/webhooks"] }); toast({ title: "Integration Deleted" }); },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/cicd/webhooks/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/cicd/webhooks"] }),
  });

  const triggerMutation = useMutation({
    mutationFn: async (config: any) => {
      const res = await apiRequest("POST", "/api/cicd/trigger", config);
      return res.json() as Promise<TriggerResult>;
    },
    onSuccess: (data) => {
      setTriggerResult(data);
      toast({
        title: data.success ? "Pipeline Triggered ✓" : "Trigger Failed",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleEvent = (event: string) => {
    setForm((f) => ({
      ...f,
      triggerOn: f.triggerOn.includes(event)
        ? f.triggerOn.filter((e) => e !== event)
        : [...f.triggerOn, event],
    }));
  };

  const EVENTS = ["push", "pull_request", "tag", "schedule", "manual"];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center shadow-lg">
            <GitBranch className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">CI/CD Integration</h1>
            <p className="text-sm text-muted-foreground">Connect GitHub Actions, Jenkins, Azure DevOps, GitLab CI</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Dialog open={triggerOpen} onOpenChange={setTriggerOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2"><Zap className="h-4 w-4" />Manual Trigger</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Trigger Pipeline Manually</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Provider</Label>
                  <Select value={triggerForm.provider} onValueChange={(v) => setTriggerForm({ ...triggerForm, provider: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{providers.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Pipeline / Webhook URL</Label>
                  <Input placeholder="https://api.github.com/repos/org/repo/actions/workflows/test.yml/dispatches" value={triggerForm.webhookUrl} onChange={(e) => setTriggerForm({ ...triggerForm, webhookUrl: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>API Token</Label>
                  <Input type="password" placeholder="ghp_... or PAT" value={triggerForm.apiToken} onChange={(e) => setTriggerForm({ ...triggerForm, apiToken: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Branch</Label>
                    <Input value={triggerForm.branch} onChange={(e) => setTriggerForm({ ...triggerForm, branch: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Environment</Label>
                    <Select value={triggerForm.environment} onValueChange={(v) => setTriggerForm({ ...triggerForm, environment: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="development">Development</SelectItem>
                        <SelectItem value="staging">Staging</SelectItem>
                        <SelectItem value="production">Production</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {triggerResult && (
                  <div className={cn("p-3 rounded-lg border flex items-start gap-2", triggerResult.success ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30")}>
                    {triggerResult.success ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />}
                    <div>
                      <p className="text-xs font-medium">{triggerResult.message}</p>
                      {triggerResult.runUrl && (
                        <a href={triggerResult.runUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1 mt-1">
                          View Run <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                )}
                <Button className="w-full" onClick={() => triggerMutation.mutate(triggerForm)} disabled={triggerMutation.isPending || !triggerForm.webhookUrl}>
                  {triggerMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Triggering...</> : <><Play className="h-4 w-4 mr-2" />Trigger Pipeline</>}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" />Add Integration</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Add CI/CD Integration</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Integration Name</Label>
                  <Input placeholder="e.g., Main Branch Tests" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Provider</Label>
                  <Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {providers.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          <div className="flex items-center gap-2">
                            <ProviderIcon provider={p.value} className="h-3.5 w-3.5" />
                            {p.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {providers.find((p) => p.value === form.provider) && (
                    <p className="text-xs text-muted-foreground">{providers.find((p) => p.value === form.provider)?.description}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Outbound Webhook / Pipeline URL</Label>
                  <Input placeholder="https://api.github.com/repos/org/repo/actions/workflows/..." value={form.webhookUrl} onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>API Token</Label>
                    <Input type="password" placeholder="PAT / API key" value={form.apiToken} onChange={(e) => setForm({ ...form, apiToken: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Inbound Secret</Label>
                    <Input type="password" placeholder="HMAC secret" value={form.secretToken} onChange={(e) => setForm({ ...form, secretToken: e.target.value })} />
                  </div>
                </div>
                {(form.provider === "gitlab_ci" || form.provider === "azure_devops") && (
                  <div className="space-y-2">
                    <Label>Project ID</Label>
                    <Input placeholder="GitLab project ID or Azure project name" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Default Branch</Label>
                    <Input value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Test Suite</Label>
                    <Select value={form.suiteId} onValueChange={(v) => setForm({ ...form, suiteId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>{suites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Trigger On Events</Label>
                  <div className="flex flex-wrap gap-2">
                    {EVENTS.map((event) => (
                      <button key={event} onClick={() => toggleEvent(event)}
                        className={cn("px-3 py-1 rounded-full text-xs font-medium border transition-all", form.triggerOn.includes(event) ? "bg-primary text-primary-foreground border-primary" : "bg-muted/30 border-border/50 hover:border-border")}>
                        {event}
                      </button>
                    ))}
                  </div>
                </div>
                <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.name || !form.provider} className="w-full">
                  {createMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</> : <><Plus className="h-4 w-4 mr-2" />Add Integration</>}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Provider Cards */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Supported Platforms</CardTitle>
              <CardDescription className="text-xs">Click to add an integration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {providers.map((p) => (
                <button key={p.value} className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left group"
                  onClick={() => { setForm({ ...form, provider: p.value, name: `${p.label} Integration` }); setCreateOpen(true); }}>
                  <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", PROVIDER_COLORS[p.value] || "bg-muted")}>
                    <ProviderIcon provider={p.value} className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{p.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.description.split(" ").slice(0, 5).join(" ")}...</p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {webhooks.filter((w) => w.provider === p.value).length}
                  </Badge>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Integrations List */}
        <div className="lg:col-span-2 space-y-4">
          {/* Inbound Webhook URLs */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Webhook className="h-4 w-4 text-primary" />
                Inbound Webhook Endpoints
              </CardTitle>
              <CardDescription className="text-xs">Configure these URLs in your CI/CD system to trigger AITAS tests</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "GitHub Actions", path: "/api/cicd/webhook/github", header: "X-Hub-Signature-256" },
                { label: "GitLab CI",      path: "/api/cicd/webhook/gitlab", header: "X-Gitlab-Token" },
                { label: "Jenkins",        path: "/api/cicd/webhook/jenkins", header: "X-Jenkins-Signature" },
                { label: "Azure DevOps",   path: "/api/cicd/webhook/azure",  header: "Authorization" },
                { label: "Generic",        path: "/api/cicd/webhook/generic", header: "X-AITAS-Signature" },
              ].map((ep) => {
                const [copied, setCopied] = useState(false);
                const url = `${window.location.origin}${ep.path}`;
                return (
                  <div key={ep.path} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                    <span className="text-xs font-medium w-28 shrink-0 text-muted-foreground">{ep.label}</span>
                    <code className="text-xs flex-1 truncate font-mono">{url}</code>
                    <Badge variant="outline" className="text-xs shrink-0 hidden sm:flex">{ep.header}</Badge>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Configured Integrations */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Configured Integrations</CardTitle>
            </CardHeader>
            <CardContent>
              {webhooks.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <GitBranch className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No integrations yet</p>
                  <p className="text-sm mt-1">Add an integration to connect your CI/CD pipeline</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {webhooks.map((wh) => (
                    <WebhookCard
                      key={wh.id}
                      webhook={wh}
                      providers={providers}
                      onDelete={(id) => deleteMutation.mutate(id)}
                      onToggle={(id, active) => toggleMutation.mutate({ id, isActive: active })}
                      onTrigger={(wh) => {
                        setTriggerForm({ ...triggerForm, provider: wh.provider, name: wh.name, webhookUrl: wh.webhookUrl || "" });
                        setTriggerOpen(true);
                      }}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
