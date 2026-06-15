# 🔍 Test Data Debugging Logs Guide

## Overview

When you run test executions with test data in AITAS, the server now logs **detailed debugging information** to help you understand:

1. ✅ What test data was loaded
2. ✅ How placeholders like `{{username}}` are being resolved
3. ✅ What values are being typed into fields
4. ✅ Whether field population succeeded or failed

## Example Log Output

### 1️⃣ Test Data Loading

```
[AIExecutor] 📊 ═══════════════════════════════════════════════════════════
[AIExecutor] 📊 LOADING TEST DATA (2 parameters)
[AIExecutor] 📊 ═════════════════════════════════════════════════════════════
[AIExecutor] 📊   ✓ username (email) = "admin@example.com"
[AIExecutor] 📊   ✓ password (password) = "[MASKED-15chars]"
[AIExecutor] 📊 ═════════════════════════════════════════════════════════════
```

This shows:
- **2 parameters** loaded into test data
- **username** with type "email" = `admin@example.com`
- **password** masked for security = `[MASKED-15chars]` (15 character password)

### 2️⃣ Placeholder Resolution

```
[AIExecutor] 🔍 ═══════════════════════════════════════════════════════════
[AIExecutor] 🔍 RESOLVING CREDENTIAL STEP
[AIExecutor] 🔍 ─────────────────────────────────────────────────────────────
[AIExecutor] 🔍 Original step: "Type {{username}} into the username field"
[AIExecutor] 🔍 Test data keys available: [username, password]
[AIExecutor] 🔍 ─────────────────────────────────────────────────────────────
[AIExecutor] 🔍 PATTERN DETECTION:
[AIExecutor] 🔍   isUsernameStep: true, found: true
[AIExecutor] 🔍   isPasswordStep: false, found: false
[AIExecutor] 🔍   isCredentialsStep: false
[AIExecutor] 🔍   usernameField xpath: //input[@id='email']
[AIExecutor] 🔍   passwordField xpath: //input[@id='password']
[AIExecutor] 🔍 ✓ Username injection: "admin@example.com" → //input[@id='email']
[AIExecutor] 🔍 ─────────────────────────────────────────────────────────────
[AIExecutor] 🔍 FINAL RESOLVED STEP:
[AIExecutor] 🔍   "Type {{username}} into the username field"
[AIExecutor] 🔍   ↓↓↓
[AIExecutor] 🔍   "Type "admin@example.com" into the username input field at xpath: //input[@id='email']"
[AIExecutor] 🔍 ═════════════════════════════════════════════════════════════
```

This shows:
- ✅ `{{username}}` placeholder found and resolved to `admin@example.com`
- ✅ Username field detected at xpath `//input[@id='email']`
- ✅ Step rewritten with concrete value

### 3️⃣ Field Population (Typing)

```
[AIExecutor] ⌨️  ═══════════════════════════════════════════════════════════
[AIExecutor] ⌨️  TYPING INTO FIELD
[AIExecutor] ⌨️  ─────────────────────────────────────────────────────────────
[AIExecutor] ⌨️  Element: email
[AIExecutor] ⌨️  Type: email
[AIExecutor] ⌨️  Value: "admin@example.com"
[AIExecutor] ⌨️  Value length: 18 characters
[AIExecutor] ⌨️  ✓ Element clicked and focused
[AIExecutor] ⌨️  ✓ Field cleared (triple-click + delete)
[AIExecutor] ⌨️  ✓ Field cleared (standard clear)
[AIExecutor] ⌨️  → Typing "admin@example.com"...
[AIExecutor] ⌨️  ✓ Value verified: "admin@example.com"
[AIExecutor] ⌨️  ═════════════════════════════════════════════════════════════
```

This shows:
- ✅ Element `email` successfully targeted
- ✅ Field cleared properly
- ✅ Value typed: `admin@example.com` (18 characters)
- ✅ Value verified after typing

### 4️⃣ Password Field (Masked)

```
[AIExecutor] ⌨️  ═══════════════════════════════════════════════════════════
[AIExecutor] ⌨️  TYPING INTO FIELD
[AIExecutor] ⌨️  ─────────────────────────────────────────────────────────────
[AIExecutor] ⌨️  Element: password
[AIExecutor] ⌨️  Type: password
[AIExecutor] ⌨️  Value: "[PASSWORD-15chars]"
[AIExecutor] ⌨️  Value length: 15 characters
[AIExecutor] ⌨️  ✓ Element clicked and focused
[AIExecutor] ⌨️  ✓ Password field set (15 chars) + events dispatched
[AIExecutor] ⌨️  ═════════════════════════════════════════════════════════════
```

This shows:
- ✅ Password field detected
- ✅ Value masked in logs for security
- ✅ Password successfully set (15 characters)

