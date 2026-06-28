/**
 * Change Password — Baxter Healthcare / Regulated-Industry Standard
 * ---------------------------------------------------------------------------
 * First-login / forced password-reset surface for AITAS. Visually matched to
 * the login page (60/40 branded split, Inter type, Baxter tokens) so the
 * authentication journey feels cohesive and premium.
 *
 * World-class touches:
 *   - Password show/hide toggles on every field
 *   - Live password-strength meter
 *   - Dynamic requirements checklist (updates as you type)
 *   - Real-time "passwords match" confirmation
 *
 * Functionality preserved (unchanged):
 *   - POST /api/auth/change-password { currentPassword, newPassword, confirmPassword }
 *   - Validates match + minimum length
 *   - On success: invalidates /api/auth/user query, toasts, routes to /
 * ---------------------------------------------------------------------------
 */

import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { BaxterLogo } from "@/components/brand/baxter-logo";
import {
  Loader2,
  Lock,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  ArrowRight,
  AlertTriangle,
  Eye,
  EyeOff,
  ShieldAlert,
  Fingerprint,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

// ---------------------------------------------------------------------------
// Security-oriented messaging for the left brand panel.
// ---------------------------------------------------------------------------
const LEFT_POINTS = [
  {
    icon: ShieldCheck,
    label: "Account Protection",
    desc: "A strong, unique password safeguards your access and the audit trail tied to your identity.",
  },
  {
    icon: Fingerprint,
    label: "Attributed Actions",
    desc: "Every action you take is recorded under your account — keep your credentials private.",
  },
  {
    icon: KeyRound,
    label: "Temporary Credential",
    desc: "Your administrator issued a one-time password. Replace it now to activate your account.",
  },
];

// ---------------------------------------------------------------------------
// Password requirement checks.
// ---------------------------------------------------------------------------
type Requirement = { label: string; test: (pw: string) => boolean };
const REQUIREMENTS: Requirement[] = [
  { label: "At least 8 characters", test: (pw) => pw.length >= 8 },
  { label: "One uppercase letter", test: (pw) => /[A-Z]/.test(pw) },
  { label: "One lowercase letter", test: (pw) => /[a-z]/.test(pw) },
  { label: "One number", test: (pw) => /[0-9]/.test(pw) },
  { label: "One special character", test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

export default function ChangePassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // --- Derived password-strength state -------------------------------------
  const passedReqs = useMemo(
    () => REQUIREMENTS.filter((r) => r.test(newPassword)).length,
    [newPassword]
  );

  const strength = useMemo(() => {
    if (!newPassword) return { score: 0, label: "—", color: "var(--baxter-line-strong)" };
    if (passedReqs <= 2) return { score: 1, label: "Weak", color: "#DC2626" };
    if (passedReqs === 3) return { score: 2, label: "Fair", color: "var(--baxter-warning)" };
    if (passedReqs === 4) return { score: 3, label: "Good", color: "#0072CE" };
    return { score: 4, label: "Strong", color: "var(--baxter-success)" };
  }, [newPassword, passedReqs]);

  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setIsLoading(true);

    try {
      await apiRequest("POST", "/api/auth/change-password", {
        currentPassword,
        newPassword,
        confirmPassword,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });

      toast({
        title: "Password changed",
        description: "Your password has been updated successfully.",
      });

      setLocation("/");
    } catch (err: any) {
      setError(err?.message || "Failed to change password. Please try again.");
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
        fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      {/* ============================================================
          LEFT PANEL (60%) — Branding + security messaging
          ============================================================ */}
      <aside
        className="hidden lg:flex lg:w-3/5 relative overflow-hidden flex-col justify-between p-12 xl:p-16"
        style={{
          background:
            "linear-gradient(135deg, #003366 0%, #00549F 55%, #0072CE 100%)",
        }}
      >
        {/* Decorative dot grid + ambient circles */}
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
            <ShieldAlert className="h-3.5 w-3.5" />
            One more step · Secure your account
          </div>

          <h1 className="text-4xl xl:text-5xl font-bold tracking-tight leading-[1.1] text-white">
            Set your new password
            <span
              className="block mt-2 font-semibold"
              style={{ color: "#BFDBFE" }}
            >
              before you continue to AITAS
            </span>
          </h1>

          <p
            className="text-base xl:text-lg leading-relaxed"
            style={{ color: "rgba(255,255,255,0.85)" }}
          >
            For your security, temporary credentials must be replaced on first
            use. Choose a strong, unique password — it protects every action
            attributed to your account.
          </p>

          <ul className="space-y-3 pt-2">
            {LEFT_POINTS.map(({ icon: Icon, label, desc }) => (
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
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.65)" }}>
            © {new Date().getFullYear()} Baxter · AITAS v2.0 Enterprise · Secure · Auditable · Compliant
          </p>
        </div>
      </aside>

      {/* ============================================================
          RIGHT PANEL (40%) — Change-password card
          ============================================================ */}
      <main className="flex flex-1 flex-col items-center justify-center p-6 lg:p-10">
        {/* Mobile-only logo */}
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
              Account Security
            </p>
            <h2 className="text-3xl font-bold tracking-tight">Change your password</h2>
            <p
              className="mt-2 text-sm leading-relaxed"
              style={{ color: "var(--baxter-ink-soft)" }}
            >
              You must change your temporary password before continuing.
            </p>
          </div>

          {/* Required notice */}
          <div
            className="rounded-lg p-3.5 mb-5 flex items-start gap-3"
            style={{
              backgroundColor: "var(--baxter-light)",
              border: "1px solid rgba(0,84,159,0.18)",
            }}
          >
            <KeyRound
              className="h-4 w-4 shrink-0 mt-0.5"
              style={{ color: "var(--baxter-primary)" }}
            />
            <p
              className="text-xs leading-relaxed"
              style={{ color: "var(--baxter-ink-soft)" }}
            >
              Your administrator set a <strong>temporary password</strong> for
              your account. Please choose a new, secure password to activate it.
            </p>
          </div>

          {/* Inline error */}
          {error && (
            <div
              role="alert"
              className="rounded-lg p-3.5 mb-5 flex items-start gap-3"
              style={{
                backgroundColor: "#FEF2F2",
                border: "1px solid #FCA5A5",
              }}
            >
              <AlertTriangle
                className="h-4 w-4 shrink-0 mt-0.5"
                style={{ color: "#DC2626" }}
              />
              <p className="text-xs leading-relaxed font-medium" style={{ color: "#991B1B" }}>
                {error}
              </p>
            </div>
          )}

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
              {/* Current password */}
              <PasswordField
                id="currentPassword"
                label="Current (temporary) password"
                placeholder="Enter your temporary password"
                value={currentPassword}
                onChange={setCurrentPassword}
                show={showCurrent}
                onToggle={() => setShowCurrent((s) => !s)}
                autoComplete="current-password"
                testId="input-current-password"
              />

              {/* New password */}
              <div className="space-y-2">
                <PasswordField
                  id="newPassword"
                  label="New password"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={setNewPassword}
                  show={showNew}
                  onToggle={() => setShowNew((s) => !s)}
                  autoComplete="new-password"
                  testId="input-new-password"
                  noWrapper
                />

                {/* Strength meter */}
                {newPassword.length > 0 && (
                  <div className="pt-1">
                    <div className="flex items-center justify-between mb-1.5">
                      <span
                        className="text-[11px] font-medium"
                        style={{ color: "var(--baxter-ink-mute)" }}
                      >
                        Password strength
                      </span>
                      <span
                        className="text-[11px] font-bold"
                        style={{ color: strength.color }}
                      >
                        {strength.label}
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4].map((seg) => (
                        <div
                          key={seg}
                          className="h-1.5 flex-1 rounded-full transition-colors"
                          style={{
                            backgroundColor:
                              seg <= strength.score
                                ? strength.color
                                : "var(--baxter-line)",
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Requirements checklist */}
              {newPassword.length > 0 && (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                  {REQUIREMENTS.map((req) => {
                    const ok = req.test(newPassword);
                    return (
                      <li
                        key={req.label}
                        className="flex items-center gap-1.5 text-[11px] font-medium"
                        style={{
                          color: ok ? "var(--baxter-success)" : "var(--baxter-ink-mute)",
                        }}
                      >
                        {ok ? (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 shrink-0 opacity-50" />
                        )}
                        {req.label}
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Confirm password */}
              <div className="space-y-2">
                <PasswordField
                  id="confirmPassword"
                  label="Confirm new password"
                  placeholder="Re-enter your new password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  show={showConfirm}
                  onToggle={() => setShowConfirm((s) => !s)}
                  autoComplete="new-password"
                  testId="input-confirm-password"
                  noWrapper
                />
                {confirmPassword.length > 0 && (
                  <p
                    className="flex items-center gap-1.5 text-[11px] font-medium"
                    style={{
                      color: passwordsMatch ? "var(--baxter-success)" : "#DC2626",
                    }}
                  >
                    {passwordsMatch ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Passwords match
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3.5 w-3.5" />
                        Passwords do not match
                      </>
                    )}
                  </p>
                )}
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full h-11 text-base font-semibold text-white shadow-sm disabled:opacity-60"
                disabled={isLoading}
                data-testid="button-change-password"
                style={{ backgroundColor: "var(--baxter-primary)" }}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Changing password…
                  </>
                ) : (
                  <>
                    Change Password
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </form>
          </div>

          {/* Trust strip */}
          <div
            className="mt-6 flex items-center justify-center gap-5 text-xs"
            style={{ color: "var(--baxter-ink-mute)" }}
          >
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
        </div>
      </main>
    </div>
  );
}

// ============================================================================
// PasswordField — reusable input with icon, label, and show/hide toggle.
// ============================================================================
function PasswordField({
  id,
  label,
  placeholder,
  value,
  onChange,
  show,
  onToggle,
  autoComplete,
  testId,
  noWrapper = false,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  autoComplete: string;
  testId: string;
  noWrapper?: boolean;
}) {
  const field = (
    <>
      <Label
        htmlFor={id}
        className="text-sm font-semibold"
        style={{ color: "var(--baxter-ink)" }}
      >
        {label}
      </Label>
      <div className="relative">
        <Lock
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
          style={{ color: "var(--baxter-ink-mute)" }}
        />
        <Input
          id={id}
          type={show ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          autoComplete={autoComplete}
          className="pl-10 pr-10 h-11"
          data-testid={testId}
          style={{
            borderColor: "var(--baxter-line-strong)",
            backgroundColor: "#ffffff",
          }}
        />
        <button
          type="button"
          onClick={onToggle}
          tabIndex={-1}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors hover:opacity-70"
          style={{ color: "var(--baxter-ink-mute)" }}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </>
  );

  return noWrapper ? field : <div className="space-y-2">{field}</div>;
}
