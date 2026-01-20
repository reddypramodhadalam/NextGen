import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Settings as SettingsIcon,
  Bell,
  Shield,
  Database,
  Clock,
  Save,
  Loader2,
  CheckCircle2,
  Brain,
  Key,
  Eye,
  EyeOff,
} from "lucide-react";
import type { PlatformSetting } from "@shared/schema";

type SettingsState = {
  notifications: {
    email: boolean;
    slack: boolean;
    executionComplete: boolean;
    executionFailed: boolean;
    dailyDigest: boolean;
  };
  execution: {
    defaultEnvironment: string;
    parallelTests: string;
    timeout: string;
    retryFailed: boolean;
    screenshotOnFailure: boolean;
    videoRecording: boolean;
    networkLogging: boolean;
  };
  reporting: {
    autoGenerate: boolean;
    format: string;
    retention: string;
    includeScreenshots: boolean;
    includeLogs: boolean;
  };
  ai: {
    useCustomLlm: boolean;
    bedrockEndpointUrl: string;
    bedrockAccessKey: string;
    bedrockSecretKey: string;
    bedrockModelId: string;
  };
};

const defaultSettings: SettingsState = {
  notifications: {
    email: true,
    slack: false,
    executionComplete: true,
    executionFailed: true,
    dailyDigest: false,
  },
  execution: {
    defaultEnvironment: "staging",
    parallelTests: "5",
    timeout: "300",
    retryFailed: true,
    screenshotOnFailure: true,
    videoRecording: false,
    networkLogging: true,
  },
  reporting: {
    autoGenerate: true,
    format: "html",
    retention: "30",
    includeScreenshots: true,
    includeLogs: true,
  },
  ai: {
    useCustomLlm: false,
    bedrockEndpointUrl: "",
    bedrockAccessKey: "",
    bedrockSecretKey: "",
    bedrockModelId: "",
  },
};

function parseSettingsFromApi(apiSettings: PlatformSetting[]): SettingsState {
  const result = structuredClone(defaultSettings);
  
  for (const setting of apiSettings) {
    const { category, key, value } = setting;
    
    if (category === "notifications" && key in result.notifications) {
      (result.notifications as any)[key] = value === "true";
    } else if (category === "execution" && key in result.execution) {
      if (typeof (result.execution as any)[key] === "boolean") {
        (result.execution as any)[key] = value === "true";
      } else {
        (result.execution as any)[key] = value || defaultSettings.execution[key as keyof typeof defaultSettings.execution];
      }
    } else if (category === "reporting" && key in result.reporting) {
      if (typeof (result.reporting as any)[key] === "boolean") {
        (result.reporting as any)[key] = value === "true";
      } else {
        (result.reporting as any)[key] = value || defaultSettings.reporting[key as keyof typeof defaultSettings.reporting];
      }
    } else if (category === "ai" && key in result.ai) {
      if (typeof (result.ai as any)[key] === "boolean") {
        (result.ai as any)[key] = value === "true";
      } else {
        (result.ai as any)[key] = value || defaultSettings.ai[key as keyof typeof defaultSettings.ai];
      }
    }
  }
  
  return result;
}

function convertSettingsToApi(settings: SettingsState): Array<{ category: string; key: string; value: string }> {
  const result: Array<{ category: string; key: string; value: string }> = [];
  
  for (const [key, value] of Object.entries(settings.notifications)) {
    result.push({ category: "notifications", key, value: String(value) });
  }
  for (const [key, value] of Object.entries(settings.execution)) {
    result.push({ category: "execution", key, value: String(value) });
  }
  for (const [key, value] of Object.entries(settings.reporting)) {
    result.push({ category: "reporting", key, value: String(value) });
  }
  for (const [key, value] of Object.entries(settings.ai)) {
    result.push({ category: "ai", key, value: String(value) });
  }
  
  return result;
}

