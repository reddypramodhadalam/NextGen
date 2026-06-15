# AITAS Test Case Implementation Guide

## 🚀 Quick Implementation Summary

This guide covers how to integrate the **standardized test case structure** into the AITAS upload flow.

## 📦 New Modules

Three new TypeScript modules have been created:

### 1. **test-case-validation.ts**
- **Purpose**: Validates test cases against standardized schema
- **Key Classes**: `TestCaseValidator`
- **Functions**:
  - `validate(testCase)` - Single test case validation
  - `validateBatch(testCases)` - Batch validation
  - `autoCorrect(testCase)` - Auto-fix common issues

### 2. **test-case-nlp-parser.ts**
- **Purpose**: AI-powered NLP parsing of unstructured test steps
- **Key Classes**: `TestCaseNLPParser`, `BatchTestCaseParser`
- **Functions**:
  - `parseStepsWithAI(steps)` - Use OpenAI to parse steps
  - `parseStepsRuleBased(steps)` - Fallback rule-based parsing
  - `extractElementLocators(stepText)` - Extract CSS/XPath selectors
  - `extractPlaceholders(steps)` - Find data placeholders

### 3. **test-case-mapping-engine.ts**
- **Purpose**: Maps parsed steps to automation framework commands
- **Key Classes**: `TestCaseMappingEngine`, Framework-specific mappers
- **Functions**:
  - `mapStep(step, context)` - Map single step to command
  - `mapSteps(steps, context)` - Map all steps
  - `generateScript()` - Generate complete test script

## 🔗 Integration Points in Routes

### **1. Parse Excel Upload Endpoint** (Enhanced)

**Endpoint**: `POST /api/upload/parse-excel`

**Current Flow**:
```
Upload Excel → Parse Rows → Return Test Cases
```

**Enhanced Flow**:
```
Upload Excel → Parse Rows → Validate Structure → AI Parse Steps → Return Validated Cases
```

**Implementation**:
```typescript
import { TestCaseValidator, EXCEL_COLUMN_MAPPING } from "./test-case-validation";
import { TestCaseNLPParser } from "./test-case-nlp-parser";

app.post("/api/upload/parse-excel", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // 1. Parse Excel file
    const excelData = parseExcelFile(req.file); // Your existing parser

    // 2. Map columns to standard schema
    const testCases = excelData.rows.map(row => {
      const tc = {};
      for (const [excelCol, standardField] of Object.entries(EXCEL_COLUMN_MAPPING)) {
        if (row[excelCol]) {
          tc[standardField] = row[excelCol];
        }
      }
      return tc;
    });

    // 3. Validate each test case
    const validationResults = TestCaseValidator.validateBatch(testCases);
    
    // 4. Parse test steps with AI (for steps that aren't already structured)
    const enhancedTestCases = await Promise.all(
      validationResults.results.map(async (result) => {
        if (result.validation.isValid && result.validation.normalizedTestCase?.testSteps) {
          // Steps are already structured
          return result.validation.normalizedTestCase;
        } else {
          // Try to parse unstructured steps
          const parseResult = await TestCaseNLPParser.parseStepsWithAI(
            [result.testCaseId + ": " + JSON.stringify(result.validation.normalizedTestCase)]
          );
          return { ...result.validation.normalizedTestCase, parseResult };
        }
      })
    );

    res.json({
      testCases: enhancedTestCases,
      errors: validationResults.results
        .filter(r => !r.validation.isValid)
        .map(r => ({
          testCaseId: r.testCaseId,
          errors: r.validation.errors,
          warnings: r.validation.warnings,
        })),
      summary: {
        total: validationResults.totalCases,
        valid: validationResults.validCases,
        invalid: validationResults.invalidCases,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
```

### **2. Enhanced Import Endpoint**

**Endpoint**: `POST /api/test-cases/import`

