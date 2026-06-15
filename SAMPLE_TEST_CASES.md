# Sample Test Cases for AITAS - Download as Excel/CSV

This document provides sample test cases that follow the AITAS standard format.

## 📥 How to Use

1. Copy the table below
2. Paste into Excel or Google Sheets
3. Fill in your test cases following the same format
4. Save as `.xlsx` or `.csv`
5. Upload to AITAS

---

## Sample Test Cases Table

### Test Case 1: Login with Valid Credentials

| Field | Value |
|-------|-------|
| Test Case ID | TC_LOGIN_001 |
| Module | Authentication |
| Test Scenario | Successful login with valid credentials |
| Test Case Description | Verify that a user can successfully log in to the application using valid username and password |
| Preconditions | User account exists with username=testuser@example.com and password=Password123 \| Browser is open and on login page |
| Target URL | https://app.example.com/login |
| Test Steps | **Step 1:** Navigate to https://app.example.com/login<br>**Step 2:** Enter testuser@example.com into Username field<br>**Step 3:** Enter Password123 into Password field<br>**Step 4:** Click Login button<br>**Step 5:** Verify user is on Dashboard page |
| Expected Result | User is successfully authenticated and redirected to dashboard page. User name is displayed in top right corner. |
| Priority | high |
| Automation | yes |
| Tags | smoke,login,critical,ui |
| Estimated Time | 45 |

### Test Case 2: Login with Invalid Password

| Field | Value |
|-------|-------|
| Test Case ID | TC_LOGIN_002 |
| Module | Authentication |
| Test Scenario | Login attempt with invalid password |
| Test Case Description | Verify that login fails when incorrect password is provided |
| Preconditions | User account exists \| Browser is open and on login page |
| Target URL | https://app.example.com/login |
| Test Steps | **Step 1:** Navigate to https://app.example.com/login<br>**Step 2:** Enter testuser@example.com into Username field<br>**Step 3:** Enter {{invalidPassword}} into Password field<br>**Step 4:** Click Login button<br>**Step 5:** Verify error message appears |
| Expected Result | Login fails. Error message "Invalid username or password" is displayed. User remains on login page. |
| Priority | high |
| Automation | yes |
| Tags | login,negative,critical |
| Estimated Time | 40 |

### Test Case 3: Create New User

| Field | Value |
|-------|-------|
| Test Case ID | TC_USER_001 |
| Module | User Management |
| Test Scenario | Create new user account |
| Test Case Description | Verify admin user can create a new user account |
| Preconditions | Admin user is logged in \| Admin is on User Management page |
| Target URL | https://app.example.com/admin/users |
| Test Steps | **Step 1:** Navigate to https://app.example.com/admin/users<br>**Step 2:** Click "Add New User" button<br>**Step 3:** Enter {{firstName}} into First Name field<br>**Step 4:** Enter {{lastName}} into Last Name field<br>**Step 5:** Enter {{email}} into Email field<br>**Step 6:** Enter {{temporaryPassword}} into Password field<br>**Step 7:** Select {{role}} from Role dropdown<br>**Step 8:** Click Save button<br>**Step 9:** Verify success message "User created successfully" |
| Expected Result | New user account is created. User appears in user list. Success message is displayed. |
| Priority | high |
| Automation | yes |
| Tags | user-management,creation,admin |
| Estimated Time | 60 |

### Test Case 4: Edit Product

| Field | Value |
|-------|-------|
| Test Case ID | TC_PRODUCT_001 |
| Module | Products |
| Test Scenario | Edit product details |
| Test Case Description | Verify user can edit product information |
| Preconditions | User is logged in \| At least one product exists \| User is on Products page |
| Target URL | https://app.example.com/products |
| Test Steps | **Step 1:** Navigate to https://app.example.com/products<br>**Step 2:** Click on first product in list<br>**Step 3:** Click Edit button<br>**Step 4:** Clear Product Name field<br>**Step 5:** Enter {{newProductName}} into Product Name field<br>**Step 6:** Clear Description field<br>**Step 7:** Enter {{newDescription}} into Description field<br>**Step 8:** Click Save button<br>**Step 9:** Verify success notification appears |
| Expected Result | Product is updated. Product list shows new name. Edit confirmation message appears. |
| Priority | medium |
| Automation | yes |
| Tags | product-management,edit,ui |
| Estimated Time | 50 |

### Test Case 5: Search Functionality

| Field | Value |
|-------|-------|
| Test Case ID | TC_SEARCH_001 |
| Module | Search |
| Test Scenario | Search for products by keyword |
| Test Case Description | Verify search returns correct products matching keyword |
| Preconditions | User is logged in \| At least 5 products exist in system |
| Target URL | https://app.example.com/products |
| Test Steps | **Step 1:** Navigate to https://app.example.com/products<br>**Step 2:** Click in Search field<br>**Step 3:** Enter {{searchKeyword}} in search box<br>**Step 4:** Click Search button or press Enter<br>**Step 5:** Verify search results display<br>**Step 6:** Verify all results contain {{searchKeyword}} |
| Expected Result | Search results are displayed with only products matching the search keyword. Result count is > 0. All visible products contain the keyword in name or description. |
| Priority | high |
| Automation | yes |
| Tags | search,functionality,filtering |
| Estimated Time | 55 |

