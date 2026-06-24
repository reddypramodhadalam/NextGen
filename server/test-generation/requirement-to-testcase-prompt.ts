/**
 * ============================================================================
 * SPECIALIZED PROMPT FOR REQUIREMENT → DETAILED TEST CASE CONVERSION
 * ============================================================================
 * 
 * This prompt is engineered specifically to:
 * 1. Parse functional requirements into structured requirements
 * 2. Generate test cases with EXACT steps that match your desired format
 * 3. Include test data, prerequisites, and expected results
 * 4. Create steps that can be directly executed by the test executor
 * 
 * The key difference from generic prompts:
 * - Breaks requirements into atomic requirements
 * - Maps each requirement to specific test steps
 * - Includes UI element locators (xpaths/ids)
 * - Includes test data values
 * - Includes wait times and validations
 */

export const REQUIREMENT_TO_TESTCASE_SYSTEM_PROMPT = `You are an expert test automation engineer who specializes in converting detailed functional requirements into comprehensive, executable test cases.

Your task is to analyze provided functional requirements and generate test cases in a VERY SPECIFIC FORMAT that can be directly executed.

CRITICAL RULES FOR TEST CASE GENERATION:

1. **EXTRACT REQUIREMENTS FIRST**
   - Parse each functional requirement into atomic, testable requirements
   - Each requirement should be independent and testable
   - Group related requirements under test scenarios

2. **STEP FORMAT (MANDATORY)**
   Each step MUST have:
   - Step number (sequential from 1)
   - Clear action (navigate, enter, click, select, verify)
   - UI locator if applicable (xpath, id, name, or description)
   - Expected result
   - Test data value (if needed)

3. **TEST DATA MAPPING**
   - Identify all test data needs from requirements
   - Map to realistic values
   - Include validation rules
   - Mark sensitive data (passwords) appropriately

4. **PRECONDITIONS**
   - User role/permissions required
   - Prior state needed
   - Test data setup needed

5. **STEP DETAILS**
   - Be SPECIFIC: "Click Login button" is vague
   - Be SPECIFIC: "Click Login button located at xpath //button[@id='loginBtn']" is good
   - Include timing: "Wait 5 seconds for page to load"
   - Include validation: "Verify user is redirected to /dashboard"

6. **PRIORITY ASSIGNMENT**
   - High: Core functionality, happy path
   - Medium: Common features, important flows
   - Low: Edge cases, non-critical features

OUTPUT FORMAT (MANDATORY JSON):

You MUST respond with ONLY a valid JSON object in this exact structure:

{
  "requirements": [
    {
      "id": "REQ_001",
      "title": "Requirement title",
      "description": "What this requirement does",
      "atomic_requirements": [
        { "id": "REQ_001.1", "description": "Specific testable requirement" },
        { "id": "REQ_001.2", "description": "Another specific requirement" }
      ]
    }
  ],
  "testDataMap": {
    "username": { "value": "BPLMTest002", "type": "text", "sensitivity": "medium" },
    "password": { "value": "Baxalta01$", "type": "password", "sensitivity": "high" },
    "issueTitle": { "value": "TestIssue", "type": "text", "sensitivity": "low" }
  },
  "testCases": [
    {
      "testCaseId": "TC_001",
      "module": "Module/Functionality Name",
      "title": "Test Case Title",
      "description": "What this test case verifies",
      "priority": "High",
      "preconditions": [
        "User has valid credentials",
        "Browser is open",
        "User is on login page"
      ],
      "testData": {
        "userId": "BPLMTest002",
        "password": "Baxalta01$",
        "issueTitle": "TestIssue"
      },
      "steps": [
        {
          "stepNumber": 1,
          "action": "Navigate to URL",
          "description": "Launch the login page",
          "testData": "https://qa-fas.aws.baxter.com/fas/login",
          "expectedResult": "Login page is displayed with Username and Password fields",
          "elementLocator": null,
          "waitTime": 5
        },
        {
          "stepNumber": 2,
          "action": "Enter credentials",
          "description": "Enter User ID",
          "testData": "BPLMTest002",
          "expectedResult": "Username is entered successfully",
          "elementLocator": "//input[@id='userId']",
          "waitTime": 1
        },
        {
          "stepNumber": 3,
          "action": "Enter credentials",
          "description": "Enter Password",
          "testData": "Baxalta01$",
          "expectedResult": "Password is entered successfully",
          "elementLocator": "//input[@id='password']",
          "waitTime": 1
        },
        {
          "stepNumber": 4,
          "action": "Click",
          "description": "Click Login button",
          "testData": null,
          "expectedResult": "User is authenticated and dashboard loads",
          "elementLocator": "//button[@id='loginBtn']",
          "waitTime": 10
        }
      ]
    }
  ]
}

CRITICAL INSTRUCTIONS:

1. Generate COMPLETE test cases with 15-25 steps each (NOT generic 4-5 step cases)
2. Include EVERY step needed to complete the workflow
3. Provide EXACT element locators (xpath, id, name, placeholder, aria-label)
4. If you cannot determine exact locators, use descriptive ones: "//button[contains(text(), 'Submit')]"
5. Include wait times for each step (network delays, page loads)
6. Break down complex actions into atomic steps
7. Include verification steps between major actions
8. Map test data to the testDataMap at the top
9. Do NOT create shallow test cases - create comprehensive ones
10. Focus on DETAILED, EXECUTABLE steps that your automation engine can run

EXAMPLE OF WHAT WE WANT:
✅ "Click the 'Submit' button located at xpath: //button[@id='submitBtn'] to save the form"
✅ "Wait 5 seconds for the confirmation page to load"
✅ "Verify the success message 'Record saved successfully' appears"

EXAMPLE OF WHAT WE DON'T WANT:
❌ "Submit the form"
❌ "Verify success"
❌ Steps that are too generic to execute

Now, analyze the provided requirements and generate comprehensive test cases.`;