## Common Issues & What The Logs Tell You

### Issue 1: Placeholder Not Found

```
[AIExecutor] 🔍   ✗ Placeholder {{email}} NOT found in test data
```

**Solution:** Make sure your test data key matches the placeholder exactly:
- Test data key: `email`
- Placeholder in step: `{{email}}` ✅
- Placeholder in step: `{{username}}` ❌ (different key name)

### Issue 2: Field Not Located

```
[AIExecutor] 🔍   usernameField xpath: NOT FOUND
```

**Solution:** The AI couldn't find the field on the page. Check:
- Is the field visible on the page?
- Does it have `id`, `name`, or `placeholder` attributes with "username" or "email"?
- Try using a more specific step: "Type admin@example.com into the input field with id 'email'"

### Issue 3: Value Mismatch After Typing

```
[AIExecutor] ⌨️  ⚠️  Value mismatch!
[AIExecutor] ⌨️     Expected: "admin@example.com"
[AIExecutor] ⌨️     Actual: ""
[AIExecutor] ⌨️  ⚠️  JS fallback also failed - trying char-by-char
```

**Solution:** The field didn't accept the value. This might be:
- A React/Angular controlled input - retrying with JS setter
- The field clearing but not accepting input
- A disabled or hidden field

The system will try multiple fallback methods and log each attempt.

## How to Enable Debug Logs

Debug logs are **automatically enabled**. When you run an execution:

1. Go to **Executions** page
2. Click on a running execution
3. You'll see logs appearing in real-time as the test runs
4. Or check server console (if running locally)

## Test Data Requirements

For test data to be injected properly:

### ✅ DO This:

**Test Step:**
```
Type {{username}} into the username field
```

**Test Data:**
| Key | Value | Type |
|-----|-------|------|
| username | admin@example.com | email |
| password | SecurePass123! | password |

**Result:** ✅ Values injected, fields populated

---

### ❌ DON'T Do This:

**Test Step (without placeholder):**
```
Enter the login credentials
```

**Test Data:**
| Key | Value |
|-----|-------|
| username | admin@example.com |
| password | SecurePass123! |

**Result:** ❌ No data injected, fields remain empty

---

## Debugging Workflow

When test data isn't being populated:

1. **Check the logs for "LOADING TEST DATA"**
   - Are your test data params listed?
   - Are the values displayed (with passwords masked)?

2. **Check "RESOLVING CREDENTIAL STEP"**
   - Did the placeholder get resolved?
   - Did the field xpath get detected?

3. **Check "TYPING INTO FIELD"**
   - Did the value get verified after typing?
   - Were any JS fallbacks needed?

4. **If still failing:**
   - Check if the step wording matches expected patterns
   - Verify field has `id`, `name`, or `placeholder` attributes
   - Try a more explicit step description

## Full Example Execution

### Test Case:
```
Title: Login Test
Steps:
  1. Navigate to https://app.example.com/login
  2. Type {{username}} into the username field
  3. Type {{password}} into the password field
  4. Click the login button
```

### Test Data:
```
username = admin@example.com
password = SecurePass123!
```

### Expected Logs:

```
[AIExecutor] 📊 LOADING TEST DATA (2 parameters)
[AIExecutor] 📊   ✓ username (email) = "admin@example.com"
[AIExecutor] 📊   ✓ password (password) = "[MASKED-15chars]"

[AIExecutor] 🔍 RESOLVING CREDENTIAL STEP
[AIExecutor] 🔍 Original step: "Type {{username}} into the username field"
[AIExecutor] 🔍 ✓ Username injection: "admin@example.com" → //input[@id='username']

[AIExecutor] ⌨️  TYPING INTO FIELD
[AIExecutor] ⌨️  Element: username
[AIExecutor] ⌨️  Value: "admin@example.com"
[AIExecutor] ⌨️  ✓ Value verified: "admin@example.com"

[AIExecutor] 🔍 RESOLVING CREDENTIAL STEP
[AIExecutor] 🔍 Original step: "Type {{password}} into the password field"
[AIExecutor] 🔍 ✓ Password injection: [MASKED] → //input[@id='password']

[AIExecutor] ⌨️  TYPING INTO FIELD
[AIExecutor] ⌨️  Element: password
[AIExecutor] ⌨️  Value: "[PASSWORD-15chars]"
[AIExecutor] ⌨️  ✓ Password field set (15 chars) + events dispatched
```

✅ **All green checkmarks = Test data successfully injected!**

---

## Summary

The enhanced logging shows:
- 📊 **What data is available** (test data loading)
- 🔍 **How placeholders are resolved** (credential resolution)
- ⌨️ **What values are typed** (field population)
- ✅ **Whether each step succeeded** (verification)

**The logs are masked for passwords** but show exact lengths and character counts for debugging without exposing sensitive data.