**Enhancement**:
```typescript
import { TestCaseValidator } from "./test-case-validation";
import { TestCaseNLPParser } from "./test-case-nlp-parser";
import { TestCaseMappingEngine } from "./test-case-mapping-engine";

app.post("/api/test-cases/import", async (req: Request, res: Response) => {
  try {
    const validation = validateBody(importTestCasesSchema, req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error });
    }
    
    const { suiteId, testCases } = validation.data;
    const importedCases = [];
    const errors = [];

    for (const tc of testCases) {
      // 1. Validate test case
      const validation = TestCaseValidator.validate(tc);
      
      if (!validation.isValid) {
        errors.push({
          testCaseId: tc.testCaseId,
          errors: validation.errors,
        });
        continue;
      }

      // 2. If test steps aren't structured, parse them
      let steps = tc.steps;
      if (tc.testSteps && !tc.steps) {
        steps = tc.testSteps;
      }

      // 3. Create test case
      const created = await storage.createTestCase({
        suiteId: suiteId ?? undefined,
        title: tc.title || tc.testCaseDescription,
        description: tc.description || tc.testCaseDescription,
        preconditions: tc.preconditions,
        targetUrl: tc.targetUrl,
        steps: steps,
        priority: tc.priority || "medium",
        tags: tc.tags,
        status: "active",
        generatedByAI: false,
        metadata: {
          testCaseId: tc.testCaseId,
          module: tc.module,
          testScenario: tc.testScenario,
          testData: tc.testData,
          automation: tc.automation,
        },
      });

      importedCases.push(created);
    }

    res.status(201).json({
      message: `Successfully imported ${importedCases.length} test cases`,
      testCases: importedCases,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error importing test cases:", error);
    res.status(500).json({ error: "Failed to import test cases" });
  }
});
```

### **3. New Validation Endpoint**

**Endpoint**: `POST /api/test-cases/validate`

```typescript
import { TestCaseValidator } from "./test-case-validation";

app.post("/api/test-cases/validate", async (req: Request, res: Response) => {
  try {
    const { testCases } = req.body;
    
    if (!Array.isArray(testCases)) {
      return res.status(400).json({ error: "testCases must be an array" });
    }

    const batchResult = TestCaseValidator.validateBatch(testCases);

    res.json({
      summary: {
        total: batchResult.totalCases,
        valid: batchResult.validCases,
        invalid: batchResult.invalidCases,
      },
      results: batchResult.results.map(r => ({
        testCaseId: r.testCaseId,
        isValid: r.validation.isValid,
        errors: r.validation.errors,
        warnings: r.validation.warnings,
        suggestions: r.validation.normalizedTestCase
          ? "Test case is well-formed"
          : "Please review validation errors above",
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
```

### **4. New NLP Parsing Endpoint**

**Endpoint**: `POST /api/test-cases/parse-steps`

```typescript
import { TestCaseNLPParser } from "./test-case-nlp-parser";

app.post("/api/test-cases/parse-steps", async (req: Request, res: Response) => {
  try {
    const { steps, useAI = true } = req.body;
    
    if (!Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({ error: "steps must be a non-empty array" });
    }

    let parseResult;
    if (useAI) {
      try {
        parseResult = await TestCaseNLPParser.parseStepsWithAI(steps);
      } catch {
        console.warn("AI parsing failed, falling back to rule-based");
        parseResult = TestCaseNLPParser.parseStepsRuleBased(steps);
      }
    } else {
      parseResult = TestCaseNLPParser.parseStepsRuleBased(steps);
    }

    // Also extract placeholders
    const placeholders = TestCaseNLPParser.extractPlaceholders(parseResult.parsedSteps);
    const locators = [];
    steps.forEach(step => {
      locators.push(...TestCaseNLPParser.extractElementLocators(step));
    });

    res.json({
      parseResult,
      extractedPlaceholders: placeholders,
      detectedLocators: locators,
      readyForMapping: parseResult.errors.length === 0,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
```

### **5. Enhanced Generate Script Endpoint**

**Endpoint**: `POST /api/generate-script` (Enhanced)