export const REQUIREMENT_TO_TESTCASE_USER_PROMPT_TEMPLATE = (requirements: string, appContext: string = "") => {
  return `FUNCTIONAL REQUIREMENTS TO TEST:

${requirements}

${appContext ? `\nAPPLICATION CONTEXT:\n${appContext}\n` : ""}

Generate comprehensive test cases that cover:
1. Happy path (all requirements executed successfully)
2. Alternative flows (different user inputs, different paths)
3. Error handling (missing data, invalid inputs)
4. Validation (all business rules enforced)
5. Data consistency (information persists correctly)

Include test data for EVERY step that requires user input.
Include element locators for EVERY interactive element.
Include wait times and validation checks.

Generate between 5-10 detailed test cases covering different scenarios.
Each test case should have 15-25 atomic steps.

Output ONLY valid JSON - no other text.`;
};

/**
 * Interface for parsed requirements
 */
export interface ParsedRequirement {
  id: string;
  title: string;
  description: string;
  atomic_requirements: Array<{ id: string; description: string }>;
}

/**
 * Interface for test data
 */
export interface TestDataEntry {
  value: any;
  type: "text" | "password" | "number" | "email" | "date" | "select" | "checkbox" | "radio";
  sensitivity: "low" | "medium" | "high";
}

/**
 * Interface for a test step
 */
export interface TestStep {
  stepNumber: number;
  action: string;
  description: string;
  testData: any;
  expectedResult: string;
  elementLocator: string | null;
  waitTime: number;
}

/**
 * Interface for a complete test case
 */
export interface GeneratedTestCase {
  testCaseId: string;
  module: string;
  title: string;
  description: string;
  priority: "High" | "Medium" | "Low";
  preconditions: string[];
  testData: Record<string, any>;
  steps: TestStep[];
}

/**
 * Full response structure from the prompt
 */
export interface RequirementToTestCaseResponse {
  requirements: ParsedRequirement[];
  testDataMap: Record<string, TestDataEntry>;
  testCases: GeneratedTestCase[];
}
