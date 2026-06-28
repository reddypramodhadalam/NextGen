# Quick Reference - Test Generation Prompt

## 🎯 One-Minute Overview

The enhanced `/api/generate-tests` API now generates **enterprise-grade test cases** with:
- ✅ Atomic steps (one action = one step)
- ✅ Complete field coverage (5 fields = 5+ steps)
- ✅ All 10 test categories
- ✅ Specific, observable outcomes
- ✅ Confidence scoring (0-100)

## 📝 JSON Output Format

```json
{
  "testCases": [
    {
      "title": "max 10 words",
      "description": "max 15 words",
      "preconditions": "max 15 words",
      "steps": [
        { "step": "max 15 words", "expected": "max 12 words" },
        { "step": "...", "expected": "..." }
      ],
      "priority": "critical|high|medium|low",
      "testType": "functional|regression|smoke|negative|boundary|security|accessibility|performance|api|usability",
      "reasoning": "1 sentence",
      "confidenceScore": 85
    }
  ],
  "coverageSummary": {
    "totalTestCases": 30,
    "byType": { "functional": 8, "negative": 3, ... }
  }
}
```

## ✅ DO: Best Practices

| Do | Example |
|----|---------|
| ✅ **Be specific** | "Click the blue 'Submit' button in the footer" |
| ✅ **One action per step** | Step 1: Fill email | Step 2: Fill password | Step 3: Click login |
| ✅ **Observable outcomes** | "Success message 'Account created' appears in green" |
| ✅ **Complete forms** | 5 fields = 5 fill steps min (+ nav + submit + verify) |
| ✅ **All categories** | functional + negative + security + accessibility + ... |
| ✅ **Clear confidence** | 95 for specific, 85 for mostly clear, 70 for assumptions |
| ✅ **Error scenarios** | Include invalid inputs, missing fields, boundary values |
| ✅ **Business context** | Explain why each test matters |

## ❌ DON'T: Common Mistakes

| Don't | Bad Example | Good Example |
|-------|-------------|--------------|
| ❌ **Combine steps** | "Fill form and submit" | "Fill field" → "Submit" |
| ❌ **Vague outcomes** | "Test passes" | "Success msg displayed" |
| ❌ **Skip fields** | 5 fields tested in 2 steps | 5 fields = 5 steps min |
| ❌ **Generic language** | "User can login" | "User enters email, password, clicks Login, redirected to dashboard" |
| ❌ **Low confidence** | Score 40 for vague requirement | Score 40 = REJECT, needs clarification |
| ❌ **Skip test types** | Only functional tests | All 10 categories represented |
| ❌ **Incomplete JSON** | Response truncated mid-array | Complete, valid JSON |

## 🚀 Quick API Call

```bash
curl -X POST http://localhost:3000/api/generate-tests \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Feature Name",
    "description": "What the feature does",
    "appType": "web",
    "testDepth": "comprehensive",
    "functionalRequirements": "Must do X, validate Y, prevent Z",
    "nonFunctionalRequirements": "Response < 1s, prevent SQL injection"
  }'
```

## 📊 Test Category Distribution

```
Functional:     ████████░░░░░░░░░░ 40%  (Happy paths)
Regression:     █████░░░░░░░░░░░░░░ 15% (Existing behavior)
Smoke:          ███░░░░░░░░░░░░░░░░ 10% (Quick checks)
Negative:       █████░░░░░░░░░░░░░░ 15% (Error handling)
Boundary:       ███░░░░░░░░░░░░░░░░ 10% (Edge cases)
Security:       ██░░░░░░░░░░░░░░░░░  5% (SQL injection, XSS)
Accessibility:  █░░░░░░░░░░░░░░░░░░  3% (Keyboard, ARIA)
Performance:    █░░░░░░░░░░░░░░░░░░  3% (Load time)
API:            █░░░░░░░░░░░░░░░░░░  3% (Status codes)
Usability:      ░░░░░░░░░░░░░░░░░░░  1% (Error messages)
```

## 💪 Step Structure Examples

### ❌ WRONG (Combined)
```json
{
  "step": "Navigate to page, fill email and password, click submit",
  "expected": "User is logged in"
}
```

### ✅ RIGHT (Atomic)
```json
[
  { "step": "Navigate to https://app.com/login", "expected": "Login form displays with email and password fields" },
  { "step": "Enter 'john@example.com' in email field", "expected": "Email value appears in input" },
  { "step": "Enter 'SecurePass123!' in password field", "expected": "Password masked with bullets" },
  { "step": "Click Login button", "expected": "Button becomes disabled, loading spinner appears" },
  { "step": "Wait for API response max 3 seconds", "expected": "User redirected to /dashboard with greeting 'Welcome John'" }
]
```

## 🎯 Form Testing Checklist

For a **5-field registration form**:

- [ ] 1 step: Navigate to form page
- [ ] 5 steps: One per field (firstName, lastName, email, phone, address)
- [ ] 1 step: Accept terms checkbox
- [ ] 1 step: Click submit button
- [ ] 1-2 steps: Verify success/redirect
- **Total: 10-11 steps minimum** ✅

### Each step must be atomic (one action):
- [ ] "Navigate to page" (1 step)
- [ ] "Fill field 1" (1 step)
- [ ] "Fill field 2" (1 step) ← NOT combined with field 1
- [ ] "Fill field 3" (1 step) ← NOT combined with field 2
- [ ] etc...

## 📈 Confidence Score Quick Guide

| 90-100 | 70-89 | 50-69 | <50 |
|--------|-------|-------|-----|
| Clear requirement | Minor assumptions | Ambiguous | Too vague |
| Specific selectors | Assumed selectors | Unclear flow | Reject |
| Proven paths | Mostly predictable | Needs customization | Clarify |
| Production ready | Automate + tweak | Review first | DON'T USE |

