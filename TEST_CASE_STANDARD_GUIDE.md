# AITAS Test Case Standard - Comprehensive Guide

## 📋 Overview

This guide outlines the **standardized test case structure** for AITAS (AI-powered Test Automation Suite). Following this standard ensures:

✅ **Consistency** across all test cases  
✅ **AI Interpretability** - AI can parse and understand your tests  
✅ **Automated Execution** - Direct upload → import → generate → run  
✅ **Team Collaboration** - Everyone uses the same format  
✅ **Traceability** - Clear requirements mapping  

---

## 📊 Excel/CSV Test Case Template

### **Required Columns**

| Column Name | Description | Format | Example |
|-------------|-------------|--------|---------|
| **Test Case ID** | Unique identifier | `TC_FEATURE_NNN` | `TC_LOGIN_001` |
| **Module** | Feature/component being tested | Text | `Login` |
| **Test Scenario** | High-level test scenario | Text | `User login with valid credentials` |
| **Test Case Description** | Detailed objective | Text | `Verify user can successfully login with correct username and password` |
| **Preconditions** | Required setup (separate with `\|`) | Text | `User account exists \| User is on login page` |
| **Target URL** | Application URL | URL | `https://app.example.com/login` |

### **Test Steps (Critical!)**

Steps must follow this exact pattern:

```
Step 1: Navigate to https://app.example.com/login
Step 2: Enter username = testuser@example.com into Username field
Step 3: Enter password = SecurePassword123 into Password field
Step 4: Click Login button
Step 5: Verify Dashboard is displayed
```

**Format Rules:**
- Number each step sequentially
- **Action keyword first**: Navigate, Click, Enter, Select, Verify, Wait, Scroll, Hover, DoubleClick, etc.
- **Target element**: Use element names, IDs, or describe the UI element
- **Input value** (if applicable): Use format `= "value"` or `{{placeholder}}`
- **Expected result**: Start with "Verify", "Check", or describe expected outcome

### **Optional But Recommended Columns**

| Column Name | Description | Format | Example |
|-------------|-------------|--------|---------|
| **Test Data** | Key-value pairs (use `key=value,key=value`) | Text | `username=testuser@example.com,password=pass123` |
| **Priority** | low, medium, high, critical | Dropdown | `high` |
| **Automation** | Should test be automated? | yes/no | `yes` |
| **Tags** | Test categories (comma-separated) | Text | `smoke,login,critical,ui` |
| **Estimated Time** | Execution time in seconds | Number | `45` |
| **Created By** | Author name | Text | `John Doe` |

---

## 🎯 Action Keywords (Must Use)

Your test steps **MUST** start with one of these action keywords for AI parsing to work:

### **Navigation**
- `Navigate to` → Go to a URL
- `Goto` → Alternative for Navigate

### **User Interaction**
- `Click` → Click UI element
- `Enter` → Type text into a field
- `Select` → Choose from dropdown
- `Hover` → Move mouse over element
- `DoubleClick` → Double-click element
- `RightClick` → Right-click element

### **Mobile Gestures**
- `Swipe` → Swipe on mobile
- `Tap` → Tap on mobile
- `LongPress` → Long press on mobile

### **Verification**
- `Verify` → Check if something is visible
- `Assert` → Assert a condition
- `CheckText` → Verify text content
- `CheckElement` → Verify element exists

### **Utility**
- `Wait` → Wait for delay
- `Scroll` → Scroll page
- `Clear` → Clear input field
- `Submit` → Submit form
- `Upload` → Upload file
- `Download` → Download file
- `Close` → Close window
- `Accept` → Accept dialog
- `Capture` → Take screenshot

---

## 📝 Complete Example

### **Excel Structure**

