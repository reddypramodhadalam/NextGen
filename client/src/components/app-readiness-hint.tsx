import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, AlertTriangle, Info, Loader2, Circle } from "lucide-react";

interface ReadinessCheck {
  key: string;
  label: string;
  hint: string;
  configured: boolean;
  optional?: boolean;
}

interface ReadinessResponse {
  type: string;
  name: string;
  category: string;
  color: string;
  setupNotes: string;
  locatorStrategy: string;
  waitStrategy: string;
  checks: ReadinessCheck[];
  ready: boolean;
}

/**
 * Per-app "config readiness" hint. Given an application type, fetches the app
 * profile's setup notes + environment variables and renders a compact reminder
 * (e.g. JDE â†’ optional AIS URL, Salesforce â†’ optional Connected App). Optional
 * checks NEVER trigger an "action needed" state â€” they are informational only,
 * because standard UI/SSO workflow testing does not require them. Renders nothing
 * for plain web apps where no special setup is needed.
 */
export function AppReadinessHint({ appType }: { appType: string }) {
  const normalized = (appType || "").trim().toLowerCase();
  const skip = !normalized || normalized === "web";

  const { data, isLoading } = useQuery<ReadinessResponse>({
    queryKey: ["/api/app-profiles", normalized, "readiness"],
    queryFn: async () => {
      const res = await fetch(`/api/app-profiles/${normalized}/readiness`);
      if (!res.ok) throw new Error("Failed to load readiness");
      return res.json();
    },
    enabled: !skip,
    staleTime: 60_000,
  });

  if (skip) return null;
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking {normalized.toUpperCase()} configuration…
      </div>
    );
  }
  if (!data) return null;

  const hasChecks = data.checks && data.checks.length > 0;
  // A REQUIRED check that is missing = real action needed. Optional checks never
  // block readiness; they only add an "optional extras" note.
  const requiredMissing = data.checks.filter((c) => !c.optional && !c.configured);
  const optionalAvailable = data.checks.filter((c) => c.optional);
  const allOptional = hasChecks && data.checks.every((c) => c.optional);

  // Variant: green when ready, amber only when a REQUIRED item is missing,
  // info (blue) when the only items are optional extras.
  const variant = requiredMissing.length > 0 ? "warning" : allOptional ? "info" : "success";
  const Icon = requiredMissing.length > 0 ? AlertTriangle : allOptional ? Info : CheckCircle2;
  const titleSuffix =
    requiredMissing.length > 0
      ? " — action needed"
      : allOptional
      ? " — ready (optional extras available)"
      : " — ready";

  return (
    <Alert variant={variant} data-testid={`readiness-${normalized}`}>
      <Icon className="h-4 w-4" />
      <AlertTitle className="text-sm">
        {data.name} setup{hasChecks ? titleSuffix : ""}
      </AlertTitle>
      <AlertDescription className="text-xs space-y-2">
        <p>{data.setupNotes}</p>
        {allOptional && (
          <p className="font-medium">
            ✅ No setup required for standard UI/SSO testing. The items below are
            optional and only unlock the REST API path for data setup/teardown.
          </p>
        )}
        {hasChecks && (
          <ul className="space-y-1">
            {data.checks.map((c) => (
              <li key={c.key} className="flex items-start gap-2">
                {c.configured ? (
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[hsl(142_71%_45%)]" />
                ) : c.optional ? (
                  <Circle className="h-3.5 w-3.5 mt-0.5 shrink-0 opacity-40" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[hsl(45_93%_47%)]" />
                )}
                <span>
                  <span className="font-medium">{c.label}</span>
                  <span className="opacity-70"> ({c.key})</span>
                  {c.optional && <span className="opacity-70"> · optional</span>}
                  {!c.configured && <span> — {c.hint}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  );
}
