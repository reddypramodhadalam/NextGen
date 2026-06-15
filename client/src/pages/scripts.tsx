import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CodeBlock } from "@/components/code-block";
import { EmptyState } from "@/components/empty-state";
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
  Code2,
  Loader2,
  Download,
  RefreshCw,
  TestTube2,
  Sparkles,
  Info,
} from "lucide-react";
import type { TestCase, GeneratedScript } from "@shared/schema";

const frameworks = [
  { value: "playwright", label: "Playwright" },
  { value: "cypress", label: "Cypress" },
  { value: "selenium", label: "Selenium" },
  { value: "puppeteer", label: "Puppeteer" },
];

const languages = [
  { value: "typescript", label: "TypeScript" },
  { value: "javascript", label: "JavaScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "csharp", label: "C#" },
];

export default function Scripts() {
  const { toast } = useToast();
  const [selectedTestCase, setSelectedTestCase] = useState<string>("");
  const [selectedFramework, setSelectedFramework] = useState<string>("playwright");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("typescript");
  const [generatedCode, setGeneratedCode] = useState<string>("");
  const [usedFallback, setUsedFallback] = useState(false);

  const { data: testCases = [], isLoading: testCasesLoading } = useQuery<TestCase[]>({
    queryKey: ["/api/test-cases"],
  });

  const { data: scripts = [] } = useQuery<GeneratedScript[]>({
    queryKey: ["/api/scripts"],
  });

  const generateMutation = useMutation({
    mutationFn: async (data: { testCaseId: string; framework: string; language: string }) => {
      const res = await apiRequest("POST", "/api/generate-script", data);
      return res.json();
    },
    onSuccess: (data: { code: string; generatedBy?: string }) => {
      setGeneratedCode(data.code);
      const isFallback = data.generatedBy === "rule-based";
      setUsedFallback(isFallback);
      queryClient.invalidateQueries({ queryKey: ["/api/scripts"] });
      toast({
        title: isFallback ? "Script Generated (Rule-Based)" : "Script Generated",
        description: isFallback
          ? "Generated using built-in templates. Add an AI API key in Settings for AI-powered scripts."
          : "Production-ready test script has been generated.",
      });
    },
    onError: () => {
      toast({
        title: "Generation Failed",
        description: "Could not generate script. Please check your connection and try again.",
        variant: "destructive",
      });
    },
  });

  const handleGenerate = () => {
    if (!selectedTestCase) {
      toast({
        title: "Test Case Required",
        description: "Please select a test case to generate a script.",
        variant: "destructive",
      });
      return;
    }
    generateMutation.mutate({
      testCaseId: selectedTestCase,
      framework: selectedFramework,
      language: selectedLanguage,
    });
  };

  const handleDownload = () => {
    if (!generatedCode) return;
    const ext =
      selectedLanguage === "typescript" ? "ts" :
      selectedLanguage === "javascript" ? "js" :
      selectedLanguage === "python" ? "py" :
      selectedLanguage === "csharp" ? "cs" :
      "java";
    const blob = new Blob([generatedCode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `test-script.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedTest = testCases.find((tc) => tc.id === selectedTestCase);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Code2 className="h-6 w-6 text-primary" />
          Script Generator
        </h1>
        <p className="text-muted-foreground">
          Generate production-ready automation scripts from test cases
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card colorSeed="scripts-configuration" className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Configuration</CardTitle>
            <CardDescription>
              Select a test case and target framework
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="test-case">Test Case</Label>
              <Select value={selectedTestCase} onValueChange={setSelectedTestCase}>
                <SelectTrigger id="test-case" data-testid="select-test-case">
                  <SelectValue placeholder="Select a test case..." />
                </SelectTrigger>
                <SelectContent>
                  {testCases.map((tc) => (
                    <SelectItem key={tc.id} value={tc.id}>
                      <div className="flex items-center gap-2">
                        {tc.generatedByAI && <Sparkles className="h-3 w-3 text-primary" />}
                        <span className="truncate">{tc.title}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="framework">Framework</Label>
              <Select value={selectedFramework} onValueChange={setSelectedFramework}>
                <SelectTrigger id="framework" data-testid="select-framework">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {frameworks.map((fw) => (
                    <SelectItem key={fw.value} value={fw.value}>
                      {fw.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="language">Language</Label>
              <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                <SelectTrigger id="language" data-testid="select-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={generateMutation.isPending || !selectedTestCase}
              className="w-full"
              data-testid="button-generate-script"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Script
                </>
              )}
            </Button>

            {selectedTest && (
              <div className="pt-4 border-t">
                <p className="text-xs font-medium text-muted-foreground mb-2">Selected Test</p>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="font-medium text-sm">{selectedTest.title}</p>
                  {selectedTest.description && (
                    <p className="text-xs text-muted-foreground mt-1">{selectedTest.description}</p>
                  )}
                  {selectedTest.steps && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {(selectedTest.steps as any[]).length} steps
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card colorSeed="scripts-generated-script" className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">Generated Script</CardTitle>
              <CardDescription>
                {generatedCode
                  ? `${frameworks.find((f) => f.value === selectedFramework)?.label} script in ${languages.find((l) => l.value === selectedLanguage)?.label}`
                  : "Script will appear here after generation"}
              </CardDescription>
            </div>
            {generatedCode && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerate}
                  disabled={generateMutation.isPending}
                  data-testid="button-regenerate"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Regenerate
                </Button>
                <Button size="sm" onClick={handleDownload} data-testid="button-download-script">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {usedFallback && generatedCode && (
              <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/8 px-3.5 py-2.5 text-xs text-amber-700 dark:text-amber-400">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div>
                  <span className="font-semibold">Rule-based script</span> — No AI API key configured.
                  {" "}<a href="/settings" className="underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-300">Add one in Settings</a> for AI-powered, context-aware code generation.
                </div>
              </div>
            )}
            {generatedCode ? (
              <CodeBlock
                code={generatedCode}
                language={selectedLanguage}
                className="max-h-[600px] overflow-y-auto"
              />
            ) : testCases.length === 0 ? (
              <EmptyState
                icon={TestTube2}
                title="No test cases available"
                description="Create or generate test cases first to generate automation scripts."
              />
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                <Code2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium">No script generated yet</p>
                <p className="text-sm mt-1">
                  Select a test case and click Generate to create a script
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {scripts.length > 0 && (
        <Card colorSeed="scripts-recent-scripts">
          <CardHeader>
            <CardTitle className="text-base">Recent Scripts</CardTitle>
            <CardDescription>Previously generated automation scripts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {scripts.slice(0, 5).map((script) => (
                <div
                  key={script.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover-elevate"
                >
                  <div className="flex items-center gap-3">
                    <Code2 className="h-4 w-4 text-primary" />
                    <div>
                      <p className="font-medium text-sm">{script.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {script.framework} - {script.language} - v{script.version}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
