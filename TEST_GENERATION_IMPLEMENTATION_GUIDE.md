# Test Generation Implementation Guide

## Overview

The `/api/generate-tests` endpoint now includes a comprehensive prompt system that enforces:
- **Exact JSON structure** with specific field constraints
- **Atomic step generation** (one action per step, never combined)
- **Field completeness** (N fields = N+ test steps)
- **All 10 test categories** (functional, regression, smoke, negative, boundary, security, accessibility, performance, api, usability)
- **Observable, specific outcomes** (no vague results)
- **Confidence scoring** with justification

## What Changed

### Before (Limited)
```json
{
  "testCases": [
    {
      "title": "User login",
      "steps": [
        { "step": "Navigate and login", "expected": "Logged in" }
      ]
    }
  ]
}
```

### After (Comprehensive)
```json
{
  "testCases": [
    {
      "title": "User login with valid credentials succeeds",
      "description": "Verify user can login with email and password",
      "preconditions": "User has a valid account, app is accessible",
      "steps": [
        { "step": "Navigate to https://app.com/login", "expected": "Login page loads, form visible" },
        { "step": "Enter valid email in email field", "expected": "Email value appears in input" },
        { "step": "Enter valid password in password field", "expected": "Password masked with bullets" },
        { "step": "Click Login button", "expected": "Button disabled, loading spinner appears" },
        { "step": "Wait for redirect and verify dashboard", "expected": "User redirected to /dashboard, greeting visible" }
      ],
      "priority": "critical",
      "testType": "functional",
      "reasoning": "Login is critical business flow that must work before any other feature",
      "confidenceScore": 95
    }
  ],
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
    }
  }
}
```

## Implementation Steps

### 1. Update API Request

When calling `/api/generate-tests`, provide detailed context:

```bash
curl -X POST http://localhost:3000/api/generate-tests \
  -H "Content-Type: application/json" \
  -d '{
    "title": "User Registration Feature",
    "description": "Users should be able to register with email, password, first name, last name, and accept terms",
    "appType": "web",
    "testDepth": "comprehensive",
    "includeE2E": true,
    "businessUseCase": "User acquisition and onboarding",
    "userRoles": "Anonymous user, visitor",
    "functionalRequirements": "Registration form with 5 fields, email validation, password strength, terms checkbox, submit button",
    "nonFunctionalRequirements": "Page load < 2s, form submit response < 1s, GDPR compliant terms",
    "targetUrl": "https://app.example.com/register"
  }'
```

### 2. Response Structure

The API returns:

```json
{
  "testCases": [
    {
      "title": "...",
      "description": "...",
      "preconditions": "...",
      "steps": [...],
      "priority": "...",
      "testType": "...",
      "reasoning": "...",
      "confidenceScore": 85
    }
  ],
  "validationScore": 90,
  "coverageSummary": {...},
  "generatedBy": "ai|rule-based"
}
```

### 3. Step Structure Compliance

Each step must follow these rules:

**Field:** `step` (action to perform)
- Max 15 words
- Specific and observable
- Includes selectors if applicable
- Example: "Click the 'Register' button with id='submit-btn'"

**Field:** `expected` (observable outcome)
- Max 12 words  
- Must be verifiable in UI/API/Network
- Not vague or subjective
- Example: "Button transitions to disabled state, request sent"

### 4. Form Field Complete Coverage

For a form with N fields:
- Generate 1 step for navigation
- Generate N steps (one per field)
- Generate 1 step for submission
- Generate 1-2 steps for verification
- **Total: N+3 to N+4 minimum steps**

**Example: 5-field registration form**

```json
"steps": [
  { "step": "Navigate to /register page", "expected": "Registration form loads, all 5 fields visible" },
  { "step": "Fill First Name field with 'John'", "expected": "First Name shows 'John' without error" },
  { "step": "Fill Last Name field with 'Doe'", "expected": "Last Name shows 'Doe' without error" },
  { "step": "Fill Email field with 'john@example.com'", "expected": "Email shows valid format without error" },
  { "step": "Fill Password field with 'SecurePass123!'", "expected": "Password masked with bullets" },
  { "step": "Fill Confirm Password with same value", "expected": "Confirm Password masked with bullets" },
  { "step": "Check Terms and Conditions checkbox", "expected": "Checkbox is marked/checked" },
  { "step": "Click Register button", "expected": "Button disabled, loading indicator shown" },
  { "step": "Wait for registration completion", "expected": "Success message 'Account created' appears" },
  { "step": "Verify redirect to dashboard", "expected": "URL is /dashboard, user greeting visible" }
]
```

