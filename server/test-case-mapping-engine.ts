/**
 * Test Case Mapping Engine - AITAS
 * Maps standardized test steps to automation framework commands (Playwright, Selenium, etc.)
 */

import { ParsedStep } from "./test-case-nlp-parser";

// ================================================================================
// TYPES
// ================================================================================

export interface AutomationCommand {
  framework: "playwright" | "selenium" | "cypress" | "puppeteer";
  language: "typescript" | "javascript" | "python" | "java" | "csharp";
  code: string;
  imports?: string[];
  explanation: string;
}

export interface MappingContext {
  framework: "playwright" | "selenium" | "cypress" | "puppeteer";
  language: "typescript" | "javascript" | "python" | "java" | "csharp";
  baseUrl?: string;
  timeout?: number; // milliseconds
  implicitWait?: number;
}

// ================================================================================
// ACTION TO COMMAND MAPPERS
// ================================================================================

class PlaywrightMapper {
  static map(step: ParsedStep, context: MappingContext): AutomationCommand {
    const code = this.generateCommand(step);
    
    return {
      framework: "playwright",
      language: context.language,
      code,
      imports: this.getImports(context.language),
      explanation: this.getExplanation(step),
    };
  }

  private static generateCommand(step: ParsedStep): string {
    switch (step.action) {
      case "Navigate":
        return `await page.goto('${step.input || 'about:blank'}');`;

      case "Click":
        return `await page.click('${step.target}');`;

      case "Enter":
        return `await page.fill('${step.target}', '${step.input || ''}');`;

      case "Select":
        return `await page.selectOption('${step.target}', '${step.input || ''}');`;

      case "Verify":
        return `await expect(page.locator('${step.target}')).toBeVisible();`;

      case "Wait":
        return `await page.waitForTimeout(${step.input || '1000'});`;

      case "Scroll":
        return `await page.evaluate(() => window.scrollBy(0, window.innerHeight));`;

      case "Hover":
        return `await page.hover('${step.target}');`;

      case "DoubleClick":
        return `await page.dblclick('${step.target}');`;

      case "RightClick":
        return `await page.click('${step.target}', { button: 'right' });`;

      case "Clear":
        return `await page.fill('${step.target}', '');`;

      case "Submit":
        return `await page.press('${step.target}', 'Enter');`;

      case "CheckText":
        return `await expect(page.locator('${step.target}')).toContainText('${step.input || ''}');`;

      case "CheckElement":
        return `await expect(page.locator('${step.target}')).toHaveCount(${step.input || '1'});`;

      case "Upload":
        return `await page.locator('${step.target}').setInputFiles('${step.input || 'file.txt'}');`;

      case "Close":
        return `await page.close();`;

      case "Capture":
        return `await page.screenshot({ path: '${step.input || 'screenshot.png'}' });`;

      case "Accept":
        return `page.once('dialog', dialog => dialog.accept());`;

      default:
        return `// Action ${step.action} not mapped`;
    }
  }

  private static getImports(_language: string): string[] {
    return [
      "import { test, expect } from '@playwright/test';",
      "import { Page } from '@playwright/test';",
    ];
  }

  private static getExplanation(step: ParsedStep): string {
    return `${step.action}: ${step.expectedResult}`;
  }
}

class SeleniumMapper {
  static map(step: ParsedStep, context: MappingContext): AutomationCommand {
    const language = context.language;
    const code = this.generateCommand(step, language);

    return {
      framework: "selenium",
      language,
      code,
      imports: this.getImports(language),
      explanation: this.getExplanation(step),
    };
  }

  private static generateCommand(step: ParsedStep, language: string): string {
    const target = step.target ? `"${step.target}"` : "''";
    const input = step.input ? `"${step.input}"` : "''";

    if (language === "python") {
      switch (step.action) {
        case "Navigate":
          return `driver.get('${step.input || 'about:blank'}')`;
        case "Click":
          return `driver.find_element(By.CSS_SELECTOR, ${target}).click()`;
        case "Enter":
          return `driver.find_element(By.CSS_SELECTOR, ${target}).send_keys(${input})`;
        case "Select":
          return `Select(driver.find_element(By.CSS_SELECTOR, ${target})).select_by_value(${input})`;
        case "Verify":
          return `assert driver.find_element(By.CSS_SELECTOR, ${target}).is_displayed()`;
        case "Wait":
          return `time.sleep(${step.input || '1'})`;
        case "CheckText":
          return `assert ${input} in driver.find_element(By.CSS_SELECTOR, ${target}).text`;
        default:
          return `# Action ${step.action} not implemented`;
      }
    } else if (language === "java") {
      switch (step.action) {
        case "Navigate":
          return `driver.get("${step.input || 'about:blank'}");`;
        case "Click":
          return `driver.findElement(By.cssSelector(${target})).click();`;
        case "Enter":
          return `driver.findElement(By.cssSelector(${target})).sendKeys(${input});`;
        case "Verify":
          return `assert driver.findElement(By.cssSelector(${target})).isDisplayed();`;
        case "Wait":
          return `Thread.sleep(${step.input || '1000'});`;
        default:
          return `// Action ${step.action} not implemented`;
      }
    } else {
      // JavaScript/TypeScript
      switch (step.action) {
        case "Navigate":
          return `await driver.get('${step.input || 'about:blank'}');`;
        case "Click":
          return `await driver.findElement(By.css(${target})).click();`;
        case "Enter":
          return `await driver.findElement(By.css(${target})).sendKeys(${input});`;
        case "Verify":
          return `const el = await driver.findElement(By.css(${target}));\nconst isDisplayed = await el.isDisplayed();\nassert(isDisplayed, 'Element not displayed');`;
        default:
          return `// Action ${step.action} not implemented`;
      }
    }
  }

