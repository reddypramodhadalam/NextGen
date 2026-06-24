import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Bot, Brain, Globe, Zap, Shield, Database, Eye, Play, Square,
  CheckCircle2, XCircle, Clock, Loader2, ChevronRight, ChevronDown,
  LayoutGrid, Terminal, Network, Cpu, RefreshCw, Upload, Download,
  AlertTriangle, Info, ArrowRight, Sparkles, Code2, TreePine,
  Activity, BarChart3, Settings2, FileText, Plus, Trash2, Search,
} from "lucide-react";
import type { TestSuite, TestCase } from "@shared/schema";

// ── Types ──────────────────────────────────────────────────────────────────

interface ExecutionStep {
  id: string;
  stepNumber: number;
  rawAction: string;
  rawExpected: string;
  parsedAction?: { type: string; target?: string; value?: string; confidence: number; reasoning: string };
  status: "pending" | "running" | "passed" | "failed" | "skipped" | "healing";
  result?: { passed: boolean; error?: string; duration: number; selectorUsed?: string; retryCount: number; screenshot?: string };
  retries: number;
  maxRetries: number;
}

interface SessionResult {
  sessionId: string;
  status: string;
  steps: ExecutionStep[];
  passedSteps: number;
  failedSteps: number;
  totalSteps: number;
  duration: number;
  logs: string[];
  screenshots: { stepIndex: number; screenshot: string; label: string }[];
  domSnapshot?: {
    url: string; title: string; elementCount: number;
    inputs: any[]; buttons: any[]; forms: any[]; iframes: any[];
  };
  error?: string;
}

interface OrchestratorEvent {
  sessionId: string;
  type: string;
  data: any;
  timestamp: string;
}

type StepInput = { step: string; expected: string };

// Agent pipeline steps
const AGENT_PIPELINE = [
  { id: "planner",        icon: Brain,     label: "Planner",         color: "text-violet-500",    bgColor: "bg-violet-500/10",  description: "Converts test steps into structured execution plan" },
  { id: "navigator",      icon: Globe,     label: "Navigator",       color: "text-blue-500",      bgColor: "bg-blue-500/10",    description: "Manages Playwright browser lifecycle" },
  { id: "dom-intel",      icon: TreePine,  label: "DOM Intelligence",color: "text-emerald-500",   bgColor: "bg-emerald-500/10", description: "Accessibility tree + semantic DOM extraction" },
  { id: "action",         icon: Zap,       label: "Action Agent",    color: "text-amber-500",     bgColor: "bg-amber-500/10",   description: "7-strategy selector waterfall execution" },
  { id: "validation",     icon: Shield,    label: "Validation",      color: "text-rose-500",      bgColor: "bg-rose-500/10",    description: "Verifies outcomes & assertions" },
  { id: "memory",         icon: Database,  label: "Memory Agent",    color: "text-cyan-500",      bgColor: "bg-cyan-500/10",    description: "Learns selectors to prevent re-discovering" },
];

// ── Status helpers ─────────────────────────────────────────────────────────

const statusColor: Record<string, string> = {
  pending:   "text-slate-400",
  running:   "text-blue-400",
  passed:    "text-emerald-500",
  failed:    "text-red-500",
  skipped:   "text-slate-400",
  healing:   "text-amber-400",
  completed: "text-emerald-500",
  idle:      "text-slate-400",
  planning:  "text-violet-400",
  navigating:"text-blue-400",
  executing: "text-amber-400",
  validating:"text-cyan-400",
};

const statusIcon = (s: string) => {
  if (s === "passed" || s === "completed") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (s === "failed") return <XCircle className="h-4 w-4 text-red-500" />;
  if (s === "running" || s === "executing") return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />;
  if (s === "healing") return <RefreshCw className="h-4 w-4 text-amber-400 animate-spin" />;
  if (s === "planning") return <Brain className="h-4 w-4 text-violet-400 animate-pulse" />;
  if (s === "navigating") return <Globe className="h-4 w-4 text-blue-400 animate-pulse" />;
  if (s === "capturing-dom") return <TreePine className="h-4 w-4 text-emerald-400 animate-pulse" />;
  if (s === "validating") return <Shield className="h-4 w-4 text-cyan-400 animate-pulse" />;
  return <Clock className="h-4 w-4 text-slate-400" />;
};

