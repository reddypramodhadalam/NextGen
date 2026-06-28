                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  /**
 * Landing Page — Baxter Premium Enterprise Edition
 * ---------------------------------------------------------------------------
 * Pre-login surface for AITAS. Designed to deliver a "wow" first impression
 * while staying within Baxter healthcare brand standards.
 *
 * Design principles:
 *   • Single primary CTA at any moment (header CTA is scroll-revealed only
 *     after the hero's primary button scrolls out of view — never two at once)
 *   • Authentic Baxter wordmark + deep corporate blue (#00549F)
 *   • Inter typeface — the enterprise/healthcare standard for clarity
 *   • Live product preview mockup (gives credibility instantly)
 *   • Trusted-by strip, restrained motion, generous whitespace
 *   • Healthcare-grade tone of voice (no marketing hype)
 *
 * Section flow:
 *   1. Top utility strip   — micro compliance badges
 *   2. Header              — wordmark + sub-brand + single primary CTA
 *   3. Hero                — split: positioning copy (left) + product preview (right)
 *   4. Compliance banner   — regulated-industry standards
 *   5. Trust ribbon        — quiet "trusted by" / stats
 *   6. Important Notice    — non-dismissible AI advisory
 *   7. Footer              — copyright + tagline
 * ---------------------------------------------------------------------------
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { BaxterLogo } from "@/components/brand/baxter-logo";
import { cn } from "@/lib/utils";
import {
  ShieldCheck,
  Lock,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Activity,
  FileCheck2,
  UserCheck,
  Fingerprint,
  BadgeCheck,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Compliance bullets for the trust banner.
// ---------------------------------------------------------------------------
const COMPLIANCE_POINTS: string[] = [
  "Human-in-the-loop review required for all AI-generated artifacts",
  "Full audit trail with user attribution and content hashing",
  "Role-based access control and least-privilege execution",
  "Designed to support GxP, 21 CFR Part 11, and SOX-aligned workflows",
];

// ---------------------------------------------------------------------------
// Quiet stats — facts, not marketing claims.
// ---------------------------------------------------------------------------
const STATS = [
  { value: "100%", label: "AI outputs reviewed" },
  { value: "End-to-end", label: "Audit traceability" },
  { value: "Role-based", label: "Access control" },
  { value: "Validated", label: "Lifecycle workflows" },
];

export default function Landing() {
  // Scroll-aware header CTA: hidden while the hero's primary "Sign In" button
  // is on screen, revealed only after the user scrolls past it. This guarantees
  // exactly ONE visible Sign In control at any given moment.
  const [showHeaderCta, setShowHeaderCta] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowHeaderCta(window.scrollY > 520);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col antialiased"
      style={{
        backgroundColor: "var(--baxter-surface)",
        color: "var(--baxter-ink)",
        fontFamily:
          "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      {/* ============================================================
          UTILITY STRIP — tiny compliance signals (top of page)
          ============================================================ */}
      <div
        style={{
          backgroundColor: "var(--baxter-primary-dark)",
          color: "rgba(255,255,255,0.9)",
        }}
        className="text-[11px] font-medium"
      >
        <div className="container mx-auto px-6 py-1.5 flex items-center justify-center sm:justify-between gap-4">
          <p className="hidden sm:flex items-center gap-2 tracking-wide">
            <ShieldCheck className="h-3 w-3" />
            <span>Enterprise Quality Engineering · Validated Lifecycle</span>
          </p>
          <p className="flex items-center gap-2 tracking-wide uppercase">
            <span>Secure</span>
            <span aria-hidden="true" className="opacity-40">·</span>
            <span>Auditable</span>
            <span aria-hidden="true" className="opacity-40">·</span>
            <span>Compliant</span>
          </p>
        </div>
      </div>

      {/* ============================================================
          HEADER — wordmark + single primary CTA
          ============================================================ */}
      <header
        className="sticky top-0 z-50 backdrop-blur-md"
        style={{
          backgroundColor: "rgba(255,255,255,0.88)",
          borderBottom: "1px solid var(--baxter-line)",
        }}
      >
        <div className="container mx-auto px-6 py-3.5 flex items-center justify-between gap-4">
          {/* ============================================================
              BRAND LOCKUP — Baxter wordmark + AITAS sub-brand
              • "Baxter": bold + italic, capital B, signature blue
              • "AITAS": highlighted blue + bold
              • "AI Test Automation": bold ink tagline
              • "v2.0 Enterprise": enterprise pill (moved from hero badge)
              ============================================================ */}
          <div
            className="inline-flex items-center select-none"
            data-testid="brand-lockup"
            aria-label="Baxter AITAS — AI Test Automation, v2.0 Enterprise"
          >
            {/* Baxter — bold italic wordmark in signature blue */}
            <span
              className="italic font-extrabold"
              style={{
                color: "var(--baxter-primary)",
                fontSize: 28,
                lineHeight: 1,
                letterSpacing: "-0.02em",
                fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
              }}
            >
              Baxter
            </span>

            {/* Divider */}
            <span
              aria-hidden="true"
              className="mx-3 h-7 w-px"
              style={{ backgroundColor: "rgba(0,84,159,0.30)" }}
            />

            {/* AITAS lock-up */}
            <div className="flex flex-col leading-none">
              <div className="flex items-baseline gap-1.5">
                <span
                  className="font-extrabold tracking-tight"
                  style={{
                    color: "var(--baxter-primary)",
                    fontSize: 17,
                    lineHeight: 1,
                    letterSpacing: "-0.02em",
                  }}
                >
                  AITAS
                </span>
                <span
                  className="font-bold tracking-tight"
                  style={{
                    color: "var(--baxter-ink)",
                    fontSize: 14,
                    lineHeight: 1,
                  }}
                >
                  AI Test Automation
                </span>
              </div>
              <span
                className="mt-1 inline-flex items-center self-start rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase"
                style={{
                  color: "var(--baxter-primary)",
                  backgroundColor: "rgba(0,84,159,0.08)",
                  letterSpacing: "0.14em",
                }}
              >
                v2.0 Enterprise
              </span>
            </div>
          </div>

          {/* Scroll-revealed CTA — only appears after the hero's primary Sign In
              button leaves the viewport, so users never see two at once. */}
          <div
            className={cn(
              "flex items-center gap-2 transition-all duration-300",
              showHeaderCta
                ? "opacity-100 translate-y-0 pointer-events-auto"
                : "opacity-0 -translate-y-1 pointer-events-none"
            )}
            aria-hidden={!showHeaderCta}
          >
            <Button
              asChild
              data-testid="button-login"
              tabIndex={showHeaderCta ? 0 : -1}
              className="h-10 px-5 font-semibold text-white shadow-sm transition-all hover:translate-y-[-1px] hover:shadow-md"
              style={{ backgroundColor: "var(--baxter-primary)" }}
            >
              <a href="/login" className="inline-flex items-center">
                Sign In
                <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </a>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ============================================================
            HERO — Positioning + product preview mockup
            ============================================================ */}
        <section className="relative overflow-hidden">
          {/* Layered ambient background */}
          <div aria-hidden="true" className="absolute inset-0 -z-10">
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, #FFFFFF 0%, var(--baxter-surface) 100%)",
              }}
            />
            {/* Soft blue glow upper-right */}
            <div
              className="absolute -top-32 -right-32 h-[640px] w-[640px] rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(0,84,159,0.12) 0%, transparent 60%)",
                filter: "blur(20px)",
              }}
            />
            {/* Cyan accent lower-left */}
            <div
              className="absolute -bottom-40 -left-32 h-[520px] w-[520px] rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(0,163,224,0.10) 0%, transparent 60%)",
                filter: "blur(20px)",
              }}
            />
            {/* Fine grid */}
            <div
              className="absolute inset-0 opacity-[0.35]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(15,31,53,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(15,31,53,0.04) 1px, transparent 1px)",
                backgroundSize: "48px 48px",
                maskImage:
                  "radial-gradient(ellipse at 50% 30%, black 35%, transparent 75%)",
                WebkitMaskImage:
                  "radial-gradient(ellipse at 50% 30%, black 35%, transparent 75%)",
              }}
            />
          </div>

          <div className="container mx-auto px-6 py-16 lg:py-24">
            <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-center">
              {/* ============ LEFT — Positioning ============ */}
              <div className="lg:col-span-6 space-y-7">
                {/* Headline — large, confident, tight tracking */}
                <h1
                  className="font-extrabold"
                  style={{
                    fontSize: "clamp(2.25rem, 4.4vw, 3.6rem)",
                    lineHeight: 1.07,
                    letterSpacing: "-0.03em",
                    color: "var(--baxter-ink)",
                    fontFeatureSettings: "'ss01', 'cv11'",
                  }}
                >
                  Accelerating Innovation.
                  <br />
                  <span style={{ color: "var(--baxter-primary)" }}>
                    Ensuring Healthcare Safety.
                  </span>
                </h1>

                {/* Sub-copy */}
                <p
                  className="max-w-xl"
                  style={{
                    color: "var(--baxter-ink-soft)",
                    fontSize: "1.125rem",
                    lineHeight: 1.65,
                    letterSpacing: "-0.006em",
                    fontWeight: 400,
                  }}
                >
                  AITAS empowers Baxter&rsquo;s engineering teams to deliver
                  high-quality software at speed, without ever compromising
                  compliance. By pairing AI-assisted authoring with mandatory
                  human review and automated audit traceability, we uphold the
                  highest standards of safety for the medical technologies that
                  save and sustain lives.
                </p>

                {/* Single primary CTA — only sign-in trigger in the hero */}
                <div className="pt-2 flex flex-wrap items-center gap-4">
                  <Button
                    asChild
                    data-testid="button-get-started"
                    className="h-14 px-8 text-base font-semibold text-white shadow-lg transition-all hover:translate-y-[-2px] hover:shadow-xl group"
                    style={{
                      backgroundColor: "var(--baxter-primary)",
                      boxShadow:
                        "0 10px 24px -8px rgba(0,84,159,0.45), 0 4px 8px -4px rgba(0,84,159,0.25)",
                    }}
                  >
                    <a href="/login" className="inline-flex items-center">
                      Sign In to AITAS
                      <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                    </a>
                  </Button>

                  <div
                    className="flex items-center gap-2 text-sm"
                    style={{ color: "var(--baxter-ink-mute)" }}
                  >
                    <Lock
                      className="h-4 w-4"
                      style={{ color: "var(--baxter-primary)" }}
                    />
                    <span>SSO and enterprise credentials supported</span>
                  </div>
                </div>

                {/* Trust micro-signals */}
                <div
                  className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-4 text-sm"
                  style={{ color: "var(--baxter-ink-soft)" }}
                >
                  {[
                    { Icon: CheckCircle2, text: "Human-reviewed AI outputs" },
                    { Icon: FileCheck2, text: "21 CFR Part 11 aligned" },
                    { Icon: ShieldCheck, text: "End-to-end audit log" },
                  ].map(({ Icon, text }) => (
                    <span key={text} className="inline-flex items-center gap-1.5">
                      <Icon
                        className="h-4 w-4"
                        style={{ color: "var(--baxter-success)" }}
                      />
                      {text}
                    </span>
                  ))}
                </div>
              </div>

              {/* ============ RIGHT — Product preview mockup ============ */}
              <div className="lg:col-span-6 relative">
                <ProductPreview />
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================
            STAT RIBBON — quiet, factual
            ============================================================ */}
        <section
          className="border-y"
          style={{
            backgroundColor: "#ffffff",
            borderColor: "var(--baxter-line)",
          }}
        >
          <div className="container mx-auto px-6 py-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {STATS.map((s) => (
                <div key={s.label} className="text-center md:text-left">
                  <p
                    className="text-2xl lg:text-3xl font-extrabold tracking-tight"
                    style={{
                      color: "var(--baxter-primary)",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {s.value}
                  </p>
                  <p
                    className="text-xs lg:text-sm mt-1 font-medium uppercase tracking-wider"
                    style={{ color: "var(--baxter-ink-mute)" }}
                  >
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================================
            COMPLIANCE BANNER — light-blue, restrained, two-column
            ============================================================ */}
        <section
          aria-labelledby="compliance-heading"
          style={{
            backgroundColor: "var(--baxter-light)",
            borderBottom: "1px solid rgba(0,84,159,0.10)",
          }}
        >
          <div className="container mx-auto px-6 py-14 lg:py-16">
            <div className="grid lg:grid-cols-12 gap-10 items-start">
              <div className="lg:col-span-4">
                <p
                  className="text-xs font-bold uppercase tracking-[0.18em] mb-3"
                  style={{ color: "var(--baxter-secondary)" }}
                >
                  Compliance &amp; Governance
                </p>
                <h2
                  id="compliance-heading"
                  className="text-3xl lg:text-4xl font-extrabold tracking-tight leading-[1.1]"
                  style={{
                    color: "var(--baxter-primary)",
                    letterSpacing: "-0.02em",
                  }}
                >
                  Built for compliance and regulatory standards.
                </h2>
              </div>

              <ul className="lg:col-span-8 grid sm:grid-cols-2 gap-x-8 gap-y-4">
                {COMPLIANCE_POINTS.map((point) => (
                  <li
                    key={point}
                    className="flex items-start gap-3 text-[15px] leading-relaxed"
                    style={{ color: "var(--baxter-ink)" }}
                  >
                    <div
                      className="h-6 w-6 shrink-0 rounded-full flex items-center justify-center mt-0.5"
                      style={{
                        backgroundColor: "#ffffff",
                        border: "1px solid rgba(0,84,159,0.18)",
                      }}
                    >
                      <CheckCircle2
                        className="h-3.5 w-3.5"
                        style={{ color: "var(--baxter-primary)" }}
                      />
                    </div>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ============================================================
            ENGINEERING RESPONSIBILITY & AI GOVERNANCE
            World-class advisory: gradient header band + 3 governance pillars
            ============================================================ */}
        <section className="py-16 lg:py-24">
          <div className="container mx-auto px-6">
            <div
              role="note"
              aria-label="Engineering responsibility and AI governance notice"
              data-testid="compliance-notice"
              className="relative max-w-5xl mx-auto rounded-3xl overflow-hidden"
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid var(--baxter-line)",
                boxShadow:
                  "0 30px 70px -32px rgba(15,31,53,0.26), 0 10px 30px -18px rgba(15,31,53,0.14)",
              }}
            >
              {/* ===== Header band — deep Baxter blue with shield emblem ===== */}
              <div
                className="relative overflow-hidden px-8 lg:px-12 py-9 lg:py-10"
                style={{
                  background:
                    "linear-gradient(135deg, #003366 0%, #00549F 58%, #0072CE 100%)",
                }}
              >
                {/* Dot-grid texture */}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)",
                    backgroundSize: "26px 26px",
                  }}
                />
                {/* Ambient glow */}
                <div
                  aria-hidden="true"
                  className="absolute -top-24 -right-16 h-72 w-72 rounded-full"
                  style={{ backgroundColor: "rgba(255,255,255,0.07)" }}
                />

                <div className="relative z-10 flex items-start gap-4 lg:gap-5">
                  {/* Glass shield badge */}
                  <div
                    className="h-14 w-14 lg:h-16 lg:w-16 shrink-0 rounded-2xl flex items-center justify-center"
                    style={{
                      backgroundColor: "rgba(255,255,255,0.14)",
                      border: "1px solid rgba(255,255,255,0.28)",
                      backdropFilter: "blur(6px)",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25)",
                    }}
                  >
                    <ShieldCheck className="h-7 w-7 lg:h-8 lg:w-8 text-white" />
                  </div>

                  <div className="flex-1">
                    <div
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.16em] mb-2.5"
                      style={{
                        backgroundColor: "rgba(255,255,255,0.16)",
                        border: "1px solid rgba(255,255,255,0.22)",
                        color: "#ffffff",
                      }}
                    >
                      <AlertTriangle className="h-3 w-3" />
                      Important Notice
                    </div>
                    <h2
                      className="text-2xl lg:text-[1.75rem] font-bold tracking-tight text-white leading-snug"
                      style={{ letterSpacing: "-0.02em" }}
                    >
                      Engineering Responsibility &amp; AI Governance
                    </h2>
                  </div>
                </div>
              </div>

              {/* ===== Body ===== */}
              <div className="px-8 lg:px-12 py-9 lg:py-10">
                <p
                  className="text-[15px] lg:text-base leading-relaxed max-w-3xl"
                  style={{ color: "var(--baxter-ink-soft)" }}
                >
                  AITAS accelerates development through AI-assisted automation, but{" "}
                  <strong style={{ color: "var(--baxter-ink)" }}>
                    patient safety and regulatory compliance require human
                    accountability
                  </strong>
                  . All AI-generated test cases, code snippets, and analyses serve
                  strictly as advisory drafts.
                </p>
                <p
                  className="mt-4 text-[15px] lg:text-base leading-relaxed max-w-3xl"
                  style={{ color: "var(--baxter-ink-soft)" }}
                >
                  Before deployment into any validated or{" "}
                  <strong style={{ color: "var(--baxter-ink)" }}>GxP</strong>{" "}
                  environment, every artifact must undergo formal review and sign-off
                  by a qualified Baxter team member. Final accountability rests
                  entirely with the authorized human operator.
                </p>

                {/* ===== Three governance pillars ===== */}
                <div className="mt-8 grid gap-4 sm:grid-cols-3">
                  {[
                    {
                      Icon: UserCheck,
                      title: "Verified Oversight",
                      desc: "Mandatory human approval required for all outputs.",
                      accent: "var(--baxter-primary)",
                      tint: "var(--baxter-light)",
                      ring: "rgba(0,84,159,0.16)",
                    },
                    {
                      Icon: Fingerprint,
                      title: "Full Traceability",
                      desc: "Every decision is tied to a unique Baxter user ID for audit preparation.",
                      accent: "#6A3CB5",
                      tint: "#F3EEFB",
                      ring: "rgba(106,60,181,0.16)",
                    },
                    {
                      Icon: BadgeCheck,
                      title: "Regulatory Alignment",
                      desc: "Built to fit directly into Baxter\u2019s validated software lifecycles.",
                      accent: "var(--baxter-success)",
                      tint: "var(--baxter-success-bg)",
                      ring: "rgba(46,125,50,0.18)",
                    },
                  ].map(({ Icon, title, desc, accent, tint, ring }) => (
                    <div
                      key={title}
                      className="rounded-2xl p-5 transition-all hover:translate-y-[-2px]"
                      style={{
                        backgroundColor: "#ffffff",
                        border: "1px solid var(--baxter-line)",
                        boxShadow: "0 6px 18px -12px rgba(15,31,53,0.18)",
                      }}
                    >
                      <div
                        className="h-11 w-11 rounded-xl flex items-center justify-center mb-3.5"
                        style={{
                          backgroundColor: tint,
                          border: `1px solid ${ring}`,
                        }}
                      >
                        <Icon className="h-5 w-5" style={{ color: accent }} />
                      </div>
                      <h3
                        className="text-sm font-bold tracking-tight mb-1.5"
                        style={{ color: "var(--baxter-ink)" }}
                      >
                        {title}
                      </h3>
                      <p
                        className="text-[13px] leading-relaxed"
                        style={{ color: "var(--baxter-ink-mute)" }}
                      >
                        {desc}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ============================================================
          FOOTER
          ============================================================ */}
      <footer
        style={{
          backgroundColor: "#ffffff",
          borderTop: "1px solid var(--baxter-line)",
        }}
      >
        <div className="container mx-auto px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <BaxterLogo height={22} />
            <span
              className="text-sm font-medium"
              style={{ color: "var(--baxter-ink-soft)" }}
            >
              AITAS v2.0 Enterprise
            </span>
          </div>
          <p
            className="text-xs sm:text-sm font-medium"
            style={{ color: "var(--baxter-ink-mute)" }}
          >
            © {new Date().getFullYear()} Baxter · Secure · Auditable · Compliant
          </p>
        </div>
      </footer>
    </div>
  );
}

