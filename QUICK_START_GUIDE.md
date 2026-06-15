# AITAS Test Case Standard - Quick Start (5 Minutes)

## 🎯 What You Need to Know

The AITAS platform now has a **standardized test case format** that allows:
- ✅ Upload Excel/CSV test cases
- ✅ AI automatically parses and structures them
- ✅ Auto-generates test scripts
- ✅ Execute tests automatically

---

## 📋 The 10 Essential Fields

When creating a test case, fill in these 10 fields:

| # | Field | Required | Format | Example |
|---|-------|----------|--------|---------|
| 1 | **Test Case ID** | YES | `TC_MODULE_NNN` | `TC_LOGIN_001` |
| 2 | **Module** | YES | Text | `Login` |
| 3 | **Test Scenario** | YES | Brief description | `Valid user login` |
| 4 | **Test Case Description** | YES | Detailed | `Verify user can login with correct credentials` |
| 5 | **Preconditions** | YES | Separated by `\|` | `User account exists \| On login page` |
| 6 | **Target URL** | MAYBE | Full URL | `https://app.example.com/login` |
| 7 | **Test Steps** | YES | Numbered with action keywords | `Step 1: Navigate...` |
| 8 | **Priority** | YES | low/medium/high/critical | `high` |
| 9 | **Automation** | YES | yes/no | `yes` |
| 10 | **Tags** | NO | Comma-separated | `smoke,login,critical` |

---

## 🚀 Quick Start: Create Your First Test Case

### Step 1: Use the Action Keywords

Every test step MUST start with one of these keywords:

```
Navigate | Click | Enter | Select | Verify | Wait | Scroll | Hover
DoubleClick | RightClick | Swipe | Tap | LongPress | Clear | Submit
Upload | Download | Close | Accept | Dismiss | Assert | CheckText | CheckElement | Capture
```

### Step 2: Write Your Test Steps

```
Step 1: Navigate to https://app.example.com/login
Step 2: Enter admin@example.com into Username field
Step 3: Enter password into Password field
Step 4: Click Login button
Step 5: Verify user is on Dashboard
```

### Step 3: Use Placeholders for Data

Instead of hard-coding values, use placeholders:

```
Step 3: Enter {{password}} into Password field
```

Then define in Test Data:
```
password = SecurePassword123
```

---

## 📊 Excel Template (Copy & Paste)

```
Test Case ID | Module | Test Scenario | Test Case Description | Preconditions | Target URL | Test Steps | Priority | Automation | Tags
TC_LOGIN_001 | Login | Valid login | User logs in successfully | User account exists | https://app.example.com/login | Step 1: Navigate to https://app.example.com/login Step 2: Enter {{email}} into Username field Step 3: Enter {{password}} into Password field Step 4: Click Login button Step 5: Verify Dashboard appears | high | yes | smoke,login,critical
```

---

## ⚡ The 5-Step Upload Flow

### 1️⃣ UPLOAD YOUR FILE
```bash
Upload Excel or CSV file with your test cases
```

### 2️⃣ VALIDATE
```
System checks all fields are correct
Warnings shown if anything is unclear
```

### 3️⃣ IMPORT
```
Test cases stored in repository
Ready for automation
```

### 4️⃣ ADD TEST DATA
```
Define values for placeholders
Set up credentials if needed
```

### 5️⃣ GENERATE & RUN
```
Select framework (Playwright/Selenium/Cypress)
Generate scripts automatically
Execute tests against your app
```

---

## ✅ DO's

✓ Use clear, descriptive step names
✓ Break complex tests into 3-10 steps
✓ Use placeholders for dynamic data: `{{username}}`
✓ Include preconditions
✓ Specify priority level
✓ Add meaningful tags
✓ Put action keyword first: "Navigate to...", not "Go to the site"

---

## ❌ DON'Ts

✗ Don't use vague steps like "do login"
✗ Don't mix multiple actions: "Click Login and verify dashboard"
✗ Don't hard-code passwords: Use placeholders instead
✗ Don't skip preconditions
✗ Don't use special characters in Test Case ID
✗ Don't leave expected results blank
✗ Don't use inconsistent action keywords

---

## 🎯 5-Minute Example: Complete Test Case

### The Scenario
```
"Test that a user can search for products"
```

### The Test Case

| Field | Value |
|-------|-------|
| Test Case ID | TC_SEARCH_001 |
| Module | Search |
| Test Scenario | Search for products by keyword |
| Test Case Description | Verify search returns correct products matching the keyword entered |
| Preconditions | User is logged in \| On Products page |
| Target URL | https://app.example.com/products |
| Test Steps | **Step 1:** Navigate to https://app.example.com/products<br>**Step 2:** Click Search box<br>**Step 3:** Enter {{searchKeyword}} into search box<br>**Step 4:** Click Search button<br>**Step 5:** Verify results display products containing {{searchKeyword}} |
| Priority | high |
| Automation | yes |
| Tags | search,functionality,ui |

---

## 🔄 Common Patterns

### Login Pattern
```
Step 1: Navigate to [url]
Step 2: Enter {{username}} into Username field
Step 3: Enter {{password}} into Password field
Step 4: Click Login button
Step 5: Verify Dashboard appears
```