## 🔒 Security Test Examples

### SQL Injection
```json
{
  "step": "Enter ' OR '1'='1' in email field",
  "expected": "Email validation rejects input or sanitizes safely"
}
```

### XSS Attack
```json
{
  "step": "Enter <script>alert('xss')</script> in name field",
  "expected": "Script tag is escaped or sanitized, no alert appears"
}
```

### Authorization Bypass
```json
{
  "step": "Access /admin/users without admin role",
  "expected": "HTTP 403 Forbidden or redirect to login"
}
```

## ♿ Accessibility Test Examples

### Keyboard Navigation
```json
{
  "step": "Press Tab key from page top to navigate form fields",
  "expected": "Focus outline visible, Tab order logical (top to bottom)"
}
```

### Screen Reader
```json
{
  "step": "Use screen reader on form fields",
  "expected": "Field labels announced correctly (e.g., 'Email, text input')"
}
```

## 📱 API Test Examples

### Success Response
```json
{
  "step": "Send POST /api/users with valid data",
  "expected": "HTTP 201, response includes id, email, createdAt fields"
}
```

### Error Response
```json
{
  "step": "Send POST /api/users with duplicate email",
  "expected": "HTTP 409 Conflict, error message 'Email already exists'"
}
```

## ⚡ Performance Test Examples

### Page Load
```json
{
  "step": "Load https://app.com/login page",
  "expected": "Page fully rendered in < 2 seconds"
}
```

### API Response
```json
{
  "step": "Send POST /api/login request",
  "expected": "Server responds within 1000ms (1 second)"
}
```

## 📋 Validation Checklist

Before using generated tests, verify:

- [ ] **Total**: 25+ tests for standard, 40+ for comprehensive
- [ ] **Coverage**: All 10 test categories represented
- [ ] **Steps**: 4+ atomic steps per test (no combining)
- [ ] **Fields**: N form fields = N+ fill steps
- [ ] **Outcomes**: All expected results observable (not vague)
- [ ] **Confidence**: Scores justified (90+ for clear, 70-89 for minor assumptions)
- [ ] **Duplicates**: No repeated scenarios
- [ ] **JSON**: Valid, complete, not truncated
- [ ] **Errors**: Negative tests included
- [ ] **Security**: Security tests present

## 🔗 Documentation Map

| Document | Purpose | Read Time |
|----------|---------|-----------|
| **QUICK_REFERENCE_TEST_GENERATION.md** | This file - quick lookup | 5 min |
| **TEST_GENERATION_IMPLEMENTATION_GUIDE.md** | How to use API, code examples | 15 min |
| **COMPREHENSIVE_TEST_GENERATION_PROMPT.md** | Complete specification | 30 min |
| **TEST_GENERATION_EXAMPLES.md** | Real-world scenarios | 20 min |

## 🎓 Example Requests

### Login Feature (Quick)
```json
{
  "title": "User Login",
  "description": "Users login with email and password",
  "appType": "web",
  "testDepth": "comprehensive"
}
```
**Expected**: 25-30 tests, 5-7 steps each

### Registration Form (Complex)
```json
{
  "title": "User Registration",
  "description": "5-field form: firstName, lastName, email, password, confirmPassword",
  "appType": "web",
  "testDepth": "exhaustive",
  "functionalRequirements": "Validate each field, email uniqueness, password strength",
  "nonFunctionalRequirements": "Load < 2s, respond < 1s, prevent SQL injection and XSS"
}
```
**Expected**: 40-50 tests, 10+ steps for happy path

### REST API (Specific)
```json
{
  "title": "Create User API",
  "description": "POST /api/v1/users creates user with email, password, name",
  "appType": "api_rest",
  "testDepth": "comprehensive",
  "apiDetails": "Returns 201 with token, 409 on duplicate, 400 on invalid"
}
```
**Expected**: 25-30 tests, API-focused (status codes, schemas)

## 💡 Pro Tips

1. **Be Verbose**: More details = better tests
2. **Include All Fields**: Don't summarize form fields
3. **Mention Errors**: "Should prevent SQL injection" → security tests
4. **State Goals**: "Critical path" → smoke tests added
5. **Specify Platforms**: "iOS and Android" → platform-specific tests
6. **Request Specific**: "Test keyboard navigation" → accessibility tests

## ⚠️ Common Issues

### Problem: Tests only have 2-3 steps
**Solution**: Set `testDepth: "exhaustive"` and be specific about fields

### Problem: Missing test categories
**Solution**: Mention in request: "Must test security and accessibility"

### Problem: Low confidence scores (<50)
**Solution**: Provide more details (field names, validations, business context)

### Problem: All tests similar (duplicates)
**Solution**: Describe error scenarios, edge cases, security concerns

## 🎯 Success Criteria

Generated tests are good when:
- ✅ 25-50 test cases
- ✅ 4-20+ atomic steps per test
- ✅ All 10 categories covered
- ✅ Confidence 75-95
- ✅ No combined actions
- ✅ Observable outcomes (specific, not vague)
- ✅ Complete field coverage
- ✅ Clear business reasoning

---

**Need Help?** Check these files in order:
1. This Quick Reference (now)
2. TEST_GENERATION_IMPLEMENTATION_GUIDE.md (next)
3. TEST_GENERATION_EXAMPLES.md (scenarios)
4. COMPREHENSIVE_TEST_GENERATION_PROMPT.md (deep dive)

**Version**: 1.0  
**Status**: ✅ Production Ready  
**Last Updated**: 2024