```
Test Case ID | Module | Test Scenario | Test Case Description | Preconditions | Target URL | Test Steps | Expected Result | Priority | Automation | Tags
TC_LOGIN_001 | Login | Valid user login | User successfully logs in with correct credentials | User account exists; User is on login page | https://app.example.com/login | Step 1: Navigate to https://app.example.com/login\nStep 2: Enter testuser@example.com into Username field\nStep 3: Enter password into Password field\nStep 4: Click Login button\nStep 5: Verify user lands on Dashboard | User is logged in and dashboard is displayed | high | yes | smoke,login,critical
```

### **JSON Equivalent**

```json
{
  "testCaseId": "TC_LOGIN_001",
  "module": "Login",
  "testScenario": "Valid user login",
  "testCaseDescription": "User successfully logs in with correct credentials",
  "preconditions": "User account exists; User is on login page",
  "targetUrl": "https://app.example.com/login",
  "testSteps": [
    {
      "stepNumber": 1,
      "action": "Navigate",
      "target": null,
      "input": "https://app.example.com/login",
      "expectedResult": "Login page is displayed"
    },
    {
      "stepNumber": 2,
      "action": "Enter",
      "target": "#username",
      "input": "testuser@example.com",
      "expectedResult": "Username field contains testuser@example.com"
    },
    {
      "stepNumber": 3,
      "action": "Enter",
      "target": "#password",
      "input": "{{password}}",
      "expectedResult": "Password field is filled"
    },
    {
      "stepNumber": 4,
      "action": "Click",
      "target": "button.login-btn",
      "input": null,
      "expectedResult": "Login button is clicked"
    },
    {
      "stepNumber": 5,
      "action": "Verify",
      "target": ".dashboard",
      "input": null,
      "expectedResult": "Dashboard is displayed and user is logged in"
    }
  ],
  "testData": [
    {"key": "username", "value": "testuser@example.com", "dataType": "email"},
    {"key": "password", "value": "SecurePassword123", "dataType": "password"}
  ],
  "priority": "high",
  "automation": "yes",
  "tags": ["smoke", "login", "critical"]
}
```

---

## 🔄 AITAS Upload Flow

### **Step-by-Step Process**

```
1. UPLOAD
   ↓ You upload Excel/CSV/JSON file
   ↓ System validates format

2. IMPORT
   ↓ System parses test cases
   ↓ AI NLP converts steps to structured format
   ↓ Validation checks all required fields
   ↓ Test cases imported to repository

3. TEST DATA
   ↓ Define placeholder values ({{username}}, {{password}}, etc.)
   ↓ Set up credentials if needed
   ↓ Load data sheet (optional)

4. GENERATE SCRIPTS
   ↓ Select framework (Playwright, Selenium, Cypress, etc.)
   ↓ Select language (TypeScript, Python, Java, etc.)
   ↓ AI generates production-ready test scripts
   ↓ Scripts available for download

5. RUN/EXECUTE
   ↓ Execute against target URL
   ↓ Monitor real-time results
   ↓ Get automated reports with screenshots
   ↓ View logs and performance metrics
```

---

## 🤖 AI Parsing & Interpretation

### **How AITAS Understands Your Tests**

1. **Action Recognition**
   - AI identifies action keywords (Click, Enter, Navigate, etc.)
   - Falls back to similar keywords if exact match not found

2. **Element Extraction**
   - Detects element descriptions like "Login button", "Username field"
   - Converts to CSS selectors or XPath automatically

3. **Data Placeholder Detection**
   - Finds `{{key}}` patterns and extracts for Test Data section
   - Validates all placeholders are defined

4. **Expected Result Parsing**
   - Extracts verification criteria
   - Creates assertions for automation scripts

### **Example: AI Parsing a Step**

**Input:**
```
"Click the Login button and verify user lands on dashboard"
```

**AI Output:**
```json
{
  "action": "Click",
  "target": "button.login-btn",
  "expectedResult": "User is redirected to dashboard"
}
```

---

## ✅ Validation Rules

### **Critical Errors** (Test Case Won't Import)
- ❌ Missing `Test Case ID`
- ❌ Missing `Test Steps` (at least 1 required)
- ❌ Invalid priority value
- ❌ Invalid action keyword
- ❌ Missing expected result in any step

