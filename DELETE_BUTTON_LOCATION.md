# Delete Execution Button Location - Visual Guide

## 🎯 Where to Find the Delete Button

### Execution History List View

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  Test Executions                                      [Run Tests]      │
│  Run and monitor your automated tests...                               │
│                                                                         │
│  ═════════════════════════════════════════════════════════════════════ │
│  Execution History                          [Delete Selected] [Refresh]│
│  All test executions and their results                                │
│  ═════════════════════════════════════════════════════════════════════ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ ✓ Login Suite - 15Jan2024 10:30:45                                │ │
│  │   Playwright - staging - 5 tests                                  │ │
│  │   ✓ 5    ✗ 0    ⏱ 45s     [View] [Rerun] [🗑️ DELETE HERE!]      │ │
│  ├───────────────────────────────────────────────────────────────────┤ │
│  │ ✓ Dashboard Suite - 15Jan2024 10:25:30                            │ │
│  │   Playwright - staging - 8 tests                                  │ │
│  │   ✓ 8    ✗ 0    ⏱ 62s     [View] [Rerun] [🗑️ DELETE HERE!]      │ │
│  ├───────────────────────────────────────────────────────────────────┤ │
│  │ ✓ API Tests - 15Jan2024 10:20:15                                  │ │
│  │   Playwright - staging - 12 tests                                 │ │
│  │   ✓ 12   ✗ 0    ⏱ 1m 15s  [View] [Rerun] [🗑️ DELETE HERE!]      │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  Pagination: Showing 1-3 of 23 executions                             │
│  [Previous] Page 1 of 8 [Next]                                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🔴 The Delete Button

### Location in Each Row
```
Execution Item Layout:
┌─ Status Badge ─┬─ Execution Info ──────┬─ Stats ────┬─ Action Buttons ─┐
│      ✓         │ Suite Name            │ ✓5 ✗0 ⏱45s │ View  Rerun  🗑️  │
└────────────────┴──────────────────────┴────────────┴──────────────────┘
                                                              ↑
                                                       DELETE BUTTON
```

### Button Appearance
- **Icon**: 🗑️ Trash can icon
- **Color**: Red/Destructive (red text)
- **Size**: Small
- **Style**: Ghost (transparent background)
- **Position**: Far right of the row
- **Order**: After [Rerun] button

---

## 👆 How to Click It

### Step 1: Find an Execution
```
Look for any execution in the Execution History list
```

### Step 2: Locate the Red Trash Icon
```
┌────────────────────────────────┬──────────────────────┐
│ Execution Info                 │  [View] [Rerun] [🗑️] │
└────────────────────────────────┴──────────────────────┘
                                          ↑ Click here!
```

### Step 3: Click the Trash Icon
```
Mouse over the row → See the buttons appear
Click the RED TRASH ICON [🗑️]
→ Confirmation dialog pops up
```

---

## ⚠️ Confirmation Dialog

After clicking the delete button, you'll see:

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  ⚠️  Confirm Deletion                               │
│                                                      │
│  Are you sure you want to delete this execution     │
│  record? This action cannot be undone.              │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │ ⚠️  WARNING                                    │  │
│  │ This will permanently remove the execution    │  │
│  │ record and all associated data (results,      │  │
│  │ screenshots, videos, logs).                   │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│         [Cancel]      [Delete Execution]            │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### Buttons in Dialog
- **[Cancel]**: Do NOT delete (closes dialog)
- **[Delete Execution]**: YES, delete this execution (red button)

---

## ⏳ During Deletion

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  ⚠️  Confirm Deletion                               │
│                                                      │
│  Are you sure you want to delete this execution...  │
│                                                      │
│  ...                                                │
│                                                      │
│         [Cancel]      [⟳ Deleting...]               │
│                       ↑ Button shows spinner        │
│                                                      │
└──────────────────────────────────────────────────────┘

While deleting:
- Dialog stays open
- Delete button shows loading spinner
- Cancel button remains clickable
- List is grayed out in background
```

---

## ✅ After Deletion

```
✓ Toast notification appears:
  "Execution deleted successfully"

✓ Dialog closes automatically

✓ Execution is removed from list

✓ List updates instantly

✓ Page count may decrease
```

---

## 🎨 Button States

### 1. Normal State (Ready to Click)
```
┌──────────────────────────────────────────┐
│ [View] [Rerun] [🗑️]                     │
│                      ↑ Red trash icon    │
│                      Ghost style         │
└──────────────────────────────────────────┘
```

### 2. Hover State
```
┌──────────────────────────────────────────┐
│ [View] [Rerun] [🗑️]  ← Icon gets darker │
│              (tooltip: "Delete execution")
└──────────────────────────────────────────┘
```

### 3. Loading State (During Deletion)
```
┌──────────────────────────────────────────┐
│ [View] [Rerun] [⟳]  ← Shows spinner     │
│              (button is disabled)        │
└──────────────────────────────────────────┘
```

### 4. After Deletion
```
Execution row is removed from the list
└─ (no more trash button for that row)
```

---

## 📱 Mobile View

On mobile devices, the button layout adjusts:

```
┌────────────────────────────────────────┐
│ ✓ Suite Name                          │
│   Playwright - staging - 5 tests      │
│   ✓5 ✗0 ⏱45s                         │
│   [View] [Rerun] [🗑️]                │
│   ← Buttons stack if needed           │
└────────────────────────────────────────┘
```

---

## 🆘 Troubleshooting

### "I don't see the delete button"
**Solution**: Scroll right in the row or check that you're looking at completed executions

### "Delete button is disabled/grayed out"
**Solution**: Wait for the previous deletion to complete, or refresh the page

### "Dialog didn't open"
**Solution**: Try clicking the trash icon again, check browser console for errors

### "Execution didn't delete"
**Solution**: Check server logs, refresh the page, try again

---

## 📍 Quick Reference

| Element | Details |
|---------|---------|
| **Icon** | 🗑️ Red trash can |
| **Color** | Red (destructive) |
| **Size** | Small button |
| **Location** | Right side of each row, after [Rerun] |
| **Function** | Delete the execution |
| **Dialog** | Appears with warning |
| **Confirmation** | Click "Delete Execution" to confirm |
| **Result** | Execution permanently removed |

---

## 🎯 Summary

1. **Find** the red trash icon 🗑️ at the end of any execution row
2. **Click** the trash icon
3. **Review** the warning message
4. **Click** "Delete Execution" to confirm
5. **Wait** for deletion to complete
6. **See** the success message and execution removed

That's it! The delete feature is ready to use! 🚀

---

*Remember: Deletion is permanent. There is no undo!*