**Total: 10 steps for 5 fields** ✅

### 5. Test Category Distribution

When generating comprehensive tests, ensure coverage:

```json
{
  "totalTestCases": 25,
  "byType": {
    "functional": 8,        // 40% - Happy paths
    "regression": 4,        // 15% - Existing behavior
    "smoke": 3,            // 10% - Quick critical checks
    "negative": 4,         // 15% - Invalid inputs
    "boundary": 2,         // 10% - Edge cases
    "security": 2,         // 5% - Security attacks
    "accessibility": 1,    // 3% - Keyboard/ARIA
    "performance": 1,      // 3% - Load times
    "api": 1               // 3% - API contracts
  }
}
```

### 6. Confidence Score Interpretation

| Score | Meaning | Action |
|-------|---------|--------|
| 90-100 | Production-ready, clear requirements | Automate immediately |
| 70-89 | Well-defined, minor assumptions | Automate with customization |
| 50-69 | Ambiguous, needs clarification | Review and refine |
| <50 | Too vague | Reject and request details |

### 7. Processing the Response

**In Frontend (React/Vue):**

```typescript
// Generate tests
const response = await fetch('/api/generate-tests', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'Feature Name',
    description: 'Detailed description',
    appType: 'web',
    testDepth: 'comprehensive'
  })
});

const data = await response.json();

// Extract test cases
const testCases = data.testCases;
const validationScore = data.validationScore;
const coverage = data.coverageSummary;

// Display test cases
testCases.forEach(tc => {
  console.log(`Title: ${tc.title}`);
  console.log(`Type: ${tc.testType}`);
  console.log(`Priority: ${tc.priority}`);
  console.log(`Confidence: ${tc.confidenceScore}`);
  console.log(`Steps: ${tc.steps.length}`);
  
  tc.steps.forEach((step, i) => {
    console.log(`  ${i+1}. ${step.step}`);
    console.log(`     => ${step.expected}`);
  });
});

// Show coverage
console.log(`Total Tests: ${coverage.totalTestCases}`);
console.log(`Coverage by Type:`, coverage.byType);
```

## Common Scenarios

### Scenario 1: Simple Login Feature

**Request:**
```json
{
  "title": "User Login",
  "description": "Users can login with email and password to access their dashboard",
  "appType": "web",
  "testDepth": "comprehensive"
}
```

**Expected Response:**
- 25-35 test cases
- Includes: functional (login success), negative (invalid credentials), boundary (very long password), security (SQL injection), accessibility (keyboard navigation), etc.
- Each test has 4-6 atomic steps
- Confidence scores 75-95

### Scenario 2: Multi-Field Form (Registration)

**Request:**
```json
{
  "title": "User Registration",
  "description": "5-field registration form: first name, last name, email, password, confirm password, terms checkbox, submit button",
  "appType": "web",
  "testDepth": "comprehensive"
}
```

**Expected Response:**
- 30-40 test cases
- Happy path has 10+ steps (one per field + navigation + submit + verify)
- Negative tests verify each field individually
- Boundary tests check field length limits
- Accessibility tests verify Tab navigation
- Security tests check password handling and SQL injection

### Scenario 3: REST API Endpoint

**Request:**
```json
{
  "title": "Create User API",
  "description": "POST /api/users with email, password, name - returns 201 with user object and auth token",
  "appType": "api_rest",
  "testDepth": "comprehensive"
}
```

**Expected Response:**
- 25-30 test cases
- API tests verify status codes (201, 400, 401, 422)
- Request/response validation
- Error message accuracy
- Edge cases: empty fields, too long values, special characters
- Security: SQL injection, XSS, missing auth

### Scenario 4: Search Feature

**Request:**
```json
{
  "title": "Product Search",
  "description": "Users can search products by keyword and filter results by price range, category. Results paginated.",
  "appType": "web",
  "testDepth": "comprehensive"
}
```

**Expected Response:**
- 35-45 test cases
- Search with results
- Search with no results
- Search with special characters
- Filter combinations
- Pagination (first, last, invalid page)
- Performance tests (large result set)
- Accessibility for search box

