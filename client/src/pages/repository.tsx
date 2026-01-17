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
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  FolderOpen,
  Plus,
  Search,
  TestTube2,
  Sparkles,
  ChevronRight,
  MoreVertical,
  Trash2,
  Loader2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TestSuite, TestCase } from "@shared/schema";

export default function Repository() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [newSuiteName, setNewSuiteName] = useState("");
  const [newSuiteDescription, setNewSuiteDescription] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedSuites, setExpandedSuites] = useState<string[]>([]);

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
      </div>

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

function TestCaseRow({ testCase, onDelete }: { testCase: TestCase; onDelete: () => void }) {
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
