# AITAS Test Generation API - Usage Guide for Layman

## What is the `/api/generate-tests` API?

This API automatically generates comprehensive test cases for any feature or requirement you describe in plain English. Instead of manually writing test cases, you just describe what you want to test, and the system creates 30+ detailed test cases with step-by-step instructions.

---

## How to Use (Step by Step)

### Step 1: Prepare Your Request

You need to describe:
- **Title**: What feature you're testing (e.g., "User Login", "Submit Order")
- **Description**: What this feature does (e.g., "Users should be able to log in with email and password")
- **App Type**: What kind of application (e.g., "web", "mobile", "api")

### Step 2: Send a Request

**Using cURL (Command Line):**

```bash
curl -X POST http://localhost:3000/api/generate-tests \
  -H "Content-Type: application/json" \
  -d '{
    "title": "User Login",
    "description": "Users can log in to the application using email and password",
    "appType": "web",
    "testDepth": "comprehensive"
  }'
```

**Using JavaScript/Fetch:**

```javascript
const response = await fetch('http://localhost:3000/api/generate-tests', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'User Login',
    description: 'Users can log in to the application using email and password',
    appType: 'web',
    testDepth: 'comprehensive'
  })
});

const testCases = await response.json();
console.log(testCases);
```

**Using Postman:**
1. Open Postman
2. Create a **POST** request to `http://localhost:3000/api/generate-tests`
3. Go to **Body** → **raw** → **JSON**
4. Paste this:
```json
{
  "title": "User Login",
  "description": "Users can log in with email and password",
  "appType": "web",
  "testDepth": "comprehensive"
}
```
5. Click **Send**

### Step 3: Understand the Response

The API returns a JSON object with:

```json
{
  "testCases": [
    {
      "title": "User Login - Functional Test Case 1",
      "description": "Happy path test",
      "preconditions": "User has a registered account",
      "steps": [
        {
          "step": "Navigate to login page",
          "expected": "Page loads successfully"
        },
        {
          "step": "Enter email 'user@example.com'",
          "expected": "Email field shows the entered value"
        },
        {
          "step": "Enter password",
          "expected": "Password is masked with bullet points"
        },
        {
          "step": "Click Login button",
          "expected": "Request is sent to backend"
        },
        {
          "step": "Verify redirect to dashboard",
          "expected": "URL changes to /dashboard"
        }
      ],
      "priority": "high",
      "testType": "functional",
      "reasoning": "Validates that users can successfully log in",
      "confidenceScore": 89
    },
    // ... 29 more test cases follow
  ],
  "coverageSummary": {
    "totalTestCases": 30,
    "byType": {
      "functional": 3,
      "regression": 3,
      "smoke": 3,
      "negative": 3,
      "boundary": 3,
      "security": 3,
      "accessibility": 3,
      "performance": 3,
      "api": 3,
      "usability": 3
    }
  }
}
```

---

## What Each Field Means

### Test Case Fields

| Field | Meaning | Example |
|-------|---------|---------|
| **title** | Short name of the test | "User Login - Functional Test Case 1" |
| **description** | What this test checks | "Test that users can successfully log in" |
| **preconditions** | What must be true before running the test | "User must have a registered account" |
| **steps** | Step-by-step instructions | Array of actions to perform |
| **priority** | How important is this test | "high", "medium", "low", "critical" |
| **testType** | Category of test | "functional", "negative", "security", etc. |
| **reasoning** | Why this test matters | "Ensures login functionality works" |
| **confidenceScore** | How confident we are this test is correct (0-100) | 89 |

### Step Fields

Each step in the "steps" array has:

| Field | Meaning | Example |
|-------|---------|---------|
| **step** | The action to perform | "Enter email 'user@example.com' in email field" |
| **expected** | What should happen after this step | "Email appears in the input field" |

---

## Test Types Explained

The system generates tests in 10 different categories:

| Test Type | What It Tests | Example |
|-----------|--------------|---------|
| **Functional** | Happy path - does it work? | Log in with correct credentials |
| **Negative** | Error handling - what if user does something wrong? | Try to log in with wrong password |
| **Boundary** | Edge cases and limits | Try password with 100 characters |
| **Security** | Can someone hack it? | Try SQL injection in login |
| **Regression** | Does old stuff still work? | Did our changes break existing features? |
| **Smoke** | Quick sanity checks | Does the login page load? |
| **Accessibility** | Can people with disabilities use it? | Can I navigate with keyboard only? |
| **Performance** | Is it fast enough? | Does login complete in under 2 seconds? |
| **API** | If there's a backend API, does it respond correctly? | Does login API return 200 status? |
| **Usability** | Is it easy to use? | Are error messages clear and helpful? |

