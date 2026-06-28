# Comprehensive Test Case Generation Prompt

## Overview
This document defines the complete prompt structure used by the `/api/generate-tests` endpoint to generate enterprise-grade test cases with a specific JSON output format.

## JSON Output Structure

All test case generation **MUST** follow this exact structure:

```json
{
  "testCases": [
    {
      "title": "max 10 words descriptive title",
      "description": "max 15 words specific to requirement, not generic",
      "preconditions": "max 15 words specific setup, not generic",
      "steps": [
        {
          "step": "concise action (max 15 words)",
          "expected": "observable outcome (max 12 words)"
        }
      ],
      "priority": "low|medium|high|critical",
      "testType": "functional|regression|smoke|e2e|negative|boundary|security|performance|accessibility|usability|api",
      "reasoning": "1 sentence explaining the business rule or risk covered",
      "confidenceScore": 85
    }
  ],
  "validationScore": 90,
  "coverageSummary": {
    "totalTestCases": 30,
    "byType": {
      "functional": 8,
      "regression": 4,
      "smoke": 3,
      "negative": 3,
      "boundary": 2,
      "security": 2,
      "accessibility": 1,
      "performance": 1,
      "api": 1,
      "usability": 1
    },
    "coverageAreas": ["Feature Area 1", "Feature Area 2"],
    "gapAreas": ["Potential gaps in coverage"]
  }
}
```

## Field Definitions

### Test Case Fields

| Field | Format | Rules | Example |
|-------|--------|-------|---------|
| **title** | String | Max 10 words, descriptive, unique | "User registration with valid credentials succeeds" |
| **description** | String | Max 15 words, specific to requirement, not generic | "Verify user can register with email, password, and confirm password" |
| **preconditions** | String | Max 15 words, specific setup required | "User has not registered, test environment is available" |
| **steps** | Array | One step per action/verification, NEVER combine | See Step Details below |
| **priority** | String | low\|medium\|high\|critical | "high" |
| **testType** | String | Must be one of 10 categories | "functional" |
| **reasoning** | String | 1 sentence explaining the rule or risk | "Validates user creation workflow per requirement" |
| **confidenceScore** | Number | 0-100, justified by clarity | 85 |

### Step Details

Each step in the `steps` array MUST have:

```json
{
  "step": "concise, observable action (max 15 words)",
  "expected": "observable result that can be verified (max 12 words)"
}
```

#### Step Rules (CRITICAL)

1. **Atomicity**: ONE action per step, NEVER combine multiple actions
   - ❌ WRONG: "Fill email and password then click login" (3 actions = 3 steps!)
   - ✅ RIGHT: 
     - Step 1: Fill email
     - Step 2: Fill password
     - Step 3: Click login

2. **Field Completeness**: For forms with N fields, generate N separate fill steps
   - 5-field form = 5 fill steps minimum (+ navigate + submit + verify)
   - 20-field form = 20+ fill steps + navigation + submission + verification

3. **Observable Outcomes**: Expected result must be verifiable in UI/API/Network
   - ❌ WRONG: "Test passes" (not observable)
   - ✅ RIGHT: "Success message 'Account created' displayed"

4. **No Length Caps**: Generate as many steps as needed
   - A 10-field form MUST have 10+ steps, not combined into 3
   - Complex workflows SHOULD have 15-25+ steps

## Test Type Coverage (ALL 10 MANDATORY)

Every test case generation **MUST** include representatives from all 10 categories:

### 1. **Functional** (40% of tests)
- Happy path success scenarios
- Valid inputs → Expected outputs
- Complete user workflows
- Example: "User registers with valid email and password successfully"

### 2. **Regression** (15% of tests)
- Re-verify existing behavior is not broken
- Previously fixed bugs
- Version compatibility
- Example: "Login still works after recent UI redesign"

### 3. **Smoke** (10% of tests)
- Quick sanity checks on critical paths
- Deployment verification
- Fast execution (< 5 seconds)
- Example: "App loads and login page displays"

### 4. **Negative** (15% of tests)
- Invalid inputs
- Missing required fields
- Wrong data types
- Out-of-bounds values
- Permission denied scenarios
- Example: "Login fails with incorrect password, error shown"

### 5. **Boundary** (10% of tests)
- Min/max field lengths
- Numeric edge values (0, -1, 999999, etc.)
- Date limits
- Empty vs full containers
- Example: "Email field accepts max 254 chars, rejects 255"

### 6. **Security** (5% of tests)
- SQL injection attempts
- XSS attacks
- CSRF tokens
- Unauthorized access
- Privilege escalation
- Example: "SQL injection ' OR '1'='1 -- rejected safely"

### 7. **Accessibility** (3% of tests)
- Keyboard-only navigation
- ARIA labels and roles
- Screen reader support
- Color contrast (WCAG 2.1 AA)
- Example: "Form accessible via Tab key navigation"

