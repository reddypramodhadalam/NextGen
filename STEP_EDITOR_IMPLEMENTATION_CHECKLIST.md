# ✅ Step Editor - Implementation Checklist

## 📋 Pre-Implementation (15 minutes)

- [ ] Read `STEP_EDITOR_SUMMARY.md`
- [ ] Read `STEP_EDITOR_INTEGRATION.md`
- [ ] Understand the features and benefits
- [ ] Check prerequisites (React, shadcn/ui, lucide-react)
- [ ] Allocate 1-2 hours for implementation

---

## 🔧 Installation (30 minutes)

### Step 1: Copy Component Files

- [ ] Create `client/src/components/StepEditor.tsx`
  - Copy entire file
  - Verify no syntax errors
  - Check imports

- [ ] Create `client/src/components/EnhancedTestCaseEditor.tsx`
  - Copy entire file
  - Verify imports
  - Check for missing UI components

### Step 2: Copy Hook File

- [ ] Create `client/src/hooks/useStepManagement.ts`
  - Copy entire file
  - Verify TypeScript syntax
  - Check for errors

### Step 3: Verify Dependencies

- [ ] Check `package.json` has:
  - [ ] `react`
  - [ ] `react-router-dom` (or your router)
  - [ ] `@radix-ui/...` (for UI components)
  - [ ] `lucide-react` (for icons)
  - [ ] `@tanstack/react-query` (optional, for data fetching)

If missing:
```bash
npm install lucide-react
npm install @radix-ui/react-dialog @radix-ui/react-select
npm install @radix-ui/react-tabs
```

### Step 4: Verify UI Components

- [ ] Check that these UI components exist in `@/components/ui`:
  - [ ] `Card`
  - [ ] `Button`
  - [ ] `Input`
  - [ ] `Textarea`
  - [ ] `Select`
  - [ ] `Checkbox`
  - [ ] `Dialog`
  - [ ] `Badge`
  - [ ] `Tabs`

If missing, create them or update imports to match your UI library

---

## 🔌 Integration (30 minutes)

### Step 5: Update Test Case Edit Page

Location: `client/src/pages/TestCaseEditPage.tsx` (or similar)

```typescript
// BEFORE
import TestCaseForm from '@/components/TestCaseForm';

// AFTER
import EnhancedTestCaseEditor from '@/components/EnhancedTestCaseEditor';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
```

- [ ] Import `EnhancedTestCaseEditor`
- [ ] Import necessary hooks (`useQuery`, `useMutation`, `useParams`)
- [ ] Replace old form with new editor
- [ ] Update `onSave` handler
- [ ] Update `isLoading` prop
- [ ] Test page loads without errors

### Step 6: Update Test Case Create Page

Location: `client/src/pages/CreateTestCasePage.tsx` (or similar)

- [ ] Import `EnhancedTestCaseEditor`
- [ ] Import `useMutation`
- [ ] Replace old form with new editor
- [ ] Update `onSave` handler
- [ ] Test page works
- [ ] Verify save API call is correct

### Step 7: Update Backend API (if needed)

Ensure your API endpoint accepts this structure:

```typescript
interface TestCase {
  id?: string;
  title: string;
  description: string;
  preconditions: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  testType: string;
  steps: TestStep[];
  expectedResult?: string;
  tags?: string[];
  testData?: Record<string, string>;
}

interface TestStep {
  stepId: number;
  action: string;
  target: string;
  value: string;
  timeoutMs?: number;
  waitEnabled?: boolean;
  retries?: number;
  expected: string;
  alternatives?: Array<{ target: string; reason: string }>;
}
```

- [ ] Update POST `/api/test-cases` endpoint
- [ ] Update PUT `/api/test-cases/:id` endpoint
- [ ] Update database schema (if needed)
- [ ] Test API accepts new fields
- [ ] Test API saves steps correctly

---

## 🧪 Testing (45 minutes)

### Step 8: Local Testing

```bash
npm run dev
```