### **Warnings** (Test Case Imports But May Have Issues)
- ⚠️ Click action without target element
- ⚠️ Placeholder used but not defined in Test Data
- ⚠️ Invalid URL format
- ⚠️ Unusual step count (< 2 or > 100)

### **Auto-Corrections** (AITAS Applies Automatically)
- ✓ Normalizes action keywords (e.g., "go to" → "Navigate")
- ✓ Generates Test Case ID from title if missing
- ✓ Defaults priority to "medium" if missing
- ✓ Extracts placeholders from steps

---

## 📊 Sample Files

### **CSV Format**

```csv
Test Case ID,Module,Test Scenario,Test Case Description,Preconditions,Target URL,Test Steps,Expected Result,Priority,Automation,Tags
TC_LOGIN_001,Login,Valid Login,User logs in with correct credentials,User account exists,https://app.example.com,Step 1: Navigate to https://app.example.com/login Step 2: Enter admin@example.com into Username field Step 3: Enter password into Password field Step 4: Click Login button Step 5: Verify Dashboard is visible,User is on Dashboard page,high,yes,smoke;login;critical
```

### **JSON Format**

```json
{
  "testCases": [
    {
      "testCaseId": "TC_LOGIN_001",
      "module": "Authentication",
      "testScenario": "Successful login",
      "testCaseDescription": "Verify user can login with valid credentials",
      "testSteps": [
        {
          "stepNumber": 1,
          "action": "Navigate",
          "input": "https://app.example.com/login",
          "expectedResult": "Login page loads successfully"
        },
        {
          "stepNumber": 2,
          "action": "Enter",
          "target": "#username",
          "input": "{{username}}",
          "expectedResult": "Username is entered"
        }
      ],
      "testData": [
        {"key": "username", "value": "testuser@example.com"}
      ],
      "priority": "high",
      "tags": ["smoke", "login"]
    }
  ]
}
```

---

## 🛠️ Best Practices

### ✅ **DO**
- ✓ Use clear, descriptive test case titles
- ✓ Break down complex tests into smaller steps (3-10 steps ideal)
- ✓ Use placeholders (`{{key}}`) for dynamic data
- ✓ Include preconditions for test setup
- ✓ Add tags for test categorization
- ✓ Specify expected results clearly
- ✓ Use consistent element naming
- ✓ Review validation warnings before importing

### ❌ **DON'T**
- ✗ Use vague steps like "do login" or "test it"
- ✗ Mix multiple actions in one step
- ✗ Hard-code test data instead of using placeholders
- ✗ Skip preconditions
- ✗ Use special characters in Test Case ID
- ✗ Leave expected results blank
- ✗ Mix different action keyword styles

---

## 🔗 Integration with CI/CD

### **Webhook Integration**

AITAS supports automatic test execution on:
- GitHub Actions
- GitLab CI
- Jenkins
- Azure DevOps

Define your webhook endpoint, and tests run automatically on push/merge events.

---

## 📞 Support & Troubleshooting

### **Upload Fails**
- Ensure file format is CSV, XLSX, JSON, or TXT
- Check all required columns are present
- Validate Test Case IDs are unique

### **AI Parsing Errors**
- Ensure action keywords are recognized (see Action Keywords section)
- Provide clear element descriptions
- Use consistent formatting

### **Test Data Not Injecting**
- Check placeholder syntax: `{{key}}`
- Verify key is defined in Test Data section
- Ensure spelling matches exactly (case-sensitive)

### **Generated Scripts Won't Run**
- Verify target URL is accessible
- Check element selectors are correct
- Ensure framework/browser drivers are installed
- Review execution logs for specific errors

---

## 📚 Learn More

- **Framework Docs**: [Playwright](https://playwright.dev) | [Selenium](https://www.selenium.dev) | [Cypress](https://cypress.io)
- **CSS Selectors**: [MDN Guide](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Selectors)
- **AITAS Docs**: Check `server/test-case-validation.ts` for validation schema
