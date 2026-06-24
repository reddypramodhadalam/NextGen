/**
 * ============================================================================
 * REQUIREMENT TO TEST CASE GENERATOR SERVICE
 * ============================================================================
 * 
 * This service orchestrates the conversion of functional requirements
 * into detailed, executable test cases.
 * 
 * Key features:
 * - Parses requirements documents
 * - Extracts atomic requirements
 * - Maps requirements to test scenarios
 * - Generates detailed test steps with data and locators
 * - Ensures output compatibility with test executor
 */

import { getAiClient } from "../ai-client";
import {
  REQUIREMENT_TO_TESTCASE_SYSTEM_PROMPT,
  REQUIREMENT_TO_TESTCASE_USER_PROMPT_TEMPLATE,
  RequirementToTestCaseResponse,
  GeneratedTestCase,
  ParsedRequirement,
} from "./requirement-to-testcase-prompt";

export interface RequirementDocument {
  title: string;
  description: string;
  content: string; // Raw requirement text
  appUrl?: string;
  appContext?: string; // Additional context (e.g., "Login required", "Admin user role")
}

export interface GenerationOptions {
  numberOfTestCases?: number; // 3-10 recommended
  targetUrl?: string;
  includeNegativeScenarios?: boolean;
  maxStepsPerCase?: number;
  locale?: "US" | "EU" | "APAC";
}

export interface GenerationResult {
  success: boolean;
  testCases: GeneratedTestCase[];
  requirements: ParsedRequirement[];
  testDataMap: Record<string, any>;
  executionSummary?: {
    totalTestCases: number;
    totalSteps: number;
    averageStepsPerCase: number;
    dataEntriesCount: number;
    estimatedExecutionTime: number; // in seconds
  };
  errors?: string[];
}

export class RequirementTestGeneratorService {
  private aiClient: any;

  constructor() {}

  /**
   * Initialize AI client
   */
  async initialize(): Promise<void> {
    this.aiClient = await getAiClient();
  }

  /**
   * Main method: Generate test cases from requirements
   */
  async generateTestCasesFromRequirements(
    requirements: RequirementDocument,
    options: GenerationOptions = {}
  ): Promise<GenerationResult> {
    console.log("🧪 [TestGenerator] Starting test case generation from requirements");
    console.log(`📋 Requirements: ${requirements.title}`);
    console.log(`📝 Content length: ${requirements.content.length} characters`);

    try {
      // Validate requirements
      if (!requirements.content || requirements.content.trim().length < 50) {
        throw new Error(
          "Requirements content is too short. Please provide detailed requirements (minimum 50 characters)"
        );
      }

      // Initialize if needed
      if (!this.aiClient) {
        await this.initialize();
      }

      // Step 1: Generate test cases via AI (with fallback)
      console.log("🤖 [TestGenerator] Calling AI for test case generation...");
      let parsed;
      
      try {
        const aiResponse = await this.callAIForGeneration(requirements, options);
        console.log("✅ [TestGenerator] AI Response received successfully");
        console.log(`   Response length: ${aiResponse.length} characters`);
        
        try {
          parsed = this.parseAIResponse(aiResponse);
          console.log(`✅ [TestGenerator] AI JSON parsed successfully: ${parsed.testCases.length} test cases`);
        } catch (parseError: any) {
          console.warn("⚠️ [TestGenerator] Failed to parse AI JSON response, using fallback");
          console.warn(`   Parse error: ${parseError.message}`);
          parsed = this.generateFallbackTestCases(requirements, options);
        }
      } catch (aiError: any) {
        console.warn("⚠️ [TestGenerator] AI generation failed, using fallback generator");
        console.warn(`   Reason: ${aiError.message}`);
        parsed = this.generateFallbackTestCases(requirements, options);
      }

      // Step 3: Validate and enhance test cases
      console.log("🔍 [TestGenerator] Validating and enhancing test cases...");
      const validated = this.validateAndEnhanceTestCases(parsed, requirements, options);

      // Step 4: Calculate summary
      const summary = this.generateExecutionSummary(validated);

      return {
        success: true,
        testCases: validated.testCases,
        requirements: validated.requirements,
        testDataMap: validated.testDataMap,
        executionSummary: summary,
      };
    } catch (error: any) {
      console.error("❌ [TestGenerator] Error generating test cases:", error.message);
      return {
        success: false,
        testCases: [],
        requirements: [],
        testDataMap: {},
        errors: [error.message],
      };
    }
  }

