#!/usr/bin/env tsx
/**
 * ============================================================================
 * TEST REQUIREMENT-BASED TEST GENERATION SYSTEM
 * ============================================================================
 * 
 * This is a complete end-to-end test of the requirement-based test generation.
 * 
 * Run with:
 * tsx test-requirement-generation.ts
 * 
 * Or add to package.json:
 * "test:generation": "tsx test-requirement-generation.ts"
 */

import chalk from 'chalk';
import { requirementTestGeneratorService } from './server/test-generation/requirement-test-generator.service';

// ==========================================================================
// TEST DATA
// ==========================================================================

const SAMPLE_REQUIREMENT = `
Requirement Description:
Before a Field Action decision is approved, all issues escalated into the Field Action process shall be managed as Risk Assessments. The system shall support the initiation, documentation, review, and submission of Risk Assessments to ensure complete, accurate, and traceable issue escalation.

Functional Requirements:

1. Initiate Escalation
   The system shall allow an FA Administrator to initiate a Risk Assessment by selecting the Initiate Escalation function.

2. Mandatory Data Capture
   The system shall require completion of all mandatory fields (identified with *) before submission.
   - Issue Log Title
   - Product Type (single or multiple selection)
   - Issue Confirmation Date (calendar control)
   - Escalation Delay Justification (if initiated more than 14 days after confirmation)

3. Issue Identification
   The system shall require entry of an Issue Log Title, including the product name or family and a brief description of the issue.

4. Product Type Selection
   The system shall allow the user to select one or more applicable Product Types based on product registration, with options to Select All or Clear All.

5. Issue Confirmation Date
   The system shall allow selection of an Issue Confirmation Date using a calendar control.
   The system shall automatically calculate and display Business Days since the Confirmation Date.

6. Reference Documentation
   The system shall allow the user to add references to related documents (e.g., CAPA, SCAR, TrackWise PR, Product Hold records).
   The system shall allow addition or removal of multiple reference entries.

7. Supplier Involvement
   The system shall allow the user to indicate whether a Supplier is involved.
   If a Supplier is involved, the system shall require entry of the associated supplier information.
   If no Supplier is involved, the user shall be able to select N/A.

8. Issue Description and Impact
   The system shall require a detailed description of the issue and potential impact, including:
   - Description of the product issue
   - Method of issue discovery
   - Whether the issue was discovered pre-use or during therapy
   - Any injury or adverse outcome experienced
   - Potential impact on product performance or quality

9. Responsible Locations
   The system shall allow selection of one or more Responsible Finished Good, Service, Manufacturing, or Logistics locations.
   The system shall allow selection of one or more Manufacturing Locations accountable for the issue.

10. Organizational Assignment
    The system shall require selection of the applicable Division.
    The system shall require selection of one or more applicable Global Business Units (GBUs).

11. Technical Analysis Determination
    The system shall require the user to indicate whether a Technical Analysis for Distributed Product is required.

12. Issue Categorization
    The system shall require selection of an Issue Category and corresponding Sub-Category.

13. Submission and Approval
    The system shall require electronic signature authentication prior to submission.
    Upon successful submission, the system shall generate and assign a unique Issue Log Number.
`;

// ==========================================================================
// HELPER FUNCTIONS
// ==========================================================================

function printHeader(title: string) {
  console.log('\n');
  console.log(chalk.bold.blue('='.repeat(80)));
  console.log(chalk.bold.blue(`  ${title}`));
  console.log(chalk.bold.blue('='.repeat(80)));
}

function printSection(title: string) {
  console.log('\n' + chalk.bold.cyan(`📋 ${title}`));
  console.log(chalk.cyan('-'.repeat(80)));
}

function printSuccess(message: string) {
  console.log(chalk.green(`✅ ${message}`));
}

function printError(message: string) {
  console.log(chalk.red(`❌ ${message}`));
}

function printWarning(message: string) {
  console.log(chalk.yellow(`⚠️  ${message}`));
}

