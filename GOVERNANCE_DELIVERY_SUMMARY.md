# Human-In-The-Loop Governance — Delivery Summary

> "AI can ASSIST, but can NEVER AUTHOR or APPROVE. Final accountability must always be human."

This deliverable implements a complete governance + human-in-the-loop control system for regulated enterprises (GxP / 21 CFR Part 11 / EU Annex 11 / SOX / ISO).

## What was built

### Backend (server/)

| File | LOC | Purpose |
|---|--:|---|
| `shared/schema.ts` | +120 | 8 new HITL columns on `test_cases`; 3 new tables (`governanceAuditLog`, `reviewRecords`, `evidenceReviews`) |
| `server/sqlite-storage.ts` | +90 | Migrations 3-6: ALTER TABLE for HITL columns + backfill, plus CREATE TABLE for all 3 governance tables |
| `server/governance/rules-engine.ts` | 270 | `getGovernanceMode()`, `setSystemType()`, `computeTestCaseHash()`, `isReviewStillValid()`, `auditLog` singleton with `record()`, `query()`, `verifySignature()` |
| `server/governance/review-service.ts` | 250 | `reviewService.submit()`, `submitBulk()`, `history()` — multi-approver, self-approval prevention, SHA-256 signed |
| `server/governance/enforcement.ts` | 200 | 3 blocking middlewares: `requireApprovedTestCases`, `blockAutoApplyAiFix`, `requireEvidenceReview` + `resolveTestCaseIdsForExecution` helper |
| `server/governance-routes.ts` | 370 | 12 HTTP endpoints under `/api/governance/*` |
| `server/routes.ts` | +180 | Imports + registration + AI test stamping + audit-on-edit + middleware on 7 execution endpoints + 3 healer endpoints |

### Frontend (client/src/)

| File | LOC | Purpose |
|---|--:|---|
| `hooks/useGovernance.ts` | 105 | React hook providing `mode`, `isValidated`, `requireHumanReview`, etc. + `getReviewStatusBadge()` helper |
| `components/governance/AiDisclaimerBanner.tsx` | 100 | 3 variants: `generator`, `healer`, `screenshot` with exact wording from the brief |
| `components/governance/ReviewRequiredBadge.tsx` | 35 | Color-coded status pill with tooltip |
| `components/governance/HumanReviewGate.tsx` | 260 | The blocking approval dialog — attestation + comment + e-signature |
| `components/governance/EvidenceReviewDialog.tsx` | 220 | 3-checkbox attestation gate for screenshot uploads |
| `components/governance/AuditTrailViewer.tsx` | 170 | Timeline view of audit events, per-resource or global |
| `components/governance/index.ts` | 10 | Barrel exports |
| `pages/generator.tsx` | +60 | Wired `AiDisclaimerBanner` + `HumanReviewGate` flow (save-then-review pattern) |
| `pages/ai-healer.tsx` | +80 | Wired disclaimer banner + disabled auto-heal in validated + `HumanReviewGate` for "Apply Fix" |
| `pages/repository.tsx` | +5 | Added `ReviewRequiredBadge` on every test case row |
| `pages/settings.tsx` | +180 | New `RegulatoryModeCard` component (VALIDATED ↔ NON_VALIDATED toggle with AlertDialog) + `AuditTrailViewer` panel |

### Documentation

| File | Purpose |
|---|---|
| `GOVERNANCE_UI_WIREFRAMES.md` | ASCII wireframes for all 9 UI surfaces + enforcement map + non-bypass properties |

## API surface added

```
GET    /api/governance/mode                       # current mode + description
PUT    /api/governance/system-type                # flip VALIDATED ↔ NON_VALIDATED
POST   /api/governance/reviews                    # submit single review
POST   /api/governance/reviews/bulk               # batch reviews
GET    /api/governance/reviews/:type/:id          # history per resource
GET    /api/governance/audit?…                    # query audit log (filters)
GET    /api/governance/audit/verify/:id           # signature verification
GET    /api/governance/stats                      # dashboard counters
POST   /api/governance/evidence                   # register evidence
PUT    /api/governance/evidence/:id/attest        # record 3-checkbox attestation
POST   /api/governance/evidence/:id/upload        # mark AQM uploaded (gated)
GET    /api/governance/evidence/:id               # get evidence + status
```

## Enforcement matrix (server-side)

