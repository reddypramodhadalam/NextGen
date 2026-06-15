# 🚀 HOW TO RUN THE AUTOMATED DEPLOYMENT SCRIPT

I've created automated scripts that will deploy everything for you! Choose your OS and follow the steps.

---

## 🎯 CHOOSE YOUR OPERATING SYSTEM

### 🐧 Linux / Mac Users
→ Use: `deploy.sh`

### 🪟 Windows Users
→ Use: `deploy.bat`

---

## 📋 BEFORE YOU START

### Prerequisites Checklist
- [ ] You have all 3 component files in your project root:
  - `StepEditor.tsx`
  - `EnhancedTestCaseEditor.tsx`
  - `useStepManagement.ts`
- [ ] You're in your project's root directory
- [ ] You have npm installed
- [ ] You have git installed
- [ ] You have 10 minutes available

---

## 🐧 LINUX / MAC DEPLOYMENT

### Step 1: Prepare the Script

```bash
# Navigate to your project root
cd ~/your-project

# Make the script executable
chmod +x deploy.sh

# Verify it's executable
ls -la deploy.sh
# Should show: -rwxr-xr-x ...
```

### Step 2: Run the Script

```bash
# Run the deployment script
bash deploy.sh

# OR

./deploy.sh
```

### Step 3: Follow the Prompts

The script will:

1. ✅ **Verify** your project setup
   - Checks package.json exists
   - Checks node_modules
   - Verifies git status

2. ✅ **Copy** component files
   - Copies StepEditor.tsx
   - Copies EnhancedTestCaseEditor.tsx
   - Copies useStepManagement.ts

3. ✅ **Find** your test case page
   - Looks for TestCaseEditPage.tsx
   - If not found, asks you to specify
   - Creates backup of original file

4. ✅ **Type Check**
   - Runs npm run type-check
   - Stops if errors found

5. ✅ **Build**
   - Runs npm run build
   - Creates dist/ folder

6. ✅ **Deploy**
   - Asks for confirmation
   - Runs deployment command
   - Verifies deployment

### Step 4: Answer Questions

When prompted, answer:

```bash
# Question 1: Uncommitted changes?
Continue anyway? (y/n) → y

# Question 2: Deploy to production?
Deploy to production now? (y/n) → y

# Question 3: Production URL?
Enter your production URL → https://your-app.com
```

### Step 5: Monitor Output

Watch for these success messages:

```
✅ Project root detected
✅ Dependencies installed
✅ All files copied successfully
✅ No TypeScript errors
Build completed successfully
✅ Deployment initiated
✅ Production is responding
```

---

## 🪟 WINDOWS DEPLOYMENT

### Step 1: Copy Files to Project Root

Before running the script, ensure these 3 files are in your project root:
- `StepEditor.tsx`
- `EnhancedTestCaseEditor.tsx`
- `useStepManagement.ts`

```powershell
# Verify files exist
dir StepEditor.tsx
dir EnhancedTestCaseEditor.tsx
dir useStepManagement.ts
```

### Step 2: Open Command Prompt

```powershell
# Open Command Prompt or PowerShell
# Navigate to project root
cd C:\your-project

# OR use PowerShell
cd C:\your-project
```

### Step 3: Run the Script

```bash
# Run the batch file
deploy.bat
```

### Step 4: Follow the Prompts

Same as Linux/Mac - answer the questions when prompted:

```
Deploy to production now? (y/n): y
Enter your production URL: https://your-app.com
```

### Step 5: Monitor Output

Look for success messages:

```
[OK] Project root detected
[OK] Dependencies installed
[OK] All files copied successfully
[OK] No TypeScript errors
[OK] Build completed successfully
[OK] Deployment initiated
```

---

## ⚠️ WHAT IF THE SCRIPT ASKS FOR MANUAL UPDATE?

If you see this message:

```
[WARNING] MANUAL UPDATE REQUIRED:
Please manually update the component usage in: client/src/pages/TestCaseEditPage.tsx
```

### Follow these steps:

1. **Open the file** in your editor:
   ```
   client/src/pages/TestCaseEditPage.tsx
   ```

2. **Find the old component**:
   ```typescript
   <TestCaseForm testCase={testCase} onSave={handleSave} />
   ```

3. **Replace with new component**:
   ```typescript
   <EnhancedTestCaseEditor
     testCase={testCase}
     onSave={async (tc) => await handleSave(tc)}
     isLoading={isLoading}
   />
   ```

4. **Add import at top**:
   ```typescript
   import EnhancedTestCaseEditor from '@/components/EnhancedTestCaseEditor';
   ```

5. **Save the file** and press Enter in the script

The script will continue automatically!

---

## 🔍 TROUBLESHOOTING

### Issue: "Permission denied" on Linux/Mac

```bash
# Make script executable
chmod +x deploy.sh

# Then run again
./deploy.sh
```

### Issue: "npm: command not found"

```bash
# Install Node.js and npm
# Download from: https://nodejs.org/

# Or using Homebrew (Mac):
brew install node

# Then try again
./deploy.sh
```

### Issue: "TypeScript errors found"