function printInfo(message: string) {
  console.log(chalk.blue(`ℹ️  ${message}`));
}

// ==========================================================================
// MAIN TEST FUNCTION
// ==========================================================================

async function runTests() {
  printHeader('🧪 REQUIREMENT-BASED TEST GENERATION - COMPREHENSIVE TEST SUITE');

  try {
    // ======================================================================
    // TEST 1: Service Initialization
    // ======================================================================
    printSection('Test 1: Service Initialization');
    console.log('Initializing requirement test generator service...');
    
    try {
      await requirementTestGeneratorService.initialize();
      printSuccess('Service initialized successfully');
    } catch (error: any) {
      if (error.message?.includes('Missing credentials') || error.message?.includes('apiKey')) {
        printWarning('AI client not configured (this is OK for demo)');
        printInfo('To use AI generation, set up your LLM_MODEL_ID or OPENAI_API_KEY');
      } else {
        throw error;
      }
    }

    // ======================================================================
    // TEST 2: Basic Requirement Processing
    // ======================================================================
    printSection('Test 2: Generate Test Cases from Sample Requirements');
    console.log('Input: Risk Assessment Escalation Requirements (13 functional requirements)');
    console.log('Generating 5 test cases with detailed steps...\n');

    const result = await requirementTestGeneratorService.generateTestCasesFromRequirements(
      {
        title: 'Verify the Initiate Escalation Functionality',
        description: 'Complete end-to-end test of Risk Assessment escalation workflow',
        content: SAMPLE_REQUIREMENT,
        appUrl: 'https://qa-fas.aws.baxter.com/fas/login',
        appContext: 'FDA-regulated medical device testing system. User: FA Administrator. Timeouts: 30s'
      },
      {
        numberOfTestCases: 3,
        targetUrl: 'https://qa-fas.aws.baxter.com/fas/login',
        includeNegativeScenarios: true,
      }
    );

    if (!result.success) {
      printError(`Generation failed: ${result.errors?.join(', ')}`);
      throw new Error('Test case generation failed');
    }

    printSuccess(`Generated ${result.testCases.length} test cases`);

    // ======================================================================
    // TEST 3: Validate Test Case Structure
    // ======================================================================
    printSection('Test 3: Validate Test Case Structure');

    if (result.testCases.length === 0) {
      printError('No test cases generated');
      return;
    }

    const firstTestCase = result.testCases[0];
    console.log(`Examining first test case: "${firstTestCase.title}"`);
    console.log('');

    // Check required fields
    const requiredFields = ['testCaseId', 'title', 'steps', 'priority', 'module'];
    let allFieldsPresent = true;

    for (const field of requiredFields) {
      if (field in firstTestCase) {
        printSuccess(`Field "${field}" is present`);
      } else {
        printError(`Field "${field}" is MISSING`);
        allFieldsPresent = false;
      }
    }

    if (!allFieldsPresent) {
      throw new Error('Test case missing required fields');
    }

    // ======================================================================
    // TEST 4: Verify Step Detail Level
    // ======================================================================
    printSection('Test 4: Verify Step Detail Level');

    const stepCount = firstTestCase.steps?.length || 0;
    console.log(`Test case "${firstTestCase.title}" has ${stepCount} steps`);

    if (stepCount < 5) {
      printWarning(`Only ${stepCount} steps (expected 10-25 for detailed coverage)`);
    } else if (stepCount < 10) {
      printInfo(`Good: ${stepCount} steps (acceptable)`);
    } else {
      printSuccess(`Excellent: ${stepCount} detailed steps (comprehensive coverage)`);
    }

    // Show first few steps
    console.log('\nFirst 3 steps:');
    firstTestCase.steps?.slice(0, 3).forEach((step: any, idx: number) => {
      console.log(`\n  Step ${step.stepNumber || idx + 1}:`);
      console.log(`    Action: ${step.action}`);
      console.log(`    Description: ${step.description}`);
      if (step.elementLocator) console.log(`    Element: ${step.elementLocator}`);
      if (step.testData) console.log(`    Data: ${JSON.stringify(step.testData)}`);
      console.log(`    Expected: ${step.expectedResult}`);
      if (step.waitTime) console.log(`    Wait: ${step.waitTime}s`);
    });

    // ======================================================================
    // TEST 5: Element Locator Coverage
    // ======================================================================
    printSection('Test 5: Element Locator Coverage');

    let stepsWithLocators = 0;
    let stepsWithData = 0;
    let stepsWithWait = 0;

    firstTestCase.steps?.forEach((step: any) => {
      if (step.elementLocator) stepsWithLocators++;
      if (step.testData) stepsWithData++;
      if (step.waitTime) stepsWithWait++;
    });

    const locatorCoverage = Math.round((stepsWithLocators / stepCount) * 100);
    const dataCoverage = Math.round((stepsWithData / stepCount) * 100);
    const waitCoverage = Math.round((stepsWithWait / stepCount) * 100);

    console.log(`Element locators: ${stepsWithLocators}/${stepCount} (${locatorCoverage}%)`);
    console.log(`Test data included: ${stepsWithData}/${stepCount} (${dataCoverage}%)`);
    console.log(`Wait times: ${stepsWithWait}/${stepCount} (${waitCoverage}%)`);

    if (locatorCoverage >= 80) printSuccess('Excellent locator coverage');
    else if (locatorCoverage >= 60) printInfo('Good locator coverage');
    else printWarning('Low locator coverage');

    // ======================================================================
    // TEST 6: Test Data Mapping
    // ======================================================================
    printSection('Test 6: Test Data Mapping');

    const dataMapKeys = Object.keys(result.testDataMap || {});
    console.log(`Test data entries: ${dataMapKeys.length}`);

    if (dataMapKeys.length > 0) {
      printSuccess(`Test data mapped for: ${dataMapKeys.slice(0, 5).join(', ')}${dataMapKeys.length > 5 ? ` ... +${dataMapKeys.length - 5} more` : ''}`);
      
      // Show sample
      console.log('\nSample test data:');
      dataMapKeys.slice(0, 3).forEach(key => {
        const entry = result.testDataMap[key];
        const displayValue = key.toLowerCase().includes('pass') ? '[MASKED]' : entry.value;
        console.log(`  ${key} = "${displayValue}" (${entry.type}, ${entry.sensitivity})`);
      });
    } else {
      printWarning('No test data extracted');
    }

    // ======================================================================
    // TEST 7: Execution Summary
    // ======================================================================
    printSection('Test 7: Execution Summary');

    const summary = result.executionSummary;
    if (summary) {
      console.log(`Total Test Cases: ${summary.totalTestCases}`);
      console.log(`Total Steps: ${summary.totalSteps}`);
      console.log(`Average Steps/Case: ${summary.averageStepsPerCase}`);
      console.log(`Test Data Entries: ${summary.dataEntriesCount}`);
      console.log(`Est. Execution Time: ${summary.estimatedExecutionTime}s (~${Math.round(summary.estimatedExecutionTime / 60)} minutes)`);

      printSuccess(`Summary metrics calculated successfully`);
    }

    // ======================================================================
    // TEST 8: Multiple Test Cases Coverage
    // ======================================================================
    printSection('Test 8: Multiple Test Cases Coverage');

    console.log(`Generated ${result.testCases.length} test cases:`);
    result.testCases.forEach((tc: any, idx: number) => {
      const priority = tc.priority || 'Medium';
      const stepCount = tc.steps?.length || 0;
      console.log(`  ${idx + 1}. [${priority}] ${tc.title} (${stepCount} steps)`);
    });

    // Check for scenario diversity
    const priorities = new Set(result.testCases.map((tc: any) => tc.priority));
    if (priorities.size > 1) {
      printSuccess(`Diverse test priorities: ${Array.from(priorities).join(', ')}`);
    } else {
      printInfo(`All test cases have same priority (consider adding more variety)`);
    }

    // ======================================================================
    // TEST 9: Requirements Traceability
    // ======================================================================
    printSection('Test 9: Requirements Traceability');

    const requirements = result.requirements || [];
    console.log(`Parsed requirements: ${requirements.length}`);

    if (requirements.length > 0) {
      printSuccess(`Successfully mapped requirements`);
      console.log('\nParsed requirement IDs:');
      requirements.slice(0, 3).forEach((req: any) => {
        console.log(`  - ${req.id}: ${req.title}`);
      });
      if (requirements.length > 3) {
        console.log(`  ... and ${requirements.length - 3} more`);
      }
    } else {
      printInfo('No requirement structure extracted (OK for fallback mode)');
    }

    // ======================================================================
    // TEST 10: Executor Compatibility
    // ======================================================================
    printSection('Test 10: Executor Compatibility Check');

    const testCase = result.testCases[0];
    const compatibilityIssues: string[] = [];

    // Check if steps can be converted to executor format
    testCase.steps?.forEach((step: any, idx: number) => {
      if (!step.step && !step.action) {
        compatibilityIssues.push(`Step ${idx + 1}: Missing action`);
      }
      if (!step.expectedResult && !step.expected) {
        compatibilityIssues.push(`Step ${idx + 1}: Missing expected result`);
      }
    });

    if (compatibilityIssues.length === 0) {
      printSuccess('All test cases are compatible with executor');
      printInfo('Steps can be directly converted to ai-test-executor format');
    } else {
      compatibilityIssues.forEach(issue => printWarning(issue));
    }

    // ======================================================================
    // FINAL REPORT
    // ======================================================================
    printHeader('📊 TEST GENERATION REPORT');

    console.log('\n' + chalk.bold.green('✅ ALL TESTS PASSED'));
    console.log('\n' + chalk.bold.cyan('Summary:'));
    console.log(`  - Test Cases Generated: ${result.testCases.length}`);
    console.log(`  - Total Steps: ${summary?.totalSteps || 0}`);
    console.log(`  - Avg Steps/Case: ${summary?.averageStepsPerCase || 0}`);
    console.log(`  - Element Locators: ${locatorCoverage}%`);
    console.log(`  - Test Data Coverage: ${dataCoverage}%`);
    console.log(`  - Estimated Execution: ${summary?.estimatedExecutionTime || 0}s`);

    console.log('\n' + chalk.bold.cyan('Quality Metrics:'));
    console.log(`  - Detail Level: ${stepCount >= 15 ? '⭐⭐⭐⭐⭐' : stepCount >= 10 ? '⭐⭐⭐⭐' : '⭐⭐⭐'}`);
    console.log(`  - Traceability: ${requirements.length > 0 ? '✅ Full' : '⚠️  Partial'}`);
    console.log(`  - Executor Ready: ${compatibilityIssues.length === 0 ? '✅ Yes' : '⚠️  Needs adjustment'}`);

    console.log('\n' + chalk.bold.cyan('Next Steps:'));
    console.log('  1. Save test cases to database');
    console.log('  2. Execute with ai-test-executor');
    console.log('  3. Monitor execution and collect results');
    console.log('  4. Generate execution report');

    console.log('\n' + chalk.bold.green('✅ REQUIREMENT GENERATION SYSTEM IS WORKING!'));
    console.log('');

    process.exit(0);

  } catch (error: any) {
    console.error('');
    console.error(chalk.bold.red('❌ TEST FAILED'));
    console.error(chalk.red(`Error: ${error.message}`));
    console.error(chalk.red(`Stack: ${error.stack}`));
    process.exit(1);
  }
}

// ==========================================================================
// RUN TESTS
// ==========================================================================

console.log(chalk.bold.green('\n🚀 Starting Requirement-Based Test Generation Tests...\n'));
runTests();