- [ ] Navigate to create test case page
- [ ] Page loads without errors
- [ ] No console errors
- [ ] UI looks correct

### Step 9: Feature Testing - Insert Steps

- [ ] Click "Add Step at Start"
- [ ] Dialog opens
- [ ] Can select action
- [ ] Can fill target
- [ ] Can enter expected result
- [ ] Click "Add Step"
- [ ] Step appears in list
- [ ] Step number is 1
- [ ] Click "+" after step 1
- [ ] Insert dialog opens
- [ ] Add new step
- [ ] Verify it's inserted as step 2
- [ ] Verify previous step 2 is now step 3

### Step 10: Feature Testing - Auto-Numbering

- [ ] Create 5 steps
- [ ] Delete step 2
- [ ] Verify remaining steps renumbered to 1,2,3,4
- [ ] Move step 1 down
- [ ] Verify new order maintains correct numbering

### Step 11: Feature Testing - Wait Configuration

- [ ] Add step with wait enabled
- [ ] Set timeout 10000ms
- [ ] Set retries 3
- [ ] Save test case
- [ ] Reload page
- [ ] Verify wait configuration persisted
- [ ] Verify badge shows `[⏱️ 10000ms] [Retry: 3x]`

### Step 12: Feature Testing - Edit Steps

- [ ] Click "Edit" on a step
- [ ] Step card turns blue
- [ ] Can modify fields
- [ ] Click "Done"
- [ ] Changes saved
- [ ] Card returns to normal

### Step 13: Feature Testing - Reorder

- [ ] Have 4 steps
- [ ] Click Up on step 3
- [ ] Verify step 3 moved to position 2
- [ ] Verify numbering correct
- [ ] Click Down on new step 2
- [ ] Verify it moved back to position 3

### Step 14: Feature Testing - Export/Import

- [ ] Create test case with 5 steps
- [ ] Click "Export"
- [ ] File downloads
- [ ] Open JSON file
- [ ] Verify structure is correct
- [ ] Create new test case
- [ ] Click "Import"
- [ ] Paste JSON
- [ ] Verify steps imported
- [ ] Verify auto-renumbered

### Step 15: Feature Testing - Form Validation

- [ ] Try to save without title
- [ ] Error message appears
- [ ] Try to save without description
- [ ] Error message appears
- [ ] Try to save without steps
- [ ] Error message appears
- [ ] Fill in all fields
- [ ] Save succeeds

### Step 16: Feature Testing - Duplicate

- [ ] Create test case "Test A"
- [ ] Click "Duplicate"
- [ ] Verify title is "Test A (Copy)"
- [ ] Verify all steps copied
- [ ] Verify new test case created

### Step 17: Browser Compatibility

- [ ] Test in Chrome
- [ ] Test in Firefox
- [ ] Test in Safari
- [ ] Test in Edge
- [ ] Verify responsive on mobile (375px)
- [ ] Verify responsive on tablet (768px)
- [ ] Verify responsive on desktop (1920px)

### Step 18: Performance Testing

- [ ] Create test case with 50 steps
- [ ] Insert step in middle
- [ ] Verify responsive (no lag)
- [ ] Export - verify quick
- [ ] Import - verify quick
- [ ] Delete random steps - verify responsive

---

## 🚀 Deployment (30 minutes)

### Step 19: Code Review

- [ ] Review `StepEditor.tsx` code
- [ ] Review `EnhancedTestCaseEditor.tsx` code
- [ ] Review `useStepManagement.ts` code
- [ ] Check for console warnings
- [ ] Check for TypeScript errors
- [ ] Check for unused variables

### Step 20: Build for Production

```bash
npm run build
```

- [ ] Build completes without errors
- [ ] No TypeScript errors
- [ ] No warnings about missing dependencies
- [ ] Bundle size reasonable

### Step 21: Staging Deployment

- [ ] Deploy to staging environment
- [ ] Run full test suite
- [ ] Test all features on staging
- [ ] Test API integration
- [ ] Test database persistence
- [ ] Check console for errors
- [ ] Monitor performance

