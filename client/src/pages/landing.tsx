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
  Globe
} from "lucide-react";

const features = [
  {
    icon: TestTube2,
    title: "AI-Powered Test Generation",
    description: "Generate comprehensive test cases from natural language requirements using GPT-4o"
  },
  {
    icon: Bot,
    title: "Autonomous Agents",
    description: "Self-healing test execution with AI-driven recovery from failures"
  },
  {
    icon: GitBranch,
    title: "Multi-Framework Support",
    description: "Run tests with Playwright, Puppeteer, or Selenium - your choice"
  },
  {
    icon: BarChart3,
    title: "Comprehensive Reports",
    description: "Detailed execution reports with export to HTML, JSON, and JUnit XML"
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    description: "Role-based access control with flexible per-project permissions"
  },
  {
    icon: Zap,
    title: "CI/CD Integration",
    description: "Seamless integration with GitHub Actions, GitLab CI, and Jenkins"
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description: "Multi-project workspaces with team management and role assignments"
  },
  {
    icon: Globe,
    title: "Multi-Environment",
    description: "Test across development, staging, and production environments"
  }
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <TestTube2 className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">AITAS</span>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" asChild data-testid="button-docs">
              <a href="/docs">Documentation</a>
            </Button>
            <Button asChild data-testid="button-login">
              <a href="/login">Sign In</a>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="py-20 px-4">
          <div className="container mx-auto text-center max-w-4xl">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              AI-Powered Test Automation System
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Generate, execute, and manage automated tests with the power of AI. 
              Build reliable software faster with intelligent test automation.
            </p>
            <Button size="lg" asChild data-testid="button-get-started">
              <a href="/login">Get Started</a>
            </Button>
          </div>
        </section>

        <section className="py-16 px-4 bg-muted/50">
          <div className="container mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12">
              Everything You Need for Test Automation
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((feature, index) => (
                <Card 
                  key={feature.title} 
                  className="hover-elevate"
                  data-testid={`card-feature-${index}`}
                >
                  <CardHeader className="pb-2">
                    <feature.icon className="h-8 w-8 text-primary mb-2" />
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-sm">
                      {feature.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 px-4">
          <div className="container mx-auto text-center max-w-2xl">
            <h2 className="text-3xl font-bold mb-6">Ready to Automate?</h2>
            <p className="text-muted-foreground mb-8">
              Start generating AI-powered test cases in minutes. 
              Sign in to get started.
            </p>
            <Button size="lg" asChild data-testid="button-sign-in-cta">
              <a href="/login">Sign In</a>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t py-8 px-4">
        <div className="container mx-auto text-center text-muted-foreground text-sm">
          <p>AITAS - AI Test Automation System</p>
        </div>
      </footer>
    </div>
  );
}