### Test Case 6: Logout User

| Field | Value |
|-------|-------|
| Test Case ID | TC_LOGIN_003 |
| Module | Authentication |
| Test Scenario | User logout |
| Test Case Description | Verify user can successfully logout from application |
| Preconditions | User is logged in and on Dashboard page |
| Target URL | https://app.example.com/dashboard |
| Test Steps | **Step 1:** Navigate to https://app.example.com/dashboard<br>**Step 2:** Click on user profile menu in top right<br>**Step 3:** Click Logout option<br>**Step 4:** Verify redirect to login page<br>**Step 5:** Verify session is cleared |
| Expected Result | User is logged out. Browser redirects to login page. Accessing dashboard directly results in redirect to login. |
| Priority | high |
| Automation | yes |
| Tags | logout,authentication |
| Estimated Time | 30 |

---

## 📋 Excel Template Columns (Copy This Header Row)

```
Test Case ID | Module | Test Scenario | Test Case Description | Preconditions | Target URL | Test Steps | Expected Result | Priority | Automation | Tags | Estimated Time
```

---

## 📝 Key Points to Remember

### Test Steps Format
- **Always** start with the step number: `Step 1:`, `Step 2:`, etc.
- **Always** use action keywords: Navigate, Click, Enter, Select, Verify, etc.
- **Use placeholders** for dynamic data: `{{username}}`, `{{password}}`, `{{email}}`
- **Be specific** about targets: "Username field", "Login button", not just "field" or "button"

### Test Data Placeholders Used in Samples

Replace these in your actual test cases:

| Placeholder | Example Value |
|-------------|----------------|
| `{{invalidPassword}}` | `WrongPassword123` |
| `{{firstName}}` | `John` |
| `{{lastName}}` | `Doe` |
| `{{email}}` | `john.doe@example.com` |
| `{{temporaryPassword}}` | `TempPassword123!` |
| `{{role}}` | `Editor` |
| `{{newProductName}}` | `Updated Product Name` |
| `{{newDescription}}` | `This is the updated product description` |
| `{{searchKeyword}}` | `laptop` |

### Priority Values
- `low` - Can be tested later
- `medium` - Standard test case
- `high` - Critical functionality
- `critical` - Blocks release

### Tags (Use Comma-Separated)
- `smoke` - Smoke test (basic functionality)
- `regression` - Regression test
- `ui` - UI/Frontend test
- `api` - API test
- `critical` - Critical business flow
- `negative` - Negative/error scenarios
- Module-specific: `login`, `user-management`, `products`, etc.

---

## 🚀 How to Download as Excel

### Option 1: Using Google Sheets
1. Create new Google Sheet
2. Copy the table from this document
3. Download as Excel: File → Download → Microsoft Excel (.xlsx)

### Option 2: Using Microsoft Excel
1. Create new Excel workbook
2. Create headers from the "Template Columns" section
3. Enter test cases row by row
4. Save as `.xlsx`

### Option 3: Using LibreOffice Calc
1. Create new spreadsheet
2. Paste data from this document
3. Export as Excel format

### Option 4: Using CSV
1. Copy markdown table
2. Paste into text editor
3. Replace pipes with commas
4. Save as `.csv`

---

## ✅ Pre-Upload Checklist

Before uploading your test cases:

- [ ] All Test Case IDs are unique
- [ ] All Test Case IDs follow format: `TC_MODULE_NNN` (e.g., `TC_LOGIN_001`)
- [ ] All Module names are filled
- [ ] All Test Scenarios have descriptions
- [ ] All Test Case Descriptions explain what is being tested
- [ ] All Preconditions list setup requirements
- [ ] All Test Steps start with "Step N:" and use action keywords
- [ ] All Expected Results are clear and measurable
- [ ] All Priority values are: low, medium, high, or critical
- [ ] All Automation values are: yes or no
- [ ] All placeholders use `{{format}}` and are documented in Test Data
- [ ] File format is .xlsx, .csv, .json, or .txt
- [ ] No special characters in Test Case ID except underscore and hyphen

---

## 🔗 Related Documentation

- **Full Standard Guide**: See `TEST_CASE_STANDARD_GUIDE.md`
- **Implementation Guide**: See `TEST_CASE_IMPLEMENTATION_GUIDE.md`
- **Validation Rules**: See `server/test-case-validation.ts`
- **AI Parsing**: See `server/test-case-nlp-parser.ts`
- **Mapping Engine**: See `server/test-case-mapping-engine.ts`

---

## 💡 Advanced Tips

### Reusing Test Cases
- Use consistent naming conventions for easy identification
- Tag related test cases together
- Keep test case size manageable (5-15 steps ideal)

### Data-Driven Testing
- Use placeholders for all variable data
- Create test data pool for reusability
- Reference same placeholder key across multiple test cases

### Parallel Execution
- Group independent test cases together
- Avoid dependencies between test cases
- Use separate data sets for parallel runs

### CI/CD Integration
- Tag test cases with `smoke` for quick validation
- Use `critical` tag for release-blocking tests
- Keep regression test cases comprehensive but concise
