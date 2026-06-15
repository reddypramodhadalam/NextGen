import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Download,
  Copy,
  Check,
  Terminal,
  Server,
  Zap,
  Shield,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Plus,
  RefreshCw,
  Settings,
  Code,
  Activity,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TestAgent } from "@shared/schema";

interface AgentSetupConfig {
  agentName: string;
  agentId: string;
  serverUrl: string;
  apiKey: string;
  installCommand: string;
  setupScript: string;
}

export default function LocalAgentSetup() {
  const { toast } = useToast();
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [showRegistrationDialog, setShowRegistrationDialog] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [agentDescription, setAgentDescription] = useState("");
  const [selectedTab, setSelectedTab] = useState("overview");

  // Fetch all agents
  const { data: agents = [], isLoading, refetch } = useQuery<TestAgent[]>({
    queryKey: ["/api/agents"],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Register new agent
  const registerMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const res = await apiRequest("POST", "/api/agents/register-local", {
        name: data.name,
        description: data.description,
        type: "browser",
        capabilities: ["screenshot", "video", "network-logging", "performance-metrics"],
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Success", description: `Agent "${agentName}" registered successfully!` });
      setShowRegistrationDialog(false);
      setAgentName("");
      setAgentDescription("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to register agent", variant: "destructive" });
    },
  });

  // Verify agent health
  const healthMutation = useMutation({
    mutationFn: async (agentId: string) => {
      const res = await apiRequest("GET", `/api/agents/${agentId}/health`);
      return res.json();
    },
    onSuccess: () => {
      refetch();
      toast({ title: "Success", description: "Agent health checked" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Health check failed", variant: "destructive" });
    },
  });

  const handleRegisterAgent = () => {
    if (!agentName.trim()) {
      toast({ title: "Error", description: "Agent name is required", variant: "destructive" });
      return;
    }
    registerMutation.mutate({ name: agentName, description: agentDescription });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
    toast({ title: "Copied", description: `${label} copied to clipboard` });
  };

  const getInstallCommand = (osType: string) => {
    const commands: Record<string, string> = {
      linux: `curl -fsSL https://get.aitas.dev/agent.sh | bash`,
      mac: `brew install aitas-agent && aitas-agent start`,
      windows: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
iwr https://get.aitas.dev/agent.ps1 | iex`,
      docker: `docker run -d \\
  -e AITAS_SERVER_URL=http://your-aitas-server.com \\
  -e AITAS_API_KEY=your-api-key \\
  aitas/agent:latest`,
    };
    return commands[osType] || "";
  };

  const getSetupScript = () => {
    return `#!/bin/bash
# AITAS Local Agent Setup Script

# 1. Download the agent
curl -fsSL https://get.aitas.dev/agent/latest/aitas-agent-linux-x64.tar.gz -o aitas-agent.tar.gz

# 2. Extract
tar -xzf aitas-agent.tar.gz
cd aitas-agent

# 3. Configure environment
cat > .env << EOF
AITAS_SERVER_URL=http://your-aitas-server.com
AITAS_API_KEY=your-generated-api-key
AITAS_AGENT_ID=your-agent-id
AITAS_AGENT_NAME=My Local Agent
AITAS_LOG_LEVEL=info
EOF

# 4. Install dependencies
npm install

# 5. Start the agent
npm run start:agent

# 6. Verify it's running
curl http://localhost:9090/health`;
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg">
            <Server className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Local Agent Setup</h1>
            <p className="text-sm text-muted-foreground">Install & manage AITAS agents on your infrastructure</p>
          </div>
        </div>
        <Dialog open={showRegistrationDialog} onOpenChange={setShowRegistrationDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Register New Agent
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Register Local Agent</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Agent Name</Label>
                <Input
                  placeholder="e.g., My Staging Agent"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                />
              </div>
              <div>
                <Label>Description (optional)</Label>
                <Textarea
                  placeholder="e.g., Running on staging environment for QA testing"
                  value={agentDescription}
                  onChange={(e) => setAgentDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <Button
                onClick={handleRegisterAgent}
                disabled={registerMutation.isPending}
                className="w-full"
              >
                {registerMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Register Agent
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Agents</p>
                <p className="text-2xl font-bold">{agents.length}</p>
              </div>
              <Server className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Online</p>
                <p className="text-2xl font-bold text-green-600">
                  {agents.filter((a) => a.status === "online").length}
                </p>
              </div>
              <Activity className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Offline</p>
                <p className="text-2xl font-bold text-red-600">
                  {agents.filter((a) => a.status === "offline").length}
                </p>
              </div>
              <AlertCircle className="h-8 w-8 text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="install">Installation</TabsTrigger>
          <TabsTrigger value="agents">My Agents</TabsTrigger>
          <TabsTrigger value="troubleshoot">Troubleshoot</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>What is a Local Agent?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Local agents run on your infrastructure and execute tests in a secure, isolated environment. Your code and data never leave your network.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Shield className="h-4 w-4 text-green-600" />
                    Security
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Tests run locally on your infrastructure. No code leaves your network.
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Zap className="h-4 w-4 text-yellow-600" />
                    Performance
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    No network latency. Tests run as fast as your hardware allows.
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Server className="h-4 w-4 text-blue-600" />
                    Scalability
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Run multiple agents across different environments simultaneously.
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Clock className="h-4 w-4 text-purple-600" />
                    24/7 Testing
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Schedule tests to run on your local agents any time, any frequency.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Start</CardTitle>
              <CardDescription>Get your first local agent running in 5 minutes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex gap-3">
                  <Badge className="h-6 w-6 flex items-center justify-center rounded-full">1</Badge>
                  <div>
                    <p className="font-medium">Choose Your OS</p>
                    <p className="text-sm text-muted-foreground">Linux, macOS, Windows, or Docker</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Badge className="h-6 w-6 flex items-center justify-center rounded-full">2</Badge>
                  <div>
                    <p className="font-medium">Run Installation Command</p>
                    <p className="text-sm text-muted-foreground">Copy and paste the command for your OS</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Badge className="h-6 w-6 flex items-center justify-center rounded-full">3</Badge>
                  <div>
                    <p className="font-medium">Configure & Start</p>
                    <p className="text-sm text-muted-foreground">Set up your API key and start the agent</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Badge className="h-6 w-6 flex items-center justify-center rounded-full">4</Badge>
                  <div>
                    <p className="font-medium">Register in AITAS</p>
                    <p className="text-sm text-muted-foreground">Your agent will appear as "Online" automatically</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Installation Tab */}
        <TabsContent value="install" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Choose Your Installation Method</CardTitle>
            </CardHeader>
          </Card>

          {["linux", "mac", "windows", "docker"].map((os) => (
            <Card key={os}>
              <CardHeader>
                <CardTitle className="text-lg capitalize flex items-center gap-2">
                  <Terminal className="h-5 w-5" />
                  {os === "mac" ? "macOS" : os === "windows" ? "Windows (PowerShell)" : os.charAt(0).toUpperCase() + os.slice(1)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">Installation Command</Label>
                  <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm text-green-400 break-all relative group">
                    {getInstallCommand(os)}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100"
                      onClick={() => copyToClipboard(getInstallCommand(os), `${os} command`)}
                    >
                      {copiedText === `${os} command` ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                Full Setup Script
              </CardTitle>
              <CardDescription>Complete step-by-step setup for advanced users</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-slate-900 rounded-lg p-4 font-mono text-xs text-green-400 overflow-x-auto max-h-96 overflow-y-auto">
                <pre>{getSetupScript()}</pre>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => copyToClipboard(getSetupScript(), "Setup script")}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy Script
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* My Agents Tab */}
        <TabsContent value="agents" className="space-y-4">
          {isLoading ? (
            <Card>
              <CardContent className="pt-6 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                <p>Loading agents...</p>
              </CardContent>
            </Card>
          ) : agents.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center py-8">
                <Server className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="text-muted-foreground mb-4">No agents registered yet</p>
                <Button onClick={() => setShowRegistrationDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Register First Agent
                </Button>
              </CardContent>
            </Card>
          ) : (
            agents.map((agent) => (
              <Card key={agent.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{agent.name}</h3>
                        <Badge variant={agent.status === "online" ? "default" : "secondary"}>
                          {agent.status === "online" ? (
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                          ) : (
                            <XCircle className="h-3 w-3 mr-1" />
                          )}
                          {agent.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{agent.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>ID: {agent.id.slice(0, 8)}...</span>
                        <span>Type: {agent.type}</span>
                        {agent.lastHeartbeat && (
                          <span>Last seen: {new Date(agent.lastHeartbeat).toLocaleTimeString()}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => healthMutation.mutate(agent.id)}
                      disabled={healthMutation.isPending}
                    >
                      {healthMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {agent.capabilities?.map((cap) => (
                      <Badge key={cap} variant="outline" className="text-xs">
                        {cap}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Troubleshoot Tab */}
        <TabsContent value="troubleshoot" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Common Issues & Solutions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <h4 className="font-semibold flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  Agent Shows Offline
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
                  <li>Verify the agent process is running: <code className="bg-slate-100 px-2 py-1 rounded">ps aux | grep aitas-agent</code></li>
                  <li>Check network connectivity to AITAS server</li>
                  <li>Verify API key is correct in .env file</li>
                  <li>Check agent logs: <code className="bg-slate-100 px-2 py-1 rounded">tail -f ~/.aitas/logs/agent.log</code></li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  Installation Failed
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
                  <li>Ensure you have curl or wget installed</li>
                  <li>Check internet connectivity</li>
                  <li>Try manual installation from GitHub releases</li>
                  <li>Run with sudo if permission denied: <code className="bg-slate-100 px-2 py-1 rounded">sudo bash agent.sh</code></li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  Tests Not Running
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
                  <li>Verify agent has required capabilities enabled</li>
                  <li>Check agent logs for execution errors</li>
                  <li>Ensure test cases are properly formatted</li>
                  <li>Verify target URL is accessible from agent</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  High CPU/Memory Usage
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
                  <li>Reduce concurrent test executions</li>
                  <li>Increase system resources (RAM, CPU)</li>
                  <li>Clear browser cache: <code className="bg-slate-100 px-2 py-1 rounded">aitas-agent clean-cache</code></li>
                  <li>Restart the agent service</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>View Agent Logs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm mb-2 block">Real-time Logs</Label>
                <div className="bg-slate-900 text-green-400 rounded-lg p-4 font-mono text-xs h-48 overflow-y-auto">
                  <div>[2024-01-15 10:30:45] Agent started successfully</div>
                  <div>[2024-01-15 10:30:46] Connected to AITAS server</div>
                  <div>[2024-01-15 10:30:47] Heartbeat sent</div>
                  <div>[2024-01-15 10:30:50] Ready to accept test executions</div>
                  <div className="text-yellow-400">[2024-01-15 10:31:00] [WARN] Memory usage at 65%</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
