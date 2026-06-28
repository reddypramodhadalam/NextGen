# Test Generation Examples

This document provides real-world examples of how to use the enhanced test generation API with the new comprehensive prompt.

## Example 1: E-Commerce Product Registration

### Request

```bash
curl -X POST http://localhost:3000/api/generate-tests \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Product Registration in E-Commerce",
    "description": "Admin users can register new products with SKU, name, price, category, description, inventory quantity, and submit for approval",
    "appType": "web",
    "testDepth": "comprehensive",
    "includeE2E": true,
    "businessUseCase": "Enable admins to add products to the catalog for customer purchase",
    "userRoles": "Product Admin, Inventory Manager, System Admin",
    "functionalRequirements": "Form has 7 fields (SKU, Product Name, Price, Category dropdown, Description textarea, Quantity, Submit button). SKU must be unique. Price must be numeric > 0. Quantity must be >= 0. All fields required except Description.",
    "nonFunctionalRequirements": "Form must load in < 2 seconds. Submit must respond within 1 second. Support 10,000+ products. Prevent SQL injection, XSS attacks. Accessible via keyboard.",
    "targetUrl": "https://admin.example.com/products/register"
  }'
```

### Expected Response (Partial - 35+ Test Cases)

```json
{
  "testCases": [
    {
      "title": "Product registration with all valid data succeeds",
      "description": "Verify admin can register a complete product with all required fields",
      "preconditions": "Admin user is logged in, has product admin role, form page loads",
      "steps": [
        { "step": "Navigate to /products/register", "expected": "Form loads in < 2s, all 7 fields visible" },
        { "step": "Enter SKU 'PROD-2024-001' in SKU field", "expected": "SKU value appears, no format errors" },
        { "step": "Enter 'Professional Laptop' in Product Name field", "expected": "Name displays without truncation" },
        { "step": "Enter '999.99' in Price field", "expected": "Price shows as currency format $999.99" },
        { "step": "Select 'Electronics' from Category dropdown", "expected": "Dropdown closes, 'Electronics' selected" },
        { "step": "Enter product description in textarea", "expected": "Text accepts 5000+ characters without error" },
        { "step": "Enter '150' in Quantity field", "expected": "Quantity value appears as number" },
        { "step": "Click Register Product button", "expected": "Button disabled, loading spinner appears" },
        { "step": "Wait for API response max 2 seconds", "expected": "Success message 'Product registered' appears" },
        { "step": "Verify redirect to product detail page", "expected": "URL is /products/PROD-2024-001, all data displays" }
      ],
      "priority": "critical",
      "testType": "functional",
      "reasoning": "Product registration is core business flow enabling catalog management",
      "confidenceScore": 95
    },
    {
      "title": "Product registration fails when SKU already exists",
      "description": "Verify system prevents duplicate SKU registration",
      "preconditions": "SKU 'PROD-2024-001' already exists in system",
      "steps": [
        { "step": "Navigate to /products/register", "expected": "Form loads" },
        { "step": "Fill all fields with valid data including SKU 'PROD-2024-001'", "expected": "All fields populate correctly" },
        { "step": "Click Register Product button", "expected": "API receives request" },
        { "step": "Wait for API response", "expected": "Error message 'SKU already exists' shown" }
      ],
      "priority": "high",
      "testType": "negative",
      "reasoning": "Prevent data corruption from duplicate SKUs",
      "confidenceScore": 90
    },
    {
      "title": "Product registration requires SKU field",
      "description": "Verify SKU is mandatory",
      "steps": [
        { "step": "Navigate to /products/register", "expected": "Form loads" },
        { "step": "Leave SKU field empty", "expected": "SKU field is empty" },
        { "step": "Fill remaining fields with valid data", "expected": "All fields except SKU are populated" },
        { "step": "Click Register Product button", "expected": "Form validation error shown for SKU field" }
      ],
      "priority": "high",
      "testType": "negative",
      "reasoning": "SKU is unique identifier and must not be empty",
      "confidenceScore": 92
    },
    {
      "title": "Product registration validates price is numeric and > 0",
      "description": "Verify price field accepts only valid currency values",
      "steps": [
        { "step": "Navigate to /products/register", "expected": "Form loads" },
        { "step": "Enter 'abc' in Price field", "expected": "Non-numeric input rejected or highlighted" },
        { "step": "Clear Price field and enter '0'", "expected": "Value '0' appears in field" },
        { "step": "Fill other fields and submit", "expected": "Error 'Price must be greater than 0' shown" },
        { "step": "Enter '-50' in Price field", "expected": "Negative value appears" },
        { "step": "Submit form", "expected": "Error 'Price must be positive' shown" }
      ],
      "priority": "high",
      "testType": "boundary",
      "reasoning": "Prevent invalid pricing that could harm business",
      "confidenceScore": 90
    },
    {
      "title": "Product registration prevents SQL injection in SKU",
      "description": "Verify SQL injection attacks in SKU field are prevented",
      "steps": [
        { "step": "Navigate to /products/register", "expected": "Form loads" },
        { "step": "Enter \\\"' OR '1'='1\\\" in SKU field", "expected": "Input accepted or sanitized" },
        { "step": "Fill remaining fields with valid data", "expected": "All fields populated" },
        { "step": "Click Register Product", "expected": "No database injection occurs, product not created with malicious SKU" }
      ],
      "priority": "critical",
      "testType": "security",
      "reasoning": "Prevent SQL injection attacks that could access unauthorized data",
      "confidenceScore": 95
    },
    {
      "title": "Product registration prevents XSS in description",
      "description": "Verify XSS attacks in description field are sanitized",
      "steps": [
        { "step": "Navigate to /products/register", "expected": "Form loads" },
        { "step": "Enter \\\"<script>alert('xss')</script>\\\" in description", "expected": "Input accepted" },
        { "step": "Fill other fields and submit", "expected": "No JavaScript execution, script tag saved as text or escaped" }
      ],
      "priority": "critical",
      "testType": "security",
      "reasoning": "Prevent XSS attacks that could execute malicious code",
      "confidenceScore": 93
    },
    {
      "title": "Product registration form is keyboard accessible",
      "description": "Verify form can be completed using Tab key only",
      "steps": [
        { "step": "Navigate to /products/register", "expected": "Form loads" },
        { "step": "Tab to SKU field from page start", "expected": "SKU field focused with visible outline" },
        { "step": "Tab through all 7 fields sequentially", "expected": "Each field receives focus in correct order" },
        { "step": "Tab to Register button", "expected": "Button receives focus with visible outline" },
        { "step": "Press Enter on Register button", "expected": "Form submits (or validation error if incomplete)" }
      ],
      "priority": "high",
      "testType": "accessibility",
      "reasoning": "Comply with WCAG 2.1 AA standards for keyboard navigation",
      "confidenceScore": 92
    },
    {
      "title": "Product registration API responds within 1 second",
      "description": "Verify registration API performance meets SLA",
      "steps": [
        { "step": "Navigate to /products/register", "expected": "Form loads" },
        { "step": "Complete form with valid data", "expected": "All fields populated" },
        { "step": "Record timestamp and submit form", "expected": "Submit starts, request sent to API" },
        { "step": "Measure time until response received", "expected": "Response received within 1000ms (1 second)" }
      ],
      "priority": "medium",
      "testType": "performance",
      "reasoning": "Ensure user experience is responsive, not sluggish",
      "confidenceScore": 88
    },
    {
      "title": "Product registration handles category selection correctly",
      "description": "Verify dropdown category selection works",
      "steps": [
        { "step": "Navigate to /products/register", "expected": "Form loads" },
        { "step": "Click Category dropdown", "expected": "Dropdown expands showing all categories" },
        { "step": "Select 'Electronics'", "expected": "Dropdown closes, 'Electronics' displayed" },
        { "step": "Click dropdown again", "expected": "Dropdown reopens with 'Electronics' highlighted" },
        { "step": "Select 'Furniture'", "expected": "Selection changes to 'Furniture'" }
      ],
      "priority": "high",
      "testType": "functional",
      "reasoning": "Ensure category selection is intuitive and works correctly",
      "confidenceScore": 90
    }
  ],
  "validationScore": 92,
  "coverageSummary": {
    "totalTestCases": 35,
    "byType": {
      "functional": 8,
      "regression": 3,
      "smoke": 2,
      "negative": 5,
      "boundary": 3,
      "security": 4,
      "accessibility": 1,
      "performance": 1,
      "api": 1,
      "usability": 1
    },
    "coverageAreas": [
      "Product field validation",
      "SKU uniqueness",
      "Price validation",
      "Category selection",
      "Form submission",
      "Security (SQL injection, XSS)",
      "Accessibility (keyboard navigation)",
      "Performance (response time)",
      "Error handling"
    ],
    "gapAreas": []
  },
  "generatedBy": "ai"
}
```

