# 📸 Step Editor Visual Guide

## User Interface Walkthrough

### 1. Main Editor Screen

```
╔════════════════════════════════════════════════════════════════════╗
║                                                                    ║
║  Create Test Case                      [Preview] [Export] [Import] [Save] │
║  Define test scenarios with step management                        ║
║                                                                    ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                    ║
║  📑 Details    | ✏️ Steps (5)  | ⚙️ Advanced                      ║
║                                                                    ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                    ║
║  DETAILS TAB CONTENT                                               ║
║  ────────────────────                                              ║
║                                                                    ║
║  Title *                                                           ║
║  [User Login with Valid Credentials_________________]              ║
║                                                                    ║
║  Description *                                                     ║
║  [This test case validates that users can log in...]              ║
║  [................................................................]║
║  [................................................................]║
║                                                                    ║
║  Preconditions                                                     ║
║  [User must have valid account...]                                ║
║  [................................................................]║
║                                                                    ║
║  Priority          │ Test Type                                     ║
║  [High      ↓]     │ [Functional    ↓]                            ║
║                                                                    ║
║  Expected Result                                                   ║
║  [User is logged in and redirected to dashboard...]               ║
║  [................................................................]║
║                                                                    ║
║  Tags                                                              ║
║  [smoke, regression, login                                        ]║
║  [smoke] [regression] [login]                                     ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
```

---

### 2. Steps Tab - Empty State

```
╔════════════════════════════════════════════════════════════════════╗
║                                                                    ║
║  Test Steps (0)                            [Add Step at Start +]  │
║  Edit, reorder, and manage test steps                              ║
║                                                                    ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                    ║
║         ⚠️  No steps added yet                                     ║
║         Click "Add Step" to begin                                  ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
```

---

### 3. Steps Tab - With Steps

```
╔════════════════════════════════════════════════════════════════════╗
║                                                                    ║
║  Test Steps (5)                            [Add Step at Start +]  │
║  Edit, reorder, and manage test execution steps                    ║
║                                                                    ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                    ║
║  ┌──────────────────────────────────────────────────────────────┐ ║
║  │ 1  NAVIGATE        [⏱️ 30000ms]           [↑] [↓] [Edit] [+] [✕]│
║  │                                                               │ ║
║  │ Target: https://app.example.com/login                        │ ║
║  │ Expected: Login page loads successfully                      │ ║
║  └──────────────────────────────────────────────────────────────┘ ║
║                                                                    ║
║  ┌──────────────────────────────────────────────────────────────┐ ║
║  │ 2  ENTER           [⏱️ 5000ms] [Retry: 2x]  [↑] [↓] [Edit] [+] [✕]│
║  │                                                               │ ║
║  │ Target: input[data-qa='email']                               │ ║
║  │ Value: user@example.com                                      │ ║
║  │ Expected: Email address entered                              │ ║
║  │                                                               │ ║
║  │ Fallback Selectors:                                          │ ║
║  │ • Playwright: input:placeholder("Email")                     │ ║
║  │ • XPath: //input[@name='email']                              │ ║
║  └──────────────────────────────────────────────────────────────┘ ║
║                                                                    ║
║  ┌──────────────────────────────────────────────────────────────┐ ║
║  │ 3  ENTER           [⏱️ 5000ms]             [↑] [↓] [Edit] [+] [✕]│
║  │                                                               │ ║
║  │ Target: input[data-qa='password']                            │ ║
║  │ Value: ••••••••••                                            │ ║
║  │ Expected: Password field filled                              │ ║
║  └──────────────────────────────────────────────────────────────┘ ║
║                                                                    ║
║  ┌──────────────────────────────────────────────────────────────┐ ║
║  │ 4  CLICK           [⏱️ 5000ms] [Retry: 3x]  [↑] [↓] [Edit] [+] [✕]│
║  │                                                               │ ║
║  │ Target: button[data-qa='login-btn']                          │ ║
║  │ Expected: Login button clicked, form submitted               │ ║
║  └──────────────────────────────────────────────────────────────┘ ║
║                                                                    ║
║  ┌──────────────────────────────────────────────────────────────┐ ║
║  │ 5  VERIFY          [⏱️ 10000ms]            [↑] [↓] [Edit] [+] [✕]│
║  │                                                               │ ║
║  │ Target: div[data-qa='dashboard']                             │ ║
║  │ Expected: Dashboard loaded, user greeting visible            │ ║
║  └──────────────────────────────────────────────────────────────┘ ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
```

---

### 4. Add Step Dialog

