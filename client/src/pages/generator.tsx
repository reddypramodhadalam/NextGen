import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { PriorityBadge } from "@/components/priority-badge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles,
  Loader2,
  Plus,
  Check,
  FileText,
  ArrowRight,
  TestTube2,
} from "lucide-react";
import type { TestSuite, TestCase } from "@shared/schema";

interface GeneratedTestCase {
  title: string;
  description: string;
  preconditions: string;
  steps: { step: string; expected: string }[];
  priority: string;
}

export default function Generator() {
  const { toast } = useToast();
  const [requirement, setRequirement] = useState("");
  const [requirementTitle, setRequirementTitle] = useState("");
  const [selectedSuite, setSelectedSuite] = useState<string>("");
  const [generatedTests, setGeneratedTests] = useState<GeneratedTestCase[]>([]);
  const [selectedTests, setSelectedTests] = useState<Set<number>>(new Set());

  const { data: suites = [] } = useQuery<TestSuite[]>({
    queryKey: ["/api/test-suites"],
  });

  const generateMutation = useMutation({
    mutationFn: async (data: { title: string; description: string }) => {
      const res = await apiRequest("POST", "/api/generate-tests", data);
      return res.json();
    },
    onSuccess: (data: { testCases: GeneratedTestCase[] }) => {
      setGeneratedTests(data.testCases);
      setSelectedTests(new Set(data.testCases.map((_, i) => i)));
      toast({
        title: "Tests Generated",
        description: `Generated ${data.testCases.length} test cases from your requirement.`,
      });
    },
    onError: () => {
      toast({
        title: "Generation Failed",
        description: "Failed to generate test cases. Please try again.",
        variant: "destructive",
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (testCases: GeneratedTestCase[]) => {
      const promises = testCases.map((tc) =>
        apiRequest("POST", "/api/test-cases", {
          ...tc,
          suiteId: selectedSuite || null,
          generatedByAI: true,
        })
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/test-cases"] });
      toast({
        title: "Tests Saved",
        description: `${selectedTests.size} test cases saved to repository.`,
      });
      setGeneratedTests([]);
      setSelectedTests(new Set());
      setRequirement("");
      setRequirementTitle("");
    },
    onError: () => {
      toast({
        title: "Save Failed",
        description: "Failed to save test cases. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleGenerate = () => {
    if (!requirement.trim()) {
      toast({
        title: "Requirement Required",
        description: "Please enter a requirement or user story to generate tests.",
        variant: "destructive",
      });
      return;
    }
    generateMutation.mutate({
      title: requirementTitle || "Untitled Requirement",
      description: requirement,
    });
  };

  const handleSaveSelected = () => {
    const testsToSave = generatedTests.filter((_, i) => selectedTests.has(i));
    if (testsToSave.length === 0) {
      toast({
        title: "No Tests Selected",
        description: "Please select at least one test case to save.",
        variant: "destructive",
      });
      return;
    }
    saveMutation.mutate(testsToSave);
  };

  const toggleTestSelection = (index: number) => {
    const newSelected = new Set(selectedTests);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedTests(newSelected);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          AI Test Generator
        </h1>
        <p className="text-muted-foreground">
          Transform requirements into comprehensive test cases with AI
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Input Requirement</CardTitle>
            <CardDescription>
              Enter a user story, feature description, or acceptance criteria
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="requirement-title">Title (optional)</Label>
              <Input
                id="requirement-title"
                placeholder="e.g., User Login Feature"
                value={requirementTitle}
                onChange={(e) => setRequirementTitle(e.target.value)}
                data-testid="input-requirement-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="requirement">Requirement Description</Label>
              <Textarea
                id="requirement"
                placeholder="As a user, I want to be able to log in with my email and password so that I can access my account.

Acceptance Criteria:
- User can enter email and password
- System validates credentials
- On success, user is redirected to dashboard
- On failure, appropriate error message is shown"
                value={requirement}
                onChange={(e) => setRequirement(e.target.value)}
                className="min-h-[200px] resize-none"
                data-testid="textarea-requirement"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="suite">Target Test Suite (optional)</Label>
              <Select value={selectedSuite} onValueChange={setSelectedSuite}>
                <SelectTrigger id="suite" data-testid="select-suite">
                  <SelectValue placeholder="Select a suite..." />
                </SelectTrigger>
                <SelectContent>
                  {suites.map((suite) => (
                    <SelectItem key={suite.id} value={suite.id}>
                      {suite.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleGenerate}
              disabled={generateMutation.isPending || !requirement.trim()}
              className="w-full"
              data-testid="button-generate-tests"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Test Cases
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">Generated Tests</CardTitle>
              <CardDescription>
                {generatedTests.length > 0
                  ? `${selectedTests.size} of ${generatedTests.length} selected`
                  : "Test cases will appear here after generation"}
              </CardDescription>
            </div>
            {generatedTests.length > 0 && (
              <Button
                onClick={handleSaveSelected}
                disabled={saveMutation.isPending || selectedTests.size === 0}
                data-testid="button-save-tests"
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Save Selected
                  </>
                )}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {generatedTests.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <TestTube2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium">No tests generated yet</p>
                <p className="text-sm mt-1">
                  Enter a requirement and click Generate to create test cases
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                {generatedTests.map((test, index) => (
                  <div
                    key={index}
                    onClick={() => toggleTestSelection(index)}
                    className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                      selectedTests.has(index)
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                    data-testid={`card-generated-test-${index}`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`h-5 w-5 rounded border flex items-center justify-center transition-colors ${
                            selectedTests.has(index)
                              ? "bg-primary border-primary"
                              : "border-border"
                          }`}
                        >
                          {selectedTests.has(index) && (
                            <Check className="h-3 w-3 text-primary-foreground" />
                          )}
                        </div>
                        <span className="font-medium text-sm">{test.title}</span>
                      </div>
                      <PriorityBadge priority={test.priority as any} />
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      {test.description}
                    </p>
                    <div className="space-y-1">
                      {test.steps.slice(0, 3).map((step, stepIndex) => (
                        <div
                          key={stepIndex}
                          className="flex items-start gap-2 text-xs text-muted-foreground"
                        >
                          <span className="font-medium shrink-0">{stepIndex + 1}.</span>
                          <span className="truncate">{step.step}</span>
                        </div>
                      ))}
                      {test.steps.length > 3 && (
                        <p className="text-xs text-muted-foreground pl-4">
                          +{test.steps.length - 3} more steps
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">How it works</h3>
                <p className="text-sm text-muted-foreground">AI-powered test generation in 3 steps</p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/80 text-sm">
                <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</span>
                Enter requirement
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/80 text-sm">
                <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</span>
                AI generates tests
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/80 text-sm">
                <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</span>
                Review & save
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
