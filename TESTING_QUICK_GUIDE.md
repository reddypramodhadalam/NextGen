# 🧪 TESTING QUICK GUIDE - STEP BY STEP

## ⚡ 5-MINUTE TEST

### STEP 1: Start Server (1 minute)

Open terminal in your AITAS folder:
```bash
npm run dev
```

Wait for this message:
```
✅ Requirement-based test generation API mounted
```

---

### STEP 2: Open Another Terminal (30 seconds)

Open a NEW terminal window (keep first one running)

---

### STEP 3: Test GET Endpoint (1 minute)

Copy this and paste in terminal:

```bash
curl -X GET http://localhost:3000/api/v2/generate-from-requirements/example
```

Press Enter.

**Expected Output:**
```json
{
  "title": "Risk Assessment Escalation",
  "description": "Test the Risk Assessment escalation workflow",
  ...
}
```

✅ **If you see JSON, TEST PASSED!**

---

### STEP 4: Test POST Endpoint (2 minutes)

Copy this and paste in terminal:

```bash
curl -X POST http://localhost:3000/api/v2/generate-from-requirements -H "Content-Type: application/json" -d "{\"title\":\"Test Login\",\"requirements\":\"The system shall allow users to login with username and password. The system shall validate credentials. The system shall redirect to dashboard on success.\"}"
```

Press Enter.

**Expected Output:**
```json
{
  "success": true,
  "data": {
    "testCases": [
      {
        "testCaseId": "TC_001",
        "title": "...",
        "steps": [...]
      }
    ]
  }
}
```

✅ **If you see success: true, TEST PASSED!**

---

## ✅ VERIFICATION

Check these in the response:

✅ `"success": true` 
✅ `"testCases"` array exists
✅ Test cases have `title`, `steps`, `priority`
✅ Steps have `stepNumber`, `action`, `description`
✅ Steps have `expectedResult`
✅ `"summary"` section shows metrics

---

## 🎯 ALL TESTS SUMMARY

| Test | Command | Expected | Status |
|------|---------|----------|--------|
| 1 | GET example | JSON response | ✅ |
| 2 | POST simple | success: true | ✅ |
| 3 | POST full spec | 5+ test cases | ✅ |
| 4 | Check steps | 15+ steps/case | ✅ |
| 5 | Check locators | Element locators present | ✅ |
| 6 | Check data | Test data mapped | ✅ |

---

## 🎊 IF ALL TESTS PASS

You have successfully:
- ✅ Deployed the API
- ✅ Verified it's working
- ✅ Generated test cases
- ✅ Confirmed element locators
- ✅ Verified test data

**Congratulations! Your system is live!** 🚀

---

## 🐛 IF TESTS FAIL

| Problem | Solution |
|---------|----------|
| "Connection refused" | Server not running. Run `npm run dev` |
| "Cannot GET..." | Routes not integrated. Check `server/routes.ts` has import and endpoints |
| "No response" | Wait 10 seconds and try again |
| Empty response | Check requirements are 50+ characters |

---

## 📊 EXPECTED METRICS

When you run TEST 3 (Full spec), you should see:

```json
"summary": {
  "totalTestCases": 5,        ← 5 test cases
  "totalSteps": 95,            ← ~95 total steps across all cases
  "averageStepsPerCase": 19,   ← ~19 steps per case
  "estimatedExecutionTime": 285
}
```

**This means:**
- ✅ Multiple test cases generated
- ✅ Comprehensive steps (not generic)
- ✅ Ready to execute

---

## 🎉 NEXT STEPS AFTER TESTING

1. ✅ Verify all 6 tests pass
2. ✅ Try with your actual requirements
3. ✅ Integrate into your UI
4. ✅ Connect to test executor
5. ✅ Start generating tests!

---

**You're done testing! System is live!** 🚀
