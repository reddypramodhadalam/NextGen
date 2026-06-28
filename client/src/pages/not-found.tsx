/**
 * Not Found (404) — Baxter Healthcare / Regulated-Industry Standard
 * ---------------------------------------------------------------------------
 * On-brand 404 surface. Rendered in BOTH the authenticated and unauthenticated
 * routers, so navigation is kept generic: "Back to home" routes to "/", which
 * resolves to the Dashboard when signed in or the Landing page when not.
 * ---------------------------------------------------------------------------
 */

import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { BaxterLogo } from "@/components/brand/baxter-logo";
import { Home, ArrowLeft, Compass, LifeBuoy } from "lucide-react";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden p-6"
      style={{
        backgroundColor: "var(--baxter-surface)",
        color: "var(--baxter-ink)",
        fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      {/* ============================================================
          Ambient background — restrained, healthcare-clean
          ============================================================ */}
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, #FFFFFF 0%, var(--baxter-surface) 100%)",
          }}
        />
        <div
          className="absolute -top-32 -right-24 h-[520px] w-[520px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(0,84,159,0.10) 0%, transparent 60%)",
            filter: "blur(20px)",
          }}
        />
        <div
          className="absolute -bottom-40 -left-32 h-[460px] w-[460px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(0,163,224,0.08) 0%, transparent 60%)",
            filter: "blur(20px)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(15,31,53,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(15,31,53,0.035) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage:
              "radial-gradient(ellipse at 50% 40%, black 30%, transparent 72%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at 50% 40%, black 30%, transparent 72%)",
          }}
        />
      </div>

      {/* Logo */}
      <div className="mb-10">
        <BaxterLogo height={28} withTagline />
      </div>

      {/* ============================================================
          404 hero — oversized numeral with gradient
          ============================================================ */}
      <div className="relative flex items-center justify-center mb-2">
        <h1
          className="font-extrabold leading-none select-none"
          style={{
            fontSize: "clamp(7rem, 22vw, 13rem)",
            letterSpacing: "-0.06em",
            background:
              "linear-gradient(135deg, #00549F 0%, #0072CE 45%, #00A3E0 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          404
        </h1>
        {/* Floating compass badge */}
        <div
          className="absolute -right-2 sm:right-2 -top-2 h-14 w-14 rounded-2xl flex items-center justify-center rotate-6"
          style={{
            backgroundColor: "#ffffff",
            border: "1px solid var(--baxter-line)",
            boxShadow: "0 12px 28px -10px rgba(0,84,159,0.30)",
          }}
        >
          <Compass className="h-7 w-7" style={{ color: "var(--baxter-primary)" }} />
        </div>
      </div>

      {/* Copy */}
      <div className="text-center max-w-lg mb-9">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          This page could not be found
        </h2>
        <p
          className="mt-3 text-base leading-relaxed"
          style={{ color: "var(--baxter-ink-soft)" }}
        >
          The page you&apos;re looking for may have been moved, renamed, or is
          temporarily unavailable. Let&apos;s get you back on track.
        </p>
      </div>

      {/* ============================================================
          Actions
          ============================================================ */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <Button
          onClick={() => setLocation("/")}
          className="h-12 px-6 text-base font-semibold text-white shadow-sm transition-all hover:translate-y-[-1px] hover:shadow-md"
          data-testid="button-go-home"
          style={{
            backgroundColor: "var(--baxter-primary)",
            boxShadow: "0 10px 24px -10px rgba(0,84,159,0.45)",
          }}
        >
          <Home className="h-4 w-4 mr-2" />
          Back to home
        </Button>

        <Button
          variant="outline"
          onClick={() => window.history.back()}
          className="h-12 px-6 text-base font-semibold transition-all hover:translate-y-[-1px]"
          data-testid="button-go-back"
          style={{
            borderColor: "var(--baxter-line-strong)",
            color: "var(--baxter-primary)",
            backgroundColor: "#ffffff",
          }}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go back
        </Button>
      </div>

      {/* Support hint */}
      <div
        className="mt-10 flex items-center gap-2 text-sm"
        style={{ color: "var(--baxter-ink-mute)" }}
      >
        <LifeBuoy className="h-4 w-4" style={{ color: "var(--baxter-primary)" }} />
        <span>
          Still stuck? Contact your administrator with error code{" "}
          <span className="font-semibold" style={{ color: "var(--baxter-ink-soft)" }}>
            HTTP&nbsp;404
          </span>
          .
        </span>
      </div>

      {/* Footer */}
      <p
        className="absolute bottom-6 text-xs"
        style={{ color: "var(--baxter-ink-mute)" }}
      >
        © {new Date().getFullYear()} Baxter · AITAS v2.0 Enterprise
      </p>
    </div>
  );
}
