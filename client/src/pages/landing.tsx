import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TestTube2,
  Bot,
  GitBranch,
  BarChart3,
  Shield,
  Zap,
  Users,
  Globe,
  Sparkles,
  Play,
  CheckCircle2,
  ArrowRight,
  Code2,
  Activity,
  Lock,
} from "lucide-react";

const features = [
  {
    icon: Sparkles,
    title: "AI Test Generation",
    description: "Generate comprehensive test cases from natural language requirements using GPT-4o in seconds.",
    color: "from-blue-500 to-cyan-500",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
  {
    icon: Bot,
    title: "Autonomous Agents",
    description: "Self-healing test execution with AI-driven recovery from failures — runs 24/7 unattended.",
    color: "from-violet-500 to-purple-500",
    bg: "bg-violet-500/10",
    border: "border-violet-500/20",
  },
  {
    icon: GitBranch,
    title: "Multi-Framework",
    description: "Run tests with Playwright, Puppeteer, or Selenium — your choice, zero lock-in.",
    color: "from-emerald-500 to-teal-500",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
  {
    icon: BarChart3,
    title: "Rich Analytics",
    description: "Detailed execution reports with predictive failure analysis and export to HTML, JSON, JUnit XML.",
    color: "from-orange-500 to-amber-500",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    description: "Role-based access control with flexible per-project permissions and audit trails.",
    color: "from-red-500 to-rose-500",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
  },
  {
    icon: Zap,
    title: "CI/CD Integration",
    description: "Seamless integration with GitHub Actions, GitLab CI, and Jenkins via webhooks.",
    color: "from-yellow-500 to-amber-500",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description: "Multi-project workspaces with team management, role assignments, and shared test libraries.",
    color: "from-pink-500 to-rose-500",
    bg: "bg-pink-500/10",
    border: "border-pink-500/20",
  },
  {
    icon: Globe,
    title: "Multi-Environment",
    description: "Test across development, staging, and production with environment-specific configurations.",
    color: "from-sky-500 to-blue-500",
    bg: "bg-sky-500/10",
    border: "border-sky-500/20",
  },
];

const stats = [
  { value: "10x", label: "Faster test creation" },
  { value: "99%", label: "Uptime reliability" },
  { value: "3", label: "Frameworks supported" },
  { value: "GPT-4o", label: "AI engine" },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-md">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight">AITAS</span>
              <span className="hidden sm:inline text-xs text-muted-foreground ml-2">AI Test Automation System</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild data-testid="button-docs">
              <a href="/docs">Documentation</a>
            </Button>
            <Button size="sm" asChild data-testid="button-login" className="btn-glow">
              <a href="/login">Sign In <ArrowRight className="h-3.5 w-3.5 ml-1" /></a>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden py-24 px-4">
          {/* Background */}
          <div className="absolute inset-0 -z-10">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600/8 via-violet-600/5 to-transparent" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-b from-blue-500/10 to-transparent rounded-full blur-3xl" />
            <div
              className="absolute inset-0 opacity-30"
              style={{
                backgroundImage: `radial-gradient(circle at 1px 1px, hsl(var(--border)) 1px, transparent 0)`,
                backgroundSize: "32px 32px",
              }}
            />
          </div>

          <div className="container mx-auto text-center max-w-4xl">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-6">
              <Sparkles className="h-3.5 w-3.5" />
              Powered by GPT-4o AI
            </div>

            <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-6 leading-tight">
              Test Automation,{" "}
              <span className="bg-gradient-to-r from-blue-500 via-violet-500 to-blue-600 bg-clip-text text-transparent">
                Supercharged by AI
              </span>
            </h1>

            <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
              Generate, execute, and manage automated tests with the power of AI.
              From requirements to running tests in minutes — not days.
            </p>

            <div className="flex items-center justify-center gap-4 flex-wrap">
              <Button size="lg" asChild data-testid="button-get-started" className="btn-glow h-12 px-8 text-base font-semibold">
                <a href="/login">
                  <Play className="h-4 w-4 mr-2" />
                  Get Started Free
                </a>
              </Button>
              <Button size="lg" variant="outline" asChild className="h-12 px-8 text-base">
                <a href="/docs">
                  <Code2 className="h-4 w-4 mr-2" />
                  View Docs
                </a>
              </Button>
            </div>

            {/* Trust indicators */}
            <div className="flex items-center justify-center gap-6 mt-10 flex-wrap">
              {[
                { icon: CheckCircle2, text: "No credit card required" },
                { icon: Lock, text: "Self-hosted option" },
                { icon: Activity, text: "Real browser automation" },
              ].map((item) => (
                <div key={item.text} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <item.icon className="h-4 w-4 text-emerald-500" />
                  {item.text}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Stats Bar */}
        <section className="border-y bg-muted/30 py-10 px-4">
          <div className="container mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {stats.map((stat) => (
                <div key={stat.label} className="text-center">
                  <p className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-500 to-violet-500 bg-clip-text text-transparent">
                    {stat.value}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1 font-medium">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-20 px-4">
          <div className="container mx-auto">
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
                Everything You Need for{" "}
                <span className="bg-gradient-to-r from-blue-500 to-violet-500 bg-clip-text text-transparent">
                  Modern Test Automation
                </span>
              </h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                A complete platform built for QA engineers, developers, and teams who demand quality.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {features.map((feature, index) => (
                <Card
                  key={feature.title}
                  className={`hover-elevate border transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${feature.border} animate-slide-up`}
                  style={{ animationDelay: `${index * 60}ms` }}
                  data-testid={`card-feature-${index}`}
                >
                  <CardHeader className="pb-3">
                    <div className={`h-10 w-10 rounded-xl ${feature.bg} flex items-center justify-center mb-3`}>
                      <feature.icon className={`h-5 w-5 bg-gradient-to-br ${feature.color} bg-clip-text`}
                        style={{ color: "transparent", fill: "none", stroke: `url(#grad-${index})` }}
                      />
                      {/* Fallback colored icon */}
                      <feature.icon className="h-5 w-5 text-primary" style={{ display: "none" }} />
                    </div>
                    <CardTitle className="text-base font-semibold">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <CardDescription className="text-sm leading-relaxed">
                      {feature.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-20 px-4 bg-muted/30">
          <div className="container mx-auto max-w-4xl">
            <div className="text-center mb-14">
              <h2 className="text-3xl font-bold tracking-tight mb-4">How It Works</h2>
              <p className="text-muted-foreground">From requirement to automated test in 3 simple steps</p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  step: "01",
                  icon: TestTube2,
                  title: "Describe Your Requirement",
                  desc: "Write a user story or acceptance criteria in plain English. No special syntax needed.",
                  color: "text-blue-500",
                  bg: "bg-blue-500/10",
                },
                {
                  step: "02",
                  icon: Sparkles,
                  title: "AI Generates Tests",
                  desc: "GPT-4o analyzes your requirement and creates comprehensive test cases with steps and assertions.",
                  color: "text-violet-500",
                  bg: "bg-violet-500/10",
                },
                {
                  step: "03",
                  icon: Play,
                  title: "Execute & Monitor",
                  desc: "Run tests in real browsers with Playwright, Puppeteer, or Selenium. Get instant results.",
                  color: "text-emerald-500",
                  bg: "bg-emerald-500/10",
                },
              ].map((item, i) => (
                <div key={item.step} className="relative text-center">
                  {i < 2 && (
                    <div className="hidden md:block absolute top-8 left-[calc(50%+3rem)] w-[calc(100%-6rem)] h-px bg-gradient-to-r from-border to-transparent" />
                  )}
                  <div className={`h-16 w-16 rounded-2xl ${item.bg} flex items-center justify-center mx-auto mb-4 ring-1 ring-border`}>
                    <item.icon className={`h-7 w-7 ${item.color}`} />
                  </div>
                  <div className="text-xs font-bold text-muted-foreground/50 mb-2 tracking-widest">{item.step}</div>
                  <h3 className="font-semibold text-base mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-4">
          <div className="container mx-auto max-w-3xl">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-blue-700 to-violet-700 p-12 text-white text-center shadow-2xl">
              <div className="absolute inset-0" style={{
                backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)`,
                backgroundSize: "24px 24px"
              }} />
              <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-white/5" />
              <div className="absolute -bottom-12 -left-12 h-48 w-48 rounded-full bg-white/5" />
              <div className="relative">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/15 text-sm font-medium mb-6">
                  <Zap className="h-3.5 w-3.5 text-yellow-300" />
                  Start automating today
                </div>
                <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Transform Your QA?</h2>
                <p className="text-blue-100 mb-8 text-lg max-w-xl mx-auto">
                  Join teams using AITAS to ship higher quality software, faster.
                </p>
                <Button
                  size="lg"
                  asChild
                  data-testid="button-sign-in-cta"
                  className="bg-white text-blue-700 hover:bg-blue-50 font-bold h-12 px-10 text-base shadow-xl"
                >
                  <a href="/login">
                    Get Started Now
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-8 px-4 bg-muted/20">
        <div className="container mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
              <Zap className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm">AITAS</span>
            <span className="text-muted-foreground text-sm">— AI Test Automation System</span>
          </div>
          <p className="text-muted-foreground text-sm">v1.0.0 Enterprise &bull; Built for Quality Engineers</p>
        </div>
      </footer>
    </div>
  );
}
