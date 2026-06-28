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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Slack,
  Mail,
  MessageSquare,
  Send,
  AlertCircle,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import type { PlatformSetting } from "@shared/schema";
import { useGovernance } from "@/hooks/useGovernance";
import { AuditTrailViewer } from "@/components/governance";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type SettingsState = {
  notifications: {
    email: boolean;
    slack: boolean;
    teams: boolean;
    executionComplete: boolean;
    executionFailed: boolean;
    dailyDigest: boolean;
    notify_on_pass: boolean;
    notify_on_fail: boolean;
    slack_webhook_url: string;
    teams_webhook_url: string;
    email_recipients: string;
    email_api_key: string;
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
    bedrockModelId: string;
  };
};

const defaultSettings: SettingsState = {
  notifications: {
    email: false,
    slack: false,
    teams: false,
    executionComplete: true,
    executionFailed: true,
    dailyDigest: false,
    notify_on_pass: false,
    notify_on_fail: true,
    slack_webhook_url: "",
    teams_webhook_url: "",
    email_recipients: "",
    email_api_key: "",
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

  const [testingChannel, setTestingChannel] = useState<string | null>(null);

  const testNotificationMutation = useMutation({
    mutationFn: async ({ channel, config }: { channel: string; config: Record<string, string> }) => {
      const res = await apiRequest("POST", "/api/notifications/test", { channel, config });
      return res.json();
    },
    onSuccess: (data) => {
      setTestingChannel(null);
      toast({
        title: data.success ? "Test Sent!" : "Test Failed",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: () => {
      setTestingChannel(null);
      toast({ title: "Error", description: "Failed to send test notification", variant: "destructive" });
    },
  });

  const handleTestNotification = (channel: "slack" | "teams" | "email") => {
    setTestingChannel(channel);
    const config: Record<string, string> = {};
    if (channel === "slack") config.webhookUrl = settings.notifications.slack_webhook_url;
    if (channel === "teams") config.webhookUrl = settings.notifications.teams_webhook_url;
    if (channel === "email") {
      config.to = settings.notifications.email_recipients;
      config.apiKey = settings.notifications.email_api_key;
    }
    testNotificationMutation.mutate({ channel, config });
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
            <CardDescription>Configure Slack, Teams, and Email alerts for test results</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="slack">
              <TabsList className="mb-4">
                <TabsTrigger value="slack" className="gap-1.5"><Slack className="h-3.5 w-3.5" />Slack</TabsTrigger>
                <TabsTrigger value="teams" className="gap-1.5"><MessageSquare className="h-3.5 w-3.5" />Teams</TabsTrigger>
                <TabsTrigger value="email" className="gap-1.5"><Mail className="h-3.5 w-3.5" />Email</TabsTrigger>
                <TabsTrigger value="rules">Rules</TabsTrigger>
              </TabsList>

              {/* Slack */}
              <TabsContent value="slack" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Slack Notifications</Label>
                    <p className="text-xs text-muted-foreground">Send test results to a Slack channel</p>
                  </div>
                  <Switch
                    checked={settings.notifications.slack}
                    onCheckedChange={(v) => updateNotification("slack" as any, v)}
                  />
                </div>
                {settings.notifications.slack && (
                  <>
                    <div className="space-y-2">
                      <Label>Slack Webhook URL</Label>
                      <Input
                        placeholder="https://hooks.slack.com/services/T.../B.../..."
                        value={settings.notifications.slack_webhook_url}
                        onChange={(e) => updateNotification("slack_webhook_url" as any, e.target.value as any)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Create an Incoming Webhook in your Slack workspace settings.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      disabled={!settings.notifications.slack_webhook_url || testingChannel === "slack"}
                      onClick={() => handleTestNotification("slack")}
                    >
                      {testingChannel === "slack" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Send Test Message
                    </Button>
                  </>
                )}
              </TabsContent>

              {/* Teams */}
              <TabsContent value="teams" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Teams Notifications</Label>
                    <p className="text-xs text-muted-foreground">Send test results to a Teams channel</p>
                  </div>
                  <Switch
                    checked={settings.notifications.teams}
                    onCheckedChange={(v) => updateNotification("teams" as any, v)}
                  />
                </div>
                {settings.notifications.teams && (
                  <>
                    <div className="space-y-2">
                      <Label>Teams Webhook URL</Label>
                      <Input
                        placeholder="https://outlook.office.com/webhook/..."
                        value={settings.notifications.teams_webhook_url}
                        onChange={(e) => updateNotification("teams_webhook_url" as any, e.target.value as any)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Create an Incoming Webhook connector in your Teams channel.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      disabled={!settings.notifications.teams_webhook_url || testingChannel === "teams"}
                      onClick={() => handleTestNotification("teams")}
                    >
                      {testingChannel === "teams" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Send Test Message
                    </Button>
                  </>
                )}
              </TabsContent>

              {/* Email */}
              <TabsContent value="email" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Email Notifications</Label>
                    <p className="text-xs text-muted-foreground">Send HTML reports via email</p>
                  </div>
                  <Switch
                    checked={settings.notifications.email}
                    onCheckedChange={(v) => updateNotification("email", v)}
                  />
                </div>
                {settings.notifications.email && (
                  <>
                    <div className="space-y-2">
                      <Label>Recipient Email(s)</Label>
                      <Input
                        placeholder="qa-team@company.com"
                        value={settings.notifications.email_recipients}
                        onChange={(e) => updateNotification("email_recipients" as any, e.target.value as any)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Resend API Key (optional)</Label>
                      <Input
                        type="password"
                        placeholder="re_..."
                        value={settings.notifications.email_api_key}
                        onChange={(e) => updateNotification("email_api_key" as any, e.target.value as any)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Get a free API key at resend.com. Leave blank to log emails to console.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      disabled={!settings.notifications.email_recipients || testingChannel === "email"}
                      onClick={() => handleTestNotification("email")}
                    >
                      {testingChannel === "email" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Send Test Email
                    </Button>
                  </>
                )}
              </TabsContent>

              {/* Rules */}
              <TabsContent value="rules" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Notify on Pass</Label>
                    <p className="text-xs text-muted-foreground">Send notification when all tests pass</p>
                  </div>
                  <Switch
                    checked={settings.notifications.notify_on_pass}
                    onCheckedChange={(v) => updateNotification("notify_on_pass" as any, v)}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Notify on Fail</Label>
                    <p className="text-xs text-muted-foreground">Send notification when tests fail (recommended)</p>
                  </div>
                  <Switch
                    checked={settings.notifications.notify_on_fail}
                    onCheckedChange={(v) => updateNotification("notify_on_fail" as any, v)}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Daily Digest</Label>
                    <p className="text-xs text-muted-foreground">Daily summary of all test runs</p>
                  </div>
                  <Switch
                    checked={settings.notifications.dailyDigest}
                    onCheckedChange={(v) => updateNotification("dailyDigest", v)}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card colorSeed="settings-execution">
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

        <Card colorSeed="settings-reporting">
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

        <Card className="lg:col-span-2" colorSeed="settings-ai">
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
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="bedrock-access-key">Access Key / API Token</Label>
                    <div className="relative">
                      <Input
                        id="bedrock-access-key"
                        type={showAccessKey ? "text" : "password"}
                        placeholder="Enter your access key or API token"
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
                        Your API credentials are stored securely. Use tokens with minimal required permissions.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card colorSeed="settings-security">
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

        {/* ─────────────────────────────────────────────────────────────────
            REGULATORY MODE — controls VALIDATED vs NON_VALIDATED behavior.
            This is platform-wide and affects ALL users.
        ───────────────────────────────────────────────────────────────────── */}
        <RegulatoryModeCard />

        {/* ── Audit trail viewer ─────────────────────────────────────── */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Governance Audit Log
            </CardTitle>
            <CardDescription>
              Immutable, append-only log of every governance event (AI generation, reviews, executions blocked, bypass attempts).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AuditTrailViewer verbose={false} maxHeight="500px" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RegulatoryModeCard
// ═══════════════════════════════════════════════════════════════════════════
// Controls VALIDATED vs NON_VALIDATED platform mode.
// Switching is an audit-logged, signed event.
// ═══════════════════════════════════════════════════════════════════════════

function RegulatoryModeCard() {
  const governance = useGovernance();
  const { toast } = useToast();
  const [pendingType, setPendingType] = useState<"VALIDATED" | "NON_VALIDATED" | null>(null);

  const flipMutation = useMutation({
    mutationFn: async (systemType: "VALIDATED" | "NON_VALIDATED") => {
      const res = await apiRequest("PUT", "/api/governance/system-type", { systemType });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/governance/mode"] });
      queryClient.invalidateQueries({ queryKey: ["/api/governance/audit"] });
      toast({
        title: "Regulatory mode updated",
        description: "Platform behavior has changed for ALL users.",
      });
      setPendingType(null);
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: "Could not update mode",
        description: err?.message || "Backend rejected the change.",
      });
    },
  });

  const isValidated = governance.isValidated;
  const target = isValidated ? "NON_VALIDATED" : "VALIDATED";
  const targetLabel = target === "VALIDATED"
    ? "Validated (GxP / SOX / ISO)"
    : "Non-Validated (sandbox / R&D)";

  return (
    <Card className="lg:col-span-2 border-l-4 border-l-amber-500">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-600" />
          Regulatory Mode
        </CardTitle>
        <CardDescription>
          Controls platform-wide governance. In <strong>VALIDATED</strong> mode the platform enforces 21 CFR Part 11 / EU Annex 11 controls: every AI output requires human approval with e-signature, AI fixes cannot be auto-applied, and evidence must be attested before AQM upload.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Current mode</p>
              <p className="mt-1 text-2xl font-bold">
                {isValidated ? (
                  <span className="text-amber-700 dark:text-amber-400">VALIDATED</span>
                ) : (
                  <span className="text-blue-700 dark:text-blue-400">NON_VALIDATED</span>
                )}
              </p>
              {governance.description && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {governance.description.summary}
                </p>
              )}
            </div>
            <div className="text-right">
              <Badge
                variant="outline"
                className={
                  isValidated
                    ? "border-amber-500 bg-amber-100 text-amber-900"
                    : "border-blue-500 bg-blue-100 text-blue-900"
                }
              >
                {isValidated ? "Strict controls active" : "Relaxed controls"}
              </Badge>
            </div>
          </div>

          {governance.description?.controls && governance.description.controls.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              {governance.description.controls.map((c, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3 w-3 text-emerald-500 flex-shrink-0" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant={isValidated ? "outline" : "default"}
              className={!isValidated ? "bg-amber-600 hover:bg-amber-700" : ""}
              onClick={() => setPendingType(target)}
              data-testid="button-toggle-regulatory-mode"
            >
              <ShieldAlert className="mr-2 h-4 w-4" />
              Switch to {targetLabel}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-600" />
                Change Regulatory Mode?
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p>
                  You are about to switch the platform from{" "}
                  <strong>{isValidated ? "VALIDATED" : "NON_VALIDATED"}</strong> to{" "}
                  <strong>{target}</strong>.
                </p>
                {target === "VALIDATED" ? (
                  <p className="text-amber-700 dark:text-amber-400">
                    All AI-generated test cases will require explicit human approval before
                    execution. Auto-application of AI Healer fixes will be blocked. Evidence
                    upload will require 3-checkbox attestation.
                  </p>
                ) : (
                  <p className="text-amber-700 dark:text-amber-400">
                    <strong>Warning:</strong> Strict regulatory controls will be relaxed.
                    AI-generated content can be executed without review. This is suitable only
                    for sandbox, R&D, or training environments — not for systems supporting
                    regulated products.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  This action will be cryptographically logged in the audit trail. It cannot
                  be undone retroactively.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={flipMutation.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => pendingType && flipMutation.mutate(pendingType)}
                disabled={flipMutation.isPending}
                className={target === "VALIDATED" ? "bg-amber-600 hover:bg-amber-700" : ""}
              >
                {flipMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating…
                  </>
                ) : (
                  <>Confirm switch to {target}</>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
