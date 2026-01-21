import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { PriorityBadge } from "@/components/priority-badge";
import { EmptyState } from "@/components/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  FolderOpen,
  Plus,
  Search,
  TestTube2,
  Sparkles,
  MoreVertical,
  Trash2,
  Loader2,
  Upload,
  Download,
  FileJson,
  Edit,
  X,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TestSuite, TestCase } from "@shared/schema";

type TestStep = { step: string; expected: string };

interface TestCaseFormData {
  title: string;
  description: string;
  preconditions: string;
  targetUrl: string;
  suiteId: string;
  priority: string;
  status: string;
  tags: string;
  steps: TestStep[];
}

const emptyFormData: TestCaseFormData = {
  title: "",
  description: "",
  preconditions: "",
  targetUrl: "",
  suiteId: "",
  priority: "medium",
  status: "active",
  tags: "",
  steps: [{ step: "", expected: "" }],
};

export default function Repository() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [newSuiteName, setNewSuiteName] = useState("");
  const [newSuiteDescription, setNewSuiteDescription] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [selectedImportSuite, setSelectedImportSuite] = useState("");
  const [expandedSuites, setExpandedSuites] = useState<string[]>([]);
  const [testCaseDialogOpen, setTestCaseDialogOpen] = useState(false);
  const [editingTestCase, setEditingTestCase] = useState<TestCase | null>(null);
  const [testCaseForm, setTestCaseForm] = useState<TestCaseFormData>(emptyFormData);

  const { data: suites = [], isLoading: suitesLoading } = useQuery<TestSuite[]>({
    queryKey: ["/api/test-suites"],
  });

  const { data: testCases = [], isLoading: testCasesLoading } = useQuery<TestCase[]>({
    queryKey: ["/api/test-cases"],
  });

  const createSuiteMutation = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      const res = await apiRequest("POST", "/api/test-suites", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/test-suites"] });
      toast({ title: "Suite Created", description: "New test suite has been created." });
      setNewSuiteName("");
      setNewSuiteDescription("");
      setDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create test suite.", variant: "destructive" });
    },
  });

  const deleteSuiteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/test-suites/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/test-suites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/test-cases"] });
      toast({ title: "Suite Deleted", description: "Test suite has been deleted." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete test suite.", variant: "destructive" });
    },
  });

  const deleteTestCaseMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/test-cases/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/test-cases"] });
      toast({ title: "Test Deleted", description: "Test case has been deleted." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete test case.", variant: "destructive" });
    },
  });

  const createTestCaseMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/test-cases", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/test-cases"] });
      toast({ title: "Test Case Created", description: "New test case has been created." });
      closeTestCaseDialog();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create test case.", variant: "destructive" });
    },
  });

  const updateTestCaseMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/test-cases/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/test-cases"] });
      toast({ title: "Test Case Updated", description: "Test case has been updated." });
      closeTestCaseDialog();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update test case.", variant: "destructive" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (data: { suiteId: string | null; testCases: any[] }) => {
      const res = await apiRequest("POST", "/api/test-cases/import", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/test-cases"] });
      toast({ title: "Import Successful", description: data.message });
      setImportDialogOpen(false);
      setImportJson("");
      setSelectedImportSuite("");
    },
    onError: (error: any) => {
      toast({ title: "Import Failed", description: error.message || "Failed to import test cases.", variant: "destructive" });
    },
  });

  const handleImport = () => {
    try {
      const parsed = JSON.parse(importJson);
      const testCasesToImport = Array.isArray(parsed) ? parsed : parsed.testCases || [parsed];
      if (testCasesToImport.length === 0) {
        toast({ title: "Invalid Format", description: "No test cases found in JSON.", variant: "destructive" });
        return;
      }
      importMutation.mutate({
        suiteId: selectedImportSuite || null,
        testCases: testCasesToImport,
      });
    } catch {
      toast({ title: "Invalid JSON", description: "Please check your JSON format.", variant: "destructive" });
    }
  };

  const handleExport = async () => {
    try {
      const res = await fetch("/api/test-cases/export");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "test-cases-export.json";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export Complete", description: `Exported ${data.length} test cases.` });
    } catch {
      toast({ title: "Export Failed", description: "Failed to export test cases.", variant: "destructive" });
    }
  };

  const openCreateTestCaseDialog = () => {
    setEditingTestCase(null);
    setTestCaseForm(emptyFormData);
    setTestCaseDialogOpen(true);
  };

  const openEditTestCaseDialog = (testCase: TestCase) => {
    setEditingTestCase(testCase);
    setTestCaseForm({
      title: testCase.title,
      description: testCase.description || "",
      preconditions: testCase.preconditions || "",
      targetUrl: testCase.targetUrl || "",
      suiteId: testCase.suiteId || "",
      priority: testCase.priority || "medium",
      status: testCase.status || "active",
      tags: testCase.tags?.join(", ") || "",
      steps: (testCase.steps as TestStep[]) || [{ step: "", expected: "" }],
    });
    setTestCaseDialogOpen(true);
  };

  const closeTestCaseDialog = () => {
    setTestCaseDialogOpen(false);
    setEditingTestCase(null);
    setTestCaseForm(emptyFormData);
  };

  const addStep = () => {
    setTestCaseForm((prev) => ({
      ...prev,
      steps: [...prev.steps, { step: "", expected: "" }],
    }));
  };

  const removeStep = (index: number) => {
    setTestCaseForm((prev) => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== index),
    }));
  };

  const updateStep = (index: number, field: "step" | "expected", value: string) => {
    setTestCaseForm((prev) => ({
      ...prev,
      steps: prev.steps.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    }));
  };

  const moveStepUp = (index: number) => {
    if (index === 0) return;
    setTestCaseForm((prev) => {
      const newSteps = [...prev.steps];
      [newSteps[index - 1], newSteps[index]] = [newSteps[index], newSteps[index - 1]];
      return { ...prev, steps: newSteps };
    });
  };

  const moveStepDown = (index: number) => {
    setTestCaseForm((prev) => {
      if (index === prev.steps.length - 1) return prev;
      const newSteps = [...prev.steps];
      [newSteps[index], newSteps[index + 1]] = [newSteps[index + 1], newSteps[index]];
      return { ...prev, steps: newSteps };
    });
  };

  const handleSaveTestCase = () => {
    if (!testCaseForm.title.trim()) {
      toast({ title: "Validation Error", description: "Title is required.", variant: "destructive" });
      return;
    }

    const validSteps = testCaseForm.steps.filter((s) => s.step.trim());
    const data = {
      title: testCaseForm.title.trim(),
      description: testCaseForm.description.trim() || null,
      preconditions: testCaseForm.preconditions.trim() || null,
      targetUrl: testCaseForm.targetUrl.trim() || null,
      suiteId: testCaseForm.suiteId || null,
      priority: testCaseForm.priority,
      status: testCaseForm.status,
      tags: testCaseForm.tags ? testCaseForm.tags.split(",").map((t) => t.trim()).filter(Boolean) : null,
      steps: validSteps.length > 0 ? validSteps : null,
    };

    if (editingTestCase) {
      updateTestCaseMutation.mutate({ id: editingTestCase.id, data });
    } else {
      createTestCaseMutation.mutate(data);
    }
  };

  const getTestCasesForSuite = (suiteId: string) =>
    testCases.filter((tc) => tc.suiteId === suiteId);

  const unassignedTestCases = testCases.filter((tc) => !tc.suiteId);

  const filteredSuites = suites.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredUnassigned = unassignedTestCases.filter(
    (tc) =>
      tc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tc.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isLoading = suitesLoading || testCasesLoading;

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
            <FolderOpen className="h-6 w-6 text-primary" />
            Test Repository
          </h1>
          <p className="text-muted-foreground">
            Organize and manage your test suites and cases
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={handleExport} data-testid="button-export-tests">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-import-tests">
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileJson className="h-5 w-5" />
                  Import Test Cases
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Target Suite (optional)</Label>
                  <select
                    className="w-full border rounded-md p-2 bg-background"
                    value={selectedImportSuite}
                    onChange={(e) => setSelectedImportSuite(e.target.value)}
                    data-testid="select-import-suite"
                  >
                    <option value="">Unassigned</option>
                    {suites.map((suite) => (
                      <option key={suite.id} value={suite.id}>{suite.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>JSON Data</Label>
                  <Textarea
                    placeholder={`Paste your JSON test cases here...

Example format:
[
  {
    "title": "Test login functionality",
    "description": "Verify user can log in",
    "steps": [
      { "step": "Navigate to login page", "expected": "Login form is displayed" },
      { "step": "Enter credentials", "expected": "Credentials are accepted" }
    ],
    "priority": "high",
    "tags": ["login", "auth"]
  }
]`}
                    value={importJson}
                    onChange={(e) => setImportJson(e.target.value)}
                    className="min-h-[200px] font-mono text-sm"
                    data-testid="textarea-import-json"
                  />
                </div>
                <Button
                  onClick={handleImport}
                  disabled={!importJson.trim() || importMutation.isPending}
                  className="w-full"
                  data-testid="button-confirm-import"
                >
                  {importMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Import Test Cases
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-suite">
                <Plus className="h-4 w-4 mr-2" />
                New Suite
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Test Suite</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="suite-name">Suite Name</Label>
                <Input
                  id="suite-name"
                  placeholder="e.g., Authentication Tests"
                  value={newSuiteName}
                  onChange={(e) => setNewSuiteName(e.target.value)}
                  data-testid="input-suite-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="suite-description">Description (optional)</Label>
                <Textarea
                  id="suite-description"
                  placeholder="Describe what this test suite covers..."
                  value={newSuiteDescription}
                  onChange={(e) => setNewSuiteDescription(e.target.value)}
                  data-testid="textarea-suite-description"
                />
              </div>
              <Button
                onClick={() => createSuiteMutation.mutate({ name: newSuiteName, description: newSuiteDescription })}
                disabled={!newSuiteName.trim() || createSuiteMutation.isPending}
                className="w-full"
                data-testid="button-confirm-create-suite"
              >
                {createSuiteMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Suite"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
          <Button onClick={openCreateTestCaseDialog} data-testid="button-create-test-case">
            <TestTube2 className="h-4 w-4 mr-2" />
            New Test Case
          </Button>
        </div>
      </div>

      <Dialog open={testCaseDialogOpen} onOpenChange={setTestCaseDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TestTube2 className="h-5 w-5" />
              {editingTestCase ? "Edit Test Case" : "Create Test Case"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="tc-title">Title *</Label>
                <Input
                  id="tc-title"
                  placeholder="e.g., Verify KYC form submission"
                  value={testCaseForm.title}
                  onChange={(e) => setTestCaseForm((prev) => ({ ...prev, title: e.target.value }))}
                  data-testid="input-test-case-title"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label htmlFor="tc-description">Description</Label>
                <Textarea
                  id="tc-description"
                  placeholder="Describe what this test case verifies..."
                  value={testCaseForm.description}
                  onChange={(e) => setTestCaseForm((prev) => ({ ...prev, description: e.target.value }))}
                  data-testid="textarea-test-case-description"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tc-suite">Test Suite</Label>
                <Select
                  value={testCaseForm.suiteId || "__unassigned__"}
                  onValueChange={(value) => setTestCaseForm((prev) => ({ ...prev, suiteId: value === "__unassigned__" ? "" : value }))}
                >
                  <SelectTrigger data-testid="select-test-case-suite">
                    <SelectValue placeholder="Select a suite (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unassigned__">Unassigned</SelectItem>
                    {suites.map((suite) => (
                      <SelectItem key={suite.id} value={suite.id}>{suite.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tc-target-url">Target URL</Label>
                <Input
                  id="tc-target-url"
                  placeholder="https://example.com/kyc-form"
                  value={testCaseForm.targetUrl}
                  onChange={(e) => setTestCaseForm((prev) => ({ ...prev, targetUrl: e.target.value }))}
                  data-testid="input-test-case-target-url"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tc-priority">Priority</Label>
                <Select
                  value={testCaseForm.priority}
                  onValueChange={(value) => setTestCaseForm((prev) => ({ ...prev, priority: value }))}
                >
                  <SelectTrigger data-testid="select-test-case-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tc-status">Status</Label>
                <Select
                  value={testCaseForm.status}
                  onValueChange={(value) => setTestCaseForm((prev) => ({ ...prev, status: value }))}
                >
                  <SelectTrigger data-testid="select-test-case-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="deprecated">Deprecated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 col-span-2">
                <Label htmlFor="tc-preconditions">Preconditions</Label>
                <Textarea
                  id="tc-preconditions"
                  placeholder="Any conditions that must be met before running this test..."
                  value={testCaseForm.preconditions}
                  onChange={(e) => setTestCaseForm((prev) => ({ ...prev, preconditions: e.target.value }))}
                  data-testid="textarea-test-case-preconditions"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label htmlFor="tc-tags">Tags (comma-separated)</Label>
                <Input
                  id="tc-tags"
                  placeholder="e.g., kyc, form, validation"
                  value={testCaseForm.tags}
                  onChange={(e) => setTestCaseForm((prev) => ({ ...prev, tags: e.target.value }))}
                  data-testid="input-test-case-tags"
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label>Test Steps</Label>
              <div className="space-y-3">
                {testCaseForm.steps.map((step, index) => (
                  <div key={index} className="flex gap-2 items-start p-3 rounded-lg bg-muted/50">
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                        {index + 1}
                      </div>
                      <div className="flex flex-col">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => moveStepUp(index)}
                          disabled={index === 0}
                          data-testid={`button-move-step-up-${index}`}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => moveStepDown(index)}
                          disabled={index === testCaseForm.steps.length - 1}
                          data-testid={`button-move-step-down-${index}`}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex-1 space-y-2">
                      <Input
                        placeholder="Step action (e.g., Navigate to {{kycFormUrl}})"
                        value={step.step}
                        onChange={(e) => updateStep(index, "step", e.target.value)}
                        data-testid={`input-step-action-${index}`}
                      />
                      <Input
                        placeholder="Expected result (e.g., KYC form is displayed)"
                        value={step.expected}
                        onChange={(e) => updateStep(index, "expected", e.target.value)}
                        data-testid={`input-step-expected-${index}`}
                      />
                    </div>
                    {testCaseForm.steps.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeStep(index)}
                        className="shrink-0"
                        data-testid={`button-remove-step-${index}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" onClick={addStep} className="w-full" data-testid="button-add-step">
                <Plus className="h-4 w-4 mr-2" />
                Add Step
              </Button>
            </div>

            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={closeTestCaseDialog} className="flex-1" data-testid="button-cancel-test-case">
                Cancel
              </Button>
              <Button
                onClick={handleSaveTestCase}
                disabled={!testCaseForm.title.trim() || createTestCaseMutation.isPending || updateTestCaseMutation.isPending}
                className="flex-1"
                data-testid="button-save-test-case"
              >
                {(createTestCaseMutation.isPending || updateTestCaseMutation.isPending) ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : editingTestCase ? (
                  "Update Test Case"
                ) : (
                  "Create Test Case"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search suites and test cases..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
          data-testid="input-search-repository"
        />
      </div>

      {suites.length === 0 && unassignedTestCases.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No test suites yet"
          description="Create your first test suite to organize your test cases, or generate tests from requirements."
          action={{ label: "Create Suite", onClick: () => setDialogOpen(true) }}
        />
      ) : (
        <div className="space-y-4">
          {filteredSuites.map((suite) => {
            const suiteCases = getTestCasesForSuite(suite.id);
            return (
              <Card key={suite.id}>
                <Accordion
                  type="multiple"
                  value={expandedSuites}
                  onValueChange={setExpandedSuites}
                >
                  <AccordionItem value={suite.id} className="border-none">
                    <AccordionTrigger className="px-6 py-4 hover:no-underline">
                      <div className="flex items-center justify-between w-full pr-4 gap-4">
                        <div className="flex items-center gap-3">
                          <FolderOpen className="h-5 w-5 text-primary" />
                          <div className="text-left">
                            <p className="font-semibold">{suite.name}</p>
                            {suite.description && (
                              <p className="text-sm text-muted-foreground line-clamp-1">
                                {suite.description}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant="secondary">{suiteCases.length} tests</Badge>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="icon"
                                variant="ghost"
                                data-testid={`button-suite-menu-${suite.id}`}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteSuiteMutation.mutate(suite.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Suite
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="px-6 pb-4 space-y-2">
                        {suiteCases.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-4 text-center">
                            No test cases in this suite yet
                          </p>
                        ) : (
                          suiteCases.map((tc) => (
                            <TestCaseRow
                              key={tc.id}
                              testCase={tc}
                              onEdit={() => openEditTestCaseDialog(tc)}
                              onDelete={() => deleteTestCaseMutation.mutate(tc.id)}
                            />
                          ))
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </Card>
            );
          })}

          {filteredUnassigned.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TestTube2 className="h-5 w-5 text-muted-foreground" />
                  Unassigned Test Cases
                  <Badge variant="secondary">{filteredUnassigned.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {filteredUnassigned.map((tc) => (
                  <TestCaseRow
                    key={tc.id}
                    testCase={tc}
                    onEdit={() => openEditTestCaseDialog(tc)}
                    onDelete={() => deleteTestCaseMutation.mutate(tc.id)}
                  />
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function TestCaseRow({ testCase, onEdit, onDelete }: { testCase: TestCase; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover-elevate gap-4">
      <div className="flex items-center gap-3 min-w-0">
        {testCase.generatedByAI && (
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
        )}
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{testCase.title}</p>
          {testCase.description && (
            <p className="text-xs text-muted-foreground truncate">{testCase.description}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <PriorityBadge priority={(testCase.priority as any) || "medium"} />
        <StatusBadge status={(testCase.status as any) || "active"} showIcon={false} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" data-testid={`button-test-menu-${testCase.id}`}>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit} data-testid={`button-edit-test-${testCase.id}`}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Test
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Test
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
