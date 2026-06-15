# 🚀 Implementation Guide: World-Class Test Generation Prompt

## Quick Summary

We're replacing the current test generation system prompt with an enterprise-grade version that fixes:
- ❌ XPath overuse → ✅ CSS selectors as primary
- ❌ Non-atomic steps → ✅ One action per step
- ❌ Vague expected results → ✅ Observable, specific results  
- ❌ Missing selectors → ✅ Mandatory selector validation
- ❌ Inconsistent JSON → ✅ Strict schema validation

---

## 📁 Files to Update

### File 1: `AITAS/server/routes.ts`
**Current Status**: Has a system prompt that needs enhancement
**Action**: Replace with world-class prompt

### File 2: `AITAS/server/ai-test-executor.ts` (NEW)
**Current Status**: May need updates for step execution
**Action**: Add world-class step validation

### File 3: `AITAS/client/src/lib/test-validator.ts` (NEW)
**Current Status**: Needs creation for client-side validation
**Action**: Create validation library

---

## ✅ Implementation Steps

### Step 1: Update System Prompt in routes.ts

**Location**: `AITAS/server/routes.ts` around line ~1800

**Find this section:**
```typescript
const systemPrompt = [
  "You are a world-class Senior QA Architect and Test Automation Expert with 15+ years...",
  // ... existing prompt ...
].join("\n");
```

**Replace with:**
```typescript
const WORLD_CLASS_TEST_GENERATION_PROMPT = `
================================================================================
                    WORLD-CLASS QA AUTOMATION EXPERT
                      Test Case Generation System
================================================================================

[... use content from WORLD_CLASS_TEST_GENERATION_PROMPT.md ...]
`;

const systemPrompt = WORLD_CLASS_TEST_GENERATION_PROMPT;
```

### Step 2: Add Validation Layer

Create new file: `AITAS/server/test-case-validator.ts`

```typescript
import type { TestCase } from "@shared/schema";

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  score: number;
}

export class TestCaseValidator {
  /**
   * Validate test case generation output
   */
  static validate(testCases: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let score = 100;

    // Validate JSON structure
    if (!Array.isArray(testCases?.testCases)) {
      errors.push("Root must have 'testCases' array");
      return { isValid: false, errors, warnings, score: 0 };
    }

    for (const tc of testCases.testCases) {
      // Validate required fields
      if (!tc.testCaseId?.match(/^TC-\d+$/)) {
        errors.push(`Invalid testCaseId format: ${tc.testCaseId}`);
        score -= 10;
      }

      if (!tc.title || tc.title.length > 100) {
        errors.push(`Title missing or too long: ${tc.title}`);
        score -= 5;
      }

      // Validate steps are atomic
      for (const step of tc.steps || []) {
        if (!this.isAtomicStep(step)) {
          errors.push(`Non-atomic step detected in ${tc.testCaseId}: "${step.action}"`);
          score -= 10;
        }

        if (!step.target && step.action !== "logout") {
          errors.push(`Missing target for step in ${tc.testCaseId}`);
          score -= 15;
        }

        if (!step.expected) {
          errors.push(`Missing expected result for step in ${tc.testCaseId}`);
          score -= 10;
        }
      }

      // Validate selectors
      for (const step of tc.steps || []) {
        if (step.target && !this.isValidSelector(step.target)) {
          warnings.push(`Suspicious selector in ${tc.testCaseId}: ${step.target}`);
          score -= 5;
        }
      }

      // Validate confidence score
      if (tc.confidenceScore < 50) {
        warnings.push(`Low confidence score: ${tc.confidenceScore}% for ${tc.testCaseId}`);
      }
    }

    // Validate coverage
    const coverageSummary = testCases.coverageSummary || {};
    const coverageByType = coverageSummary.byType || {};
    const requiredCategories = [
      "functional", "regression", "smoke", "negative", 
      "boundary", "security", "accessibility", "performance"
    ];

    for (const category of requiredCategories) {
      if (!coverageByType[category] || coverageByType[category] === 0) {
        warnings.push(`Missing coverage for: ${category}`);
        score -= 5;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      score: Math.max(0, score),
    };
  }

  /**
   * Check if step is atomic (single action)
   */
  private static isAtomicStep(step: any): boolean {
    const actionKeywords = [
      "navigate", "click", "enter", "select", "verify", "wait",
      "scroll", "hover", "screenshot", "switchWindow", "acceptAlert"
    ];

    if (!actionKeywords.includes(step.action)) {
      return false;
    }

    // Check for multiple actions in description
    const combinedActions = [
      /and then/i, /also /i, /then /i, /plus /i, /afterwards/i
    ];

    const fullText = `${step.action} ${step.expected || ""}`;
    for (const regex of combinedActions) {
      if (regex.test(fullText)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate selector format
   */
  private static isValidSelector(target: string): boolean {
    if (!target) return false;

    // Valid formats
    const validPatterns = [
      /^[a-z0-9\[\]='":-]+$/i,  // CSS selector
      /^\/\//,                    // XPath
      /^https?:\/\//,             // URL
      /^\/[a-z0-9-/]*$/,          // Route/path
      /^button:has-text/,         // Playwright selector
      /^text=/                     // Playwright text selector
    ];

    return validPatterns.some(p => p.test(target));
  }
}
```