```typescript
import { TestCaseMappingEngine } from "./test-case-mapping-engine";

app.post("/api/generate-script", async (req: Request, res: Response) => {
  try {
    const validation = validateBody(generateScriptSchema, req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error });
    }
    
    const { testCaseId, framework, language } = validation.data;
    const testCase = await storage.getTestCase(testCaseId);
    
    if (!testCase) {
      return res.status(404).json({ error: "Test case not found" });
    }

    // 1. Map steps to framework commands
    const mappingContext = {
      framework,
      language,
      baseUrl: testCase.targetUrl,
      timeout: 30000,
    };

    const code = TestCaseMappingEngine.generateScript(
      testCase.steps || [],
      mappingContext,
      testCaseId,
      testCase.title
    );

    // 2. Save generated script
    const script = await storage.createScript({
      testCaseId,
      name: `${testCase.title} - ${framework}`,
      framework,
      language,
      code,
    });

    res.json({
      code,
      script,
      generatedBy: "ai",
      framework,
      language,
      ready: true,
    });
  } catch (error: any) {
    console.error("Error generating script:", error);
    res.status(500).json({ error: "Failed to generate script" });
  }
});
```

## 🧪 Usage Example

### **Full Flow: Upload → Import → Generate → Execute**

1. **Upload Excel**:
   ```bash
   curl -F "file=@testcases.xlsx" http://localhost:5000/api/upload/parse-excel
   ```

2. **Validate**:
   ```bash
   curl -X POST http://localhost:5000/api/test-cases/validate \
     -H "Content-Type: application/json" \
     -d '{"testCases": [...]}'
   ```

3. **Import**:
   ```bash
   curl -X POST http://localhost:5000/api/test-cases/import \
     -H "Content-Type: application/json" \
     -d '{"suiteId": "suite-1", "testCases": [...]}'
   ```

4. **Parse Steps** (Optional):
   ```bash
   curl -X POST http://localhost:5000/api/test-cases/parse-steps \
     -H "Content-Type: application/json" \
     -d '{"steps": ["Click Login button", "Enter password"], "useAI": true}'
   ```

5. **Generate Scripts**:
   ```bash
   curl -X POST http://localhost:5000/api/generate-script \
     -H "Content-Type: application/json" \
     -d '{"testCaseId": "tc-123", "framework": "playwright", "language": "typescript"}'
   ```

6. **Execute**:
   ```bash
   curl -X POST http://localhost:5000/api/executions \
     -H "Content-Type: application/json" \
     -d '{"suiteId": "suite-1", "targetUrl": "https://app.example.com", "framework": "playwright"}'
   ```

## 📊 Database Schema Updates

### **Test Case Table** (Enhanced)

Add new columns to store standardized metadata:

```sql
ALTER TABLE test_cases ADD COLUMN (
  test_case_id VARCHAR(100) UNIQUE,
  module VARCHAR(255),
  test_scenario TEXT,
  automation VARCHAR(10),
  metadata JSON
);
```

### **Test Data Pool** (For storing reusable test data)

```sql
CREATE TABLE test_data_pools (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  data JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 🔍 Error Handling

### **Validation Errors**
- Return with 400 status
- Include field path and specific error message
- Suggest corrections

### **AI Parsing Failures**
- Gracefully fall back to rule-based parsing
- Log the failure for debugging
- Return with warnings

### **Mapping Failures**
- Check if framework/language combination is supported
- Return partial script with explanations

## 📈 Monitoring & Metrics

Track these metrics:

```typescript
interface UploadMetrics {
  totalFilesUploaded: number;
  totalTestCasesImported: number;
  validationSuccessRate: number; // %
  aiParsingSuccessRate: number; // %
  averageParsingTime: number; // ms
  averageScriptGenerationTime: number; // ms
  frameworkPreferences: Record<string, number>;
  languagePreferences: Record<string, number>;
}
```

---

## ✅ Implementation Checklist

- [ ] Add three new TypeScript modules
- [ ] Update routes with new endpoints
- [ ] Add validation in upload flow
- [ ] Add NLP parsing option
- [ ] Add mapping engine for script generation
- [ ] Update database schema
- [ ] Add test data for validation
- [ ] Document standard template
- [ ] Create UI components for validation feedback
- [ ] Add monitoring/metrics
- [ ] Test end-to-end flow
- [ ] Deploy and monitor
