/**
 * EvidenceReviewDialog
 * ─────────────────────────────────────────────────────────────────────────────
 * Mandatory 3-attestation gate before any screenshot / artifact is uploaded
 * to AQM (or any external validation system).
 *
 * Per the governance brief:
 *   ☐ I confirm the screenshot is correct and represents the executed step
 *   ☐ I confirm no sensitive data / PHI / PII is present
 *   ☐ I confirm this screenshot matches the test step description
 *
 * All three required. None can be defaulted to checked.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Camera, CheckCircle2, ShieldAlert, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useGovernance } from "@/hooks/useGovernance";

export interface EvidenceItem {
  /** Server-side evidence record id (POST /api/governance/evidence). */
  id: string;
  evidenceType: "SCREENSHOT" | "VIDEO" | "HAR" | "LOG" | "ATTACHMENT";
  evidenceUri?: string;
  stepDescription?: string;
  previewUrl?: string;
}

interface EvidenceReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  evidence: EvidenceItem;
  /** Called after all three attestations succeed AND server records them. */
  onAttested: () => void | Promise<void>;
}

export function EvidenceReviewDialog({
  open,
  onOpenChange,
  evidence,
  onAttested,
}: EvidenceReviewDialogProps) {
  const { isValidated } = useGovernance();
  const { toast } = useToast();
  const [attestCorrectness, setAttestCorrectness] = useState(false);
  const [attestNoSensitive, setAttestNoSensitive] = useState(false);
  const [attestMatchesStep, setAttestMatchesStep] = useState(false);
  const [comment, setComment] = useState("");

  const reset = () => {
    setAttestCorrectness(false);
    setAttestNoSensitive(false);
    setAttestMatchesStep(false);
    setComment("");
  };

  const attestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/governance/evidence/${evidence.id}/attest`, {
        attestedCorrectness: attestCorrectness,
        attestedNoSensitiveData: attestNoSensitive,
        attestedMatchesStep: attestMatchesStep,
        comment: comment.trim() || undefined,
      });
      return await res.json();
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/governance/evidence"] });
      toast({
        title: "Evidence attested",
        description: "Attestation recorded. You may now upload to AQM.",
      });
      await onAttested();
      reset();
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: "Attestation failed",
        description: err?.message || "Server rejected the attestation.",
      });
    },
  });

  const allAttested = attestCorrectness && attestNoSensitive && attestMatchesStep;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!attestMutation.isPending) { if (!o) reset(); onOpenChange(o); } }}>
      <DialogContent className="max-w-xl" data-testid="evidence-review-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-blue-600" />
            Reviewer Attestation Required
          </DialogTitle>
          <DialogDescription>
            Before uploading evidence to formal validation records, you must attest the following.
            {isValidated && " (Required by GxP / 21 CFR Part 11.)"}
          </DialogDescription>
        </DialogHeader>

        {/* Preview */}
        {evidence.previewUrl && (
          <div className="overflow-hidden rounded-md border bg-muted">
            <img
              src={evidence.previewUrl}
              alt="Evidence preview"
              className="max-h-64 w-full object-contain"
            />
          </div>
        )}
        {evidence.stepDescription && (
          <div className="rounded-md border bg-muted/40 p-2 text-xs">
            <span className="font-semibold">Step under review:</span> {evidence.stepDescription}
          </div>
        )}

        <Alert className="border-l-4 border-l-amber-500 bg-amber-50/80 dark:bg-amber-950/30">
          <ShieldAlert className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-sm">All three attestations are required.</AlertTitle>
          <AlertDescription className="text-xs">
            The platform will block AQM upload until every checkbox below is ticked.
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <label className="flex items-start gap-3 rounded-md border bg-background p-3 cursor-pointer">
            <Checkbox
              checked={attestCorrectness}
              onCheckedChange={(v) => setAttestCorrectness(v === true)}
              data-testid="checkbox-correctness"
            />
            <span className="text-sm leading-relaxed">
              <strong>Correctness.</strong> I confirm the screenshot/evidence is correct and
              accurately represents the executed step.
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-md border bg-background p-3 cursor-pointer">
            <Checkbox
              checked={attestNoSensitive}
              onCheckedChange={(v) => setAttestNoSensitive(v === true)}
              data-testid="checkbox-no-sensitive"
            />
            <span className="text-sm leading-relaxed">
              <strong>No sensitive data.</strong> I confirm this evidence contains no PHI, PII,
              credentials, or other restricted data.
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-md border bg-background p-3 cursor-pointer">
            <Checkbox
              checked={attestMatchesStep}
              onCheckedChange={(v) => setAttestMatchesStep(v === true)}
              data-testid="checkbox-matches-step"
            />
            <span className="text-sm leading-relaxed">
              <strong>Matches step.</strong> I confirm this evidence matches the test step
              description above and was not captured from an unrelated screen.
            </span>
          </label>
        </div>

        <div className="space-y-1">
          <Label htmlFor="evidence-comment">Optional reviewer note</Label>
          <Textarea
            id="evidence-comment"
            placeholder="Any context for the audit trail…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => { reset(); onOpenChange(false); }}
            disabled={attestMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => attestMutation.mutate()}
            disabled={!allAttested || attestMutation.isPending}
            data-testid="button-attest-evidence"
            className="bg-green-600 hover:bg-green-700"
          >
            {attestMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Recording…
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Record Attestation
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