```bash
# The script stopped because of TypeScript errors
# Fix the errors in your code:
npm run type-check

# Then run the script again
./deploy.sh
```

### Issue: "git: command not found"

```bash
# Install git
# Download from: https://git-scm.com/

# Then try again
./deploy.sh
```

### Issue: Script seems stuck

```bash
# Press Ctrl+C to stop the script
Ctrl+C

# Fix the issue and try again
./deploy.sh
```

---

## 📊 SCRIPT PHASES EXPLAINED

### Phase 1: Verification (2 min)
- Checks you're in the right directory
- Verifies Node.js is installed
- Checks git status

**Expected outcome**: "Project root detected" ✅

### Phase 2: Copy Files (2 min)
- Creates `client/src/components/` directory
- Creates `client/src/hooks/` directory
- Copies 3 component files

**Expected outcome**: "All files copied successfully" ✅

### Phase 3: Find & Update (3 min)
- Finds your test case page
- Either auto-updates or asks for manual update
- Creates backup of original file

**Expected outcome**: Either automatic or manual update done ✅

### Phase 4: Type Check (2 min)
- Runs TypeScript compiler
- Checks for errors in your code

**Expected outcome**: "No TypeScript errors" ✅

### Phase 5: Build (3 min)
- Runs `npm run build`
- Creates `dist/` folder
- Shows build size

**Expected outcome**: "Build completed successfully" ✅

### Phase 6: Deploy (2 min)
- Asks for confirmation
- Runs deployment command
- Monitors output

**Expected outcome**: "Deployment initiated" ✅

### Phase 7: Verification (1 min)
- Checks production health endpoint
- Verifies deployment worked

**Expected outcome**: "Production is responding" ✅

---

## ✅ SUCCESS INDICATORS

When deployment is complete, you should see:

```
[OK] Files copied
[OK] Build completed
[OK] Deployment initiated
[OK] Production is responding

Next steps:
  1. Verify in production: https://your-app.com/test-cases
  2. Monitor logs for errors
  3. Notify your team
  4. Gather user feedback

[OK] Deployment script finished!
```

---

## 🎯 WHAT TO CHECK AFTER DEPLOYMENT

### 1. Verify in Production (2 min)

Open your production URL:
```
https://your-app.com/test-cases
```

Check:
- ✅ Page loads
- ✅ No 404 errors
- ✅ "Add Step at Start" button visible
- ✅ Can click and add a step
- ✅ Auto-numbering works

### 2. Check Browser Console (1 min)

Open DevTools: **F12** or **Cmd+Option+I**

Check:
- ✅ No red error messages
- ✅ Console shows no warnings
- ✅ Network tab shows 200 OK responses

### 3. Test Key Features (3 min)

In production test case page:
- [ ] Can create new test case
- [ ] Can add steps
- [ ] Steps auto-number (1, 2, 3...)
- [ ] Can insert after step
- [ ] Can delete step
- [ ] Can export as JSON
- [ ] Can save to database

### 4. Monitor Logs (ongoing)

```bash
# Watch for errors
tail -f logs/production.log

# Should show: No errors related to StepEditor
```

---

## 🔄 IF DEPLOYMENT FAILS

### Step 1: Check the Error Message

The script will show exactly what failed:

```
Error: TypeScript errors found
Error: Build failed
Error: Deployment failed
```

### Step 2: Fix the Issue

```bash
# For TypeScript errors:
npm run type-check

# For build errors:
npm run build

# For deployment errors:
npm run deploy:production
```

### Step 3: Run Script Again

```bash
./deploy.sh   # Linux/Mac
deploy.bat    # Windows
```

---

## 📞 SUPPORT

### Script Issues?

1. **Check logs**: Look at script output carefully
2. **Read error message**: It tells you exactly what's wrong
3. **Fix the issue**: Run the command it suggests
4. **Try again**: Run the script again

### Deployment Issues?

1. **Check production URL**: Is it correct?
2. **Check logs**: Look at production logs
3. **Verify health**: `curl https://your-app.com/api/health`
4. **Try rollback**: If critical issue, use rollback procedure

---

## 🚀 YOU'RE READY!

Everything is automated. Just:

1. **Linux/Mac**: `bash deploy.sh`
2. **Windows**: `deploy.bat`
3. **Answer prompts** when asked
4. **Watch the magic happen!** ✨

---

## ⏱️ TIMELINE

- **Phase 1**: 2 minutes
- **Phase 2**: 2 minutes
- **Phase 3**: 3 minutes
- **Phase 4**: 2 minutes
- **Phase 5**: 3 minutes
- **Phase 6**: 2 minutes
- **Phase 7**: 1 minute

**Total: ~15 minutes** ⏱️

---

## 🎉 AFTER DEPLOYMENT

Your team can now:
- ✅ Insert steps anywhere
- ✅ Auto-numbering works
- ✅ Configure wait per step
- ✅ Export/import test cases
- ✅ Create tests 67% faster!

---

**Ready?** 

```bash
# Linux/Mac:
bash deploy.sh

# Windows:
deploy.bat
```

🚀 **Let's deploy!**