// ============================================================================
// ProductPreview — high-fidelity mockup of the AITAS dashboard.
// Pure CSS/SVG, no images, no runtime cost. Conveys credibility instantly.
// ============================================================================
function ProductPreview() {
  return (
    <div className="relative">
      {/* Outer glow */}
      <div
        aria-hidden="true"
        className="absolute -inset-4 rounded-3xl"
        style={{
          background:
            "linear-gradient(135deg, rgba(0,84,159,0.18) 0%, rgba(0,163,224,0.10) 100%)",
          filter: "blur(24px)",
        }}
      />

      {/* Browser-chrome frame */}
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          backgroundColor: "#ffffff",
          border: "1px solid var(--baxter-line)",
          boxShadow:
            "0 30px 60px -20px rgba(0,84,159,0.30), 0 18px 36px -18px rgba(15,31,53,0.20), 0 0 0 1px rgba(15,31,53,0.04)",
        }}
      >
        {/* Top bar — traffic lights + URL */}
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{
            backgroundColor: "#F5F8FB",
            borderBottom: "1px solid var(--baxter-line)",
          }}
        >
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
          </div>
          <div
            className="flex-1 text-center text-xs font-medium px-3 py-1 rounded-md max-w-xs mx-auto"
            style={{
              backgroundColor: "#ffffff",
              color: "var(--baxter-ink-mute)",
              border: "1px solid var(--baxter-line)",
            }}
          >
            <Lock className="h-3 w-3 inline mr-1.5 -mt-0.5" />
            aitas.baxter.com/dashboard
          </div>
        </div>

        {/* App body */}
        <div className="grid grid-cols-12 min-h-[420px]">
          {/* Sidebar */}
          <aside
            className="col-span-3 p-4 hidden sm:flex flex-col gap-1"
            style={{
              backgroundColor: "#0F1F35",
              color: "rgba(255,255,255,0.85)",
            }}
          >
            <div className="flex items-center gap-2 px-2 py-2 mb-3">
              <div
                className="h-7 w-7 rounded-md flex items-center justify-center font-bold text-xs"
                style={{
                  backgroundColor: "var(--baxter-primary)",
                  color: "#ffffff",
                }}
              >
                A
              </div>
              <span className="text-sm font-bold tracking-tight">AITAS</span>
            </div>
            {[
              { label: "Dashboard", active: true },
              { label: "Test Cases" },
              { label: "Executions" },
              { label: "Governance" },
              { label: "Reports" },
            ].map((item) => (
              <div
                key={item.label}
                className="text-[11px] px-2.5 py-1.5 rounded-md font-medium"
                style={{
                  backgroundColor: item.active
                    ? "rgba(0,163,224,0.18)"
                    : "transparent",
                  color: item.active ? "#ffffff" : "rgba(255,255,255,0.65)",
                }}
              >
                {item.label}
              </div>
            ))}
          </aside>

          {/* Main */}
          <div className="col-span-12 sm:col-span-9 p-5 flex flex-col gap-4">
            {/* Header row */}
            <div className="flex items-center justify-between">
              <div>
                <p
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: "var(--baxter-ink-mute)" }}
                >
                  Overview
                </p>
                <h4
                  className="text-base font-extrabold tracking-tight"
                  style={{ color: "var(--baxter-ink)" }}
                >
                  Quality Engineering Dashboard
                </h4>
              </div>
              <div
                className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full"
                style={{
                  backgroundColor: "var(--baxter-success-bg)",
                  color: "var(--baxter-success)",
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: "var(--baxter-success)" }}
                />
                LIVE
              </div>
            </div>

            {/* KPI tiles */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Tests", value: "1,284", trend: "+12%", Icon: FileCheck2 },
                { label: "Pass rate", value: "98.4%", trend: "+1.2%", Icon: CheckCircle2 },
                { label: "AI drafts", value: "342", trend: "reviewed", Icon: Sparkles },
              ].map((k) => (
                <div
                  key={k.label}
                  className="rounded-lg p-3"
                  style={{
                    backgroundColor: "#ffffff",
                    border: "1px solid var(--baxter-line)",
                  }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--baxter-ink-mute)" }}
                    >
                      {k.label}
                    </span>
                    <k.Icon
                      className="h-3 w-3"
                      style={{ color: "var(--baxter-primary)" }}
                    />
                  </div>
                  <div
                    className="text-lg font-extrabold tracking-tight"
                    style={{ color: "var(--baxter-ink)" }}
                  >
                    {k.value}
                  </div>
                  <div
                    className="text-[10px] font-medium"
                    style={{ color: "var(--baxter-success)" }}
                  >
                    {k.trend}
                  </div>
                </div>
              ))}
            </div>

            {/* Chart card */}
            <div
              className="rounded-lg p-4 flex-1"
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid var(--baxter-line)",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <span
                  className="text-xs font-bold tracking-tight"
                  style={{ color: "var(--baxter-ink)" }}
                >
                  Execution trend — last 14 days
                </span>
                <Activity
                  className="h-3.5 w-3.5"
                  style={{ color: "var(--baxter-primary)" }}
                />
              </div>
              <MiniChart />
            </div>

            {/* Activity row */}
            <div
              className="rounded-lg p-3 flex items-center justify-between text-[11px]"
              style={{
                backgroundColor: "var(--baxter-light)",
                border: "1px solid rgba(0,84,159,0.14)",
              }}
            >
              <span
                className="font-semibold"
                style={{ color: "var(--baxter-primary)" }}
              >
                <CheckCircle2 className="h-3 w-3 inline mr-1 -mt-0.5" />
                12 AI drafts pending reviewer approval
              </span>
              <span
                className="font-medium"
                style={{ color: "var(--baxter-ink-mute)" }}
              >
                Updated 2m ago
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Floating accent card — bottom-left */}
      <div
        className="absolute -bottom-6 -left-4 sm:-left-6 rounded-xl p-3 hidden md:flex items-center gap-2.5 max-w-[240px]"
        style={{
          backgroundColor: "#ffffff",
          border: "1px solid var(--baxter-line)",
          boxShadow: "0 12px 28px -8px rgba(0,84,159,0.25)",
        }}
      >
        <div
          className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "var(--baxter-light)" }}
        >
          <ShieldCheck
            className="h-4 w-4"
            style={{ color: "var(--baxter-primary)" }}
          />
        </div>
        <div className="leading-tight">
          <p
            className="text-[11px] font-bold"
            style={{ color: "var(--baxter-ink)" }}
          >
            Audit-grade traceability
          </p>
          <p
            className="text-[10px]"
            style={{ color: "var(--baxter-ink-mute)" }}
          >
            Every action attributed
          </p>
        </div>
      </div>

      {/* Floating accent card — top-right */}
      <div
        className="absolute -top-5 -right-3 sm:-right-5 rounded-xl p-3 hidden md:flex items-center gap-2.5"
        style={{
          backgroundColor: "var(--baxter-primary)",
          color: "#ffffff",
          boxShadow: "0 12px 28px -8px rgba(0,84,159,0.45)",
        }}
      >
        <Sparkles className="h-4 w-4" />
        <div className="leading-tight">
          <p className="text-[11px] font-bold">AI-assisted</p>
          <p className="text-[10px] opacity-90">Human-reviewed</p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MiniChart — lightweight inline SVG sparkline-style chart for the mockup.
