/**
 * Baxter Brand Logo
 * ---------------------------------------------------------------------------
 * Faithful rendition of the official Baxter International wordmark, modelled
 * on the mark used at baxter.com.
 *
 * The Baxter brand signature is the word "Baxter" set in the company's
 * corporate blue (#00549F) and finished with a raised registered-trademark
 * symbol. We render it here as live text pinned with explicit inline
 * typography - Inter / Helvetica Neue, bold, italic, with tight optical
 * tracking - so the slant, weight, kerning, and color stay identical across
 * every browser and host stylesheet (no external image required, crisp at any
 * size, and never lowercase).
 * ---------------------------------------------------------------------------
 */

import { cn } from "@/lib/utils";

interface BaxterLogoProps {
  /** Height in pixels - drives the wordmark font size. */
  height?: number;
  /** Apply a className wrapper. */
  className?: string;
  /** Render the AITAS sub-brand lock-up next to the wordmark. */
  withTagline?: boolean;
  /** Render in white (for use on dark/blue surfaces). */
  variant?: "default" | "onDark";
}

export function BaxterLogo({
  height = 32,
  className,
  withTagline = false,
  variant = "default",
}: BaxterLogoProps) {
  const fill = variant === "onDark" ? "#ffffff" : "#00549F";
  const subColor = variant === "onDark" ? "rgba(255,255,255,0.92)" : "#00549F";
  const taglineMuted =
    variant === "onDark" ? "rgba(255,255,255,0.62)" : "#6B7A8C";
  const divider =
    variant === "onDark" ? "rgba(255,255,255,0.32)" : "rgba(0,84,159,0.30)";

  // The Baxter wordmark scales with `height`; the (R) is sized proportionally.
  const wordSize = Math.round(height * 0.92);
  const regSize = Math.max(8, Math.round(height * 0.26));

  return (
    <div
      className={cn("inline-flex items-center select-none", className)}
      data-testid="baxter-logo"
      aria-label="Baxter AITAS"
    >
      {/* ====================================================================
          BAXTER WORDMARK
          Official brand signature: "Baxter" in corporate blue (#00549F),
          bold + italic with tight tracking, finished with a raised (R).
          Rendered as live text so it is crisp at any size and never lowercase.
          ==================================================================== */}
      <span
        className="inline-flex items-start font-extrabold italic"
        style={{
          color: fill,
          fontSize: wordSize,
          lineHeight: 1,
          letterSpacing: "-0.03em",
          fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
          fontStyle: "italic",
        }}
      >
        Baxter
        <sup
          aria-hidden="true"
          style={{
            fontSize: regSize,
            lineHeight: 1,
            marginLeft: Math.round(height * 0.04),
            marginTop: Math.round(height * 0.06),
            fontWeight: 600,
            fontStyle: "normal",
            opacity: 0.85,
          }}
        >
          &#174;
        </sup>
      </span>

      {withTagline && (
        <>
          <span
            aria-hidden="true"
            className="mx-3 h-7 w-px"
            style={{ backgroundColor: divider }}
          />
          <div className="flex flex-col leading-none">
            <span
              className="font-bold tracking-tight"
              style={{
                color: subColor,
                fontSize: Math.round(height * 0.5),
                fontFamily:
                  "'Inter', 'Helvetica Neue', Arial, sans-serif",
                letterSpacing: "-0.03em",
                lineHeight: 1,
              }}
            >
              AITAS
            </span>
            <span
              className="mt-1 font-semibold uppercase"
              style={{
                color: taglineMuted,
                fontSize: Math.max(9, Math.round(height * 0.26)),
                fontFamily:
                  "'Inter', 'Helvetica Neue', Arial, sans-serif",
                letterSpacing: "0.18em",
                lineHeight: 1,
              }}
            >
              AI Test Automation
            </span>
          </div>
        </>
      )}
    </div>
  );
}