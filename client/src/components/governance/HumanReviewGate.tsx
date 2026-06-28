/**
 * HumanReviewGate — the blocking approval dialog
 * ─────────────────────────────────────────────────────────────────────────────
 * Exact reviewer flow from the governance brief:
 *   1. User clicks the action button (e.g. "Save Tests" / "Approve" / "Apply Fix")
 *   2. This modal opens
 *   3. User reads the AI disclaimer
 *   4. User MUST check the attestation box: "I have reviewed and approved these test cases"
 *   5. In VALIDATED mode, user MUST type a justification comment (≥ 10 chars)
 *   6. User MUST re-type their name as e-signature
 *   7. Submit posts to POST /api/governance/reviews
 *   8. If accepted, onApproved() runs the original action
 *
 * No bypass. No "skip review" link. No admin override.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, ShieldAlert, AlertTriangle, Loader2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useGovernance } from "@/hooks/useGovernance";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

export type ReviewableResourceType =
  | "TEST_CASE"
  | "HEAL_SUGGESTION"
  | "EVIDENCE"
  | "TEST_SUITE";

export interface ReviewableItem {
  id: string;
  type: ReviewableResourceType;
  version?: number;
  title: string;
  subtitle?: string;
  /** Snippet of content the reviewer is approving (e.g. step preview). */
  contentPreview?: string;
}

interface HumanReviewGateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ReviewableItem[];
  /** Title for the dialog. */
  title?: string;
  /** Custom intro paragraph. */
  intro?: string;
  /** Called only AFTER backend records a valid APPROVED review. */
  onApproved: (reviewIds: string[]) => void | Promise<void>;
}