### Create Item Pattern
```
Step 1: Navigate to [url]/create
Step 2: Enter {{name}} into Name field
Step 3: Enter {{description}} into Description field
Step 4: Click Save button
Step 5: Verify success message appears
Step 6: Verify item is in list
```

### Edit Item Pattern
```
Step 1: Navigate to [url]/items
Step 2: Click Edit on first item
Step 3: Clear current value
Step 4: Enter {{newValue}} into field
Step 5: Click Save button
Step 6: Verify success message
```

### Search Pattern
```
Step 1: Navigate to [url]
Step 2: Click Search box
Step 3: Enter {{searchTerm}} into search field
Step 4: Click Search button / Press Enter
Step 5: Verify results contain {{searchTerm}}
```

---

## 🤖 What AI Does For You

When you upload your test cases, AI automatically:

1. **Reads** your test steps
2. **Understands** action keywords (Click, Enter, Navigate, etc.)
3. **Detects** what UI elements you're interacting with
4. **Finds** your data placeholders
5. **Generates** production-ready test scripts
6. **Supports** multiple frameworks: Playwright, Selenium, Cypress, Puppeteer
7. **Supports** multiple languages: TypeScript, Python, Java, C#, JavaScript

---

## 📥 How to Create Your File

### Option 1: Excel (Recommended)
1. Download Excel template
2. Fill in your test cases (one per row)
3. Save as `.xlsx`
4. Upload to AITAS

### Option 2: Google Sheets
1. Create Google Sheet
2. Copy template and fill in
3. Download as Excel
4. Upload to AITAS

### Option 3: CSV
1. Create CSV file with same columns
2. Fill in test cases
3. Save as `.csv`
4. Upload to AITAS

### Option 4: JSON
1. Create JSON file with array of test cases
2. Follow JSON structure shown in examples
3. Save as `.json`
4. Upload to AITAS

---

## 🎓 Priority Levels Explained

| Level | When to Use | Example |
|-------|------------|---------|
| **critical** | Must work or app is broken | Login, Payment |
| **high** | Core features that users rely on | Search, Create, Edit |
| **medium** | Standard functionality | View details, Filter |
| **low** | Nice-to-have features | Dark mode, Export |

---

## 🏷️ Tag Examples

Use tags to organize your tests:

**Type**: `smoke`, `regression`, `integration`, `ui`, `api`  
**Feature**: `login`, `search`, `payment`, `user-management`  
**Priority**: `critical`, `high-impact`  
**Status**: `manual`, `automated`, `in-progress`  

Example: `smoke,login,critical` means it's a smoke test for login feature with critical priority.

---

## 🔗 Use Placeholders for Data

### What is a Placeholder?
```
{{placeholder_name}}
```

### Why Use Them?
- ✅ Reuse same test with different data
- ✅ Keep credentials secure
- ✅ Easy to update test data without changing steps
- ✅ Run tests in multiple environments

### Example
```
Step 2: Enter {{username}} into Username field
Step 3: Enter {{password}} into Password field
```

Then define:
```
username = testuser@example.com
password = SecurePassword123
```

---

## ⚠️ Validation Errors

### Critical Errors (Test Won't Upload)
```
❌ Missing Test Case ID
❌ Missing Test Steps
❌ Missing Priority
❌ Invalid Priority value
❌ Missing Expected Result
```

### Warnings (Test Uploads But May Have Issues)
```
⚠️ Click action without target element
⚠️ Placeholder used but not defined
⚠️ Unusual URL format
```

---

## 💡 Pro Tips

1. **Organize by Feature**
   ```
   TC_LOGIN_001, TC_LOGIN_002, TC_LOGIN_003
   TC_SEARCH_001, TC_SEARCH_002
   ```

2. **Use Consistent Terminology**
   ```
   Always: "Username field"
   Never mix: "username input", "login field", "account name"
   ```

3. **Step Naming**
   ```
   Good: "Step 1: Navigate to https://app.example.com/login"
   Bad: "Step 1: Open the app"
   ```

4. **Expected Results**
   ```
   Good: "Dashboard page displays with user name in top right"
   Bad: "Page displays"
   ```

5. **Data Placeholders**
   ```
   Good: {{firstName}}, {{email}}, {{password}}
   Bad: test123, user@test.com (hardcoded!)
   ```

---

## 🚀 Next Steps

1. ✅ **Read** `TEST_CASE_STANDARD_GUIDE.md` for details
2. ✅ **Download** Excel template from sample file
3. ✅ **Create** your first test case
4. ✅ **Upload** to AITAS
5. ✅ **Watch** AI parse and structure it
6. ✅ **Generate** scripts automatically
7. ✅ **Execute** tests against your app
8. ✅ **View** results and reports

---

## 📞 Quick Help

**Q: What if my steps aren't working?**
A: Make sure you're using action keywords. See "Action Keywords" section above.

**Q: Can I hard-code passwords?**
A: No! Use placeholders: `{{password}}`

**Q: Do I need to write code?**
A: No! AITAS generates code automatically from your test cases.

**Q: Can I use my existing test cases?**
A: Yes! Reformat them to match this standard and upload.

**Q: What frameworks does it support?**
A: Playwright, Selenium, Cypress, Puppeteer

**Q: What languages?**
A: TypeScript, JavaScript, Python, Java, C#

---

## 🎉 You're Ready!

You now know everything needed to create standardized test cases for AITAS.

**Next**: Download the Excel template and create your first test case! 🚀