### 8. **Performance** (3% of tests)
- Page load time < 3 seconds
- API response time < 2 seconds
- Large data set handling
- Concurrent user load
- Example: "Login page loads in < 2 seconds"

### 9. **API** (3% of tests)
- HTTP status codes (200, 201, 400, 401, 403, 404, 409, 422, 500)
- Response schema validation
- Error response structures
- Rate limiting
- Example: "GET /users returns 200 with valid schema"

### 10. **Usability** (1% of tests)
- UI clarity and findability
- Error message clarity
- User guidance
- Navigation intuitiveness
- Example: "Error message clearly explains what field is invalid"

## Step Generation Examples

### Example 1: Login Form (WRONG - Only 3 Steps)

❌ **This is insufficient:**
```json
{
  "steps": [
    { "step": "Navigate to login page", "expected": "Login form displayed" },
    { "step": "Fill email and password", "expected": "Fields populated" },
    { "step": "Click login", "expected": "Logged in successfully" }
  ]
}
```

✅ **Correct format (5+ atomic steps):**
```json
{
  "steps": [
    { "step": "Navigate to https://app.com/login", "expected": "Login page loads, email and password inputs visible" },
    { "step": "Enter 'user@example.com' in email input", "expected": "Email value appears in the field" },
    { "step": "Enter 'SecurePass123!' in password input", "expected": "Password masked with bullet characters" },
    { "step": "Click Login button", "expected": "Button becomes disabled, loading spinner appears" },
    { "step": "Wait for API response and verify redirect", "expected": "User redirected to /dashboard, greeting 'Welcome' visible" }
  ]
}
```

### Example 2: User Registration Form (COMPREHENSIVE - 12+ Steps for 5 Fields)

```json
{
  "title": "User registration with all fields",
  "description": "Verify user can complete registration with all required information",
  "steps": [
    { "step": "Navigate to /register page", "expected": "Registration form loads, all 5 fields visible" },
    { "step": "Clear and fill First Name field with 'John'", "expected": "First Name field shows 'John' without errors" },
    { "step": "Clear and fill Last Name field with 'Doe'", "expected": "Last Name field shows 'Doe' without errors" },
    { "step": "Clear and fill Email field with 'john.doe@example.com'", "expected": "Email field shows valid email without format errors" },
    { "step": "Clear and fill Password field with 'SecurePass123!'", "expected": "Password field shows masked bullets, not plain text" },
    { "step": "Clear and fill Confirm Password with 'SecurePass123!'", "expected": "Confirm Password field shows masked bullets matching password" },
    { "step": "Scroll down to view Terms checkbox", "expected": "Terms checkbox visible on page" },
    { "step": "Check the Terms and Conditions checkbox", "expected": "Checkbox is now marked/checked" },
    { "step": "Click Register button", "expected": "Button is disabled, loading state shown, registration request sent" },
    { "step": "Wait max 5 seconds for API response", "expected": "Success message 'Account created successfully' appears or redirect" },
    { "step": "Verify redirect to login or dashboard", "expected": "URL changes to /login or /dashboard, user data persisted" }
  ]
}
```

### Example 3: Search Feature (Multiple Scenarios)

**Scenario 1: Search with Results**
```json
{
  "title": "Search returns matching results",
  "steps": [
    { "step": "Navigate to /search page", "expected": "Search form with query input and submit button visible" },
    { "step": "Click the search input field", "expected": "Input field is focused, cursor visible" },
    { "step": "Type 'laptop' in the search field", "expected": "Search term 'laptop' appears in input" },
    { "step": "Click the Search button", "expected": "Search request sent, loading indicator appears" },
    { "step": "Wait for search results to load", "expected": "Results list populated with matching products, pagination visible" }
  ]
}
```

**Scenario 2: Search with No Results**
```json
{
  "title": "Search with no matching results",
  "steps": [
    { "step": "Navigate to /search page", "expected": "Search form visible" },
    { "step": "Type 'xyznonexistentproduct123' in search", "expected": "Term appears in input field" },
    { "step": "Click Search button", "expected": "Search executes, loading state shown" },
    { "step": "Wait for results page to load", "expected": "Message 'No results found' displayed, suggestions offered" }
  ]
}
```

## Confidence Score Guidelines

| Score Range | Definition | Indicators | Suitable For |
|-------------|-----------|-----------|-------------|
| 90-100 | Production-Ready | Clear requirements, proven selectors, no assumptions | Immediate automation |
| 70-89 | Well-Defined | Minor assumptions (element IDs), mostly deterministic | Automation with small customization |
| 50-69 | Interpretable | Multiple assumptions, requires customization | Manual testing or review before automation |
| <50 | NOT RECOMMENDED | Too vague, too many unknowns | REJECT - request clarification |

### Justification Examples

✅ **Score 95**: 
- Requirement: "User clicks Login button on /login page"
- Reason: Clear URL, specific button identifier, observable action

✅ **Score 75**: 
- Requirement: "User completes the form"
- Reason: Form structure assumed, selectors inferred, minor customization needed