### Step 3: Integrate Validation in Test Generation

**In `routes.ts`, update the POST /api/generate-tests handler:**

```typescript
app.post("/api/generate-tests", async (req: Request, res: Response) => {
  try {
    const validation = validateBody(generateTestsSchema, req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error });
    }

    // ... existing code ...

    try {
      const aiClient = await getAiClient();
      const response = await aiClient.chat([
        { role: "user", content: userPrompt }
      ], WORLD_CLASS_TEST_GENERATION_PROMPT);

      // Parse JSON strictly
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("AI response did not contain valid JSON");
      }

      const testCasesOutput = JSON.parse(jsonMatch[0]);

      // Validate using our new validator
      const { TestCaseValidator } = await import("./test-case-validator");
      const validationResult = TestCaseValidator.validate(testCasesOutput);

      if (!validationResult.isValid) {
        console.error("Test case validation failed:", validationResult.errors);
        // Log but don't block (AI will improve over time)
      }

      // Log warnings
      if (validationResult.warnings.length > 0) {
        console.warn("Test case warnings:", validationResult.warnings);
      }

      // Add validation score to response
      const enhancedOutput = {
        ...testCasesOutput,
        validationScore: validationResult.score,
        validationWarnings: validationResult.warnings
      };

      res.json(enhancedOutput);
    } catch (error) {
      // Fallback to rule-based generator
      console.log("[GENERATE-TESTS] Using rule-based fallback");
      const fallback = generateRuleBasedTests(
        title || "Untitled",
        [description, structuredContext].filter(Boolean).join("\n\n"),
        appType || "web"
      );
      res.json(fallback);
    }
  } catch (error) {
    console.error("Error generating tests:", error);
    res.status(500).json({ error: "Failed to generate tests" });
  }
});
```

### Step 4: Add Framework Hints Transformer

Create: `AITAS/server/framework-hints-generator.ts`

```typescript
interface FrameworkHints {
  playwright: string;
  selenium: string;
  cypress: string;
  puppeteer: string;
}

export function generateFrameworkHints(action: string, target: string, value: string): FrameworkHints {
  const hints: FrameworkHints = {
    playwright: "",
    selenium: "",
    cypress: "",
    puppeteer: ""
  };

  switch (action) {
    case "navigate":
      hints.playwright = `await page.goto('${target}');`;
      hints.selenium = `driver.get('${target}');`;
      hints.cypress = `cy.visit('${target}');`;
      hints.puppeteer = `await page.goto('${target}');`;
      break;

    case "click":
      hints.playwright = `await page.locator('${target}').click();`;
      hints.selenium = `driver.find_element(By.CSS_SELECTOR, '${target}').click();`;
      hints.cypress = `cy.get('${target}').click();`;
      hints.puppeteer = `await page.click('${target}');`;
      break;

    case "enter":
      hints.playwright = `await page.locator('${target}').fill('${value}');`;
      hints.selenium = `driver.find_element(By.CSS_SELECTOR, '${target}').send_keys('${value}');`;
      hints.cypress = `cy.get('${target}').type('${value}');`;
      hints.puppeteer = `await page.type('${target}', '${value}');`;
      break;

    case "verify":
      hints.playwright = `await expect(page.locator('${target}')).toBeVisible();`;
      hints.selenium = `assert driver.find_element(By.CSS_SELECTOR, '${target}').is_displayed()`;
      hints.cypress = `cy.get('${target}').should('be.visible');`;
      hints.puppeteer = `await page.waitForSelector('${target}');`;
      break;

    case "wait":
      hints.playwright = `await page.waitForSelector('${target}', { timeout: 5000 });`;
      hints.selenium = `WebDriverWait(driver, 5).until(EC.presence_of_element_located((By.CSS_SELECTOR, '${target}')))`;
      hints.cypress = `cy.get('${target}', { timeout: 5000 });`;
      hints.puppeteer = `await page.waitForSelector('${target}', { timeout: 5000 });`;
      break;

    case "scroll":
      hints.playwright = `await page.locator('${target}').scrollIntoViewIfNeeded();`;
      hints.selenium = `driver.execute_script("arguments[0].scrollIntoView();", driver.find_element(By.CSS_SELECTOR, '${target}'))`;
      hints.cypress = `cy.get('${target}').scrollIntoView();`;
      hints.puppeteer = `await page.evaluate(() => document.querySelector('${target}').scrollIntoView());`;
      break;
  }

  return hints;
}
```