## Example 2: REST API - User Creation Endpoint

### Request

```bash
curl -X POST http://localhost:3000/api/generate-tests \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Create User API Endpoint",
    "description": "POST /api/v1/users with email, password, firstName, lastName creates a new user account and returns 201 with user object and auth token",
    "appType": "api_rest",
    "testDepth": "comprehensive",
    "apiDetails": "Endpoint: POST /api/v1/users. Request: { email, password, firstName, lastName }. Response 201: { id, email, firstName, lastName, token, createdAt }. Response 400: validation errors. Response 409: email already exists.",
    "functionalRequirements": "Create new user, hash password, generate auth token, return user object with token",
    "nonFunctionalRequirements": "Response time < 500ms. Support 1M+ users. Prevent SQL injection, validate email format, enforce password strength"
  }'
```

### Expected Response (Partial - 25+ Test Cases)

```json
{
  "testCases": [
    {
      "title": "Create user with valid data returns 201",
      "description": "Verify successful user creation with all required fields",
      "steps": [
        { "step": "Send POST /api/v1/users with valid user data", "expected": "HTTP 201 status returned" },
        { "step": "Verify response contains user id, email, firstName, lastName", "expected": "All user fields present in response" },
        { "step": "Verify response contains auth token", "expected": "Token field present and not empty" },
        { "step": "Verify response contains createdAt timestamp", "expected": "Timestamp is valid ISO date format" }
      ],
      "priority": "critical",
      "testType": "functional",
      "reasoning": "Verify core user creation functionality works end-to-end",
      "confidenceScore": 95
    },
    {
      "title": "Create user with duplicate email returns 409 Conflict",
      "description": "Verify system prevents duplicate email registration",
      "preconditions": "User with email 'john@example.com' already exists",
      "steps": [
        { "step": "Send POST /api/v1/users with email 'john@example.com'", "expected": "HTTP 409 Conflict status returned" },
        { "step": "Verify response contains error message", "expected": "Message contains 'email already exists'" },
        { "step": "Verify no new user is created", "expected": "GET /api/v1/users returns same user count" }
      ],
      "priority": "high",
      "testType": "negative",
      "reasoning": "Prevent duplicate accounts that would corrupt user database",
      "confidenceScore": 92
    },
    {
      "title": "Create user with invalid email format returns 400",
      "description": "Verify email validation rejects invalid formats",
      "steps": [
        { "step": "Send POST with email 'notanemail'", "expected": "HTTP 400 Bad Request status" },
        { "step": "Verify error message specifies email validation", "expected": "Error contains 'invalid email format'" },
        { "step": "Send with email 'missing@domain'", "expected": "HTTP 400 returned" },
        { "step": "Send with email '@nodomain.com'", "expected": "HTTP 400 returned" }
      ],
      "priority": "high",
      "testType": "boundary",
      "reasoning": "Prevent invalid emails that would cause delivery issues",
      "confidenceScore": 90
    },
    {
      "title": "Create user with weak password returns 400",
      "description": "Verify password strength validation",
      "steps": [
        { "step": "Send POST with password '123'", "expected": "HTTP 400 Bad Request" },
        { "step": "Error message should specify password too short", "expected": "Message contains 'minimum 8 characters'" },
        { "step": "Send with password 'password' (no numbers)", "expected": "HTTP 400 returned" },
        { "step": "Error indicates need for numbers/symbols", "expected": "Message contains 'require uppercase, numbers, symbols'" }
      ],
      "priority": "high",
      "testType": "security",
      "reasoning": "Enforce strong passwords to prevent account takeover",
      "confidenceScore": 88
    },
    {
      "title": "Create user with missing email field returns 400",
      "description": "Verify email is required",
      "steps": [
        { "step": "Send POST /api/v1/users without email field", "expected": "HTTP 400 Bad Request" },
        { "step": "Verify error message", "expected": "Message contains 'email is required'" }
      ],
      "priority": "high",
      "testType": "negative",
      "reasoning": "Email is unique identifier and must not be empty",
      "confidenceScore": 93
    },
    {
      "title": "Create user response time under 500ms",
      "description": "Verify API responds quickly",
      "steps": [
        { "step": "Record start time", "expected": "Timestamp recorded" },
        { "step": "Send POST /api/v1/users with valid data", "expected": "Request sent" },
        { "step": "Record end time when response received", "expected": "Response time measured" },
        { "step": "Verify elapsed time", "expected": "Response time < 500ms" }
      ],
      "priority": "medium",
      "testType": "performance",
      "reasoning": "API must be responsive for good user experience",
      "confidenceScore": 85
    },
    {
      "title": "Create user prevents SQL injection in email",
      "description": "Verify SQL injection in email field is sanitized",
      "steps": [
        { "step": "Send POST with email \\\"' OR '1'='1\\\"", "expected": "HTTP 400 or email validation error" },
        { "step": "Verify no database injection occurs", "expected": "Injection attempt fails safely" }
      ],
      "priority": "critical",
      "testType": "security",
      "reasoning": "Prevent SQL injection attacks accessing unauthorized data",
      "confidenceScore": 94
    },
    {
      "title": "Create user password is hashed in database",
      "description": "Verify passwords are not stored in plaintext",
      "steps": [
        { "step": "Create user with password 'MySecurePass123!'", "expected": "User created, HTTP 201" },
        { "step": "Query database directly for password field", "expected": "Password is hashed (bcrypt), not plaintext" },
        { "step": "Attempt to authenticate with correct password", "expected": "Authentication succeeds" },
        { "step": "Attempt to authenticate with wrong password", "expected": "Authentication fails" }
      ],
      "priority": "critical",
      "testType": "security",
      "reasoning": "Protect user credentials from exposure if database is breached",
      "confidenceScore": 96
    }
  ],
  "validationScore": 94,
  "coverageSummary": {
    "totalTestCases": 25,
    "byType": {
      "functional": 4,
      "regression": 2,
      "smoke": 2,
      "negative": 4,
      "boundary": 3,
      "security": 5,
      "api": 5
    }
  },
  "generatedBy": "ai"
}
```