---

## Parameters You Can Use

### Basic Parameters

```json
{
  "title": "Feature Name",           // What you're testing
  "description": "What it does",     // Description of the feature
  "appType": "web",                  // Type: web, mobile, api, desktop
  "testDepth": "comprehensive"       // comprehensive (default), standard, exhaustive
}
```

### Advanced Parameters

```json
{
  "title": "User Registration",
  "description": "Allow users to create accounts",
  "appType": "web",
  "appName": "MyApp",
  "moduleName": "Authentication",
  "businessUseCase": "User onboarding",
  "userRoles": "Customer, Admin, Guest",
  "functionalRequirements": "Email validation, password strength",
  "nonFunctionalRequirements": "Must load in under 2 seconds",
  "apiDetails": "POST /api/register",
  "testDepth": "comprehensive"
}
```

---

## Example Requests

### Example 1: Simple Web Form

```bash
curl -X POST http://localhost:3000/api/generate-tests \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Contact Form",
    "description": "Users can submit contact information via a form",
    "appType": "web"
  }'
```

**You get**: 30 test cases covering:
- Filling all form fields
- Clicking submit
- Checking validation messages
- Testing empty fields
- Testing special characters
- Testing long inputs
- Security tests
- Accessibility tests

### Example 2: REST API Endpoint

```bash
curl -X POST http://localhost:3000/api/generate-tests \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Create User API",
    "description": "POST /api/users endpoint that creates a new user",
    "appType": "api_rest",
    "apiDetails": "POST /api/users with JSON body containing name, email, password"
  }'
```

**You get**: 30 test cases covering:
- Valid user creation (200 response)
- Missing required fields (400 response)
- Duplicate email (409 response)
- Invalid data types (422 response)
- Unauthorized access (401 response)
- Rate limiting checks
- Performance benchmarks

### Example 3: Mobile App

```bash
curl -X POST http://localhost:3000/api/generate-tests \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Mobile Payment",
    "description": "Users can make payments in the mobile app",
    "appType": "mobile"
  }'
```

**You get**: 30 test cases covering:
- Payment screen navigation
- Amount entry
- Payment confirmation
- Error handling
- Offline scenarios
- Different screen sizes
- Accessibility for disabled users
- Security (no storing card details)

---

## Response Codes

| Code | Meaning |
|------|---------|
| **200** | Success! Test cases were generated |
| **400** | Bad request - check your JSON format |
| **500** | Server error - the system crashed |

---

## Common Mistakes

❌ **WRONG**:
```json
{
  "description": "login"
}
```

✅ **RIGHT**:
```json
{
  "title": "User Login",
  "description": "Users can log in with email and password",
  "appType": "web"
}
```

---

## How Many Test Cases Do I Get?

By default: **30 test cases**

Each test case has:
- **8-15 atomic steps** (individual, non-combined actions)
- **Clear expected results** for each step
- **Type category** (functional, security, etc.)
- **Priority level** (critical, high, medium, low)
- **Confidence score** (0-100)

---

## What to Do With the Test Cases

1. **Review** them to ensure they match your requirements
2. **Modify** any steps that don't apply to your specific app
3. **Export** them to a test management system (Jira, TestRail, etc.)
4. **Execute** them manually or automate them with Selenium/Playwright
5. **Track** results and bugs found

---

## Need Help?

If the generated test cases don't look right:

1. **Be more specific** in the description
   - Instead of: "create user"
   - Use: "Create a new user account by filling in First Name, Last Name, Email, Password, and clicking Register button"

2. **Provide examples** of what the feature does
   - "Users should see validation errors if they enter an invalid email format"

3. **Mention constraints**
   - "Password must be at least 8 characters with uppercase, number, and symbol"

4. **Describe the app type**
   - "This is a React web application"
   - "This is an iOS mobile app"
   - "This is a REST API backend"

---

## Limitations

- Requires description of what you're testing (not mind reading!)
- Works best with clear, detailed requirements
- Generated tests are starting point (you may need to customize)
- AI confidence scores help identify uncertain tests

---

## Next Steps

1. Start with simple requests
2. Gradually add more details
3. Review and customize the output
4. Use test cases to improve your QA process
5. Save time by letting AI generate the first draft!