## Validation Checklist

Before using generated test cases, verify:

- [ ] Total test count is 25+ (comprehensive) or 40+ (exhaustive)
- [ ] All 10 test categories are represented
- [ ] Each test has 3+ steps (5+ for forms)
- [ ] No step combines multiple actions
- [ ] All expected results are observable (not vague)
- [ ] Confidence scores are justified (75+)
- [ ] Coverage summary shows distribution
- [ ] No duplicate scenarios
- [ ] Field tests are complete (N fields = N+ steps)

## Troubleshooting

### Problem: Test cases have only 1-2 steps per test

**Solution:** Steps are being combined. Request regeneration and specify:
```json
{
  "testDepth": "exhaustive",
  "includeE2E": true,
  "appType": "web"
}
```

### Problem: Missing test categories

**Solution:** The generator should include all 10 types. If missing, specify in request:
```json
{
  "nonFunctionalRequirements": "Must test security (SQL injection, XSS), accessibility (keyboard navigation), performance (< 2s load time)"
}
```

### Problem: Confidence scores are too low (<50)

**Solution:** Provide more specific details in the request:
```json
{
  "description": "Specific field names, expected outcomes, error scenarios",
  "functionalRequirements": "Detailed behavior per requirement",
  "businessUseCase": "Clear business context"
}
```

## API Integration Examples

### JavaScript/TypeScript
```typescript
interface GenerateTestsRequest {
  title: string;
  description: string;
  appType?: string;
  testDepth?: 'standard' | 'comprehensive' | 'exhaustive';
  includeE2E?: boolean;
  businessUseCase?: string;
  userRoles?: string;
  functionalRequirements?: string;
  nonFunctionalRequirements?: string;
  targetUrl?: string;
}

interface TestCase {
  title: string;
  description: string;
  preconditions: string;
  steps: Array<{ step: string; expected: string }>;
  priority: 'low' | 'medium' | 'high' | 'critical';
  testType: string;
  reasoning: string;
  confidenceScore: number;
}

interface GenerateTestsResponse {
  testCases: TestCase[];
  validationScore: number;
  coverageSummary: {
    totalTestCases: number;
    byType: Record<string, number>;
    coverageAreas: string[];
    gapAreas: string[];
  };
  generatedBy: 'ai' | 'rule-based';
}

async function generateTests(request: GenerateTestsRequest): Promise<GenerateTestsResponse> {
  const response = await fetch('/api/generate-tests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });
  return response.json();
}
```

### Python
```python
import requests

def generate_tests(
    title: str,
    description: str,
    app_type: str = "web",
    test_depth: str = "comprehensive",
    **kwargs
) -> dict:
    """Generate test cases via AITAS API"""
    payload = {
        "title": title,
        "description": description,
        "appType": app_type,
        "testDepth": test_depth,
        **kwargs
    }
    
    response = requests.post(
        "http://localhost:3000/api/generate-tests",
        json=payload
    )
    
    return response.json()

# Example usage
result = generate_tests(
    title="User Login",
    description="Users can login with email and password",
    app_type="web",
    test_depth="comprehensive",
    businessUseCase="User authentication and session management"
)

print(f"Generated {result['validationScore']} test cases")
print(f"Coverage by type: {result['coverageSummary']['byType']}")
```

## Best Practices

1. **Be Specific**: Include exact field names, URLs, validation rules
2. **List All Fields**: For forms, enumerate every field
3. **Include Business Context**: Explain why the feature matters
4. **Specify Error Scenarios**: Describe what errors should be prevented
5. **Request All Categories**: Ask for security, accessibility, performance tests
6. **Review Results**: Check confidence scores and step atomicity
7. **Iterate**: Refine and regenerate for better coverage

## Summary

The enhanced test generation system now:
- ✅ Enforces atomic steps (one action per step)
- ✅ Ensures complete field coverage (N fields = N+ steps)
- ✅ Provides all 10 test categories
- ✅ Generates specific, observable outcomes
- ✅ Includes confidence scoring with justification
- ✅ Returns detailed coverage summary
- ✅ Supports enterprise-grade test automation

This enables AITAS to generate production-ready test cases that are:
- Maintainable
- Executable
- Comprehensive
- Quality-assured