## Example 3: Mobile App - Login Feature

### Request

```bash
curl -X POST http://localhost:3000/api/generate-tests \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Mobile App Login Feature",
    "description": "iOS and Android users can login with email and password, persist session, show user profile after successful login",
    "appType": "mobile",
    "testDepth": "comprehensive",
    "businessUseCase": "Enable users to securely access their personalized mobile app experience",
    "functionalRequirements": "Email input, password input (masked), Login button, error messages for invalid credentials, session persistence",
    "nonFunctionalRequirements": "Support iOS 14+, Android 10+. Offline handling. Biometric login support. Session timeout after 30min. App load time < 3s",
    "appContext": "Mobile app for on-the-go transactions and account management"
  }'
```

### Expected Response (Partial - 30+ Test Cases)

```json
{
  "testCases": [
    {
      "title": "User login with valid credentials on iOS succeeds",
      "description": "Verify user can login on iPhone with email and password",
      "preconditions": "iOS app installed, user account exists, app loads",
      "steps": [
        { "step": "Tap Email text field", "expected": "Email field focused, keyboard appears" },
        { "step": "Type email 'user@example.com'", "expected": "Email appears in field" },
        { "step": "Tap Password text field", "expected": "Password field focused, keyboard switches" },
        { "step": "Type password 'SecurePass123!'", "expected": "Characters shown as dots (masked)" },
        { "step": "Tap Login button", "expected": "Button disabled, loading spinner appears" },
        { "step": "Wait for API response max 5 seconds", "expected": "Loading completes, transition begins" },
        { "step": "Verify screen transitions to Profile", "expected": "User name displayed, profile image visible" }
      ],
      "priority": "critical",
      "testType": "functional",
      "reasoning": "Core feature enabling app access on iOS",
      "confidenceScore": 94
    },
    {
      "title": "User login with valid credentials on Android succeeds",
      "description": "Verify user can login on Android devices",
      "preconditions": "Android app installed, user account exists",
      "steps": [
        { "step": "Tap Email text field", "expected": "Email field focused, keyboard appears" },
        { "step": "Type email 'user@example.com'", "expected": "Email displayed in field" },
        { "step": "Tap Password text field", "expected": "Password field focused" },
        { "step": "Type password", "expected": "Characters masked with dots" },
        { "step": "Tap Login button", "expected": "Loading indicator shown" },
        { "step": "Wait for authentication", "expected": "User profile screen displayed" }
      ],
      "priority": "critical",
      "testType": "functional",
      "reasoning": "Core feature enabling app access on Android",
      "confidenceScore": 93
    },
    {
      "title": "Login fails with wrong password shows error",
      "description": "Verify error handling for incorrect credentials",
      "steps": [
        { "step": "Tap Email field and enter valid email", "expected": "Email displayed" },
        { "step": "Tap Password field and enter wrong password", "expected": "Password masked" },
        { "step": "Tap Login button", "expected": "Loading begins" },
        { "step": "Wait for response", "expected": "Error message 'Invalid credentials' shown in red alert" }
      ],
      "priority": "high",
      "testType": "negative",
      "reasoning": "Provide clear feedback for authentication failures",
      "confidenceScore": 92
    },
    {
      "title": "Login form works in portrait and landscape orientations",
      "description": "Verify UI adapts to device orientation changes",
      "steps": [
        { "step": "Hold device in portrait (vertical) orientation", "expected": "Login form displayed vertically" },
        { "step": "Rotate device to landscape (horizontal)", "expected": "Form adjusts, all fields still visible and clickable" },
        { "step": "Rotate back to portrait", "expected": "Form returns to portrait layout" }
      ],
      "priority": "high",
      "testType": "functional",
      "reasoning": "Ensure responsive design works for both orientations",
      "confidenceScore": 90
    },
    {
      "title": "Login session persists after app close on iOS",
      "description": "Verify user stays logged in after app restart",
      "steps": [
        { "step": "Login to app successfully", "expected": "Profile screen displayed" },
        { "step": "Force-close the app (swipe up to close)", "expected": "App closes" },
        { "step": "Reopen app from home screen", "expected": "App opens and shows profile screen, no login needed" }
      ],
      "priority": "high",
      "testType": "functional",
      "reasoning": "Reduce friction by maintaining user sessions",
      "confidenceScore": 88
    },
    {
      "title": "Login prevents password from being visible",
      "description": "Verify password field masks input",
      "steps": [
        { "step": "Tap Password field", "expected": "Field focused" },
        { "step": "Type 'MyPassword123'", "expected": "Characters shown as 12 dots, not plain text" },
        { "step": "Look for show/hide toggle", "expected": "Eye icon appears to reveal password temporarily" },
        { "step": "Tap eye icon", "expected": "Password becomes visible momentarily" },
        { "step": "Tap eye icon again", "expected": "Password masked again" }
      ],
      "priority": "critical",
      "testType": "security",
      "reasoning": "Prevent shoulder surfing attacks",
      "confidenceScore": 93
    },
    {
      "title": "App requires biometric re-authentication after 30 minutes",
      "description": "Verify session timeout and re-auth prompt",
      "steps": [
        { "step": "Login successfully", "expected": "User in app using features" },
        { "step": "Put device in background for 30+ minutes", "expected": "Session expires" },
        { "step": "Return to app", "expected": "Biometric prompt appears (Face ID or Touch ID)" },
        { "step": "Complete biometric authentication", "expected": "User re-authenticated, app functionality restored" }
      ],
      "priority": "high",
      "testType": "security",
      "reasoning": "Protect user data if device is left unattended",
      "confidenceScore": 85
    }
  ],
  "validationScore": 91,
  "coverageSummary": {
    "totalTestCases": 30,
    "byType": {
      "functional": 8,
      "negative": 3,
      "security": 5,
      "accessibility": 2,
      "performance": 2,
      "usability": 1
    }
  },
  "generatedBy": "ai"
}
```

