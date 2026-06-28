/**
 * AuditTrailViewer
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders a chronological, immutable view of governance audit events.
 * Used on the test case detail page (per-resource) and on the governance
 * dashboard (global).
 */

import { useQuery } from "@tanstack/react-query";
import { Shield, AlertCircle, CheckCircle2, XCircle, Info } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AuditEntry {
  id: string;
  eventType: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  resourceType?: string;
  resourceId?: string;
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
  systemType?: string;
  payload?: any;
  ipAddress?: string;
  userAgent?: string;
  signature?: string;
  createdAt: string;
}

interface AuditTrailViewerProps {
  resourceType?: string;
  resourceId?: string;
  /** When true, shows full payload JSON. */
  verbose?: boolean;
  className?: string;
  maxHeight?: string;
}

function severityIcon(s: AuditEntry["severity"]) {
  switch (s) {
    case "CRITICAL":
      return <XCircle className="h-4 w-4 text-red-600" />;
    case "WARNING":
      return <AlertCircle className="h-4 w-4 text-amber-600" />;
    case "INFO":
    default:
      return <Info className="h-4 w-4 text-blue-500" />;
  }
}

function severityBadge(s: AuditEntry["severity"]): string {
  switch (s) {
    case "CRITICAL": return "bg-red-100 text-red-800 border-red-300";
    case "WARNING":  return "bg-amber-100 text-amber-800 border-amber-300";
    case "INFO":
    default:         return "bg-blue-100 text-blue-800 border-blue-300";
  }
}

function eventLabel(e: string): string {
  if (!e) return "Event";
  return e.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AuditTrailViewer({
  resourceType,
  resourceId,
  verbose = false,
  className,
  maxHeight = "400px",
}: AuditTrailViewerProps) {
  const queryParams = new URLSearchParams();
  if (resourceType) queryParams.set("resourceType", resourceType);
  if (resourceId) queryParams.set("resourceId", resourceId);

  const { data, isLoading, error } = useQuery<{ entries: AuditEntry[]; total: number }>({
    queryKey: ["/api/governance/audit", resourceType ?? "all", resourceId ?? "all"],
    queryFn: async () => {
      const res = await fetch(`/api/governance/audit?${queryParams.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      // The API responds with { count, rows }. Normalize to { total, entries }
      // and stay defensive so a shape change can never crash the page.
      const entries: AuditEntry[] = json.entries ?? json.rows ?? [];
      const total: number = json.total ?? json.count ?? entries.length;
      return { entries, total };
    },
  });

  return (
    <div className={cn("space-y-2", className)} data-testid="audit-trail-viewer">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Audit Trail</h3>
        </div>
        {data && (
          <span className="text-xs text-muted-foreground">
            {data.total} event{data.total === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading audit trail…</p>}
      {error && (
        <p className="text-sm text-red-600">
          Could not load audit log: {(error as Error).message}
        </p>
      )}

      {data && data.entries.length === 0 && (
        <p className="rounded-md border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
          No audit events recorded yet.
        </p>
      )}

      {data && data.entries.length > 0 && (
        <ScrollArea className="rounded-md border bg-background" style={{ maxHeight }}>
          <ol className="divide-y">
            {data.entries.map((entry) => (
              <li key={entry.id} className="p-3" data-testid={`audit-entry-${entry.id}`}>
                <div className="flex items-start gap-3">
                  {severityIcon(entry.severity)}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{eventLabel(entry.eventType)}</span>
                      <Badge variant="outline" className={cn("text-[10px]", severityBadge(entry.severity))}>
                        {entry.severity}
                      </Badge>
                      {entry.systemType && (
                        <Badge variant="outline" className="text-[10px]">{entry.systemType}</Badge>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      <span>{new Date(entry.createdAt).toLocaleString()}</span>
                      {entry.actorEmail && (
                        <> · by <span className="font-mono">{entry.actorEmail}</span></>
                      )}
                      {entry.actorRole && <> · {entry.actorRole}</>}
                      {entry.ipAddress && <> · {entry.ipAddress}</>}
                    </div>
                    {entry.resourceType && entry.resourceId && (
                      <div className="mt-1 text-xs">
                        <span className="text-muted-foreground">Resource:</span>{" "}
                        <span className="font-mono">{entry.resourceType}/{entry.resourceId.slice(0, 8)}</span>
                      </div>
                    )}
                    {verbose && entry.payload && (
                      <pre className="mt-2 max-h-32 overflow-auto rounded bg-muted p-2 text-[10px] leading-tight">
                        {JSON.stringify(entry.payload, null, 2)}
                      </pre>
                    )}
                    {entry.signature && verbose && (
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        <span className="font-semibold">Signature:</span>{" "}
                        <span className="font-mono">{entry.signature.slice(0, 16)}…</span>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </ScrollArea>
      )}
    </div>
  );
}