| Endpoint | Middleware | Behavior in VALIDATED |
|---|---|---|
| `POST /api/test-cases` | inline | AI-generated rows auto-stamped `DRAFT` + audit |
| `PATCH /api/test-cases/:id` | inline | Content edits on APPROVED rows revert to DRAFT |
| `POST /api/executions` | `requireApprovedTestCases` | 409 if any test case not APPROVED |
| `POST /api/executions/api` | `requireApprovedTestCases` | 409 if any test case not APPROVED |
| `POST /api/executions/salesforce` | `requireApprovedTestCases` | 409 if any test case not APPROVED |
| `POST /api/executions/jde` | `requireApprovedTestCases` | 409 if any test case not APPROVED |
| `POST /api/executions/sap-fiori` | `requireApprovedTestCases` | 409 if any test case not APPROVED |
| `POST /api/executions/sap-gui` | `requireApprovedTestCases` | 409 if any test case not APPROVED |
| `POST /api/execute/unified` | `requireApprovedTestCases` | 409 if test case not APPROVED |
| `POST /api/healer/analyse-suite` | `blockAutoApplyAiFix` | 403 if `autoHeal=true` |
| `POST /api/healer/heal` | `blockAutoApplyAiFix` | 403 if `autoHeal=true` |
| `POST /api/healer/on-failure` | `blockAutoApplyAiFix` | 403 if `autoHeal=true` |
| `POST /api/healer/apply` | inline | 403 unless `approvalId` provided + audit `AI_HEAL_APPLIED` |
| `POST /api/governance/evidence/:id/upload` | `requireEvidenceReview` | 409 unless all 3 attestations recorded |

## Audit event catalog

```
AI_TEST_CASE_GENERATED      - INFO     - new AI row created
AI_TEST_CASE_EDITED         - INFO     - AI row mutated by user
AI_HEAL_APPLIED             - INFO     - AI healer fix applied
REVIEW_APPROVED             - INFO     - reviewer signed off
REVIEW_REJECTED             - INFO     - reviewer rejected
EVIDENCE_ATTESTED           - INFO     - 3 attestations recorded
EVIDENCE_UPLOADED           - INFO     - sent to AQM
SYSTEM_TYPE_CHANGED         - INFO     - regulatory mode flipped
EXECUTION_BLOCKED_NO_REVIEW - WARNING  - execution refused for missing review
REVIEW_BYPASS_ATTEMPTED     - CRITICAL - user tried to bypass governance
```

Every event is SHA-256 signed (`eventType|resourceType|resourceId|actorId|timestamp|payload`).

## Compile status

✅ **Zero errors** in any governance file (verified via `tsc --noEmit` filtered for governance/review-service/enforcement/HumanReviewGate/AiDisclaimer/EvidenceReview/AuditTrail/useGovernance/ReviewRequired).

✅ **Zero errors** in `client/src/` (full client-side compile clean).

Pre-existing TS errors in `autonomous-agent.ts`, `execution.controller.ts`, `database-storage.ts`, `playwright-adapter-enhanced.ts`, missing `@types/bull`, etc. are unrelated to this work.

## Non-bypass properties

1. No "skip review" feature flag exists. Mode is read from `platform_settings.system_type` on every request (30s cache).
2. No admin role check exempts users from the middleware.
3. Edits invalidate prior approval automatically (content hash mismatch detection at both PATCH time and execution time).
4. Multi-approver support via `min_approvers` setting.
5. E-signature on the client is also re-validated server-side against the session user.
6. Audit log is append-only — no DELETE / UPDATE endpoints exposed.
7. Bypass attempts emit CRITICAL severity events with full request payload.

## Quick smoke-test plan

```bash
# 1. Set system to VALIDATED
curl -X PUT http://localhost:3000/api/governance/system-type \
     -H "Content-Type: application/json" \
     -d '{"systemType":"VALIDATED"}'

# 2. Verify mode
curl http://localhost:3000/api/governance/mode

# 3. Generate AI test cases via UI → should be saved as DRAFT
#    HumanReviewGate should auto-open

# 4. Try to execute without approval → expect 409 REVIEW_REQUIRED
curl -X POST http://localhost:3000/api/executions \
     -H "Content-Type: application/json" \
     -d '{"suiteId":"<your-suite-id>","targetUrl":"http://x.com"}'

# 5. Try auto-heal → expect 403 AUTO_APPLY_NOT_PERMITTED
curl -X POST http://localhost:3000/api/healer/heal \
     -H "Content-Type: application/json" \
     -d '{"testCaseId":"<id>","autoHeal":true}'

# 6. View audit trail
curl http://localhost:3000/api/governance/audit | jq .
```

## What's still optional (not built, but room to extend)

- **Multi-approver workflows UI.** Backend supports `min_approvers > 1`, but a dedicated "approvers pending" dashboard wasn't built.
- **Reject reason templates.** Currently free-text. Could add structured reason codes.
- **AQM connector wiring.** `evidence_reviews` table is fully gated, but the actual upload to ALM Octane / qTest / Jira Xray is left as a stub — drop the integration code into `POST /api/governance/evidence/:id/upload` handler.
- **CSV / PDF export of audit log.** Backend `GET /api/governance/audit` returns JSON; an `?format=csv` query param could be added.
- **Email/Slack approval requests.** The `notifications` settings infrastructure already exists in the app — wire `REVIEW_REQUESTED` audit events into it.
