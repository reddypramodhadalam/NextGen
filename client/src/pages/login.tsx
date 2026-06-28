/**
 * Login Page — Baxter Healthcare / Regulated-Industry Standard
 * ---------------------------------------------------------------------------
 * Sign-in surface for AITAS, redesigned for trust-first compliance tone.
 *
 * Layout: 60 / 40 split on desktop
 *   - Left  (60%): Baxter wordmark, value proposition, compliance bullets,
 *                  feature list. Subtle Baxter-blue gradient.
 *   - Right (40%): Clean white sign-in card with optional
 *                  "I acknowledge AI outputs require human review" checkbox.
 *
 * Functionality preserved (unchanged):
 *   - POST /api/auth/login { email, password }
 *   - mustChangePassword → redirects to /change-password
 *   - On success: invalidates /api/auth/user query and routes to /
 *   - Toast notifications for success / failure
 * ---------------------------------------------------------------------------
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { BaxterLogo } from "@/components/brand/baxter-logo";
import {
  Loader2,
  Mail,
  Lock,
  ShieldCheck,
  CheckCircle2,
  FileCheck2,
  ClipboardList,
  Server,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

// ---------------------------------------------------------------------------
// Compliance-oriented features displayed on the left panel.
// Re-uses landing-page tone (no AI hype, no speed claims).
// ---------------------------------------------------------------------------
const LEFT_FEATURES = [
  {
    icon: FileCheck2,
    label: "Human-Reviewed AI",
    desc: "All AI outputs require qualified reviewer approval before use.",
  },
  {
    icon: ClipboardList,
    label: "Full Audit Trail",
    desc: "Every action attributed, timestamped, and content-hashed.",
  },
  {
    icon: Server,
    label: "Secure Execution",
    desc: "Hardened agents with role-based access and credential vaulting.",
  },
  {
    icon: ShieldCheck,
    label: "Regulated-Ready",
    desc: "Designed to support GxP, 21 CFR Part 11, and SOX workflows.",
  },
];

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Soft gate — the checkbox is a compliance acknowledgement, not security.
    // Backend remains the source of truth; we still send the credentials.
    if (!acknowledged) {
      toast({
        variant: "destructive",
        title: "Acknowledgement required",
        description:
          "Please acknowledge that AI-generated outputs require human review before signing in.",
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await apiRequest("POST", "/api/auth/login", {
        email,
        password,
      });
      const data = await response.json();

      if (data.mustChangePassword) {
        setLocation("/change-password");
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        setLocation("/");
      }

      toast({
        title: "Signed in successfully",
        description: "Welcome to AITAS. Your session is now active.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Sign-in failed",
        description:
          error?.message ||
          "We could not verify those credentials. Please try again or contact your administrator.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col lg:flex-row"
      style={{
        backgroundColor: "var(--baxter-surface)",
        color: "var(--baxter-ink)",
        fontFamily:
          "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      {/* ============================================================
          LEFT PANEL (60%) — Branding + compliance messaging
          ============================================================ */}
      <aside
        className="hidden lg:flex lg:w-3/5 relative overflow-hidden flex-col justify-between p-12 xl:p-16"
        style={{
          background:
            "linear-gradient(135deg, #003366 0%, #00549F 55%, #0072CE 100%)",
        }}
      >
        {/* Decorative — restrained, healthcare-clean */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.07) 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />
        <div
          aria-hidden="true"
          className="absolute -top-32 -right-32 h-[420px] w-[420px] rounded-full"
          style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-24 -left-16 h-[300px] w-[300px] rounded-full"
          style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
        />

        {/* Logo (top) */}
        <div className="relative z-10">
          <BaxterLogo height={32} variant="onDark" withTagline />
        </div>

        {/* Hero block (middle) */}
        <div className="relative z-10 max-w-xl space-y-7">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{
              backgroundColor: "rgba(255,255,255,0.14)",
              border: "1px solid rgba(255,255,255,0.22)",
              color: "#ffffff",
              backdropFilter: "blur(4px)",
            }}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Enterprise · Auditable · Compliant
          </div>

          <h1 className="text-4xl xl:text-5xl font-bold tracking-tight leading-[1.1] text-white">
            Enterprise Test Automation
            <span
              className="block mt-2 font-semibold"
              style={{ color: "#BFDBFE" }}
            >
              for regulated and compliance-driven environments
            </span>
          </h1>

          <p
            className="text-base xl:text-lg leading-relaxed"
            style={{ color: "rgba(255,255,255,0.85)" }}
          >
            AI-assisted authoring with mandatory human review, role-based
            access controls, and complete audit traceability — built for the
            quality engineering teams who deliver in regulated industries.
          </p>

          <ul className="grid sm:grid-cols-2 gap-3 pt-2">
            {LEFT_FEATURES.map(({ icon: Icon, label, desc }) => (
              <li
                key={label}
                className="flex items-start gap-3 p-3.5 rounded-xl"
                style={{
                  backgroundColor: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  backdropFilter: "blur(4px)",
                }}
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: "rgba(255,255,255,0.14)" }}
                >
                  <Icon className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white leading-tight">
                    {label}
                  </p>
                  <p
                    className="text-xs mt-1 leading-relaxed"
                    style={{ color: "rgba(255,255,255,0.78)" }}
                  >
                    {desc}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer (bottom) */}
        <div className="relative z-10">
          <p
            className="text-xs"
            style={{ color: "rgba(255,255,255,0.65)" }}
          >
            © {new Date().getFullYear()} Baxter · AITAS v2.0 Enterprise · Secure · Auditable · Compliant
          </p>
        </div>
      </aside>

      {/* ============================================================
          RIGHT PANEL (40%) — Sign-in card
          ============================================================ */}
      <main className="flex flex-1 flex-col items-center justify-center p-6 lg:p-10">
        {/* Mobile-only logo (since left panel is hidden on small screens) */}
        <div className="flex lg:hidden mb-8 self-center">
          <BaxterLogo height={28} withTagline />
        </div>

        <div className="w-full max-w-md">
          {/* Heading */}
          <div className="mb-7">
            <p
              className="text-xs font-semibold tracking-[0.18em] uppercase mb-2"
              style={{ color: "var(--baxter-primary)" }}
            >
              Sign In
            </p>
            <h2 className="text-3xl font-bold tracking-tight">
              Access your AITAS account
            </h2>
            <p
              className="mt-2 text-sm leading-relaxed"
              style={{ color: "var(--baxter-ink-soft)" }}
            >
              Use your enterprise credentials. All access is logged for audit
              and compliance.
            </p>
          </div>

          {/* Form card */}
          <div
            className="rounded-xl p-6 lg:p-7 shadow-xl"
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid var(--baxter-line)",
              boxShadow:
                "0 10px 30px -10px rgba(0,94,184,0.18), 0 4px 12px -6px rgba(0,0,0,0.06)",
            }}
          >
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div className="space-y-2">
                <Label
                  htmlFor="email"
                  className="text-sm font-semibold"
                  style={{ color: "var(--baxter-ink)" }}
                >
                  Username / Email
                </Label>
                <div className="relative">
                  <Mail
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
                    style={{ color: "var(--baxter-ink-mute)" }}
                  />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@baxter.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="username"
                    className="pl-10 h-11"
                    data-testid="input-email"
                    style={{
                      borderColor: "var(--baxter-line-strong)",
                      backgroundColor: "#ffffff",
                    }}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label
                  htmlFor="password"
                  className="text-sm font-semibold"
                  style={{ color: "var(--baxter-ink)" }}
                >
                  Password
                </Label>
                <div className="relative">
                  <Lock
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
                    style={{ color: "var(--baxter-ink-mute)" }}
                  />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="pl-10 h-11"
                    data-testid="input-password"
                    style={{
                      borderColor: "var(--baxter-line-strong)",
                      backgroundColor: "#ffffff",
                    }}
                  />
                </div>
              </div>

              {/* Acknowledgement — compliance gate */}
              <div
                className="rounded-lg p-3.5 flex items-start gap-3"
                style={{
                  backgroundColor: "var(--baxter-light)",
                  border: "1px solid rgba(0,94,184,0.18)",
                }}
              >
                <Checkbox
                  id="acknowledge"
                  checked={acknowledged}
                  onCheckedChange={(v) => setAcknowledged(v === true)}
                  data-testid="checkbox-acknowledge"
                  className="mt-0.5"
                  style={{
                    borderColor: "var(--baxter-primary)",
                  }}
                />
                <Label
                  htmlFor="acknowledge"
                  className="text-xs leading-relaxed cursor-pointer font-normal"
                  style={{ color: "var(--baxter-ink-soft)" }}
                >
                  I acknowledge that AI-generated outputs in AITAS are advisory
                  and require <strong>human review and approval</strong> before
                  being used in any validated or regulated activity.
                </Label>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full h-11 text-base font-semibold text-white shadow-sm disabled:opacity-60"
                disabled={isLoading || !acknowledged}
                data-testid="button-submit-login"
                style={{ backgroundColor: "var(--baxter-primary)" }}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </form>

            <p
              className="text-center text-sm mt-5"
              style={{ color: "var(--baxter-ink-soft)" }}
            >
              Need access?{" "}
              <span
                className="font-semibold"
                style={{ color: "var(--baxter-primary)" }}
              >
                Contact your administrator
              </span>
            </p>
          </div>

          {/* Trust strip */}
          <div
            className="mt-6 flex items-center justify-center gap-5 text-xs"
            style={{ color: "var(--baxter-ink-mute)" }}
          >
            <span className="flex items-center gap-1.5">
              <ShieldCheck
                className="h-3.5 w-3.5"
                style={{ color: "var(--baxter-primary)" }}
              />
              Role-based access
            </span>
            <span
              aria-hidden="true"
              className="h-3 w-px"
              style={{ backgroundColor: "var(--baxter-line)" }}
            />
            <span className="flex items-center gap-1.5">
              <Lock
                className="h-3.5 w-3.5"
                style={{ color: "var(--baxter-primary)" }}
              />
              Encrypted in transit
            </span>
            <span
              aria-hidden="true"
              className="h-3 w-px"
              style={{ backgroundColor: "var(--baxter-line)" }}
            />
            <span className="flex items-center gap-1.5">
              <CheckCircle2
                className="h-3.5 w-3.5"
                style={{ color: "var(--baxter-success)" }}
              />
              Audit logged
            </span>
          </div>

          {/* Compliance disclaimer — visible & non-dismissible */}
          <div
            role="note"
            className="mt-6 rounded-lg p-3.5 flex gap-2.5"
            style={{
              backgroundColor: "var(--baxter-warning-bg)",
              border: "1px solid #F2BE7A",
            }}
          >
            <AlertTriangle
              className="h-4 w-4 shrink-0 mt-0.5"
              style={{ color: "var(--baxter-warning)" }}
            />
            <p
              className="text-xs leading-relaxed"
              style={{ color: "#5C3A00" }}
            >
              By signing in, you agree to use AITAS in accordance with your
              organisation&apos;s acceptable use, data handling, and quality
              management policies.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