```
╔════════════════════════════════════════════════════════════════════╗
║                                                                    ║
║  Add Test Step                                                  [✕]║
║  Insert after step 2                                              ║
║                                                                    ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                    ║
║  Action *                                                          ║
║  [Click              ↓]                                           ║
║  Choose the action type for this step                              ║
║                                                                    ║
║  Target (Selector/URL) *                                          ║
║  [button[data-qa='submit']_________________________]               ║
║  CSS selector, XPath, URL, or element identifier                  ║
║                                                                    ║
║  Value (optional)                                                  ║
║  [________________________________________________]               ║
║  Input value for 'enter' or 'select' actions                      ║
║                                                                    ║
║  Expected Result                                                   ║
║  [Form submitted successfully_____________________]               ║
║  Observable result or outcome                                      ║
║                                                                    ║
║  ┌────────────────────────────────────────────────┐              ║
║  │ ☑ Enable Wait Configuration                    │              ║
║  │                                                │              ║
║  │  ├─ Timeout (milliseconds)                     │              ║
║  │  │  [5000_________________]                   │              ║
║  │  │                                            │              ║
║  │  │  Default for click: 5000ms                 │              ║
║  │  │                                            │              ║
║  │  └─ Retries                                    │              ║
║  │     [1_____]                                  │              ║
║  │     Retry failed steps (1-5 times)            │              ║
║  │                                                │              ║
║  │  Quick Preset:                                 │              ║
║  │  [Fast (2s)] [Normal (5s)] [Slow (10s)] [Very Slow (30s)]    │
║  └────────────────────────────────────────────────┘              ║
║                                                                    ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                    ║
║  [Cancel]  [Add Step]                                             ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
```

---

### 5. Step Card - Editing Mode

```
┌────────────────────────────────────────────────────────────────┐
│  1  CLICK                                    [Done]             │
│                                                                │
│  Target *                                                      │
│  [button[data-qa='continue']_______________________]           │
│                                                                │
│  Value                                                         │
│  [________________________________________________]            │
│                                                                │
│  Expected result                                               │
│  [Form submitted, user redirected__________________]          │
│                                                                │
│  ┌──────────────────────────────────────────────┐            │
│  │ Wait Configuration                           │            │
│  │ ┌────────────────────────────────────────┐   │            │
│  │ │ Timeout (ms)                           │   │            │
│  │ │ [5000____________]                    │   │            │
│  │ │                                        │   │            │
│  │ │ Retries                                │   │            │
│  │ │ [1____]                               │   │            │
│  │ └────────────────────────────────────────┘   │            │
│  └──────────────────────────────────────────────┘            │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

### 6. Insert Step Flow

```
BEFORE:
┌─────────┐
│ Step 1  │
├─────────┤
│ Step 2  │ ← Click "+" here
├─────────┤
│ Step 3  │
└─────────┘

↓ Click "+" after Step 2

[Add Step Dialog Opens]
[Fill in details]
[Click "Add Step"]

↓

AFTER:
┌─────────┐
│ Step 1  │
├─────────┤
│ Step 2  │
├─────────┤
│ Step 3  │ ← NEW (auto-numbered)
├─────────┤
│ Step 4  │ ← Was Step 3 (auto-renumbered)
└─────────┘
```

---

### 7. Wait Configuration Explained

```
Without Wait (Default):
┌──────────────────┐
│ 1  CLICK         │
└──────────────────┘
Wait: None
Timeout: 5000ms (internal)
Retries: 1 (internal)

With Wait Configuration:
┌────────────────────────────────┐
│ 1  CLICK [⏱️ 5000ms] [Retry: 3x]│
├────────────────────────────────┤
│ Timeout: 5000ms                │
│ Retries: 3 times               │
└────────────────────────────────┘

Example Timeline:
─────────────────────────────────────
0ms   → Try to click
       ✗ Element not ready
       ↻ Wait 100ms

100ms → Try to click
       ✗ Still not visible
       ↻ Wait 100ms

200ms → Try to click
       ✗ Element disabled
       ↻ Retry 1/3

300ms → Try to click (retry 1)
       ✓ Success!

Result: Clicked successfully with retry
─────────────────────────────────────
```

---

### 8. Auto-Numbering Example

```
SCENARIO: Delete Step 2

BEFORE:
1  NAVIGATE
2  ENTER      ← Delete this
3  VERIFY
4  CLICK

↓ Click delete on Step 2

AFTER (Auto-renumbered):
1  NAVIGATE
2  VERIFY      ← Auto-renumbered to 2
3  CLICK       ← Auto-renumbered to 3