### Step 22: Production Deployment

- [ ] Get approval from team lead
- [ ] Create backup of production database
- [ ] Deploy to production
- [ ] Verify deployment successful
- [ ] Test all features in production
- [ ] Monitor error logs
- [ ] Monitor user feedback

### Step 23: Post-Deployment

- [ ] Monitor for errors
- [ ] Check performance metrics
- [ ] Gather user feedback
- [ ] Document any issues
- [ ] Plan follow-up improvements

---

## 📊 Verification (15 minutes)

### Step 24: Final Verification

#### Create Test Case Workflow
- [ ] Click "Create Test Case"
- [ ] Page loads
- [ ] All form fields visible
- [ ] Can fill in details
- [ ] Can add steps
- [ ] Can insert between steps
- [ ] Steps auto-number correctly
- [ ] Can configure wait per step
- [ ] Can export test case
- [ ] Can save to database

#### Edit Test Case Workflow
- [ ] Click "Edit Test Case"
- [ ] Existing data loads
- [ ] Can modify fields
- [ ] Can add/remove steps
- [ ] Can reorder steps
- [ ] Auto-numbering works
- [ ] Can save changes

#### All Features
- [ ] Insert ✅
- [ ] Edit ✅
- [ ] Delete ✅
- [ ] Reorder ✅
- [ ] Auto-number ✅
- [ ] Wait config ✅
- [ ] Export ✅
- [ ] Import ✅
- [ ] Duplicate ✅
- [ ] Validation ✅

---

## 🎯 Success Criteria

- [ ] All tests pass
- [ ] No console errors
- [ ] No TypeScript errors
- [ ] All features working
- [ ] Responsive design works
- [ ] Performance acceptable
- [ ] Users can create test cases
- [ ] Users can edit test cases
- [ ] Users can insert steps
- [ ] Users can export/import
- [ ] Documentation complete

---

## 🔄 Rollback Plan

If issues occur:

### Quick Rollback (5 minutes)
```bash
# Revert to previous commit
git reset --hard HEAD~1
npm run dev
```

### Full Rollback (15 minutes)
```bash
# Revert branch
git checkout main
npm install
npm run dev
```

### Selective Rollback (10 minutes)
```bash
# Revert specific files
git checkout HEAD -- client/src/components/StepEditor.tsx
npm run dev
```

---

## 📝 Sign-Off

### Development Team
- [ ] Code implementation complete
- [ ] All tests pass
- [ ] No console errors
- [ ] Ready for QA

### QA Team
- [ ] Feature testing complete
- [ ] All scenarios covered
- [ ] Performance verified
- [ ] Ready for production

### Product Team
- [ ] User acceptance testing complete
- [ ] Feature meets requirements
- [ ] Performance acceptable
- [ ] Approved for production

### Operations Team
- [ ] Deployment plan reviewed
- [ ] Rollback procedures ready
- [ ] Monitoring configured
- [ ] Approved for deployment

---

## 📞 Support Contacts

If you encounter issues:

**Documentation**:
- `STEP_EDITOR_INTEGRATION.md` - Integration guide
- `STEP_EDITOR_ENHANCEMENTS.md` - Feature guide
- `STEP_EDITOR_VISUAL_GUIDE.md` - UI guide

**Common Issues**:
Check `STEP_EDITOR_INTEGRATION.md` section "🐛 Common Issues & Solutions"

---

## ✅ Final Checklist

Before marking as COMPLETE:

- [ ] All 24 steps completed
- [ ] All features tested
- [ ] All sign-offs received
- [ ] Documentation available
- [ ] Team trained
- [ ] Monitoring active
- [ ] Rollback ready

---

## 🎉 Completion

When all items are checked:

✅ **IMPLEMENTATION COMPLETE**

**Status**: Ready for production use
**Quality**: Enterprise grade
**Support**: Full documentation provided

---

**Total Time Required**: 2-3 hours
**Difficulty**: Moderate
**Risk Level**: Low
**ROI**: High

🚀 **You're ready to deploy!**