  /**
   * Call AI to generate test cases (with timeout)
   */
  private async callAIForGeneration(
    requirements: RequirementDocument,
    options: GenerationOptions
  ): Promise<string> {
    const userPrompt = REQUIREMENT_TO_TESTCASE_USER_PROMPT_TEMPLATE(
      requirements.content,
      requirements.appContext
    );

    console.log("📤 [TestGenerator] Sending to AI:");
    console.log(`   - Prompt length: ${userPrompt.length} chars`);
    console.log(`   - System prompt configured: ${REQUIREMENT_TO_TESTCASE_SYSTEM_PROMPT.length} chars`);

    try {
      // Add timeout of 60 seconds
      const timeoutPromise = new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("AI request timeout (60 seconds)")), 60000)
      );

      const aiPromise = this.aiClient.chat(
        [{ role: "user", content: userPrompt }],
        REQUIREMENT_TO_TESTCASE_SYSTEM_PROMPT
      );

      const response = await Promise.race([aiPromise, timeoutPromise]);

      console.log(`✅ [TestGenerator] AI Response received: ${response.length} characters`);
      return response;
    } catch (error: any) {
      console.error("❌ [TestGenerator] AI call failed:", error.message);
      throw new Error(`AI generation failed: ${error.message}`);
    }
  }

  /**
   * Use fallback rule-based generator when AI fails
   */
  private generateFallbackTestCases(
    requirements: RequirementDocument,
    options: GenerationOptions
  ): RequirementToTestCaseResponse {
    console.log("🔄 [TestGenerator] Using fallback rule-based generator...");

    const lines = requirements.content
      .split(/[\n.]+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 10);

    const testCases: GeneratedTestCase[] = [];
    const lower = requirements.content.toLowerCase();

    // Extract keywords
    const hasLogin = lower.includes("login") || lower.includes("authenticate");
    const hasForm = lower.includes("form") || lower.includes("submit");
    const hasValidate = lower.includes("validate") || lower.includes("error");

    // Create multiple test cases based on depth
    const numCases = options.numberOfTestCases || 5;
    const testCaseTemplates = [
      {
        title: "Happy Path - Main Functionality",
        priority: "High",
        description: `Verify the primary success flow: ${lines[0] || "User completes main task"}`,
      },
      {
        title: "Positive Flow - All Fields",
        priority: "High",
        description: "Verify with all optional fields populated",
      },
      {
        title: "Error Handling - Validation",
        priority: "High",
        description: "Verify the system handles validation errors gracefully",
      },
      {
        title: "Negative Flow - Invalid Input",
        priority: "Medium",
        description: "Verify system rejects invalid data",
      },
      {
        title: "Edge Cases - Boundary Values",
        priority: "Medium",
        description: "Verify the system handles boundary conditions",
      },
      {
        title: "Security - Access Control",
        priority: "High",
        description: "Verify proper authorization and permissions",
      },
      {
        title: "Data Persistence - Verification",
        priority: "Medium",
        description: "Verify data is saved and persists correctly",
      },
      {
        title: "Workflow - Multi-step Process",
        priority: "High",
        description: "Verify complete end-to-end workflow",
      },
    ].slice(0, numCases);

    testCaseTemplates.forEach((template, idx) => {
      const steps: any[] = [];
      let stepNum = 1;

      // Create DIFFERENT steps for each test case based on index
      console.log(`[FallbackGen] Creating test case ${idx + 1}/${testCaseTemplates.length}: "${template.title}"`);

      if (hasLogin) {
        steps.push(
          {
            stepNumber: stepNum++,
            action: "Navigate",
            description: "Navigate to login URL",
            testData: "https://qa-fas.aws.baxter.com/fas/login",
            expectedResult: "Login page is displayed with username and password fields",
            elementLocator: null,
            waitTime: 5,
          },
          {
            stepNumber: stepNum++,
            action: "Verify",
            description: "Verify login form is present",
            testData: null,
            expectedResult: "Login form with username and password fields is visible",
            elementLocator: "//form[@id='loginForm']",
            waitTime: 2,
          },
          {
            stepNumber: stepNum++,
            action: "Enter",
            description: "Enter username",
            testData: "BPLMTest001",
            expectedResult: "Username is entered successfully in the field",
            elementLocator: "//input[@id='userId']",
            waitTime: 1,
          },
          {
            stepNumber: stepNum++,
            action: "Enter",
            description: "Enter password",
            testData: "Baxalta01$",
            expectedResult: "Password is entered and masked",
            elementLocator: "//input[@id='password']",
            waitTime: 1,
          },
          {
            stepNumber: stepNum++,
            action: "Click",
            description: "Click Login button",
            testData: null,
            expectedResult: "Login button is clicked and authentication is processed",
            elementLocator: "//button[@id='loginBtn']",
            waitTime: 5,
          },
          {
            stepNumber: stepNum++,
            action: "Verify",
            description: "Verify user is redirected to dashboard",
            testData: null,
            expectedResult: "Dashboard page is displayed with user name visible",
            elementLocator: "//div[@id='dashboard']",
            waitTime: 3,
          },
          {
            stepNumber: stepNum++,
            action: "Verify",
            description: "Verify session is active",
            testData: null,
            expectedResult: "User logout option is available in header",
            elementLocator: "//button[contains(text(), 'Logout')]",
            waitTime: 1,
          }
        );
      } else if (hasForm) {
        // Create DIFFERENT test scenarios based on index
        if (idx === 0) {
          // Happy Path - Fill all fields correctly
          steps.push(
            { stepNumber: stepNum++, action: "Navigate", description: "Navigate to Risk Assessment page", testData: "https://qa-fas.aws.baxter.com/fas/login", expectedResult: "Login page is displayed", elementLocator: null, waitTime: 5 },
            { stepNumber: stepNum++, action: "Enter", description: "Enter User ID", testData: "BPLMTest001", expectedResult: "User ID entered successfully", elementLocator: "//input[@id='userId']", waitTime: 1 },
            { stepNumber: stepNum++, action: "Enter", description: "Enter Password", testData: "Baxalta01$", expectedResult: "Password entered successfully", elementLocator: "//input[@id='password']", waitTime: 1 },
            { stepNumber: stepNum++, action: "Click", description: "Click Login button", testData: null, expectedResult: "User is authenticated", elementLocator: "//button[@id='loginBtn']", waitTime: 5 },
            { stepNumber: stepNum++, action: "Click", description: "Click Initiate Escalation button", testData: null, expectedResult: "Risk Assessment form is displayed", elementLocator: "//button[contains(text(), 'Initiate Escalation')]", waitTime: 3 },
            { stepNumber: stepNum++, action: "Enter", description: "Enter Issue Log Title", testData: "TestIssue", expectedResult: "Title is entered successfully", elementLocator: "//input[@name='issueTitle']", waitTime: 1 },
            { stepNumber: stepNum++, action: "Click", description: "Submit form", testData: null, expectedResult: "Form is submitted successfully", elementLocator: "//button[@type='submit']", waitTime: 3 },
            { stepNumber: stepNum++, action: "Verify", description: "Verify success message", testData: null, expectedResult: "Success message is displayed", elementLocator: "//div[@class='success-message']", waitTime: 2 }
          );
        } else if (idx === 1) {
          // All Optional Fields
          steps.push(
            { stepNumber: stepNum++, action: "Navigate", description: "Navigate to form", testData: null, expectedResult: "Form page loads", elementLocator: null, waitTime: 3 },
            { stepNumber: stepNum++, action: "Enter", description: "Fill Issue Log Title (mandatory)", testData: "CompleteTestCase", expectedResult: "Title entered", elementLocator: "//input[@id='issueTitle']", waitTime: 1 },
            { stepNumber: stepNum++, action: "Select", description: "Select Product Type", testData: "Drug/Biologic", expectedResult: "Product type selected", elementLocator: "//select[@name='productType']", waitTime: 1 },
            { stepNumber: stepNum++, action: "Enter", description: "Enter Issue Confirmation Date", testData: "19-06-2026", expectedResult: "Date is entered", elementLocator: "//input[@name='confirmationDate']", waitTime: 1 },
            { stepNumber: stepNum++, action: "Enter", description: "Enter Description", testData: "Full detailed description of issue", expectedResult: "Description accepted", elementLocator: "//textarea[@name='description']", waitTime: 1 },
            { stepNumber: stepNum++, action: "Click", description: "Submit with all fields", testData: null, expectedResult: "Form submitted", elementLocator: "//button[@type='submit']", waitTime: 3 },
            { stepNumber: stepNum++, action: "Verify", description: "Verify record created", testData: null, expectedResult: "New record displayed with all fields", elementLocator: "//div[@id='recordDetails']", waitTime: 2 }
          );
        } else if (idx === 2) {
          // Error Handling - Missing mandatory fields
          steps.push(
            { stepNumber: stepNum++, action: "Navigate", description: "Navigate to form", testData: null, expectedResult: "Form displayed", elementLocator: null, waitTime: 3 },
            { stepNumber: stepNum++, action: "Click", description: "Click Submit without filling mandatory fields", testData: null, expectedResult: "Validation error appears", elementLocator: "//button[@type='submit']", waitTime: 2 },
            { stepNumber: stepNum++, action: "Verify", description: "Verify error message for missing title", testData: null, expectedResult: "Error message: 'Issue Log Title is required'", elementLocator: "//div[@class='error-message']", waitTime: 1 },
            { stepNumber: stepNum++, action: "Enter", description: "Fill Issue Log Title", testData: "TestError", expectedResult: "Title filled", elementLocator: "//input[@id='issueTitle']", waitTime: 1 },
            { stepNumber: stepNum++, action: "Click", description: "Click Submit again", testData: null, expectedResult: "Form accepted", elementLocator: "//button[@type='submit']", waitTime: 2 },
            { stepNumber: stepNum++, action: "Verify", description: "Verify form submission success", testData: null, expectedResult: "Success page displayed", elementLocator: "//div[@class='success']", waitTime: 2 }
          );
        } else if (idx === 3) {
          // Invalid Input Data
          steps.push(
            { stepNumber: stepNum++, action: "Navigate", description: "Navigate to form", testData: null, expectedResult: "Form loads", elementLocator: null, waitTime: 3 },
            { stepNumber: stepNum++, action: "Enter", description: "Enter invalid Issue Title (too short)", testData: "A", expectedResult: "Input accepted", elementLocator: "//input[@id='issueTitle']", waitTime: 1 },
            { stepNumber: stepNum++, action: "Enter", description: "Enter invalid date (past date)", testData: "01-01-2020", expectedResult: "Input accepted", elementLocator: "//input[@name='confirmationDate']", waitTime: 1 },
            { stepNumber: stepNum++, action: "Click", description: "Attempt to submit invalid data", testData: null, expectedResult: "Validation errors appear", elementLocator: "//button[@type='submit']", waitTime: 2 },
            { stepNumber: stepNum++, action: "Verify", description: "Verify validation error for title length", testData: null, expectedResult: "Error: 'Minimum 10 characters required'", elementLocator: "//span[@class='error']", waitTime: 1 },
            { stepNumber: stepNum++, action: "Verify", description: "Verify validation error for date", testData: null, expectedResult: "Error: 'Date cannot be in the past'", elementLocator: "//span[@class='error']", waitTime: 1 }
          );
        } else if (idx === 4) {
          // Boundary Values
          steps.push(
            { stepNumber: stepNum++, action: "Navigate", description: "Navigate to form", testData: null, expectedResult: "Form displayed", elementLocator: null, waitTime: 3 },
            { stepNumber: stepNum++, action: "Enter", description: "Enter title with minimum characters", testData: "MinChars12", expectedResult: "Title accepted", elementLocator: "//input[@id='issueTitle']", waitTime: 1 },
            { stepNumber: stepNum++, action: "Enter", description: "Enter title with maximum characters", testData: "A".repeat(255), expectedResult: "Title accepted or truncated", elementLocator: "//input[@id='issueTitle']", waitTime: 1 },
            { stepNumber: stepNum++, action: "Enter", description: "Enter large amount in Amount field", testData: "999999.99", expectedResult: "Amount accepted", elementLocator: "//input[@name='amount']", waitTime: 1 },
            { stepNumber: stepNum++, action: "Click", description: "Submit boundary value data", testData: null, expectedResult: "Form processed", elementLocator: "//button[@type='submit']", waitTime: 2 },
            { stepNumber: stepNum++, action: "Verify", description: "Verify boundary values handled correctly", testData: null, expectedResult: "Record created with boundary values", elementLocator: "//div[@id='recordDetails']", waitTime: 2 }
          );
        } else {
          // Default: Data Persistence
          steps.push(
            { stepNumber: stepNum++, action: "Navigate", description: "Navigate to form and fill it", testData: null, expectedResult: "Form displayed", elementLocator: null, waitTime: 3 },
            { stepNumber: stepNum++, action: "Enter", description: "Fill all required fields", testData: "PersistenceTest", expectedResult: "Fields filled", elementLocator: "//input[@id='issueTitle']", waitTime: 2 },
            { stepNumber: stepNum++, action: "Click", description: "Submit form", testData: null, expectedResult: "Form submitted", elementLocator: "//button[@type='submit']", waitTime: 2 },
            { stepNumber: stepNum++, action: "Verify", description: "Record is created and saved", testData: null, expectedResult: "Record visible in list", elementLocator: "//table[@id='records']", waitTime: 2 },
            { stepNumber: stepNum++, action: "Navigate", description: "Navigate to details page", testData: null, expectedResult: "Details page loaded", elementLocator: null, waitTime: 3 },
            { stepNumber: stepNum++, action: "Verify", description: "Verify all data persisted", testData: null, expectedResult: "All entered data is displayed", elementLocator: "//div[@class='details']", waitTime: 2 }
          );
        }
      } else {
        // Generic workflow steps
        steps.push(
          {
            stepNumber: stepNum++,
            action: "Navigate",
            description: `Navigate to ${requirements.title}`,
            testData: null,
            expectedResult: "Page loads successfully with all elements",
            elementLocator: null,
            waitTime: 5,
          },
          {
            stepNumber: stepNum++,
            action: "Verify",
            description: "Verify page title is correct",
            testData: null,
            expectedResult: "Page title matches expected title",
            elementLocator: "//h1",
            waitTime: 1,
          },
          {
            stepNumber: stepNum++,
            action: "Verify",
            description: "Verify all main elements are visible",
            testData: null,
            expectedResult: "All required UI elements are displayed",
            elementLocator: null,
            waitTime: 2,
          },
          {
            stepNumber: stepNum++,
            action: "Verify",
            description: "Verify page is responsive",
            testData: null,
            expectedResult: "All elements are properly positioned and visible",
            elementLocator: null,
            waitTime: 1,
          }
        );
      }

      const testCase: GeneratedTestCase = {
        testCaseId: `TC_${String(idx + 1).padStart(3, "0")}`,
        title: template.title,
        description: template.description,
        priority: template.priority,
        module: requirements.title || "Module",
        steps: steps,
        preconditions: ["User has valid credentials", "Browser is open"],
        testData: {},
      };

      testCases.push(testCase);
    });

    return {
      requirements: [],
      testCases: testCases,
      testDataMap: {
        username: { value: "testuser@example.com", type: "email" },
        password: { value: "TestPassword123!", type: "password" },
      },
    };
  }

  /**
   * Parse AI response into structured format
   */
  private parseAIResponse(response: string): RequirementToTestCaseResponse {
    let jsonStr = response;

    console.log(`[Parser] Raw response length: ${response.length}`);

    // STEP 1: Remove markdown code block wrapper (ALL variants)
    jsonStr = jsonStr.replace(/^```[\s\S]*?^```/gm, ''); // Remove full block
    jsonStr = jsonStr.replace(/^```json\s*/gm, ''); // Remove opening ```json
    jsonStr = jsonStr.replace(/^```\s*/gm, ''); // Remove opening ```
    jsonStr = jsonStr.replace(/\s*```\s*$/gm, ''); // Remove closing ```
    
    // STEP 2: Trim whitespace
    jsonStr = jsonStr.trim();

    console.log(`[Parser] After markdown cleanup: ${jsonStr.length} chars`);

    // STEP 3: Find the actual JSON object (first { to last })
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');

    console.log(`[Parser] First brace at ${firstBrace}, last brace at ${lastBrace}`);

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
      console.log(`[Parser] Extracted JSON: ${jsonStr.length} chars`);
    }

    console.log(`[Parser] Attempting to parse JSON (length: ${jsonStr.length})`);
    console.log(`[Parser] First 200 chars: ${jsonStr.substring(0, 200)}...`);

    try {
      const parsed = JSON.parse(jsonStr);
      console.log("✅ [TestGenerator] JSON parsed successfully!");
      console.log(`   - Requirements: ${parsed.requirements?.length || 0}`);
      console.log(`   - Test cases: ${parsed.testCases?.length || 0}`);
      console.log(`   - Test data entries: ${Object.keys(parsed.testDataMap || {}).length}`);

      // Validate structure
      if (!Array.isArray(parsed.testCases)) {
        throw new Error("testCases is not an array");
      }

      if (parsed.testCases.length === 0) {
        throw new Error("No test cases in response");
      }

      // Log each test case
      parsed.testCases.forEach((tc: any, idx: number) => {
        console.log(`   TC ${idx + 1}: "${tc.title}" - ${tc.steps?.length || 0} steps`);
        if (tc.steps && tc.steps.length > 0) {
          tc.steps.slice(0, 3).forEach((s: any, sIdx: number) => {
            console.log(`      Step ${sIdx + 1}: ${s.description}`);
          });
        }
      });

      return parsed;
    } catch (error: any) {
      console.error("❌ [TestGenerator] JSON parsing failed:", error.message);
      console.error("❌ String that failed to parse (first 500 chars):");
      console.error(jsonStr.substring(0, 500));
      console.error("❌ String that failed to parse (last 500 chars):");
      console.error(jsonStr.substring(Math.max(0, jsonStr.length - 500)));
      throw new Error(`Failed to parse AI response: ${error.message}`);
    }
  }

  /**
   * Validate and enhance generated test cases
   */
  private validateAndEnhanceTestCases(
    parsed: RequirementToTestCaseResponse,
    requirements: RequirementDocument,
    options: GenerationOptions
  ): RequirementToTestCaseResponse {
    const errors: string[] = [];

    // Validate requirements
    if (!Array.isArray(parsed.requirements)) {
      parsed.requirements = [];
    }
    parsed.requirements = parsed.requirements.filter((req: ParsedRequirement) => {
      if (!req.id || !req.title) {
        errors.push(`Invalid requirement format: missing id or title`);
        return false;
      }
      return true;
    });

    // Validate and enhance test cases
    if (!Array.isArray(parsed.testCases)) {
      parsed.testCases = [];
    }

    console.log(`[TestGenerator] Validating ${parsed.testCases.length} test cases...`);

    parsed.testCases = parsed.testCases
      .map((tc, index) => {
        const enhanced = this.validateAndEnhanceTestCase(tc, index, requirements, options);
        if (enhanced) {
          console.log(`   TC ${index + 1}: "${enhanced.title}" → ${enhanced.steps.length} steps`);
        }
        return enhanced;
      })
      .filter((tc): tc is GeneratedTestCase => tc !== null);

    // Validate test data
    if (!parsed.testDataMap) {
      parsed.testDataMap = {};
    }

    console.log(`[TestGenerator] After validation: ${parsed.testCases.length} test cases, ${Object.keys(parsed.testDataMap).length} test data entries`);

    if (errors.length > 0) {
      console.warn("⚠️ [TestGenerator] Validation warnings:");
      errors.forEach((err) => console.warn(`   - ${err}`));
    }

    return parsed;
  }

  /**
   * Validate and enhance individual test case
   */
  private validateAndEnhanceTestCase(
    testCase: any,
    index: number,
    requirements: RequirementDocument,
    options: GenerationOptions
  ): GeneratedTestCase | null {
    try {
      // Ensure required fields
      if (!testCase.title) {
        testCase.title = `Test Case ${index + 1}`;
      }
      if (!testCase.testCaseId) {
        testCase.testCaseId = `TC_${String(index + 1).padStart(3, "0")}`;
      }
      if (!testCase.priority) {
        testCase.priority = "Medium";
      }
      if (!testCase.module) {
        testCase.module = requirements.title || "Functionality";
      }

      // Ensure steps array
      if (!Array.isArray(testCase.steps)) {
        testCase.steps = [];
      }

      // Only enhance steps if they exist - don't add generic steps
      if (testCase.steps.length > 0) {
        testCase.steps = testCase.steps
          .map((step: any, stepIndex: number) => this.enhanceStep(step, stepIndex))
          .filter((step): step is any => step !== null);
      } else {
        // If no steps, log warning but don't create fake ones
        console.warn(`⚠️ [TestGenerator] Test case ${testCase.testCaseId} has NO steps in AI response`);
      }

      // Ensure preconditions
      if (!Array.isArray(testCase.preconditions)) {
        testCase.preconditions = [
          "User has valid credentials",
          "Browser is open",
          "Network connectivity is available",
        ];
      }

      // Ensure test data
      if (!testCase.testData) {
        testCase.testData = {};
      }

      // Check minimum step count
      if (testCase.steps.length < 5) {
        console.warn(
          `⚠️ [TestGenerator] Test case ${testCase.testCaseId} "${testCase.title}" has only ${testCase.steps.length} steps (expected 10+)`
        );
      }

      return testCase as GeneratedTestCase;
    } catch (error: any) {
      console.warn(`⚠️ [TestGenerator] Failed to enhance test case ${index}: ${error.message}`);
      return null;
    }
  }

  /**
   * Enhance individual step
   */
  private enhanceStep(step: any, stepIndex: number): any {
    if (!step) return null;

    // Ensure step number
    if (!step.stepNumber) {
      step.stepNumber = stepIndex + 1;
    }

    // Ensure action is defined
    if (!step.action) {
      step.action = "Verify";
    }

    // Ensure description - make it detailed
    if (!step.description) {
      step.description = `Step ${step.stepNumber}`;
    } else {
      // Enhance description with action and data
      if (step.testData && step.action.toLowerCase() === "enter") {
        step.description = `${step.description} = ${step.testData}`;
      }
    }

    // Ensure expected result - make it specific
    if (!step.expectedResult) {
      step.expectedResult = "Step completed successfully";
    }

    // Ensure wait time (default 1-2 seconds, more for navigation/loads)
    if (!step.waitTime) {
      if (step.action.toLowerCase().includes("navigate") || step.action.toLowerCase().includes("wait")) {
        step.waitTime = 5;
      } else if (step.action.toLowerCase().includes("click")) {
        step.waitTime = 2;
      } else {
        step.waitTime = 1;
      }
    }

    // Enhance element locator if present
    if (step.elementLocator && typeof step.elementLocator === "string") {
      // Ensure xpath uses double slashes
      if (!step.elementLocator.startsWith("//") && step.elementLocator.length > 0) {
        step.elementLocator = "//" + step.elementLocator;
      }
    } else if (!step.elementLocator && (step.action.toLowerCase() === "click" || step.action.toLowerCase() === "select")) {
      // If action requires element but no locator, create one from description
      if (step.description) {
        step.elementLocator = `//button[contains(text(), '${step.description.substring(0, 30)}')]`;
      }
    }

    return step;
  }

  /**
   * Generate execution summary
   */
  private generateExecutionSummary(
    parsed: RequirementToTestCaseResponse
  ): {
    totalTestCases: number;
    totalSteps: number;
    averageStepsPerCase: number;
    dataEntriesCount: number;
    estimatedExecutionTime: number;
  } {
    const testCases = parsed.testCases || [];
    const totalSteps = testCases.reduce((sum, tc) => sum + (tc.steps?.length || 0), 0);

    // Estimate execution time: 3 seconds per step average
    const estimatedExecutionTime = totalSteps * 3;

    return {
      totalTestCases: testCases.length,
      totalSteps,
      averageStepsPerCase: testCases.length > 0 ? Math.round(totalSteps / testCases.length) : 0,
      dataEntriesCount: Object.keys(parsed.testDataMap || {}).length,
      estimatedExecutionTime,
    };
  }

  /**
   * Format test cases for display
   */
  formatTestCasesForDisplay(testCases: GeneratedTestCase[]): any[] {
    return testCases.map((tc) => ({
      id: tc.testCaseId,
      title: tc.title,
      module: tc.module,
      priority: tc.priority,
      stepCount: tc.steps?.length || 0,
      description: tc.description,
      preconditions: tc.preconditions?.join("; ") || "None",
    }));
  }

  /**
   * Export test cases to different formats
   */
  exportTestCases(
    testCases: GeneratedTestCase[],
    format: "json" | "csv" | "excel" = "json"
  ): string {
    if (format === "json") {
      return JSON.stringify(testCases, null, 2);
    } else if (format === "csv") {
      // CSV format
      let csv = "Test Case ID,Title,Module,Priority,Steps,Description\n";
      testCases.forEach((tc) => {
        csv += `"${tc.testCaseId}","${tc.title}","${tc.module}","${tc.priority}",${tc.steps?.length || 0},"${tc.description}"\n`;
      });
      return csv;
    }
    return JSON.stringify(testCases, null, 2);
  }
}

/**
 * Create and export a singleton instance
 */
export const requirementTestGeneratorService = new RequirementTestGeneratorService();
