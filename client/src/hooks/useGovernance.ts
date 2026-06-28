/**
 * useGovernance - reactive hook exposing the platform governance mode.
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth on the client for "is this a VALIDATED system?".
 * Used by every disclaimer banner, review gate, and AI healer dialog so the
 * UI matches what the backend will actually enforce.
 */

import { useQuery } from "@tanstack/react-query";

export type SystemType = "VALIDATED" | "NON_VALIDATED";

export interface GovernanceMode {
  systemType: SystemType;
  requireHumanReview: boolean;
  allowAutoApplyAiFixes: boolean;
  requireEvidenceReview: boolean;
  requireApprovalComment: boolean;
  minApprovers: number;
  enforceImmutableAudit: boolean;
}

export interface GovernanceModeResponse {
  mode: GovernanceMode;
  description: {
    headline: string;
    summary: string;
    controls: string[];
  };
}

const DEFAULT_MODE: GovernanceMode = {
  systemType: "NON_VALIDATED",
  requireHumanReview: false,
  allowAutoApplyAiFixes: true,
  requireEvidenceReview: false,
  requireApprovalComment: false,
  minApprovers: 1,
  enforceImmutableAudit: false,
};

export function useGovernance() {
  const { data, isLoading, error, refetch } = useQuery<GovernanceModeResponse>({
    queryKey: ["/api/governance/mode"],
    staleTime: 30_000, // governance mode is cached on the server too
  });

  const mode = data?.mode ?? DEFAULT_MODE;

  return {
    mode,
    description: data?.description,
    isValidated: mode.systemType === "VALIDATED",
    requireHumanReview: mode.requireHumanReview,
    allowAutoApplyAiFixes: mode.allowAutoApplyAiFixes,
    requireEvidenceReview: mode.requireEvidenceReview,
    requireApprovalComment: mode.requireApprovalComment,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Returns the human-readable badge config for a test case review status.
 */
export function getReviewStatusBadge(status: string | null | undefined): {
  label: string;
  className: string;
  description: string;
} {
  switch (status) {
    case "APPROVED":
      return {
        label: "Approved",
        className: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700",
        description: "Reviewed and approved by a human. Safe to execute.",
      };
    case "PENDING":
      return {
        label: "Pending Review",
        className: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700",
        description: "Awaiting additional approvers.",
      };
    case "DRAFT":
      return {
        label: "AI-Generated — Not Reviewed",
        className: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700",
        description: "AI-generated content. Requires human review before execution.",
      };
    case "REJECTED":
      return {
        label: "Rejected",
        className: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700",
        description: "Reviewer rejected this test case.",
      };
    case "SUPERSEDED":
      return {
        label: "Superseded",
        className: "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-900/30 dark:text-gray-300 dark:border-gray-700",
        description: "An older version replaced by a newer review.",
      };
    case "NOT_REQUIRED":
    default:
      return {
        label: "Human-Authored",
        className: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-700",
        description: "Manually authored. No AI review required.",
      };
  }
}