✅ No gaps, no manual work!
```

---

### 9. Export/Import Data Flow

```
┌─────────────────────────────────────────────────────┐
│                  Test Case Editor                   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [Export]  →  test-case.json  →  Download ↓       │
│                                                     │
│                                                     │
│  [Import]  ←  Upload/Paste JSON  ←  [.json file]  │
│                                                     │
│  Validates format
│  Auto-renumbers
│  Shows success
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

### 10. Action Buttons Per Step

```
Step Card Buttons:
├─ ↑ (Up Arrow)     → Move step up (disabled on 1st)
├─ ↓ (Down Arrow)   → Move step down (disabled on last)
├─ Edit             → Toggle edit mode
├─ + (Plus)         → Insert after this step
└─ 🗑️ (Trash)       → Delete step

Example:
3  ENTER
[↑] [↓] [Edit] [+] [✕]
 │   │    │     │   └─ Delete
 │   │    │     └─ Insert after
 │   │    └─ Edit inline
 │   └─ Move down
 └─ Move up
```

---

### 11. Validation Messages

```
SUCCESS MESSAGE:
┌─────────────────────────────────┐
│ ✓ Test case saved successfully! │
│                                 │
│ (Auto-disappears after 3s)     │
└─────────────────────────────────┘

ERROR MESSAGE:
┌──────────────────────────────────────┐
│ ⚠️  Validation Error                 │
│                                      │
│ Step validation failed:              │
│ • Target is required                 │
│ • Timeout must be 1000-300000ms     │
└──────────────────────────────────────┘
```

---

### 12. Preview Dialog

```
╔════════════════════════════════════════════════════════════════════╗
║                                                                    ║
║  Test Case Preview                                             [✕]║
║                                                                    ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                    ║
║  Title                                                             ║
║  User Login with Valid Credentials                                ║
║                                                                    ║
║  Description                                                       ║
║  This test validates that users can log in with valid...          ║
║                                                                    ║
║  Priority         │ Type                                           ║
║  High             │ Functional                                     ║
║                                                                    ║
║  Steps (5)                                                         ║
║  ┌─────────────────────────────────────────────────────────────┐  ║
║  │ Step 1: NAVIGATE                                            │  ║
║  │ Target: https://app.example.com/login                      │  ║
║  │ Expected: Login page loaded with title                     │  ║
║  └─────────────────────────────────────────────────────────────┘  ║
║  ┌─────────────────────────────────────────────────────────────┐  ║
║  │ Step 2: ENTER                                               │  ║
║  │ Target: input[data-qa='email']                              │  ║
║  │ Expected: Email address entered                             │  ║
║  └─────────────────────────────────────────────────────────────┘  ║
║  ... (3 more steps)                                                ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
```

---

## 🎨 Color Coding

```
Step Number Badge:
  Default: Gray (#666)
  Current Edit: Blue (highlight)

Wait Configuration:
  Timeout Badge: Blue with clock icon [⏱️ 5000ms]
  Retry Badge: Amber [Retry: 3x]

Action Buttons:
  Up/Down: Gray (disabled if at boundary)
  Edit: Blue
  Insert: Green
  Delete: Red

Status Messages:
  Success: Green
  Error: Red
  Warning: Amber
  Info: Blue
```

---

## ⌨️ Interaction Patterns

### Adding a Step
```
1. User clicks button (Add at Start / Insert after / Add at End)
2. Dialog opens
3. User fills form
4. User clicks "Add Step"
5. Step appears in list
6. Numbers auto-adjust
7. Success message
8. Dialog closes
```

### Editing a Step
```
1. User clicks "Edit" button
2. Step card turns blue
3. Fields become editable
4. User modifies values
5. User clicks "Done"
6. Changes saved
7. Card returns to normal view
```

### Reordering Steps
```
1. User clicks ↑ or ↓
2. Step swaps position
3. Numbers auto-renumber
4. UI updates instantly
```

---

## 🎯 Key UI Principles

✅ **Clear Visual Hierarchy**
- Step numbers prominent
- Actions clearly labeled
- Important info highlighted

✅ **Intuitive Navigation**
- Familiar buttons (Edit, Delete, etc.)
- Logical flow (Add Step → Fill Form → Done)
- Quick actions (Copy, Export, Import)

✅ **Immediate Feedback**
- Auto-renumbering visible
- Success/error messages
- Loading states

✅ **User-Friendly**
- Disabled buttons for invalid actions
- Helpful placeholders
- Clear error messages

✅ **Professional**
- Consistent spacing
- Clean typography
- Modern colors

---

**Status**: ✅ UI Design Complete
**Quality**: 🏆 Enterprise Grade
**User Experience**: 😊 Excellent