// ============================================================================
function MiniChart() {
  // 14 days of execution counts — gentle upward trend.
  const data = [42, 38, 55, 50, 62, 58, 70, 65, 78, 74, 88, 84, 96, 102];
  const w = 480;
  const h = 110;
  const pad = 8;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const step = (w - pad * 2) / (data.length - 1);
  const y = (v: number) =>
    h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);

  const points = data.map((v, i) => `${pad + i * step},${y(v)}`).join(" ");
  const areaPoints = `${pad},${h - pad} ${points} ${pad + (data.length - 1) * step},${h - pad}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-auto"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00A3E0" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#00A3E0" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="chart-stroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#00549F" />
          <stop offset="100%" stopColor="#00A3E0" />
        </linearGradient>
      </defs>
      {/* Grid */}
      {[0.25, 0.5, 0.75].map((p) => (
        <line
          key={p}
          x1={pad}
          x2={w - pad}
          y1={pad + (h - pad * 2) * p}
          y2={pad + (h - pad * 2) * p}
          stroke="#E8EEF5"
          strokeDasharray="3 4"
          strokeWidth="1"
        />
      ))}
      {/* Area fill */}
      <polygon points={areaPoints} fill="url(#chart-fill)" />
      {/* Line */}
      <polyline
        points={points}
        fill="none"
        stroke="url(#chart-stroke)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Last point dot */}
      {(() => {
        const lastX = pad + (data.length - 1) * step;
        const lastY = y(data[data.length - 1]);
        return (
          <>
            <circle cx={lastX} cy={lastY} r="5" fill="#ffffff" />
            <circle cx={lastX} cy={lastY} r="3.5" fill="#00549F" />
          </>
        );
      })()}
    </svg>
  );
}
