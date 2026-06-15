import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Globe, Cloud, Database, Layers, Monitor, AppWindow, Coffee,
  Smartphone, Zap, FileCode, GitMerge, Search, ChevronRight,
  CheckCircle2, Info, Copy, Check, BookOpen, Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// Icon map
const ICON_MAP: Record<string, any> = {
  Globe, Cloud, Database, Layers, Monitor, AppWindow, Coffee,
  Smartphone, Zap, FileCode, GitMerge,
};

const CATEGORY_COLORS: Record<string, string> = {
  web: "blue",
  erp: "amber",
  desktop: "violet",
  mobile: "green",
  api: "cyan",
};

const COLOR_CLASSES: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  blue:   { bg: "bg-blue-500/10",   text: "text-blue-600 dark:text-blue-400",   border: "border-blue-500/20",   badge: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  sky:    { bg: "bg-sky-500/10",    text: "text-sky-600 dark:text-sky-400",     border: "border-sky-500/20",    badge: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20" },
  amber:  { bg: "bg-amber-500/10",  text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/20",  badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  orange: { bg: "bg-orange-500/10", text: "text-orange-600 dark:text-orange-400",border: "border-orange-500/20",badge: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20" },
  red:    { bg: "bg-red-500/10",    text: "text-red-600 dark:text-red-400",     border: "border-red-500/20",    badge: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" },
  violet: { bg: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400",border: "border-violet-500/20",badge: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20" },
  emerald:{ bg: "bg-emerald-500/10",text: "text-emerald-600 dark:text-emerald-400",border: "border-emerald-500/20",badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  green:  { bg: "bg-green-500/10",  text: "text-green-600 dark:text-green-400", border: "border-green-500/20",  badge: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20" },
  cyan:   { bg: "bg-cyan-500/10",   text: "text-cyan-600 dark:text-cyan-400",   border: "border-cyan-500/20",   badge: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20" },
  purple: { bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400",border: "border-purple-500/20",badge: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20" },
  pink:   { bg: "bg-pink-500/10",   text: "text-pink-600 dark:text-pink-400",   border: "border-pink-500/20",   badge: "bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20" },
  slate:  { bg: "bg-slate-500/10",  text: "text-slate-600 dark:text-slate-400", border: "border-slate-500/20",  badge: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20" },
};

interface AppProfile {
  type: string;
  label: string;
  description: string;
  icon: string;
  category: string;
  executor: string;
  defaultFramework: string;
  locatorStrategy: string;
  waitStrategy: string;
  authTypes: string[];
  aiPromptHints: string;
  setupNotes: string;
  color: string;
}

interface ProfilesData {
  profiles: AppProfile[];
  categories: Record<string, { label: string; color: string }>;
}

export default function AppProfiles() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedProfile, setSelectedProfile] = useState<AppProfile | null>(null);
  const [copiedHint, setCopiedHint] = useState(false);

  const { data, isLoading } = useQuery<ProfilesData>({
    queryKey: ["/api/app-profiles"],
  });

  const profiles = data?.profiles || [];
  const categories = data?.categories || {};

  const filtered = profiles.filter((p) => {
    const matchSearch =
      !search ||
      p.label.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase());
    const matchCat = selectedCategory === "all" || p.category === selectedCategory;
    return matchSearch && matchCat;
  });

  const grouped = filtered.reduce<Record<string, AppProfile[]>>((acc, p) => {
    if (!acc[p.category]) acc[p.category] = [];
    acc[p.category].push(p);
    return acc;
  }, {});

  const handleCopyHint = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedHint(true);
    setTimeout(() => setCopiedHint(false), 2000);
    toast({ title: "Copied!", description: "AI prompt hint copied to clipboard." });
  };

  return (
    <div className="flex h-full">
      {/* Left Panel — Profile List */}
      <div className="flex flex-col w-full max-w-2xl border-r overflow-y-auto">
        <div className="p-6 border-b sticky top-0 bg-background/95 backdrop-blur-sm z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg">
              <Settings2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Application Profiles</h1>
              <p className="text-sm text-muted-foreground">
                Select your app type for optimized test automation
              </p>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search applications..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Category Filter */}
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant={selectedCategory === "all" ? "default" : "outline"}
              onClick={() => setSelectedCategory("all")}
              className="h-7 text-xs"
            >
              All ({profiles.length})
            </Button>
            {Object.entries(categories).map(([key, cat]) => {
              const colors = COLOR_CLASSES[CATEGORY_COLORS[key] || "blue"];
              const count = profiles.filter((p) => p.category === key).length;
              return (
                <Button
                  key={key}
                  size="sm"
                  variant={selectedCategory === key ? "default" : "outline"}
                  onClick={() => setSelectedCategory(key)}
                  className={cn(
                    "h-7 text-xs",
                    selectedCategory === key ? "" : `${colors.text} ${colors.border}`
                  )}
                >
                  {cat.label} ({count})
                </Button>
              );
            })}
          </div>
        </div>

        {/* Profile Cards */}
        <div className="p-4 space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : (
            Object.entries(grouped).map(([category, catProfiles]) => {
              const catInfo = categories[category];
              const catColor = CATEGORY_COLORS[category] || "blue";
              const colors = COLOR_CLASSES[catColor];
              return (
                <div key={category}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={cn("text-xs font-bold uppercase tracking-widest", colors.text)}>
                      {catInfo?.label || category}
                    </span>
                    <div className={cn("flex-1 h-px", colors.bg)} />
                  </div>
                  <div className="grid gap-2">
                    {catProfiles.map((profile) => {
                      const Icon = ICON_MAP[profile.icon] || Globe;
                      const pColors = COLOR_CLASSES[profile.color] || COLOR_CLASSES.blue;
                      const isSelected = selectedProfile?.type === profile.type;
                      return (
                        <button
                          key={profile.type}
                          onClick={() => setSelectedProfile(profile)}
                          className={cn(
                            "w-full text-left p-4 rounded-xl border transition-all duration-150 hover:shadow-md",
                            isSelected
                              ? `${pColors.bg} ${pColors.border} shadow-sm`
                              : "bg-card border-border/60 hover:border-border"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", pColors.bg)}>
                              <Icon className={cn("h-5 w-5", pColors.text)} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm">{profile.label}</span>
                                <Badge
                                  variant="outline"
                                  className={cn("text-[10px] px-1.5 py-0 h-4", pColors.badge)}
                                >
                                  {profile.executor}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {profile.description}
                              </p>
                            </div>
                            <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform", isSelected ? "rotate-90 text-primary" : "text-muted-foreground/40")} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Panel — Profile Detail */}
      <div className="flex-1 overflow-y-auto">
        {!selectedProfile ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="h-20 w-20 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <BookOpen className="h-9 w-9 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Select an Application Profile</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Choose an application type from the left to see its automation configuration,
              locator strategies, and AI prompt hints.
            </p>
          </div>
        ) : (
          <ProfileDetail
            profile={selectedProfile}
            onCopyHint={handleCopyHint}
            copiedHint={copiedHint}
          />
        )}
      </div>
    </div>
  );
}

function ProfileDetail({
  profile,
  onCopyHint,
  copiedHint,
}: {
  profile: AppProfile;
  onCopyHint: (text: string) => void;
  copiedHint: boolean;
}) {
  const Icon = ICON_MAP[profile.icon] || Globe;
  const colors = COLOR_CLASSES[profile.color] || COLOR_CLASSES.blue;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className={cn("rounded-2xl p-6 border", colors.bg, colors.border)}>
        <div className="flex items-start gap-4">
          <div className={cn("h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 bg-background/80 shadow-sm")}>
            <Icon className={cn("h-7 w-7", colors.text)} />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold tracking-tight">{profile.label}</h2>
            <p className="text-sm text-muted-foreground mt-1">{profile.description}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Badge variant="outline" className={cn("text-xs", colors.badge)}>
                {profile.category.toUpperCase()}
              </Badge>
              <Badge variant="outline" className="text-xs">
                Executor: {profile.executor}
              </Badge>
              <Badge variant="outline" className="text-xs">
                Framework: {profile.defaultFramework}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Config Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        <InfoCard
          title="Locator Strategy"
          icon={<Search className="h-4 w-4" />}
          content={profile.locatorStrategy}
          color={colors}
        />
        <InfoCard
          title="Wait Strategy"
          icon={<CheckCircle2 className="h-4 w-4" />}
          content={profile.waitStrategy}
          color={colors}
        />
      </div>

      {/* Auth Types */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <div className={cn("h-6 w-6 rounded-md flex items-center justify-center", colors.bg)}>
              <Settings2 className={cn("h-3.5 w-3.5", colors.text)} />
            </div>
            Supported Authentication Types
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {profile.authTypes.map((auth) => (
              <Badge key={auth} variant="secondary" className="text-xs capitalize">
                {auth.replace(/_/g, " ")}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* AI Prompt Hints */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <div className="h-6 w-6 rounded-md bg-violet-500/10 flex items-center justify-center">
                <Zap className="h-3.5 w-3.5 text-violet-500" />
              </div>
              AI Prompt Hints
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={() => onCopyHint(profile.aiPromptHints)}
            >
              {copiedHint ? (
                <><Check className="h-3 w-3" /> Copied!</>
              ) : (
                <><Copy className="h-3 w-3" /> Copy</>
              )}
            </Button>
          </div>
          <CardDescription className="text-xs">
            These hints are automatically injected into the AI when generating tests for this app type.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/50 rounded-xl p-4 font-mono text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap border border-border/40">
            {profile.aiPromptHints}
          </div>
        </CardContent>
      </Card>

      {/* Setup Notes */}
      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <Info className="h-4 w-4" />
            Setup Requirements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed">{profile.setupNotes}</p>
        </CardContent>
      </Card>

      {/* Quick Start */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Quick Start</CardTitle>
          <CardDescription className="text-xs">
            How to create your first test for {profile.label}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {[
              `Go to AI Test Generator and select "${profile.label}" as the application type`,
              "Enter your requirement or user story in plain English",
              `AI will generate test cases optimized for ${profile.label} using ${profile.locatorStrategy.split(",")[0]}`,
              `Configure your ${profile.authTypes[0]?.replace(/_/g, " ")} credentials in Environment Settings`,
              "Run the execution — AITAS handles the rest automatically",
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className={cn(
                  "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5",
                  colors.bg, colors.text
                )}>
                  {i + 1}
                </span>
                <span className="text-sm text-muted-foreground">{step}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoCard({
  title,
  icon,
  content,
  color,
}: {
  title: string;
  icon: React.ReactNode;
  content: string;
  color: { bg: string; text: string; border: string; badge: string };
}) {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <div className={cn("h-6 w-6 rounded-md flex items-center justify-center", color.bg)}>
            <span className={color.text}>{icon}</span>
          </div>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground leading-relaxed">{content}</p>
      </CardContent>
    </Card>
  );
}
