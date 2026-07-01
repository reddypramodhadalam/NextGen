/**
 * AITAS AI Knowledge Hub Page
 * ═══════════════════════════════════════════════════════════════════════════════
 * UI for managing knowledge sources, viewing extracted knowledge, and governance rules
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Database, 
  Plus, 
  RefreshCw, 
  Trash2, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Settings,
  FileText,
  Shield,
  Search,
  Filter,
  Github,
  FileCode,
  Layers,
  Upload,
  FileImage,
  FileType2,
  Presentation,
  Eye,
  X,
  Sparkles,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

// Types
interface KnowledgeSource {
  id: string;
  name: string;
  sourceType: string;
  sourceUrl: string;
  moduleTag: string;
  application: string;
  status: string;
  documentCount: number;
  lastIngested?: string;
  errorMessage?: string;
  createdAt: string;
}

interface GovernanceRule {
  id: string;
  application: string;
  module: string;
  requiredObjects: string[];
  requiredTables: string[];
  requiredValidations: string[];
  blockedTestTypes: string[];
  blockedPatterns: string[];
  businessFlowOrder: string[];
  isActive: boolean;
}

interface KnowledgeStats {
  totalSources: number;
  sourcesByStatus: Record<string, number>;
  sourcesByApplication: Record<string, number>;
  totalDocuments: number;
  totalGovernanceRules: number;
  activeGovernanceRules: number;
}

const SOURCE_TYPES = [
  { value: "GITHUB", label: "GitHub Repository", icon: Github },
  { value: "BITBUCKET", label: "Bitbucket Repository", icon: FileCode },
  { value: "ORACLE_DOCS", label: "Oracle Documentation", icon: FileText },
  { value: "SAP_DOCS", label: "SAP Documentation", icon: FileText },
  { value: "SALESFORCE_DOCS", label: "Salesforce Documentation", icon: FileText },
  { value: "JIRA", label: "Jira Project", icon: Layers },
  { value: "CONFLUENCE", label: "Confluence Space", icon: FileText },
  { value: "SHAREPOINT", label: "SharePoint Site", icon: Database },
  { value: "CUSTOM_URL", label: "Custom URL", icon: ExternalLink },
];

const FILE_TYPE_INFO = [
  { ext: ".pptx,.ppt", label: "PowerPoint", icon: Presentation, color: "text-orange-600" },
  { ext: ".pdf", label: "PDF", icon: FileText, color: "text-red-600" },
  { ext: ".docx,.doc", label: "Word Document", icon: FileType2, color: "text-blue-600" },
  { ext: ".png,.jpg,.jpeg,.gif,.bmp,.webp", label: "Images (OCR)", icon: FileImage, color: "text-purple-600" },
  { ext: ".txt,.md,.csv", label: "Text/Markdown", icon: FileText, color: "text-gray-600" },
];

const ACCEPTED_FILE_EXTENSIONS =
  ".pptx,.ppt,.pdf,.docx,.doc,.png,.jpg,.jpeg,.gif,.bmp,.webp,.txt,.md,.csv";

const MODULE_TAGS = [
  // JDE — whole functional-spec / customization sets (all modules)
  { value: "JDE_CUSTOMIZATION", label: "JDE - Customization Spec (All Modules)", app: "JDE" },
  { value: "JDE_FUNCTIONAL_SPEC", label: "JDE - Functional Spec (All Modules)", app: "JDE" },
  // JDE — specific modules
  { value: "JDE_PROCUREMENT", label: "JDE - Procurement", app: "JDE" },
  { value: "JDE_ORDER_MANAGEMENT", label: "JDE - Order Management", app: "JDE" },
  { value: "JDE_ACCOUNTS_PAYABLE", label: "JDE - Accounts Payable", app: "JDE" },
  { value: "JDE_ACCOUNTS_RECEIVABLE", label: "JDE - Accounts Receivable", app: "JDE" },
  { value: "JDE_GENERAL_LEDGER", label: "JDE - General Ledger", app: "JDE" },
  { value: "JDE_INVENTORY", label: "JDE - Inventory", app: "JDE" },
  // SAP
  { value: "SAP_MM", label: "SAP - Materials Management", app: "SAP" },
  { value: "SAP_SD", label: "SAP - Sales & Distribution", app: "SAP" },
  { value: "SAP_FI", label: "SAP - Financial Accounting", app: "SAP" },
  { value: "SAP_PP", label: "SAP - Production Planning", app: "SAP" },
  // Salesforce
  { value: "SF_SALES", label: "Salesforce - Sales Cloud", app: "SALESFORCE" },
  { value: "SF_SERVICE", label: "Salesforce - Service Cloud", app: "SALESFORCE" },
  // General / Custom — for documents that don't belong to a specific ERP module
  { value: "GENERAL_PROCESS", label: "General - Process / Work Instruction", app: "CUSTOM" },
  { value: "GENERAL_FUNCTIONAL", label: "General - Functional Spec", app: "CUSTOM" },
  { value: "GENERAL_OTHER", label: "General - Other / Uncategorized", app: "CUSTOM" },
];

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-800",
  INGESTING: "bg-blue-100 text-blue-800",
  CLASSIFYING: "bg-purple-100 text-purple-800",
  EXTRACTING: "bg-indigo-100 text-indigo-800",
  EMBEDDING: "bg-cyan-100 text-cyan-800",
  READY: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
};

const STATUS_ICONS: Record<string, typeof CheckCircle2> = {
  PENDING: Clock,
  INGESTING: RefreshCw,
  CLASSIFYING: RefreshCw,
  EXTRACTING: RefreshCw,
  EMBEDDING: RefreshCw,
  READY: CheckCircle2,
  FAILED: AlertCircle,
};

export default function KnowledgeBasePage() {
  const [isAddSourceOpen, setIsAddSourceOpen] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<string>("all");
  const [knowledgeSearchQuery, setKnowledgeSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch stats
  const { data: stats } = useQuery<KnowledgeStats>({
    queryKey: ["/api/knowledge/stats"],
  });

  // Fetch KB integration health (DB + Vector Index + Extractors + AI client + Retrieval)
  const { data: health } = useQuery<{
    overall: "HEALTHY" | "DEGRADED" | "BROKEN";
    checks: Array<{ name: string; status: "PASS" | "WARN" | "FAIL"; detail: string }>;
    stats: { sources: number; structuredKnowledge: number; vectorIndexEntries: number };
  }>({
    queryKey: ["/api/knowledge/health"],
    queryFn: async () => {
      const r = await fetch("/api/knowledge/health", { credentials: "include" });
      return r.json();
    },
    refetchInterval: 60000, // refresh every minute
  });

  // Fetch sources
  const { data: sources, isLoading: sourcesLoading } = useQuery<KnowledgeSource[]>({
    queryKey: ["/api/knowledge/sources"],
  });

  // Fetch governance rules
  const { data: governanceRules } = useQuery<GovernanceRule[]>({
    queryKey: ["/api/knowledge/governance"],
  });

  // Fetch structured knowledge - fetch all when no search, or filter by objectName
  const { data: structuredKnowledge, isLoading: knowledgeLoading, refetch: refetchKnowledge } = useQuery<any[]>({
    queryKey: ["/api/knowledge/knowledge", knowledgeSearchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (knowledgeSearchQuery.trim()) {
        params.set("objectName", knowledgeSearchQuery.trim());
      }
      const url = `/api/knowledge/knowledge${params.toString() ? `?${params}` : ""}`;
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch knowledge");
      return response.json();
    },
  });

  // Handle search
  const handleKnowledgeSearch = () => {
    setIsSearching(true);
    refetchKnowledge().finally(() => setIsSearching(false));
  };

  // Create source mutation (URL-based)
  const createSourceMutation = useMutation({
    mutationFn: async (data: Partial<KnowledgeSource>) => {
      return apiRequest("POST", "/api/knowledge/sources", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/stats"] });
      setIsAddSourceOpen(false);
      toast({
        title: "Knowledge Source Added",
        description: "The source has been added and ingestion will begin shortly.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add knowledge source",
        variant: "destructive",
      });
    },
  });

  // File upload mutation (PPT/PDF/Image/DOCX)
  const uploadSourceMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch("/api/knowledge/sources/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/stats"] });
      setIsAddSourceOpen(false);
      toast({
        title: "File Uploaded",
        description: "Ingestion has started. Track status in the Sources tab.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload file",
        variant: "destructive",
      });
    },
  });

  // SharePoint crawl mutation
  const sharepointMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/knowledge/sources/sharepoint", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/stats"] });
      setIsAddSourceOpen(false);
      toast({
        title: "SharePoint Crawl Started",
        description: "Each discovered file will appear as its own source. Watch the Sources tab.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "SharePoint Error",
        description: error.message || "SharePoint crawl failed",
        variant: "destructive",
      });
    },
  });

  // SharePoint SSO browser-crawl mutation (no token)
  const sharepointSsoMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/knowledge/sources/sharepoint-sso", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/stats"] });
      setIsAddSourceOpen(false);
      toast({
        title: "SharePoint SSO Crawl Started",
        description:
          "A Chrome window will open — sign in once if prompted. Discovered files appear in the Sources tab.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "SharePoint SSO Error",
        description: error.message || "SharePoint SSO crawl failed",
        variant: "destructive",
      });
    },
  });

  // Delete source mutation
  const deleteSourceMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/knowledge/sources/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/stats"] });
      toast({
        title: "Source Deleted",
        description: "The knowledge source has been removed.",
      });
    },
  });

  // Re-ingest mutation
  const reingestMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/knowledge/sources/${id}/reingest`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/sources"] });
      toast({
        title: "Re-ingestion Started",
        description: "The source will be re-processed.",
      });
    },
  });

  const filteredSources = sources?.filter(s => 
    selectedApplication === "all" || s.application === selectedApplication
  );

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Database className="h-8 w-8 text-primary" />
            AI Knowledge Hub
            {health && (
              <Badge
                className={
                  health.overall === "HEALTHY"
                    ? "bg-green-100 text-green-800 border-green-300"
                    : health.overall === "DEGRADED"
                    ? "bg-amber-100 text-amber-800 border-amber-300"
                    : "bg-red-100 text-red-800 border-red-300"
                }
                title={health.checks.map((c) => `${c.status === "PASS" ? "✓" : c.status === "WARN" ? "⚠" : "✗"} ${c.name}: ${c.detail}`).join("\n")}
              >
                {health.overall === "HEALTHY" ? "✓ " : health.overall === "DEGRADED" ? "⚠ " : "✗ "}
                {health.overall}
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage knowledge sources for intelligent test generation
            {health && health.stats && (
              <span className="ml-2 text-xs">
                · {health.stats.sources} sources · {health.stats.structuredKnowledge} knowledge items · {health.stats.vectorIndexEntries} indexed for RAG
              </span>
            )}
          </p>
        </div>
        <Dialog open={isAddSourceOpen} onOpenChange={setIsAddSourceOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Source
            </Button>
          </DialogTrigger>
          <AddSourceDialog 
            onSubmit={(data) => createSourceMutation.mutate(data)}
            onUpload={(formData) => uploadSourceMutation.mutate(formData)}
            onSharepoint={(data) => sharepointMutation.mutate(data)}
            onSharepointSso={(data) => sharepointSsoMutation.mutate(data)}
            isLoading={createSourceMutation.isPending || uploadSourceMutation.isPending || sharepointMutation.isPending || sharepointSsoMutation.isPending}
          />
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Sources
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalSources || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Documents Indexed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalDocuments || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Governance Rules
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeGovernanceRules || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ready Sources
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats?.sourcesByStatus?.READY || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="sources" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sources" className="gap-2">
            <Database className="h-4 w-4" />
            Sources
          </TabsTrigger>
          <TabsTrigger value="governance" className="gap-2">
            <Shield className="h-4 w-4" />
            Governance Rules
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="gap-2">
            <Search className="h-4 w-4" />
            Browse Knowledge
          </TabsTrigger>
        </TabsList>

        {/* Sources Tab */}
        <TabsContent value="sources" className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedApplication} onValueChange={setSelectedApplication}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by app" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Applications</SelectItem>
                  <SelectItem value="JDE">Oracle JDE</SelectItem>
                  <SelectItem value="SAP">SAP</SelectItem>
                  <SelectItem value="SALESFORCE">Salesforce</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Documents</TableHead>
                  <TableHead>Last Ingested</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sourcesLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : filteredSources?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No knowledge sources configured. Add your first source to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSources?.map((source) => {
                    const StatusIcon = STATUS_ICONS[source.status] || Clock;
                    return (
                      <TableRow key={source.id}>
                        <TableCell>
                          <div className="font-medium">{source.name}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {source.sourceUrl}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{source.sourceType}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{source.moduleTag}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[source.status]}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {source.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{source.documentCount}</TableCell>
                        <TableCell>
                          {source.lastIngested 
                            ? new Date(source.lastIngested).toLocaleDateString()
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => reingestMutation.mutate(source.id)}
                              disabled={source.status === "INGESTING"}
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => window.open(source.sourceUrl, "_blank")}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteSourceMutation.mutate(source.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Governance Rules Tab */}
        <TabsContent value="governance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Module Governance Rules</CardTitle>
              <CardDescription>
                Rules that ensure test cases include required objects, tables, and validations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Application</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Required Objects</TableHead>
                    <TableHead>Required Tables</TableHead>
                    <TableHead>Blocked Types</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {governanceRules?.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell>
                        <Badge variant="outline">{rule.application}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{rule.module}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {rule.requiredObjects.slice(0, 3).map((obj) => (
                            <Badge key={obj} variant="secondary" className="text-xs">
                              {obj}
                            </Badge>
                          ))}
                          {rule.requiredObjects.length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{rule.requiredObjects.length - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {rule.requiredTables.slice(0, 3).map((tbl) => (
                            <Badge key={tbl} variant="secondary" className="text-xs">
                              {tbl}
                            </Badge>
                          ))}
                          {rule.requiredTables.length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{rule.requiredTables.length - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {rule.blockedTestTypes.map((type) => (
                          <Badge key={type} variant="destructive" className="text-xs mr-1">
                            {type}
                          </Badge>
                        ))}
                      </TableCell>
                      <TableCell>
                        <Badge className={rule.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                          {rule.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Browse Knowledge Tab */}
        <TabsContent value="knowledge" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Browse Extracted Knowledge</CardTitle>
              <CardDescription>
                Search and view structured knowledge extracted from your sources
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 mb-4">
                <Input 
                  placeholder="Search by object name (e.g., P4310, ME21N)..." 
                  className="max-w-md" 
                  value={knowledgeSearchQuery}
                  onChange={(e) => setKnowledgeSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleKnowledgeSearch()}
                />
                <Button 
                  variant="outline" 
                  onClick={handleKnowledgeSearch}
                  disabled={isSearching || knowledgeLoading}
                >
                  {isSearching || knowledgeLoading ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4 mr-2" />
                  )}
                  Search
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setKnowledgeSearchQuery("");
                    refetchKnowledge();
                  }}
                >
                  Clear
                </Button>
              </div>
              
              {knowledgeLoading ? (
                <div className="text-center py-12 text-muted-foreground">
                  <RefreshCw className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
                  <p>Loading knowledge...</p>
                </div>
              ) : structuredKnowledge && structuredKnowledge.length > 0 ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Found {structuredKnowledge.length} knowledge item(s)
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Object</TableHead>
                        <TableHead>Application</TableHead>
                        <TableHead>Module</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Test Points</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {structuredKnowledge.map((item: any) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Badge variant="outline" className="font-mono">
                              {item.objectName}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={
                              item.application === "JDE" ? "bg-blue-100 text-blue-800" :
                              item.application === "SAP" ? "bg-orange-100 text-orange-800" :
                              item.application === "SALESFORCE" ? "bg-cyan-100 text-cyan-800" :
                              "bg-gray-100 text-gray-800"
                            }>
                              {item.application}
                            </Badge>
                          </TableCell>
                          <TableCell>{item.module}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{item.knowledgeType}</Badge>
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {item.facts?.description || "-"}
                          </TableCell>
                          <TableCell>
                            {item.facts?.testPoints?.length > 0 ? (
                              <span className="text-sm text-muted-foreground">
                                {item.facts.testPoints.length} test point(s)
                              </span>
                            ) : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  
                  {/* Expandable details for each knowledge item */}
                  <div className="space-y-4 mt-6">
                    <h4 className="font-semibold">Knowledge Details</h4>
                    {structuredKnowledge.map((item: any) => (
                      <Card key={item.id} className="p-4">
                        <div className="flex items-start gap-4">
                          <Badge variant="outline" className="font-mono text-lg px-3 py-1">
                            {item.objectName}
                          </Badge>
                          <div className="flex-1 space-y-3">
                            <div>
                              <h5 className="font-medium">{item.facts?.description || item.objectName}</h5>
                              <p className="text-sm text-muted-foreground">
                                {item.application} / {item.module} / {item.knowledgeType}
                              </p>
                            </div>
                            
                            {item.facts?.requiredFields && item.facts.requiredFields.length > 0 && (
                              <div>
                                <p className="text-sm font-medium mb-1">Required Fields:</p>
                                <div className="flex flex-wrap gap-1">
                                  {item.facts.requiredFields.map((field: string, i: number) => (
                                    <Badge key={i} variant="secondary" className="text-xs">
                                      {field}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {item.facts?.tables && item.facts.tables.length > 0 && (
                              <div>
                                <p className="text-sm font-medium mb-1">Tables:</p>
                                <div className="flex flex-wrap gap-1">
                                  {item.facts.tables.map((table: string, i: number) => (
                                    <Badge key={i} variant="outline" className="text-xs font-mono">
                                      {table}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {item.facts?.testPoints && item.facts.testPoints.length > 0 && (
                              <div>
                                <p className="text-sm font-medium mb-1">Test Points:</p>
                                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                  {item.facts.testPoints.map((point: string, i: number) => (
                                    <li key={i}>{point}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            
                            {item.facts?.validations && item.facts.validations.length > 0 && (
                              <div>
                                <p className="text-sm font-medium mb-1">Validations:</p>
                                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                  {item.facts.validations.map((val: string, i: number) => (
                                    <li key={i}>{val}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No knowledge found{knowledgeSearchQuery ? ` for "${knowledgeSearchQuery}"` : ""}.</p>
                  <p className="text-sm mt-2">
                    {sources && sources.length > 0 
                      ? "Try a different search term, or click 'Refresh' on a source to re-ingest."
                      : "Add knowledge sources to start building your AI Knowledge Hub."}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Add Source Dialog Component — supports URL + File Upload + SharePoint with preview
function AddSourceDialog({
  onSubmit,
  onUpload,
  onSharepoint,
  onSharepointSso,
  isLoading,
}: {
  onSubmit: (data: Partial<KnowledgeSource>) => void;
  onUpload: (formData: FormData) => void;
  onSharepoint: (data: any) => void;
  onSharepointSso: (data: any) => void;
  isLoading: boolean;
}) {
  const [tab, setTab] = useState<"url" | "file" | "sharepoint">("url");

  // URL form state
  const [formData, setFormData] = useState({
    name: "",
    sourceType: "",
    sourceUrl: "",
    moduleTag: "",
    application: "",
    authType: "NONE",
  });

  // File upload state
  const [file, setFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadModuleTag, setUploadModuleTag] = useState("");
  // Free-text application identity (e.g. "Model N"). For non-ERP specs this lets
  // the knowledge be stored under its OWN application name instead of a generic
  // "CUSTOM", so it can later be retrieved/scoped precisely during generation.
  const [uploadAppName, setUploadAppName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // SharePoint form state
  const [sp, setSp] = useState({
    name: "",
    siteUrl: "",
    folderPath: "",
    accessToken: "",
    moduleTag: "",
    application: "" as "JDE" | "SAP" | "SALESFORCE" | "CUSTOM" | "",
    applicationScope: [] as string[],
    maxFiles: 50,
    // SSO browser-crawl mode (no token). "sso" = persistent Chrome profile,
    // "graph" = Microsoft Graph + OAuth token (SharePoint Online only).
    mode: "sso" as "sso" | "graph",
    libraryUrl: "",
    recursive: true,
  });

  // Preview state
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showAllKnowledge, setShowAllKnowledge] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  const toggleItem = (i: number) =>
    setExpandedItems((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const moduleInfo = MODULE_TAGS.find((m) => m.value === formData.moduleTag);
    const application = moduleInfo?.app || "CUSTOM";
    onSubmit({ ...formData, application });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      if (!uploadName) setUploadName(f.name);
      setPreviewData(null);
      setPreviewError(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) {
      setFile(f);
      if (!uploadName) setUploadName(f.name);
      setPreviewData(null);
      setPreviewError(null);
    }
  };

  const handlePreview = async () => {
    if (!file) return;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewData(null);
    setShowAllKnowledge(false);
    setExpandedItems(new Set());
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", uploadName || file.name);
      if (uploadModuleTag) fd.append("moduleTag", uploadModuleTag);
      const mt = MODULE_TAGS.find((m) => m.value === uploadModuleTag);
      // Same application-identity resolution as the real upload so the preview
      // reflects exactly what will be stored (typed name wins, nice casing).
      const previewApp =
        uploadAppName.trim() ||
        mt?.app ||
        undefined;
      if (previewApp) fd.append("application", previewApp);

      const res = await fetch("/api/knowledge/preview", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setPreviewError(json.error || "Preview failed");
      } else {
        setPreviewData(json);
      }
    } catch (e: any) {
      setPreviewError(e.message || "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleUpload = () => {
    if (!file) {
      setPreviewError("Please choose a file to upload first.");
      return;
    }
    if (!uploadModuleTag) {
      setPreviewError("Module Tag is required — pick one from the dropdown above to enable ingestion.");
      return;
    }
    setPreviewError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("name", uploadName || file.name);
    fd.append("moduleTag", uploadModuleTag);
    const mt = MODULE_TAGS.find((m) => m.value === uploadModuleTag);
    // Resolve the application identity:
    //  1) a user-typed app name (e.g. "Model N") wins — stored with its nice
    //     casing; the vector-index application filter is case-insensitive so it
    //     still matches on retrieval
    //  2) else the module's mapped ERP app (JDE/SAP/SALESFORCE)
    //  3) else CUSTOM
    const resolvedApp =
      uploadAppName.trim() ||
      mt?.app ||
      "CUSTOM";
    fd.append("application", resolvedApp);
    if (uploadAppName.trim()) fd.append("appDisplayName", uploadAppName.trim());
    fd.append("sourceType", "FILE_UPLOAD");
    onUpload(fd);
  };

  return (
    <DialogContent className="sm:max-w-[640px] max-h-[90vh] flex flex-col overflow-hidden">
      <DialogHeader>
        <DialogTitle>Add Knowledge Source</DialogTitle>
        <DialogDescription>
          Add a knowledge source from a URL or upload a document (PPT, PDF, DOCX, Image).
        </DialogDescription>
      </DialogHeader>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex flex-col flex-1 min-h-0">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="url" className="gap-2">
            <ExternalLink className="h-4 w-4" />
            URL Source
          </TabsTrigger>
          <TabsTrigger value="file" className="gap-2">
            <Upload className="h-4 w-4" />
            File Upload
          </TabsTrigger>
          <TabsTrigger value="sharepoint" className="gap-2">
            <Database className="h-4 w-4" />
            SharePoint
          </TabsTrigger>
        </TabsList>

        {/* Scrollable body — keeps the dialog header (with close ✕) and the
            tab bar pinned while long previews scroll inside this region.
            This prevents the close button from scrolling away on tall previews. */}
        <div className="flex-1 overflow-y-auto -mr-3 pr-3 mt-1">

        {/* URL TAB */}
        <TabsContent value="url" className="space-y-4 mt-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Source Name</Label>
              <Input
                id="name"
                placeholder="e.g., JDE Procurement Docs"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sourceType">Source Type</Label>
              <Select
                value={formData.sourceType}
                onValueChange={(v) => setFormData({ ...formData, sourceType: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select source type" />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_TYPES.map((type) => (
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
              <Label htmlFor="sourceUrl">Source URL</Label>
              <Input
                id="sourceUrl"
                placeholder="https://..."
                value={formData.sourceUrl}
                onChange={(e) => setFormData({ ...formData, sourceUrl: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="moduleTag">Module Tag (Required)</Label>
              <Select
                value={formData.moduleTag}
                onValueChange={(v) => setFormData({ ...formData, moduleTag: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select module" />
                </SelectTrigger>
                <SelectContent>
                  {MODULE_TAGS.map((tag) => (
                    <SelectItem key={tag.value} value={tag.value}>
                      {tag.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Determines how knowledge is classified and retrieved.
              </p>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Source
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </TabsContent>

        {/* FILE UPLOAD TAB */}
        <TabsContent value="file" className="space-y-4 mt-4">
          {/* Drag-drop zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/40 transition"
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={ACCEPTED_FILE_EXTENSIONS}
              onChange={handleFileChange}
            />
            {file ? (
              <div className="space-y-2">
                <CheckCircle2 className="h-10 w-10 mx-auto text-green-600" />
                <p className="font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB · {file.type || "unknown type"}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    setPreviewData(null);
                    setUploadName("");
                  }}
                >
                  <X className="h-3 w-3 mr-1" /> Remove
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                <p className="font-medium">Click to upload or drag &amp; drop</p>
                <p className="text-xs text-muted-foreground">
                  Max 50MB · Supported file types below
                </p>
              </div>
            )}
          </div>

          {/* Supported file types */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {FILE_TYPE_INFO.map((ft) => (
              <div
                key={ft.label}
                className="flex items-center gap-2 px-2 py-1 border rounded text-xs"
              >
                <ft.icon className={`h-4 w-4 ${ft.color}`} />
                <span className="font-medium">{ft.label}</span>
              </div>
            ))}
          </div>

          {/* Form fields */}
          <div className="space-y-2">
            <Label htmlFor="uploadName">Display Name</Label>
            <Input
              id="uploadName"
              placeholder="e.g., Order-to-Cash Process Doc"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="uploadAppName" className="flex items-center gap-1.5">
              Application Name
              <span className="text-[11px] font-normal text-muted-foreground">
                — the system this document describes
              </span>
            </Label>
            <Input
              id="uploadAppName"
              placeholder="e.g., Model N, Workday, Coupa (leave blank for ERP modules)"
              value={uploadAppName}
              onChange={(e) => setUploadAppName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              For non-ERP specs, name the app (e.g. <span className="font-medium">Model N</span>) so its
              knowledge is stored under its own identity and can be precisely grounded during test
              generation — instead of a generic "CUSTOM".
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="uploadModuleTag" className="flex items-center gap-1.5">
              Module Tag <span className="text-destructive">*</span>
              {file && !uploadModuleTag && (
                <span className="text-[11px] font-normal text-amber-600 dark:text-amber-400">
                  — required to enable ingestion
                </span>
              )}
            </Label>
            <Select value={uploadModuleTag} onValueChange={setUploadModuleTag}>
              <SelectTrigger
                className={cn(
                  file && !uploadModuleTag && "border-amber-500/60 ring-1 ring-amber-500/30"
                )}
              >
                <SelectValue placeholder="Select module (required)" />
              </SelectTrigger>
              <SelectContent>
                {MODULE_TAGS.map((tag) => (
                  <SelectItem key={tag.value} value={tag.value}>
                    {tag.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Not an ERP doc? Use a <span className="font-medium">General</span> option at the bottom of the list.
            </p>
          </div>

          {previewError && (
            <div className="border border-destructive/40 bg-destructive/10 text-destructive p-3 rounded text-sm">
              {previewError}
            </div>
          )}

          {/* Preview shown inline */}
          {previewData && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-foreground">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Preview Result
                </CardTitle>
                <CardDescription className="text-xs">
                  Extracted {previewData.extraction?.units} units ·{" "}
                  {previewData.extraction?.wordCount} words
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="border rounded p-2 bg-card">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {previewData.counts?.valid || 0}
                    </div>
                    <div className="text-xs text-muted-foreground">Valid</div>
                  </div>
                  <div className="border rounded p-2 bg-card">
                    <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                      {previewData.counts?.rejected || 0}
                    </div>
                    <div className="text-xs text-muted-foreground">Rejected</div>
                  </div>
                  <div className="border rounded p-2 bg-card">
                    <div className="text-2xl font-bold text-foreground">
                      {previewData.counts?.total || 0}
                    </div>
                    <div className="text-xs text-muted-foreground">Total</div>
                  </div>
                </div>

                {previewData.knowledge?.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-foreground">
                      Knowledge items found ({previewData.knowledge.length}):
                    </div>
                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                      {(showAllKnowledge
                        ? previewData.knowledge
                        : previewData.knowledge.slice(0, 5)
                      ).map((k: any, i: number) => {
                        const isOpen = expandedItems.has(i);
                        const facts = k.facts || {};
                        const hasDetail =
                          !!facts.description ||
                          (facts.requiredFields?.length ?? 0) > 0 ||
                          (facts.tables?.length ?? 0) > 0 ||
                          (facts.testPoints?.length ?? 0) > 0 ||
                          (facts.validations?.length ?? 0) > 0;
                        return (
                          <div
                            key={i}
                            className="text-xs border rounded bg-card text-card-foreground overflow-hidden"
                          >
                            <button
                              type="button"
                              onClick={() => hasDetail && toggleItem(i)}
                              className={cn(
                                "w-full flex items-center justify-between gap-2 p-2 text-left",
                                hasDetail && "hover:bg-muted/50 cursor-pointer"
                              )}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {hasDetail ? (
                                  isOpen ? (
                                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  )
                                ) : (
                                  <span className="w-3.5 shrink-0" />
                                )}
                                <Badge variant="outline" className="font-mono shrink-0">
                                  {k.objectName}
                                </Badge>
                                <span className="truncate text-muted-foreground">
                                  {facts.description?.slice(0, 60) || "—"}
                                </span>
                              </div>
                              <Badge variant="secondary" className="text-xs shrink-0">
                                {k.confidenceScore}%
                              </Badge>
                            </button>

                            {isOpen && hasDetail && (
                              <div className="border-t bg-muted/30 p-2.5 space-y-2">
                                {facts.description && (
                                  <p className="text-muted-foreground leading-relaxed">
                                    {facts.description}
                                  </p>
                                )}
                                {facts.requiredFields?.length > 0 && (
                                  <div>
                                    <p className="font-medium text-foreground mb-1">Required Fields:</p>
                                    <div className="flex flex-wrap gap-1">
                                      {facts.requiredFields.map((f: string, j: number) => (
                                        <Badge key={j} variant="secondary" className="text-[10px]">{f}</Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {facts.tables?.length > 0 && (
                                  <div>
                                    <p className="font-medium text-foreground mb-1">Tables:</p>
                                    <div className="flex flex-wrap gap-1">
                                      {facts.tables.map((t: string, j: number) => (
                                        <Badge key={j} variant="outline" className="text-[10px] font-mono">{t}</Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {facts.testPoints?.length > 0 && (
                                  <div>
                                    <p className="font-medium text-foreground mb-1">
                                      Test Points ({facts.testPoints.length}):
                                    </p>
                                    <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                                      {facts.testPoints.map((p: string, j: number) => (
                                        <li key={j}>{p}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                {facts.validations?.length > 0 && (
                                  <div>
                                    <p className="font-medium text-foreground mb-1">
                                      Validations ({facts.validations.length}):
                                    </p>
                                    <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                                      {facts.validations.map((v: string, j: number) => (
                                        <li key={j}>{v}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {previewData.knowledge.length > 5 && (
                      <button
                        type="button"
                        onClick={() => setShowAllKnowledge((v) => !v)}
                        className="text-xs text-primary hover:underline w-full text-center pt-1"
                      >
                        {showAllKnowledge
                          ? "Show less"
                          : `Show all ${previewData.knowledge.length} items`}
                      </button>
                    )}
                  </div>
                )}

                {previewData.extraction?.warnings?.length > 0 && (
                  <div className="text-xs">
                    <div className="font-medium text-amber-600 dark:text-amber-400">Warnings:</div>
                    <ul className="list-disc list-inside text-muted-foreground">
                      {previewData.extraction.warnings
                        .slice(0, 3)
                        .map((w: string, i: number) => (
                          <li key={i}>{w}</li>
                        ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            </DialogClose>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:items-center">
              {file && !uploadModuleTag && (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  Pick a Module Tag above
                </span>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={handlePreview}
                disabled={!file || previewLoading}
              >
                {previewLoading ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Previewing...
                  </>
                ) : (
                  <>
                    <Eye className="mr-2 h-4 w-4" />
                    Preview
                  </>
                )}
              </Button>
              <Button
                type="button"
                onClick={handleUpload}
                disabled={!file || isLoading}
                title={!uploadModuleTag ? "Select a Module Tag first" : undefined}
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload &amp; Ingest
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </TabsContent>

        {/* SHAREPOINT TAB */}
        <TabsContent value="sharepoint" className="space-y-4 mt-4">
          {/* Mode toggle: SSO browser (no token) vs Graph API (token) */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSp({ ...sp, mode: "sso" })}
              className={cn(
                "rounded border p-3 text-left text-xs transition",
                sp.mode === "sso"
                  ? "border-primary bg-primary/10 ring-1 ring-primary"
                  : "border-border hover:bg-muted/50"
              )}
            >
              <div className="flex items-center gap-2 font-medium text-sm">
                <Database className="h-4 w-4" /> SSO Browser
                <Badge variant="secondary" className="ml-auto">No token</Badge>
              </div>
              <p className="mt-1 text-muted-foreground">
                Best for on-prem / SSO sites (e.g. worksites.baxter.com). Opens Chrome, you sign in once, then it crawls.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setSp({ ...sp, mode: "graph" })}
              className={cn(
                "rounded border p-3 text-left text-xs transition",
                sp.mode === "graph"
                  ? "border-primary bg-primary/10 ring-1 ring-primary"
                  : "border-border hover:bg-muted/50"
              )}
            >
              <div className="flex items-center gap-2 font-medium text-sm">
                <ExternalLink className="h-4 w-4" /> Graph API
                <Badge variant="secondary" className="ml-auto">Token</Badge>
              </div>
              <p className="mt-1 text-muted-foreground">
                For SharePoint Online. Needs an OAuth token with Sites.Read.All + Files.Read.All.
              </p>
            </button>
          </div>

          {sp.mode === "sso" ? (
            /* ─────────────── SSO BROWSER CRAWL (no token) ─────────────── */
            <div className="space-y-4">
              <div className="rounded border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                <strong>SSO Browser Crawl:</strong> Paste the SharePoint document-library link from your browser
                (the URL with <code>RootFolder=…</code>). AITAS opens Chrome using the same profile as your JDE tests —
                sign in once if prompted — then recursively downloads every PDF/PPT/DOCX/Image and runs each through the
                ingestion pipeline. <strong>No token needed.</strong>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ssoName">Display Name</Label>
                <Input
                  id="ssoName"
                  placeholder="e.g., JDE Supply Chain SOPs"
                  value={sp.name}
                  onChange={(e) => setSp({ ...sp, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ssoLibraryUrl">SharePoint Library URL</Label>
                <Input
                  id="ssoLibraryUrl"
                  placeholder="https://worksites.baxter.com/sites/.../Forms/AllItems.aspx?RootFolder=/sites/.../SOP"
                  value={sp.libraryUrl}
                  onChange={(e) => setSp({ ...sp, libraryUrl: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Copy this straight from your browser's address bar while viewing the folder. The
                  <code> RootFolder </code> part tells AITAS which folder to crawl.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="ssoApp">Application</Label>
                  <Select value={sp.application} onValueChange={(v: any) => setSp({ ...sp, application: v })}>
                    <SelectTrigger><SelectValue placeholder="Select application" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="JDE">JDE</SelectItem>
                      <SelectItem value="SAP">SAP</SelectItem>
                      <SelectItem value="SALESFORCE">Salesforce</SelectItem>
                      <SelectItem value="CUSTOM">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ssoMaxFiles">Max Files</Label>
                  <Input
                    id="ssoMaxFiles"
                    type="number"
                    min={1}
                    max={500}
                    value={sp.maxFiles}
                    onChange={(e) => setSp({ ...sp, maxFiles: parseInt(e.target.value) || 50 })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ssoModuleTag">Module Tag</Label>
                <Select value={sp.moduleTag} onValueChange={(v) => setSp({ ...sp, moduleTag: v })}>
                  <SelectTrigger><SelectValue placeholder="Select module" /></SelectTrigger>
                  <SelectContent>
                    {MODULE_TAGS.map((tag) => (
                      <SelectItem key={tag.value} value={tag.value}>
                        {tag.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={sp.recursive}
                  onChange={(e) => setSp({ ...sp, recursive: e.target.checked })}
                />
                Crawl subfolders recursively (recommended — your SOP folder has nested subfolders)
              </label>

              <DialogFooter>
                <Button
                  type="button"
                  onClick={() => {
                    if (!sp.libraryUrl || !sp.application || !sp.moduleTag) return;
                    onSharepointSso({
                      name: sp.name || `SharePoint (SSO): ${sp.libraryUrl}`,
                      libraryUrl: sp.libraryUrl,
                      application: sp.application,
                      moduleTag: sp.moduleTag,
                      recursive: sp.recursive,
                      maxFiles: sp.maxFiles,
                    });
                  }}
                  disabled={isLoading || !sp.libraryUrl || !sp.application || !sp.moduleTag}
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Starting…
                    </>
                  ) : (
                    <>
                      <Database className="mr-2 h-4 w-4" />
                      Start SSO Crawl
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          ) : (
          /* ─────────────── GRAPH API CRAWL (token) ─────────────── */
          <div className="space-y-4">
          <div className="rounded border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
            <strong>SharePoint Crawler:</strong> Recursively scans a SharePoint site, downloads every supported file (PDF/PPT/DOCX/Image), filters by application, and runs each file through the same ingestion pipeline. Each discovered file becomes its own source so you can track status.
          </div>

          <div className="space-y-2">
            <Label htmlFor="spName">Display Name</Label>
            <Input
              id="spName"
              placeholder="e.g., JDE Functional Specs"
              value={sp.name}
              onChange={(e) => setSp({ ...sp, name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="spSiteUrl">SharePoint Site URL</Label>
            <Input
              id="spSiteUrl"
              placeholder="https://contoso.sharepoint.com/sites/JDEDocs"
              value={sp.siteUrl}
              onChange={(e) => setSp({ ...sp, siteUrl: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="spFolder">Folder Path (optional)</Label>
            <Input
              id="spFolder"
              placeholder="Shared Documents/Procurement Specs"
              value={sp.folderPath}
              onChange={(e) => setSp({ ...sp, folderPath: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">Leave blank to crawl the entire site root.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="spToken">OAuth Access Token (Graph API)</Label>
            <Input
              id="spToken"
              type="password"
              placeholder="eyJ0eXAiOiJKV1QiLCJhbGc..."
              value={sp.accessToken}
              onChange={(e) => setSp({ ...sp, accessToken: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Required Graph scopes: <code>Sites.Read.All</code>, <code>Files.Read.All</code>. Token is used in memory only — never stored.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="spApp">Application</Label>
              <Select value={sp.application} onValueChange={(v: any) => setSp({ ...sp, application: v })}>
                <SelectTrigger><SelectValue placeholder="Select application" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="JDE">JDE</SelectItem>
                  <SelectItem value="SAP">SAP</SelectItem>
                  <SelectItem value="SALESFORCE">Salesforce</SelectItem>
                  <SelectItem value="CUSTOM">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="spMaxFiles">Max Files</Label>
              <Input
                id="spMaxFiles"
                type="number"
                min={1}
                max={500}
                value={sp.maxFiles}
                onChange={(e) => setSp({ ...sp, maxFiles: parseInt(e.target.value) || 50 })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="spModuleTag">Module Tag</Label>
            <Select value={sp.moduleTag} onValueChange={(v) => setSp({ ...sp, moduleTag: v })}>
              <SelectTrigger><SelectValue placeholder="Select module" /></SelectTrigger>
              <SelectContent>
                {MODULE_TAGS.map((tag) => (
                  <SelectItem key={tag.value} value={tag.value}>
                    {tag.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Application Scope (filter what gets ingested)</Label>
            <div className="flex flex-wrap gap-2">
              {["JDE", "SAP", "SALESFORCE"].map((app) => {
                const checked = sp.applicationScope.includes(app);
                return (
                  <Button
                    key={app}
                    type="button"
                    variant={checked ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setSp({
                        ...sp,
                        applicationScope: checked
                          ? sp.applicationScope.filter((a) => a !== app)
                          : [...sp.applicationScope, app],
                      });
                    }}
                  >
                    {app}
                  </Button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Only files matching these applications will be ingested. Leave empty to ingest everything.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              onClick={() => {
                if (!sp.siteUrl || !sp.accessToken || !sp.application || !sp.moduleTag) {
                  return;
                }
                onSharepoint({
                  name: sp.name || `SharePoint: ${sp.siteUrl}`,
                  siteUrl: sp.siteUrl,
                  folderPath: sp.folderPath || undefined,
                  accessToken: sp.accessToken,
                  application: sp.application,
                  moduleTag: sp.moduleTag,
                  applicationScope: sp.applicationScope.length > 0 ? sp.applicationScope : undefined,
                  maxFiles: sp.maxFiles,
                });
              }}
              disabled={
                isLoading ||
                !sp.siteUrl ||
                !sp.accessToken ||
                !sp.application ||
                !sp.moduleTag
              }
            >
              {isLoading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Crawling...
                </>
              ) : (
                <>
                  <Database className="mr-2 h-4 w-4" />
                  Start SharePoint Crawl
                </>
              )}
            </Button>
          </DialogFooter>
          </div>
          )}
        </TabsContent>
        </div>
      </Tabs>
    </DialogContent>
  );
}
