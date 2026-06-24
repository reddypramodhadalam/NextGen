/**
 * AITAS Knowledge Base Page
 * ═══════════════════════════════════════════════════════════════════════════════
 * UI for managing knowledge sources, viewing extracted knowledge, and governance rules
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState } from "react";
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
  Layers
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
  { value: "CUSTOM_URL", label: "Custom URL", icon: ExternalLink },
];

const MODULE_TAGS = [
  // JDE
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

  // Create source mutation
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
            Knowledge Base
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage knowledge sources for intelligent test generation
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
            isLoading={createSourceMutation.isPending}
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
                      : "Add knowledge sources to start building your knowledge base."}
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

// Add Source Dialog Component
function AddSourceDialog({ 
  onSubmit, 
  isLoading 
}: { 
  onSubmit: (data: Partial<KnowledgeSource>) => void;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    name: "",
    sourceType: "",
    sourceUrl: "",
    moduleTag: "",
    application: "",
    authType: "NONE",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Derive application from moduleTag
    const moduleInfo = MODULE_TAGS.find(m => m.value === formData.moduleTag);
    const application = moduleInfo?.app || "CUSTOM";
    
    onSubmit({
      ...formData,
      application,
    });
  };

  return (
    <DialogContent className="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle>Add Knowledge Source</DialogTitle>
        <DialogDescription>
          Add a new source to extract knowledge for test generation.
        </DialogDescription>
      </DialogHeader>
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
            Module tag determines how knowledge is classified and retrieved.
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
    </DialogContent>
  );
}