  private static getImports(language: string): string[] {
    if (language === "python") {
      return [
        "from selenium import webdriver",
        "from selenium.webdriver.common.by import By",
        "from selenium.webdriver.support.ui import Select",
        "import time",
      ];
    } else if (language === "java") {
      return [
        "import org.openqa.selenium.WebDriver;",
        "import org.openqa.selenium.By;",
        "import org.openqa.selenium.WebElement;",
      ];
    } else {
      return [
        "const { Builder, By, until } = require('selenium-webdriver');",
        "const assert = require('assert');",
      ];
    }
  }

  private static getExplanation(step: ParsedStep): string {
    return `${step.action}: ${step.expectedResult}`;
  }
}

class CypressMapper {
  static map(step: ParsedStep, _context: MappingContext): AutomationCommand {
    const code = this.generateCommand(step);

    return {
      framework: "cypress",
      language: "javascript",
      code,
      imports: [],
      explanation: this.getExplanation(step),
    };
  }

  private static generateCommand(step: ParsedStep): string {
    switch (step.action) {
      case "Navigate":
        return `cy.visit('${step.input || '/'}');`;
      case "Click":
        return `cy.get('${step.target}').click();`;
      case "Enter":
        return `cy.get('${step.target}').type('${step.input || ''}');`;
      case "Select":
        return `cy.get('${step.target}').select('${step.input || ''}');`;
      case "Verify":
        return `cy.get('${step.target}').should('be.visible');`;
      case "Wait":
        return `cy.wait(${step.input || '1000'});`;
      case "CheckText":
        return `cy.get('${step.target}').should('contain', '${step.input || ''}');`;
      default:
        return `// Action ${step.action} not mapped`;
    }
  }

  private static getExplanation(step: ParsedStep): string {
    return `${step.action}: ${step.expectedResult}`;
  }
}

class PuppeteerMapper {
  static map(step: ParsedStep, _context: MappingContext): AutomationCommand {
    const code = this.generateCommand(step);

    return {
      framework: "puppeteer",
      language: "javascript",
      code,
      imports: ["const puppeteer = require('puppeteer');"],
      explanation: this.getExplanation(step),
    };
  }

  private static generateCommand(step: ParsedStep): string {
    switch (step.action) {
      case "Navigate":
        return `await page.goto('${step.input || 'about:blank'}');`;
      case "Click":
        return `await page.click('${step.target}');`;
      case "Enter":
        return `await page.type('${step.target}', '${step.input || ''}');`;
      case "Verify":
        return `const el = await page.$('${step.target}');\nassert(el !== null, 'Element not found');`;
      case "Wait":
        return `await page.waitForTimeout(${step.input || '1000'});`;
      case "CheckText":
        return `const text = await page.$eval('${step.target}', el => el.textContent);\nassert(text.includes('${step.input || ''}'));`;
      case "Capture":
        return `await page.screenshot({path: '${step.input || 'screenshot.png'}'});`;
      default:
        return `// Action ${step.action} not mapped`;
    }
  }

  private static getExplanation(step: ParsedStep): string {
    return `${step.action}: ${step.expectedResult}`;
  }
}

// ================================================================================
// MAIN MAPPING ENGINE
// ================================================================================

export class TestCaseMappingEngine {
  /**
   * Map a single step to automation command
   */
  static mapStep(step: ParsedStep, context: MappingContext): AutomationCommand {
    switch (context.framework) {
      case "playwright":
        return PlaywrightMapper.map(step, context);
      case "selenium":
        return SeleniumMapper.map(step, context);
      case "cypress":
        return CypressMapper.map(step, context);
      case "puppeteer":
        return PuppeteerMapper.map(step, context);
      default:
        return {
          framework: context.framework,
          language: context.language,
          code: `// Framework ${context.framework} not supported`,
          explanation: "Unsupported framework",
        };
    }
  }