## Key Takeaways

### From E-Commerce Example
- ✅ **Field Coverage**: Each of 7 form fields gets its own test step
- ✅ **All Categories**: 35 tests cover all 10 categories
- ✅ **Atomic Steps**: Never combining multiple actions (e.g., separate steps for each field fill)
- ✅ **Observable Outcomes**: Every expected result is verifiable

### From API Example
- ✅ **HTTP Status Codes**: Tests verify correct 201, 400, 409 responses
- ✅ **Security Focus**: SQL injection, XSS, password hashing explicitly tested
- ✅ **Performance**: Response time requirements verified
- ✅ **Edge Cases**: Missing fields, invalid formats, boundary values

### From Mobile Example
- ✅ **Platform Specific**: Separate tests for iOS and Android
- ✅ **UI Interactions**: Tap, rotate, mask verification
- ✅ **Session Management**: Persistence, timeout, re-authentication
- ✅ **Accessibility**: Biometric support, keyboard handling

## Best Practices Demonstrated

1. **Specific Field Names**: Instead of "fill the form," specify "Fill Email field with 'user@example.com'"
2. **Observable Outcomes**: Instead of "field populated," say "Email value appears in input field"
3. **Complete Coverage**: Form with 7 fields has 7+ fill steps
4. **All Test Types**: Every response includes functional, negative, security, accessibility, performance
5. **Clear Confidence**: Scores 85-95 are justified by specific, clear requirements
6. **Business Context**: Each test explains why it matters (security, data integrity, UX)

## How to Use These Examples

1. **Copy the request format** and adapt to your feature
2. **Be specific** about field names, URLs, business logic
3. **Include all requirements** (functional, non-functional, security)
4. **Expect 25-40 tests** for comprehensive coverage
5. **Review confidence scores** - adjust if < 75
6. **Check coverage summary** - verify all 10 types represented

This structured approach ensures AITAS generates production-ready test cases that can be immediately automated or executed manually.
