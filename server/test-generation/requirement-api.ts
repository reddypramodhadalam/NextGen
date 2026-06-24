/**
 * ============================================================================
 * API ENDPOINT FOR REQUIREMENT-BASED TEST CASE GENERATION
 * ============================================================================
 * 
 * This provides the HTTP API for converting requirements to test cases.
 * 
 * Endpoint: POST /api/v2/generate-from-requirements
 * 
 * Example usage:
 * ```bash
 * curl -X POST http://localhost:3000/api/v2/generate-from-requirements \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "title": "Risk Assessment Escalation",
 *     "description": "Test the Risk Assessment escalation process",
 *     "requirements": "Functional requirement text here...",
 *     "appUrl": "https://qa-fas.aws.baxter.com/fas/login",
 *     "appContext": "FDA-regulated medical device testing"
 *   }'
 * ```
 */

import { Router, Request, Response } from "express";
import { requirementTestGeneratorService } from "./requirement-test-generator.service";
import { z } from "zod";

const router = Router();

/**
 * Request schema for requirement-based test generation
 */
const GenerateFromRequirementsSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().optional(),
  requirements: z.string().min(50, "Requirements must be at least 50 characters"),
  appUrl: z.string().url().optional(),
  appContext: z.string().optional(),
  numberOfTestCases: z.number().int().min(1).max(20).optional().default(5),
  includeNegativeScenarios: z.boolean().optional().default(true),
  locale: z.enum(["US", "EU", "APAC"]).optional().default("US"),
});

type GenerateFromRequirementsRequest = z.infer<typeof GenerateFromRequirementsSchema>;

/**
 * POST /api/v2/generate-from-requirements
 *
 * Generate test cases from functional requirements
 */
router.post("/api/v2/generate-from-requirements", async (req: Request, res: Response) => {
  try {
    console.log("📋 [API] Received test generation request from requirements");

    // Validate request body
    const validation = GenerateFromRequirementsSchema.safeParse(req.body);
    if (!validation.success) {
      console.warn("❌ [API] Validation failed:", validation.error.errors);
      return res.status(400).json({
        success: false,
        error: "Invalid request",
        details: validation.error.errors,
      });
    }

    const payload = validation.data as GenerateFromRequirementsRequest;

    console.log(`📋 [API] Title: ${payload.title}`);
    console.log(`📝 [API] Requirements length: ${payload.requirements.length} characters`);
    console.log(`🎯 [API] Number of test cases to generate: ${payload.numberOfTestCases}`);

    // Initialize service
    await requirementTestGeneratorService.initialize();

    // Generate test cases
    const result = await requirementTestGeneratorService.generateTestCasesFromRequirements(
      {
        title: payload.title,
        description: payload.description || "",
        content: payload.requirements,
        appUrl: payload.appUrl,
        appContext: payload.appContext,
      },
      {
        numberOfTestCases: payload.numberOfTestCases,
        targetUrl: payload.appUrl,
        includeNegativeScenarios: payload.includeNegativeScenarios,
        locale: payload.locale,
      }
    );

    if (!result.success) {
      console.error("❌ [API] Generation failed:", result.errors);
      return res.status(500).json({
        success: false,
        error: "Test generation failed",
        details: result.errors,
      });
    }

    console.log(`✅ [API] Successfully generated ${result.testCases.length} test cases`);
    console.log(`📊 [API] Summary: ${result.executionSummary?.totalSteps} total steps`);

    // Return success response
    return res.status(200).json({
      success: true,
      data: {
        testCases: result.testCases,
        requirements: result.requirements,
        testDataMap: result.testDataMap,
        summary: result.executionSummary,
        metadata: {
          generatedAt: new Date().toISOString(),
          source: "AI-powered requirement analysis",
          version: "1.0",
        },
      },
    });
  } catch (error: any) {
    console.error("❌ [API] Unexpected error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
});

/**
 * GET /api/v2/generate-from-requirements/example
 *
 * Get example request format
 */
router.get("/api/v2/generate-from-requirements/example", (req: Request, res: Response) => {
  return res.status(200).json({
    title: "Risk Assessment Escalation",
    description: "Test the Risk Assessment escalation workflow",
    requirements: `
Functional Requirements:

1. Initiate Escalation
   - The system shall allow an FA Administrator to initiate a Risk Assessment by selecting the Initiate Escalation function.

2. Mandatory Data Capture
   - The system shall require completion of all mandatory fields (identified with *) before submission.
   - Issue Log Title: Product name and brief description
   - Product Type: Single or multiple selection
   - Issue Confirmation Date: Calendar control
   - Escalation Delay Justification: Required if > 14 days from confirmation
   
3. Reference Documentation
   - The system shall allow addition/removal of multiple reference entries
   - Support for CAPA, SCAR, TrackWise PR, Product Hold records

4. Supplier Involvement
   - Option to select N/A or provide supplier information
   - If selected, supplier details are required

5. Issue Description and Impact
   - Detailed description of issue, discovery method, impact
   - Chronological summary of events
   - Potential product interactions

6. Organizational Assignment
   - Division selection (mandatory)
   - Global Business Units selection (mandatory)
   - Responsible Locations (multi-select)
   - Manufacturing Locations (multi-select)

7. Technical Analysis Requirement
   - Indicator for distributed product analysis
   - If No, justification and rationale required

8. Assessment Ownership
   - FA Assessment Owner assignment (if analysis required)

9. Issue Categorization
   - Issue Category and Sub-Category selection
   - Not treated as root cause classification

10. Submission and Approval
    - Electronic signature authentication
    - Unique Issue Log Number generation upon submission
    `,
    appUrl: "https://qa-fas.aws.baxter.com/fas/login",
    appContext: "FDA-regulated medical device testing system. User: FA Administrator",
    numberOfTestCases: 5,
    includeNegativeScenarios: true,
  });
});

/**
 * POST /api/v2/generate-from-requirements/batch
 *
 * Generate test cases for multiple requirements (batch operation)
 */
router.post("/api/v2/generate-from-requirements/batch", async (req: Request, res: Response) => {
  try {
    const { requirements } = req.body;

    if (!Array.isArray(requirements) || requirements.length === 0) {
      return res.status(400).json({
        success: false,
        error: "requirements must be a non-empty array",
      });
    }

    console.log(`📋 [API] Batch operation: ${requirements.length} requirements`);

    await requirementTestGeneratorService.initialize();

    const results = await Promise.all(
      requirements.map((req: any) =>
        requirementTestGeneratorService.generateTestCasesFromRequirements(
          {
            title: req.title,
            description: req.description || "",
            content: req.requirements,
            appUrl: req.appUrl,
            appContext: req.appContext,
          },
          {
            numberOfTestCases: req.numberOfTestCases || 5,
            targetUrl: req.appUrl,
            includeNegativeScenarios: req.includeNegativeScenarios !== false,
          }
        )
      )
    );

    const allTestCases = results.flatMap((r) => r.testCases);
    const totalSteps = results.reduce(
      (sum, r) => sum + (r.executionSummary?.totalSteps || 0),
      0
    );

    console.log(`✅ [API] Batch complete: ${allTestCases.length} test cases, ${totalSteps} steps`);

    return res.status(200).json({
      success: true,
      data: {
        totalRequirements: requirements.length,
        totalTestCases: allTestCases.length,
        totalSteps,
        results: results.map((r) => ({
          success: r.success,
          testCaseCount: r.testCases.length,
          stepCount: r.executionSummary?.totalSteps || 0,
          errors: r.errors,
        })),
        testCases: allTestCases,
      },
    });
  } catch (error: any) {
    console.error("❌ [API] Batch error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