  /**
   * Map all steps in a test case
   */
  static mapSteps(steps: ParsedStep[], context: MappingContext): AutomationCommand[] {
    return steps.map(step => this.mapStep(step, context));
  }

  /**
   * Generate complete test script from mapped commands
   */
  static generateScript(
    steps: ParsedStep[],
    context: MappingContext,
    testCaseId: string,
    testCaseTitle: string
  ): string {
    const mappedCommands = this.mapSteps(steps, context);
    const imports = new Set<string>();
    
    mappedCommands.forEach(cmd => {
      cmd.imports?.forEach(imp => imports.add(imp));
    });

    const commandCode = mappedCommands.map(cmd => cmd.code).join("\n  ");

    // Generate based on framework/language
    if (context.framework === "playwright") {
      return this.generatePlaywrightScript(
        testCaseId,
        testCaseTitle,
        Array.from(imports),
        commandCode,
        context.language
      );
    } else if (context.framework === "selenium") {
      return this.generateSeleniumScript(
        testCaseId,
        testCaseTitle,
        Array.from(imports),
        commandCode,
        context.language
      );
    } else if (context.framework === "cypress") {
      return this.generateCypressScript(testCaseId, testCaseTitle, commandCode);
    } else {
      return commandCode;
    }
  }

  private static generatePlaywrightScript(
    testCaseId: string,
    testCaseTitle: string,
    imports: string[],
    commandCode: string,
    language: string
  ): string {
    if (language === "typescript") {
      return `import { test, expect, Page } from '@playwright/test';

/**
 * Test Case: ${testCaseId}
 * Title: ${testCaseTitle}
 * Generated by AITAS
 */

test('${testCaseTitle} (${testCaseId})', async ({ page }) => {
  try {
    ${commandCode}
  } catch (error) {
    console.error('Test failed:', error);
    throw error;
  }
});`;
    } else {
      return `const { test, expect } = require('@playwright/test');

/**
 * Test Case: ${testCaseId}
 * Title: ${testCaseTitle}
 * Generated by AITAS
 */

test('${testCaseTitle} (${testCaseId})', async ({ page }) => {
  try {
    ${commandCode}
  } catch (error) {
    console.error('Test failed:', error);
    throw error;
  }
});`;
    }
  }

  private static generateSeleniumScript(
    testCaseId: string,
    testCaseTitle: string,
    imports: string[],
    commandCode: string,
    language: string
  ): string {
    if (language === "python") {
      return `from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select
import time

"""
Test Case: ${testCaseId}
Title: ${testCaseTitle}
Generated by AITAS
"""

def test_${testCaseId.toLowerCase().replace(/[^a-z0-9]/g, '_')}():
    driver = webdriver.Chrome()
    try:
        ${commandCode.split('\n').map(line => '        ' + line).join('\n')}
        print("Test passed!")
    finally:
        driver.quit()

if __name__ == "__main__":
    test_${testCaseId.toLowerCase().replace(/[^a-z0-9]/g, '_')}()`;
    } else if (language === "java") {
      return `import org.junit.Before;
import org.junit.After;
import org.junit.Test;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.By;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;

/**
 * Test Case: ${testCaseId}
 * Title: ${testCaseTitle}
 * Generated by AITAS
 */
public class ${testCaseId.replace(/-/g, '').replace(/_/g, '')} {
    private WebDriver driver;

    @Before
    public void setUp() {
        driver = new ChromeDriver();
    }

    @Test
    public void test${testCaseId.replace(/-/g, '').replace(/_/g, '')}() {
        ${commandCode.split('\n').map(line => '        ' + line).join('\n')}
    }

    @After
    public void tearDown() {
        driver.quit();
    }
}`;
    } else {
      return `// Selenium WebDriver - Node.js
const { Builder, By, until } = require('selenium-webdriver');
const assert = require('assert');

/*
 * Test Case: ${testCaseId}
 * Title: ${testCaseTitle}
 * Generated by AITAS
 */

async function test_${testCaseId.toLowerCase().replace(/[^a-z0-9]/g, '_')}() {
    let driver = await new Builder().forBrowser('chrome').build();
    try {
        ${commandCode.split('\n').map(line => '        ' + line).join('\n')}
        console.log('Test passed!');
    } finally {
        await driver.quit();
    }
}

test_${testCaseId.toLowerCase().replace(/[^a-z0-9]/g, '_')}().catch(console.error);`;
    }
  }

  private static generateCypressScript(
    testCaseId: string,
    testCaseTitle: string,
    commandCode: string
  ): string {
    return `/**
 * Test Case: ${testCaseId}
 * Title: ${testCaseTitle}
 * Generated by AITAS
 */

describe('${testCaseTitle}', () => {
  it('${testCaseId}', () => {
    ${commandCode.split('\n').map(line => '    ' + line).join('\n')}
  });
});`;
  }
}