export default function Settings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [hasChanges, setHasChanges] = useState(false);
  const [showAccessKey, setShowAccessKey] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);

  const { data: apiSettings, isLoading } = useQuery<PlatformSetting[]>({
    queryKey: ["/api/settings"],
  });

  useEffect(() => {
    if (apiSettings) {
      setSettings(parseSettingsFromApi(apiSettings));
    }
  }, [apiSettings]);

  const saveMutation = useMutation({
    mutationFn: async (settingsToSave: SettingsState) => {
      const settingsArray = convertSettingsToApi(settingsToSave);
      return apiRequest("POST", "/api/settings/bulk", { settings: settingsArray });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      setHasChanges(false);
      toast({
        title: "Settings Saved",
        description: "Your preferences have been saved and will apply to all future executions.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save settings",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    saveMutation.mutate(settings);
  };

  const updateNotification = (key: keyof typeof settings.notifications, value: boolean) => {
    setSettings((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, [key]: value },
    }));
    setHasChanges(true);
  };

  const updateExecution = (key: keyof typeof settings.execution, value: string | boolean) => {
    setSettings((prev) => ({
      ...prev,
      execution: { ...prev.execution, [key]: value },
    }));
    setHasChanges(true);
  };

  const updateReporting = (key: keyof typeof settings.reporting, value: string | boolean) => {
    setSettings((prev) => ({
      ...prev,
      reporting: { ...prev.reporting, [key]: value },
    }));
    setHasChanges(true);
  };

  const updateAi = (key: keyof typeof settings.ai, value: string | boolean) => {
    setSettings((prev) => ({
      ...prev,
      ai: { ...prev.ai, [key]: value },
    }));
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-48" />
              </CardHeader>
              <CardContent className="space-y-4">
                {[1, 2, 3].map((j) => (
                  <Skeleton key={j} className="h-12 w-full" />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <SettingsIcon className="h-6 w-6 text-primary" />
            Settings
            {hasChanges && (
              <Badge variant="secondary" className="ml-2">Unsaved Changes</Badge>
            )}
          </h1>
          <p className="text-muted-foreground">
            Configure your testing platform preferences. These settings apply to all test executions.
          </p>
        </div>
        <Button 
          onClick={handleSave} 
          disabled={!hasChanges || saveMutation.isPending}
          data-testid="button-save-settings"
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Changes
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              Notifications
            </CardTitle>
            <CardDescription>Configure how you receive updates</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="email-notifications">Email Notifications</Label>
                <p className="text-sm text-muted-foreground">Receive updates via email</p>
              </div>
              <Switch
                id="email-notifications"
                checked={settings.notifications.email}
                onCheckedChange={(v) => updateNotification("email", v)}
                data-testid="switch-email-notifications"
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="slack-notifications">Slack Integration</Label>
                <p className="text-sm text-muted-foreground">Send alerts to Slack channel</p>
              </div>
              <Switch
                id="slack-notifications"
                checked={settings.notifications.slack}
                onCheckedChange={(v) => updateNotification("slack", v)}
                data-testid="switch-slack-notifications"
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="exec-complete">Execution Complete</Label>
                <p className="text-sm text-muted-foreground">Notify when tests finish</p>
              </div>
              <Switch
                id="exec-complete"
                checked={settings.notifications.executionComplete}
                onCheckedChange={(v) => updateNotification("executionComplete", v)}
                data-testid="switch-exec-complete"
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="exec-failed">Execution Failed</Label>
                <p className="text-sm text-muted-foreground">Notify on test failures</p>
              </div>
              <Switch
                id="exec-failed"
                checked={settings.notifications.executionFailed}
                onCheckedChange={(v) => updateNotification("executionFailed", v)}
                data-testid="switch-exec-failed"
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="daily-digest">Daily Digest</Label>
                <p className="text-sm text-muted-foreground">Daily summary report</p>
              </div>
              <Switch
                id="daily-digest"
                checked={settings.notifications.dailyDigest}
                onCheckedChange={(v) => updateNotification("dailyDigest", v)}
                data-testid="switch-daily-digest"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Execution Settings
            </CardTitle>
            <CardDescription>Configure test execution behavior</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="default-env">Default Environment</Label>
              <Select
                value={settings.execution.defaultEnvironment}
                onValueChange={(v) => updateExecution("defaultEnvironment", v)}
              >
                <SelectTrigger id="default-env" data-testid="select-default-env">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="development">Development</SelectItem>
                  <SelectItem value="staging">Staging</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="parallel-tests">Parallel Tests</Label>
              <Input
                id="parallel-tests"
                type="number"
                value={settings.execution.parallelTests}
                onChange={(e) => updateExecution("parallelTests", e.target.value)}
                data-testid="input-parallel-tests"
              />
              <p className="text-xs text-muted-foreground">Number of tests to run in parallel</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="timeout">Test Timeout (seconds)</Label>
              <Input
                id="timeout"
                type="number"
                value={settings.execution.timeout}
                onChange={(e) => updateExecution("timeout", e.target.value)}
                data-testid="input-timeout"
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="retry-failed">Retry Failed Tests</Label>
                <p className="text-sm text-muted-foreground">Automatically retry failures</p>
              </div>
              <Switch
                id="retry-failed"
                checked={settings.execution.retryFailed}
                onCheckedChange={(v) => updateExecution("retryFailed", v)}
                data-testid="switch-retry-failed"
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="screenshot-failure">Screenshot on Failure</Label>
                <p className="text-sm text-muted-foreground">Capture screen on test failure</p>
              </div>
              <Switch
                id="screenshot-failure"
                checked={settings.execution.screenshotOnFailure}
                onCheckedChange={(v) => updateExecution("screenshotOnFailure", v)}
                data-testid="switch-screenshot-failure"
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="video-recording">Video Recording</Label>
                <p className="text-sm text-muted-foreground">Record test execution videos</p>
              </div>
              <Switch
                id="video-recording"
                checked={settings.execution.videoRecording}
                onCheckedChange={(v) => updateExecution("videoRecording", v)}
                data-testid="switch-video-recording"
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="network-logging">Network Logging</Label>
                <p className="text-sm text-muted-foreground">Capture network requests</p>
              </div>
              <Switch
                id="network-logging"
                checked={settings.execution.networkLogging}
                onCheckedChange={(v) => updateExecution("networkLogging", v)}
                data-testid="switch-network-logging"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              Reporting
            </CardTitle>
            <CardDescription>Configure report generation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="auto-generate">Auto-Generate Reports</Label>
                <p className="text-sm text-muted-foreground">Create reports after each execution</p>
              </div>
              <Switch
                id="auto-generate"
                checked={settings.reporting.autoGenerate}
                onCheckedChange={(v) => updateReporting("autoGenerate", v)}
                data-testid="switch-auto-generate"
              />
            </div>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="report-format">Report Format</Label>
              <Select
                value={settings.reporting.format}
                onValueChange={(v) => updateReporting("format", v)}
              >
                <SelectTrigger id="report-format" data-testid="select-report-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="html">HTML</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="junit">JUnit XML</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="retention">Report Retention (days)</Label>
              <Input
                id="retention"
                type="number"
                value={settings.reporting.retention}
                onChange={(e) => updateReporting("retention", e.target.value)}
                data-testid="input-retention"
              />
              <p className="text-xs text-muted-foreground">Days to keep reports before cleanup</p>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="include-screenshots">Include Screenshots</Label>
                <p className="text-sm text-muted-foreground">Embed screenshots in reports</p>
              </div>
              <Switch
                id="include-screenshots"
                checked={settings.reporting.includeScreenshots}
                onCheckedChange={(v) => updateReporting("includeScreenshots", v)}
                data-testid="switch-include-screenshots"
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="include-logs">Include Logs</Label>
                <p className="text-sm text-muted-foreground">Embed execution logs in reports</p>
              </div>
              <Switch
                id="include-logs"
                checked={settings.reporting.includeLogs}
                onCheckedChange={(v) => updateReporting("includeLogs", v)}
                data-testid="switch-include-logs"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              AI Integration
            </CardTitle>
            <CardDescription>Configure custom LLM for AI-powered features</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="use-custom-llm">Use Custom LLM</Label>
                <p className="text-sm text-muted-foreground">
                  Enable to use your own AWS Bedrock instead of the default AI service
                </p>
              </div>
              <Switch
                id="use-custom-llm"
                checked={settings.ai.useCustomLlm}
                onCheckedChange={(v) => updateAi("useCustomLlm", v)}
                data-testid="switch-use-custom-llm"
              />
            </div>

            {settings.ai.useCustomLlm && (
              <>
                <Separator />
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="bedrock-endpoint">API Endpoint URL</Label>
                    <Input
                      id="bedrock-endpoint"
                      type="url"
                      placeholder="https://your-bedrock-endpoint.amazonaws.com"
                      value={settings.ai.bedrockEndpointUrl}
                      onChange={(e) => updateAi("bedrockEndpointUrl", e.target.value)}
                      data-testid="input-bedrock-endpoint"
                    />
                    <p className="text-xs text-muted-foreground">
                      Your custom LLM API endpoint URL
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bedrock-access-key">Access Key</Label>
                    <div className="relative">
                      <Input
                        id="bedrock-access-key"
                        type={showAccessKey ? "text" : "password"}
                        placeholder="Enter your access key"
                        value={settings.ai.bedrockAccessKey}
                        onChange={(e) => updateAi("bedrockAccessKey", e.target.value)}
                        data-testid="input-bedrock-access-key"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setShowAccessKey(!showAccessKey)}
                        data-testid="button-toggle-access-key"
                      >
                        {showAccessKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bedrock-secret-key">Secret Key</Label>
                    <div className="relative">
                      <Input
                        id="bedrock-secret-key"
                        type={showSecretKey ? "text" : "password"}
                        placeholder="Enter your secret key"
                        value={settings.ai.bedrockSecretKey}
                        onChange={(e) => updateAi("bedrockSecretKey", e.target.value)}
                        data-testid="input-bedrock-secret-key"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setShowSecretKey(!showSecretKey)}
                        data-testid="button-toggle-secret-key"
                      >
                        {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="bedrock-model">Model ID</Label>
                    <Input
                      id="bedrock-model"
                      type="text"
                      placeholder="e.g., anthropic.claude-3-5-haiku-20241022-v1:0"
                      value={settings.ai.bedrockModelId}
                      onChange={(e) => updateAi("bedrockModelId", e.target.value)}
                      data-testid="input-bedrock-model"
                    />
                    <p className="text-xs text-muted-foreground">
                      The model identifier for your Bedrock model (e.g., anthropic.claude-3-5-haiku-20241022-v1:0)
                    </p>
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-start gap-3">
                    <Key className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                    <div>
                      <span className="font-medium text-amber-600 dark:text-amber-400">Security Note</span>
                      <p className="text-sm text-muted-foreground mt-1">
                        Your AWS credentials are stored securely and encrypted. Make sure to use IAM credentials with minimal required permissions for Bedrock access only.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Security & Privacy
            </CardTitle>
            <CardDescription>Manage security settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3 mb-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <span className="font-medium">Local Execution</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Your code and test data never leave your infrastructure. All test execution happens locally through our secure agent system.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3 mb-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <span className="font-medium">Data Encryption</span>
              </div>
              <p className="text-sm text-muted-foreground">
                All data is encrypted at rest and in transit. We use industry-standard encryption protocols.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3 mb-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <span className="font-medium">Role-Based Access</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Control who can view, create, edit, and execute tests with granular permissions.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