❌ **Score 40**: 
- Requirement: "User navigates through the workflow"
- Reason: Workflow undefined, actions unclear, too many assumptions

## Response Headers & Configuration

When calling `/api/generate-tests`, use:

```bash
POST /api/generate-tests
Content-Type: application/json

{
  "title": "Feature Title",
  "description": "Complete feature description with all details",
  "appType": "web|jde|salesforce|sap_fiori|mobile|api_rest",
  "testDepth": "standard|comprehensive|exhaustive",
  "includeE2E": true,
  "targetUrl": "https://app.example.com",
  "businessUseCase": "Why is this feature important?",
  "userRoles": "User roles that interact with this feature",
  "functionalRequirements": "What must the feature do?",
  "nonFunctionalRequirements": "Performance, security, compliance requirements"
}
```

## Validation Gates (ALL MUST PASS)

Before returning test cases, verify:

- ✅ **All steps are atomic** (one action per step, not combined)
- ✅ **All selectors are valid** (CSS, XPath, or Playwright syntax)
- ✅ **All expected results are observable** (not vague or subjective)
- ✅ **All 10 test categories are covered** (min 1 of each, ideally distributed)
- ✅ **No duplicate test scenarios** (each test unique)
- ✅ **Confidence scores justified** (match clarity and assumptions)
- ✅ **Error handling included** (negative tests present)
- ✅ **JSON is complete and valid** (no truncation, proper structure)

## Common Mistakes to Avoid

### ❌ WRONG: Combining Multiple Actions

```json
{
  "step": "Navigate to login, enter credentials, and click submit",
  "expected": "User is logged in"
}
```

### ✅ RIGHT: Atomic Steps

```json
[
  { "step": "Navigate to /login page", "expected": "Login form visible" },
  { "step": "Enter email in email input", "expected": "Email value visible" },
  { "step": "Enter password in password input", "expected": "Password masked" },
  { "step": "Click submit button", "expected": "Form submitted, redirect initiated" }
]
```

### ❌ WRONG: Non-Observable Expected Results

```json
{ "step": "Submit the form", "expected": "Test passes" }
```

### ✅ RIGHT: Observable Outcomes

```json
{ "step": "Click Register button", "expected": "Success message 'Account created' visible, page redirects to /dashboard" }
```

### ❌ WRONG: Incomplete Form Testing

```json
{
  "steps": [
    { "step": "Fill the form", "expected": "Form complete" },
    { "step": "Submit", "expected": "Success" }
  ]
}
```

### ✅ RIGHT: Complete Field Coverage (5 fields = 5+ fill steps)

```json
{
  "steps": [
    { "step": "Navigate to form page", "expected": "Form with 5 fields visible" },
    { "step": "Fill field 1: first name", "expected": "First name value visible" },
    { "step": "Fill field 2: last name", "expected": "Last name value visible" },
    { "step": "Fill field 3: email", "expected": "Email value visible" },
    { "step": "Fill field 4: phone", "expected": "Phone value visible" },
    { "step": "Fill field 5: address", "expected": "Address value visible" },
    { "step": "Click submit", "expected": "Form submitted, processing indicator shown" },
    { "step": "Wait for confirmation", "expected": "Success message displayed or redirect" }
  ]
}
```

## Integration with AITAS

### Endpoint
```
POST /api/generate-tests
```

### Request Body
```json
{
  "title": "Feature to test",
  "description": "Detailed description of the feature",
  "appType": "web",
  "testDepth": "comprehensive",
  "includeE2E": true,
  "appContext": "Business context",
  "functionalRequirements": "What must work",
  "nonFunctionalRequirements": "Performance/security/compliance"
}
```

### Response
```json
{
  "testCases": [...],
  "validationScore": 90,
  "coverageSummary": {...},
  "warnings": [],
  "generatedBy": "ai|rule-based"
}
```

## Best Practices

1. **Be Specific**: Include URLs, field names, expected values
2. **One Action Per Step**: Never combine multiple actions
3. **Complete Field Coverage**: Test every field in forms
4. **All Categories**: Ensure all 10 test types are represented
5. **Observable Results**: Every expected outcome must be verifiable
6. **Clear Confidence**: Justify confidence scores based on clarity
7. **No Assumptions**: If unclear, request clarification
8. **Error Scenarios**: Include negative and edge case tests

## Summary

The test generation system requires:

1. **JSON structure adherence** - Exact format must be followed
2. **Atomic steps** - One action per step, never combined
3. **Field completeness** - Every field gets its own step
4. **All categories** - All 10 test types must be covered
5. **Observable results** - All outcomes must be verifiable
6. **Realistic confidence** - Scores must match clarity level
7. **No truncation** - JSON must be complete and valid
8. **Enterprise quality** - Production-ready test cases

This ensures AITAS generates comprehensive, maintainable, and executable test cases across all application types and scenarios.