// ── Step Row ────────────────────────────────────────────────────────────────

function StepRow({ step, index }: { step: ExecutionStep; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const isActive = step.status === "running" || step.status === "healing";
  const actionColor: Record<string,string> = {
    navigate:"bg-blue-500/10 text-blue-400", click:"bg-amber-500/10 text-amber-400",
    fill:"bg-violet-500/10 text-violet-400", select:"bg-cyan-500/10 text-cyan-400",
    check:"bg-emerald-500/10 text-emerald-400", verify:"bg-rose-500/10 text-rose-400",
    press:"bg-slate-500/10 text-slate-400", wait:"bg-slate-500/10 text-slate-400",
    scroll:"bg-indigo-500/10 text-indigo-400",
  };
  const typeStyle = step.parsedAction ? (actionColor[step.parsedAction.type] || "bg-slate-500/10 text-slate-400") : "";

  return (
    <div className={`border rounded-lg transition-all duration-200 ${
      isActive ? "border-primary/50 bg-primary/5 shadow-sm" :
      step.status === "passed" ? "border-emerald-500/20 bg-emerald-500/5" :
      step.status === "failed" ? "border-red-500/20 bg-red-500/5" :
      "border-border"
    }`}>
      <button
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30 transition-colors rounded-lg"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-mono text-muted-foreground w-6 text-right">{step.stepNumber}</span>
          {statusIcon(step.status)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{step.rawAction}</p>
          {step.parsedAction && (
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${typeStyle}`}>
                {step.parsedAction.type}
              </span>
              {step.parsedAction.target && (
                <span className="text-xs text-muted-foreground truncate">→ {step.parsedAction.target}</span>
              )}
              <span className={`text-xs ml-auto ${statusColor[step.status]}`}>{step.status}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {step.result?.duration && (
            <span className="text-xs text-muted-foreground font-mono">{step.result.duration}ms</span>
          )}
          {(step.result?.retryCount ?? 0) > 0 && (
            <Badge variant="outline" className="text-xs text-amber-500 border-amber-500/30">
              {step.result?.retryCount ?? 0} retry
            </Badge>
          )}
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-border/50 mt-1 pt-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground mb-1 font-medium">Expected</p>
              <p className="font-mono bg-muted/50 p-2 rounded text-xs">{step.rawExpected || "—"}</p>
            </div>
            {step.parsedAction && (
              <div>
                <p className="text-muted-foreground mb-1 font-medium">AI Plan ({step.parsedAction.confidence}% confidence)</p>
                <p className="font-mono bg-muted/50 p-2 rounded text-xs">{step.parsedAction.reasoning}</p>
              </div>
            )}
          </div>
          {step.result?.error && (
            <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2">
              <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {step.result.error}
            </div>
          )}
          {step.result && step.result.selectorUsed && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Code2 className="h-3.5 w-3.5 shrink-0" />
              <span>Selector used: <code className="font-mono text-primary">{step.result.selectorUsed}</code></span>
            </div>
          )}
          {step.result?.screenshot && (
            <div>
              <p className="text-xs text-muted-foreground mb-1.5 font-medium">Screenshot</p>
              <img
                src={`data:image/jpeg;base64,${step.result.screenshot}`}
                alt={`Step ${step.stepNumber}`}
                className="rounded-lg border border-border max-h-40 object-contain"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── DOM Inspector Panel ────────────────────────────────────────────────────

function DOMInspector({ dom }: { dom: SessionResult["domSnapshot"] }) {
  const [activeTab, setActiveTab] = useState("inputs");
  if (!dom) return null;
  const sections = [
    { key: "inputs",   label: "Inputs",   count: dom.inputs?.length ?? 0,   color: "text-violet-400",  icon: FileText },
    { key: "buttons",  label: "Buttons",  count: dom.buttons?.length ?? 0,  color: "text-amber-400",   icon: Zap },
    { key: "forms",    label: "Forms",    count: dom.forms?.length ?? 0,    color: "text-emerald-400", icon: LayoutGrid },
    { key: "iframes",  label: "iFrames",  count: dom.iframes?.length ?? 0,  color: "text-blue-400",    icon: Globe },
  ];

  const items: any[] = activeTab === "inputs" ? dom.inputs ?? []
    : activeTab === "buttons" ? dom.buttons ?? []
    : activeTab === "forms" ? dom.forms ?? []
    : dom.iframes ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TreePine className="h-4 w-4 text-emerald-500" />
          DOM Intelligence Snapshot
        </CardTitle>
        <CardDescription className="text-xs">
          {dom.title} • {dom.url} • {dom.elementCount} elements captured
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-3 flex-wrap">
          {sections.map(s => (
            <button
              key={s.key}
              onClick={() => setActiveTab(s.key)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                activeTab === s.key ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
              }`}
            >
              <s.icon className={`h-3 w-3 ${activeTab === s.key ? "" : s.color}`} />
              {s.label}
              <span className={`ml-0.5 ${activeTab === s.key ? "opacity-80" : "text-muted-foreground"}`}>
                ({s.count})
              </span>
            </button>
          ))}
        </div>
        <ScrollArea className="h-52">
          <div className="space-y-1.5 pr-2">
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No {activeTab} found</p>
            ) : items.slice(0, 30).map((el: any, i: number) => (
              <div key={i} className="flex items-start gap-2 p-2 bg-muted/30 rounded-lg text-xs">
                <code className="font-mono text-muted-foreground w-5 shrink-0">{i + 1}</code>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {el.type && <span className="px-1 py-0.5 bg-blue-500/10 text-blue-400 rounded font-mono">{el.type}</span>}
                    {el.role && el.role !== el.type && <span className="px-1 py-0.5 bg-violet-500/10 text-violet-400 rounded font-mono">{el.role}</span>}
                    <span className="font-medium truncate">{el.ariaLabel || el.placeholder || el.name || el.textContent || el.id || "unnamed"}</span>
                  </div>
                  <code className="text-muted-foreground block truncate mt-0.5">{el.selector}</code>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ── Agent Pipeline Visual ──────────────────────────────────────────────────

function AgentPipeline({ activeAgent }: { activeAgent?: string }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {AGENT_PIPELINE.map((agent, i) => {
        const isActive = activeAgent === agent.id;
        const Icon = agent.icon;
        return (
          <div key={agent.id} className="flex items-center gap-1">
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all ${
              isActive ? `${agent.bgColor} ${agent.color} ring-1 ring-current` : "bg-muted/50 text-muted-foreground"
            }`}>
              <Icon className={`h-3 w-3 ${isActive ? "animate-pulse" : ""}`} />
              <span className="hidden sm:inline">{agent.label}</span>
            </div>
            {i < AGENT_PIPELINE.length - 1 && (
              <ArrowRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Log Stream ─────────────────────────────────────────────────────────────

function LogStream({ logs }: { logs: string[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const colorize = (line: string) => {
    if (line.includes("✓") || line.includes("PASSED") || line.includes("✓ PASSED")) return "text-emerald-400";
    if (line.includes("✗") || line.includes("FAILED") || line.includes("Error")) return "text-red-400";
    if (line.includes("[Planner]")) return "text-violet-400";
    if (line.includes("[Navigator]")) return "text-blue-400";
    if (line.includes("[DOMIntelligence]")) return "text-emerald-400";
    if (line.includes("[Action]")) return "text-amber-400";
    if (line.includes("[Validate]")) return "text-cyan-400";
    if (line.includes("[Orchestrator]")) return "text-primary";
    if (line.includes("[Selector]")) return "text-indigo-400";
    if (line.includes("[Healer]") || line.includes("Self-Heal")) return "text-orange-400";
    if (line.includes("⚠")) return "text-yellow-400";
    if (line.startsWith("---") || line.startsWith("===")) return "text-muted-foreground";
    return "text-slate-300";
  };

  return (
    <div
      ref={scrollRef}
      className="h-56 overflow-y-auto font-mono text-xs bg-black/60 rounded-lg p-3 border border-border/50 space-y-0.5"
    >
      {logs.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">Waiting for agent activity...</p>
      ) : (
        logs.map((line, i) => (
          <div key={i} className={`leading-5 ${colorize(line)}`}>
            {line}
          </div>
        ))
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function MultiAgentPage() {
  const { toast } = useToast();

  // ── State ──
  const [targetUrl, setTargetUrl] = useState("https://");
  const [steps, setSteps] = useState<StepInput[]>([
    { step: "", expected: "" },
  ]);
  const [testData, setTestData] = useState<{ key: string; value: string }[]>([]);
  const [maxRetries, setMaxRetries] = useState("3");
  const [headless, setHeadless] = useState(true);
  const [captureScreenshots, setCaptureScreenshots] = useState(true);
  const [selectedTestCaseId, setSelectedTestCaseId] = useState("");
  const [activeTab, setActiveTab] = useState("configure");

  // Session tracking
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);
  const [liveEvents, setLiveEvents] = useState<OrchestratorEvent[]>([]);
  const [liveLogs, setLiveLogs] = useState<string[]>([]);
  const [activeAgent, setActiveAgent] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // DOM capture
  const [domUrl, setDomUrl] = useState("");
  const [capturedDOM, setCapturedDOM] = useState<any>(null);

  // Memory stats
  const [memoryStats, setMemoryStats] = useState<any>(null);

  // ── Queries ──
  const { data: suites = [] } = useQuery<TestSuite[]>({ queryKey: ["/api/suites"] });
  const { data: testCases = [] } = useQuery<TestCase[]>({ queryKey: ["/api/test-cases"] });

  // ── Start Session Mutation ──
  const startMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        targetUrl,
        steps,
        testData: Object.fromEntries(testData.map(d => [d.key, d.value])),
        maxRetries: parseInt(maxRetries),
        headless,
        captureScreenshots,
      };
      if (selectedTestCaseId) {
        payload.testCaseId = selectedTestCaseId;
        const tc = testCases.find(t => t.id === selectedTestCaseId);
        if (tc) payload.testCaseTitle = tc.title;
      }
      const res = await apiRequest("POST", "/api/multi-agent/sessions", payload);
      return res.json();
    },
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      setActiveTab("execution");
      setLiveLogs([]);
      setLiveEvents([]);
      setSessionResult(null);
      startSSEStream(data.sessionId);
      toast({ title: "Session Started", description: "Multi-agent system is running..." });
    },
    onError: (err: any) => {
      toast({ title: "Failed to Start", description: err.message, variant: "destructive" });
    },
  });

  // ── DOM Capture Mutation ──
  const domCaptureMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await apiRequest("POST", "/api/multi-agent/capture-dom", { url, headless: true });
      return res.json();
    },
    onSuccess: (data) => {
      setCapturedDOM(data);
      toast({ title: "DOM Captured", description: `${data.elementCount} elements extracted from ${data.title}` });
    },
    onError: (err: any) => {
      toast({ title: "DOM Capture Failed", description: err.message, variant: "destructive" });
    },
  });

  // ── SSE Stream ──
  const startSSEStream = useCallback((sid: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setIsStreaming(true);
    const es = new EventSource(`/api/multi-agent/sessions/${sid}/stream`);
    eventSourceRef.current = es;

    es.onmessage = (evt) => {
      try {
        const event: OrchestratorEvent = JSON.parse(evt.data);
        setLiveEvents(prev => [...prev, event]);

        if (event.type === "agent_log") {
          setLiveLogs(prev => [...prev, event.data.message]);
        }
        if (event.type === "step_started") {
          const agentMap: Record<string,string> = {
            navigate: "navigator", click: "action", fill: "action",
            select: "action", verify: "validation",
          };
          setActiveAgent(agentMap[event.data.parsedType] || "action");
        }
        if (event.type === "dom_captured") {
          setActiveAgent("dom-intel");
          setLiveLogs(prev => [...prev, `[DOMIntelligence] Captured: ${event.data.inputs} inputs, ${event.data.buttons} buttons, ${event.data.forms} forms`]);
        }
        if (event.type === "planning_complete") {
          setActiveAgent("planner");
        }
        if (event.type === "step_complete" || event.type === "step_failed") {
          setActiveAgent("validation");
          // Refresh session result
          fetchSessionResult(sid);
        }
        if (event.type === "healing_started") {
          setActiveAgent("memory");
        }
        if (event.type === "session_complete" || event.type === "session_failed") {
          setActiveAgent("");
          setIsStreaming(false);
          es.close();
          fetchSessionResult(sid);
          toast({
            title: event.type === "session_complete" ? "Session Complete" : "Session Failed",
            description: event.type === "session_complete"
              ? `${event.data.passed}/${event.data.total} steps passed`
              : event.data.error || "Session encountered errors",
            variant: event.type === "session_complete" ? "default" : "destructive",
          });
        }
      } catch {}
    };

    es.onerror = () => {
      setIsStreaming(false);
    };
  }, [toast]);

  const fetchSessionResult = async (sid: string) => {
    try {
      const res = await fetch(`/api/multi-agent/sessions/${sid}`);
      if (res.ok) {
        const data = await res.json();
        setSessionResult(data);
      }
    } catch {}
  };

  const fetchMemoryStats = async () => {
    try {
      const res = await fetch("/api/multi-agent/memory");
      if (res.ok) setMemoryStats(await res.json());
    } catch {}
  };

  useEffect(() => {
    fetchMemoryStats();
    return () => { eventSourceRef.current?.close(); };
  }, []);

  // Load test case steps
  const handleLoadTestCase = (tcId: string) => {
    setSelectedTestCaseId(tcId);
    const tc = testCases.find(t => t.id === tcId);
    if (tc?.steps && Array.isArray(tc.steps)) {
      setSteps((tc.steps as any[]).map(s => ({ 
        step: s.step || (s.action && s.target ? `${s.action}: ${s.target}` : s.action) || "", 
        expected: s.expected || "" 
      })));
      if (tc.targetUrl) setTargetUrl(tc.targetUrl);
    }
  };

  const passRate = sessionResult
    ? Math.round((sessionResult.passedSteps / Math.max(sessionResult.totalSteps, 1)) * 100)
    : 0;


  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            Multi-Agent AI Test System
          </h1>
          <p className="text-muted-foreground mt-1">
            World-class Playwright automation with accessibility-first DOM intelligence
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isStreaming && (
            <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 animate-pulse">
              <Activity className="h-3 w-3 mr-1" />
              Live
            </Badge>
          )}
          {sessionResult && (
            <Badge variant={sessionResult.status === "completed" ? "default" : "destructive"}>
              {statusIcon(sessionResult.status)}
              <span className="ml-1 capitalize">{sessionResult.status}</span>
            </Badge>
          )}
        </div>
      </div>

      {/* Agent Pipeline */}
      <Card className="bg-gradient-to-r from-primary/5 via-background to-primary/5 border-primary/20">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Agent Pipeline</p>
          <AgentPipeline activeAgent={activeAgent} />
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="configure"><Settings2 className="h-3.5 w-3.5 mr-1" />Configure</TabsTrigger>
          <TabsTrigger value="execution"><Play className="h-3.5 w-3.5 mr-1" />Execution</TabsTrigger>
          <TabsTrigger value="dom"><TreePine className="h-3.5 w-3.5 mr-1" />DOM</TabsTrigger>
          <TabsTrigger value="screenshots"><Eye className="h-3.5 w-3.5 mr-1" />Screenshots</TabsTrigger>
          <TabsTrigger value="memory"><Database className="h-3.5 w-3.5 mr-1" />Memory</TabsTrigger>
        </TabsList>

        {/* ── CONFIGURE TAB ─────────────────────────────────────────────── */}
        <TabsContent value="configure" className="space-y-4 mt-4">
          <div className="grid lg:grid-cols-3 gap-4">
            {/* Left: Target + Test Case */}
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Globe className="h-4 w-4 text-blue-500" />
                    Target & Steps
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-xs">Target URL</Label>
                      <Input
                        placeholder="https://your-app.com"
                        value={targetUrl}
                        onChange={e => setTargetUrl(e.target.value)}
                        className="font-mono text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Load from Test Case</Label>
                      <Select value={selectedTestCaseId} onValueChange={handleLoadTestCase}>
                        <SelectTrigger className="text-sm">
                          <SelectValue placeholder="Select test case..." />
                        </SelectTrigger>
                        <SelectContent>
                          {testCases.map(tc => (
                            <SelectItem key={tc.id} value={tc.id}>{tc.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Max Retries (self-healing)</Label>
                      <Select value={maxRetries} onValueChange={setMaxRetries}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["1","2","3","4","5"].map(v => <SelectItem key={v} value={v}>{v} retries</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Steps Editor */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-xs">Test Steps ({steps.length})</Label>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSteps(prev => [...prev, { step: "", expected: "" }])}
                      >
                        <Plus className="h-3 w-3 mr-1" />Add Step
                      </Button>
                    </div>
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {steps.map((s, i) => (
                        <div key={i} className="flex items-start gap-2 p-2.5 bg-muted/30 rounded-lg border border-border/50">
                          <span className="text-xs font-mono text-muted-foreground mt-2 w-5 shrink-0 text-right">{i + 1}</span>
                          <div className="flex-1 space-y-1.5">
                            <Input
                              placeholder={`Action: e.g., Click the Login button`}
                              value={s.step}
                              onChange={e => {
                                const n = [...steps]; n[i] = { ...n[i], step: e.target.value }; setSteps(n);
                              }}
                              className="text-xs h-8"
                            />
                            <Input
                              placeholder={`Expected: e.g., User is redirected to dashboard`}
                              value={s.expected}
                              onChange={e => {
                                const n = [...steps]; n[i] = { ...n[i], expected: e.target.value }; setSteps(n);
                              }}
                              className="text-xs h-8 text-muted-foreground"
                            />
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-red-500 mt-1"
                            onClick={() => setSteps(prev => prev.filter((_, j) => j !== i))}
                            disabled={steps.length <= 1}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right: Test Data + Options */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Database className="h-4 w-4 text-cyan-500" />
                    Test Data
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {testData.map((d, i) => (
                    <div key={i} className="flex gap-1.5 items-center">
                      <Input
                        placeholder="key"
                        value={d.key}
                        onChange={e => { const n=[...testData]; n[i]={...n[i],key:e.target.value}; setTestData(n); }}
                        className="text-xs h-8 w-1/2"
                      />
                      <Input
                        placeholder="value"
                        type={d.key.toLowerCase().includes("pass") ? "password" : "text"}
                        value={d.value}
                        onChange={e => { const n=[...testData]; n[i]={...n[i],value:e.target.value}; setTestData(n); }}
                        className="text-xs h-8 flex-1"
                      />
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setTestData(prev => prev.filter((_,j) => j !== i))}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => setTestData(prev => [...prev, { key: "", value: "" }])}>
                    <Plus className="h-3 w-3 mr-1" />Add Variable
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-violet-500" />
                    Execution Options
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { label: "Headless Browser", desc: "Run without visible window", val: headless, set: setHeadless },
                    { label: "Capture Screenshots", desc: "Screenshot per step", val: captureScreenshots, set: setCaptureScreenshots },
                  ].map(opt => (
                    <div key={opt.label} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{opt.label}</p>
                        <p className="text-xs text-muted-foreground">{opt.desc}</p>
                      </div>
                      <button
                        onClick={() => opt.set(!opt.val)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${opt.val ? "bg-primary" : "bg-muted"}`}
                      >
                        <span className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${opt.val ? "translate-x-5" : "translate-x-1"}`} />
                      </button>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Button
                className="w-full"
                size="lg"
                onClick={() => startMutation.mutate()}
                disabled={startMutation.isPending || isStreaming || !targetUrl || steps.every(s => !s.step)}
              >
                {startMutation.isPending || isStreaming ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Running...</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-2" />Launch Multi-Agent</>
                )}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ── EXECUTION TAB ──────────────────────────────────────────────── */}
        <TabsContent value="execution" className="space-y-4 mt-4">
          {!sessionId ? (
            <div className="text-center py-16 text-muted-foreground">
              <Bot className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No session running. Configure and launch from the Configure tab.</p>
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 space-y-4">
                {/* Stats Bar */}
                {sessionResult && (
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { label: "Total", value: sessionResult.totalSteps, color: "text-foreground" },
                      { label: "Passed", value: sessionResult.passedSteps, color: "text-emerald-500" },
                      { label: "Failed", value: sessionResult.failedSteps, color: "text-red-500" },
                      { label: "Pass Rate", value: `${passRate}%`, color: passRate >= 80 ? "text-emerald-500" : "text-amber-500" },
                    ].map(s => (
                      <Card key={s.label}>
                        <CardContent className="p-3 text-center">
                          <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                          <p className="text-xs text-muted-foreground">{s.label}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Progress Bar */}
                {sessionResult && (
                  <div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>Progress</span>
                      <span>{sessionResult.passedSteps + sessionResult.failedSteps}/{sessionResult.totalSteps} steps</span>
                    </div>
                    <Progress value={passRate} className="h-2" />
                  </div>
                )}

                {/* Steps List */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Step Execution
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-72">
                      <div className="space-y-2 pr-2">
                        {(sessionResult?.steps || []).map((step, i) => (
                          <StepRow key={step.id} step={step} index={i} />
                        ))}
                        {(sessionResult?.steps || []).length === 0 && (
                          <div className="text-center py-8 text-muted-foreground text-sm">
                            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                            Waiting for steps...
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>

              {/* Right: Live Logs */}
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Terminal className="h-4 w-4" />
                      Agent Logs
                      {isStreaming && <span className="ml-auto text-xs text-emerald-500 animate-pulse">● Live</span>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <LogStream logs={liveLogs} />
                  </CardContent>
                </Card>

                {/* DOM snapshot from session */}
                {sessionResult?.domSnapshot && (
                  <DOMInspector dom={sessionResult.domSnapshot} />
                )}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── DOM TAB ────────────────────────────────────────────────────── */}
        <TabsContent value="dom" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="h-4 w-4 text-emerald-500" />
                Capture DOM Intelligence
              </CardTitle>
              <CardDescription>Extract accessibility tree + semantic elements from any URL</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  placeholder="https://your-app.com"
                  value={domUrl}
                  onChange={e => setDomUrl(e.target.value)}
                  className="font-mono text-sm"
                />
                <Button
                  onClick={() => domCaptureMutation.mutate(domUrl)}
                  disabled={domCaptureMutation.isPending || !domUrl}
                >
                  {domCaptureMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <><TreePine className="h-4 w-4 mr-1" />Capture</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
          {capturedDOM && <DOMInspector dom={capturedDOM} />}
        </TabsContent>

        {/* ── SCREENSHOTS TAB ────────────────────────────────────────────── */}
        <TabsContent value="screenshots" className="mt-4">
          {!sessionResult?.screenshots?.length ? (
            <div className="text-center py-16 text-muted-foreground">
              <Eye className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Screenshots will appear after running a session.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sessionResult.screenshots.map((ss, i) => (
                <Card key={i} className="overflow-hidden">
                  <div className="relative">
                    <img
                      src={`data:image/jpeg;base64,${ss.screenshot}`}
                      alt={ss.label}
                      className="w-full object-cover max-h-40"
                    />
                    <div className="absolute top-2 left-2">
                      <Badge variant="secondary" className="text-xs font-mono">
                        Step {ss.stepIndex + 1}
                      </Badge>
                    </div>
                  </div>
                  <CardContent className="p-2">
                    <p className="text-xs text-muted-foreground truncate">{ss.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── MEMORY TAB ────────────────────────────────────────────────── */}
        <TabsContent value="memory" className="space-y-4 mt-4">
          <Button variant="outline" size="sm" onClick={fetchMemoryStats}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh Stats
          </Button>
          {memoryStats ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Selector Cache", value: memoryStats.selectorCacheSize, icon: Code2, color: "text-violet-500" },
                { label: "Page States", value: memoryStats.pageStateCacheSize, icon: Globe, color: "text-blue-500" },
                { label: "Workflows", value: memoryStats.workflowHistorySize, icon: Activity, color: "text-emerald-500" },
                { label: "Patterns", value: memoryStats.elementPatternsSize, icon: Brain, color: "text-amber-500" },
              ].map(stat => (
                <Card key={stat.label}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <stat.icon className={`h-8 w-8 ${stat.color} opacity-80`} />
                    <div>
                      <p className="text-2xl font-bold">{stat.value}</p>
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Loading memory stats...</p>
          )}
          {memoryStats?.topSelectors?.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Top Learned Selectors</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {memoryStats.topSelectors.map((s: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 text-sm">
                      <span className="text-muted-foreground font-mono w-5 text-right">{i+1}</span>
                      <span className="flex-1 truncate">{s.description}</span>
                      <Badge variant="outline" className="text-xs">{s.hits} hits</Badge>
                      <Badge variant="secondary" className="text-xs">{Math.round(s.successRate * 100)}%</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