export function HumanReviewGate({
  open,
  onOpenChange,
  items,
  title = "Human Review Required",
  intro,
  onApproved,
}: HumanReviewGateProps) {
  const { mode, isValidated, requireApprovalComment } = useGovernance();
  const { user } = useAuth() as any;
  const { toast } = useToast();
  const [attested, setAttested] = useState(false);
  const [comment, setComment] = useState("");
  const [signature, setSignature] = useState("");

  const expectedSignature = (user?.firstName && user?.lastName)
    ? `${user.firstName} ${user.lastName}`.trim()
    : user?.email || "";

  const reset = () => {
    setAttested(false);
    setComment("");
    setSignature("");
  };

  const submitReview = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/governance/reviews/bulk", {
        items: items.map((i) => ({
          resourceType: i.type,
          resourceId: i.id,
          resourceVersion: i.version,
        })),
        decision: "APPROVED",
        comment: comment.trim(),
        signature: signature.trim(),
      });
      return (await res.json()) as { reviewIds: string[]; accepted: number; rejected: number };
    },
    onSuccess: async (data) => {
      // Invalidate test case caches so badges refresh
      queryClient.invalidateQueries({ queryKey: ["/api/test-cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/governance/stats"] });
      toast({
        title: "Review recorded",
        description: `Approved ${data.accepted} item(s). Action will continue.`,
      });
      await onApproved(data.reviewIds);
      reset();
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: "Approval failed",
        description: err?.message || "Could not record review.",
      });
    },
  });

  const commentRequired = isValidated && requireApprovalComment;
  const signatureRequired = isValidated;
  const commentOk = !commentRequired || comment.trim().length >= 10;
  const signatureOk = !signatureRequired || (
    signature.trim().length > 0 &&
    expectedSignature.length > 0 &&
    signature.trim().toLowerCase() === expectedSignature.toLowerCase()
  );
  const canSubmit = attested && commentOk && signatureOk && !submitReview.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitReview.isPending) { if (!o) reset(); onOpenChange(o); } }}>
      <DialogContent className="max-w-2xl" data-testid="human-review-gate">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {intro ||
              "You are about to approve AI-generated content. Final responsibility rests with the reviewer."}
          </DialogDescription>
        </DialogHeader>

        {/* System type banner */}
        <Alert
          className={
            isValidated
              ? "border-l-4 border-l-amber-500 bg-amber-50/80 dark:bg-amber-950/30"
              : "border-l-4 border-l-blue-400 bg-blue-50/60 dark:bg-blue-950/30"
          }
        >
          <AlertTriangle className={isValidated ? "h-4 w-4 text-amber-600" : "h-4 w-4 text-blue-500"} />
          <AlertTitle className="text-sm font-semibold">
            System Classification: {mode.systemType}
          </AlertTitle>
          <AlertDescription className="text-xs">
            {isValidated
              ? "Validated system (GxP / SOX / ISO). Comment + electronic signature required. Action will be cryptographically logged."
              : "Non-validated system. Review is recommended but lighter controls apply."}
          </AlertDescription>
        </Alert>

        {/* Items being approved */}
        <div>
          <Label className="text-sm font-semibold">
            Items requiring your approval ({items.length})
          </Label>
          <ScrollArea className="mt-2 max-h-48 rounded-md border bg-muted/30 p-2">
            <ul className="space-y-2 text-sm">
              {items.map((i) => (
                <li
                  key={`${i.type}-${i.id}`}
                  className="flex items-start gap-2 rounded p-2 hover:bg-muted/60"
                  data-testid={`review-item-${i.id}`}
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{i.title}</p>
                    {i.subtitle && (
                      <p className="truncate text-xs text-muted-foreground">{i.subtitle}</p>
                    )}
                    {i.contentPreview && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {i.contentPreview}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </div>

        {/* Attestation - always required */}
        <div className="flex items-start gap-3 rounded-md border bg-background p-3">
          <Checkbox
            id="attestation"
            checked={attested}
            onCheckedChange={(v) => setAttested(v === true)}
            data-testid="checkbox-attestation"
          />
          <Label htmlFor="attestation" className="cursor-pointer text-sm leading-relaxed">
            <span className="font-semibold">
              I have reviewed and approved {items.length === 1 ? "this item" : "these items"}.
            </span>{" "}
            I certify that the content has been independently verified, reflects the documented
            business and regulatory requirements, and that I take responsibility for its accuracy
            and correctness.
          </Label>
        </div>

        {/* Comment - required in validated mode */}
        <div className="space-y-1">
          <Label htmlFor="review-comment">
            Justification {commentRequired && <span className="text-red-600">*</span>}
          </Label>
          <Textarea
            id="review-comment"
            placeholder={
              commentRequired
                ? "Required: explain why this content is accurate and compliant (min 10 chars)…"
                : "Optional: notes for the audit trail…"
            }
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            data-testid="input-review-comment"
          />
          {commentRequired && !commentOk && comment.length > 0 && (
            <p className="text-xs text-red-600">Comment must be at least 10 characters.</p>
          )}
        </div>

        {/* E-signature - required in validated mode */}
        {signatureRequired && (
          <div className="space-y-1">
            <Label htmlFor="signature">
              Electronic Signature <span className="text-red-600">*</span>
            </Label>
            <Input
              id="signature"
              placeholder={`Re-type your name: ${expectedSignature}`}
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              data-testid="input-signature"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              By typing your name, you affirm that this is your legal electronic signature
              equivalent to a handwritten signature (21 CFR Part 11 / EU Annex 11).
            </p>
            {signature.length > 0 && !signatureOk && (
              <p className="text-xs text-red-600">
                Signature must match your account name: <strong>{expectedSignature}</strong>.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => { reset(); onOpenChange(false); }}
            disabled={submitReview.isPending}
            data-testid="button-cancel-review"
          >
            Cancel
          </Button>
          <Button
            onClick={() => submitReview.mutate()}
            disabled={!canSubmit}
            data-testid="button-submit-review"
            className="bg-green-600 hover:bg-green-700"
          >
            {submitReview.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Recording…
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Approve & Continue
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