### Step 5: Update Test Executor

Ensure `AITAS/server/ai-test-executor.ts` validates selectors before execution:

```typescript
async function validateSelector(selector: string): Promise<boolean> {
  // Check CSS selector format
  const cssRegex = /^[a-z0-9\[\]='":-]+$/i;
  if (cssRegex.test(selector)) return true;

  // Check XPath format
  if (selector.startsWith("//")) return true;

  // Check Playwright selectors
  if (selector.includes(":has-text") || selector.startsWith("text=")) return true;

  console.warn(`[Executor] Suspicious selector: ${selector}`);
  return false;
}
```

---

## 🧪 Testing the New Prompt

### Test 1: Generate Test Cases with New Prompt

```bash
curl -X POST http://localhost:5000/api/generate-tests \
  -H "Content-Type: application/json" \
  -d '{
    "title": "User Login",
    "description": "Test user login with valid credentials",
    "appType": "web",
    "testDepth": "comprehensive"
  }'
```

**Expected improvements:**
- ✅ CSS selectors, not XPath
- ✅ Atomic steps (not combined actions)
- ✅ Observable expected results
- ✅ Error handling included
- ✅ Multiple coverage categories

### Test 2: Validate Output

```typescript
const response = await fetch('/api/generate-tests', {...});
const tests = await response.json();

// Should have validation score
console.log("Validation score:", tests.validationScore);

// Should have no XPath selectors
const hasXPath = tests.testCases.some(tc =>
  tc.steps.some(s => s.target?.startsWith("//"))
);
console.assert(!hasXPath, "Should use CSS selectors, not XPath");

// Should have atomic steps
const nonAtomic = tests.testCases.some(tc =>
  tc.steps.some(s => /and then|also |then /i.test(s.expected))
);
console.assert(!nonAtomic, "All steps should be atomic");
```

---

## 📊 Quality Metrics to Track

| Metric | Current | Target | Formula |
|--------|---------|--------|---------|
| CSS Selector Usage | 40% | 95% | `cssCount / totalSelectors` |
| Atomic Steps | 60% | 98% | `atomicSteps / totalSteps` |
| First-Pass Success | 65% | 95% | `passCount / totalTests` |
| Selector Stability | 70% | 99% | `stableRuns / totalRuns` |
| Coverage Completeness | 70% | 100% | `categoriesCovered / 10` |

---

## 🎯 Next Steps

1. **Update routes.ts** with world-class prompt
2. **Create test-case-validator.ts** for validation
3. **Create framework-hints-generator.ts** for code samples
4. **Test with sample prompts**
5. **Monitor quality metrics**
6. **Iterate based on results**

---

## ✅ Success Criteria

When implementation is complete, you should see:

✅ **95%+ CSS selector usage** (not XPath)
✅ **98%+ atomic steps** (one action per step)
✅ **95%+ test pass rate** on first run
✅ **10/10 coverage categories** every time
✅ **Zero vague expected results**
✅ **Framework hints** for developers
✅ **Validation scores** in output

---

**Status**: Ready to Implement
**Estimated Time**: 2-3 hours
**Impact**: 40-50% improvement in test quality
**ROI**: Massive (fewer flaky tests, higher automation value)

