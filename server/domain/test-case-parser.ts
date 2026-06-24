/**
 * Test Case Parser - Properly extracts structured test steps
 * Fixes the issue of mixed Title/Step/Expected data
 */

export interface ParsedStep {
  action: string;           // navigate, input, click, verify, etc
  value?: string;           // URL, text to enter, etc
  expectedResult: string;   // What should happen
  description: string;      // Human readable
}

export class TestCaseParser {
  /**
   * Parse test step text and extract structured action
   */
  static parseStep(stepText: string, expectedText: string): ParsedStep {
    const step = stepText.trim().toLowerCase();
    const expected = expectedText.trim();

    console.log(`[Parser] Parsing step: "${step}"`);
    console.log(`[Parser] Expected: "${expected}"`);

    // Pattern 1: Navigate to URL
    const navMatch = step.match(/navigate\s+to\s+url\s*=?\s*(.+)/i) ||
                     step.match(/go\s+to\s+(.https?:\/\/.+)/i) ||
                     step.match(/launch\s+(.https?:\/\/.+)/i);
    if (navMatch) {
      const url = navMatch[1].trim().replace(/["']|^\s+|\s+$/g, '');
      return {
        action: "navigate",
        value: url,
        expectedResult: expected || "URL launched successfully",
        description: `Navigate to ${url}`,
      };
    }

    // Pattern 2: Scroll
    const scrollMatch = step.match(/scroll\s+(up|down|left|right)/i);
    if (scrollMatch) {
      const direction = scrollMatch[1].toLowerCase();
      return {
        action: "scroll",
        value: direction,
        expectedResult: expected || `Scrolled ${direction} successfully`,
        description: `Scroll ${direction}`,
      };
    }

    // Pattern 3: Click button
    const clickMatch = step.match(/click\s+(?:the\s+)?(?:button\s+)?['"]?(.+?)['"]?(?:\s+button)?$/i) ||
                       step.match(/click\s+(.+)/i);
    if (clickMatch) {
      const buttonText = clickMatch[1].trim().replace(/['"]/g, '');
      return {
        action: "click",
        value: buttonText,
        expectedResult: expected || `${buttonText} clicked successfully`,
        description: `Click ${buttonText} button`,
      };
    }

    // Pattern 4: Enter/Type text
    const enterMatch = step.match(/(?:enter|type)\s+(?:text\s+)?['"]?(.+?)['"]?\s+(?:in|into)\s+(?:the\s+)?(.+)/i) ||
                       step.match(/(?:enter|type)\s+(.+?)\s*=\s*(.+)/i) ||
                       step.match(/(?:enter|type)\s+(.+)/i);
    if (enterMatch) {
      let value = "", field = "";
      
      if (enterMatch[2]) {
        // Two captures: value and field name
        value = enterMatch[1].trim();
        field = enterMatch[2].trim();
      } else {
        // Single capture: try to parse "fieldname=value"
        const parts = enterMatch[1].split('=');
        if (parts.length === 2) {
          field = parts[0].trim();
          value = parts[1].trim();
        } else {
          value = enterMatch[1].trim();
          field = "field";
        }
      }

      return {
        action: "input",
        value: value,
        expectedResult: expected || `${value} entered successfully`,
        description: `Enter ${value} in ${field}`,
      };
    }

    // Pattern 5: Select radio button
    const radioMatch = step.match(/select\s+(?:radio\s+)?button\s*=\s*(.+)/i) ||
                       step.match(/select\s+(.+?)\s+radio/i);
    if (radioMatch) {
      const option = radioMatch[1].trim();
      return {
        action: "select_radio",
        value: option,
        expectedResult: expected || `${option} radio button selected`,
        description: `Select radio button: ${option}`,
      };
    }

    // Pattern 6: Select from dropdown
    const selectMatch = step.match(/select\s+(.+?)\s+(?:from|in)\s+(.+)/i) ||
                        step.match(/select\s+(.+)/i);
    if (selectMatch) {
      const value = selectMatch[1].trim();
      const field = selectMatch[2]?.trim() || "field";
      return {
        action: "select",
        value: value,
        expectedResult: expected || `${value} selected successfully`,
        description: `Select ${value}`,
      };
    }

    // Pattern 7: Verify text/element
    const verifyMatch = step.match(/(?:verify|check)\s+(.+)/i);
    if (verifyMatch) {
      const toVerify = verifyMatch[1].trim();
      return {
        action: "verify",
        value: toVerify,
        expectedResult: expected || `${toVerify} verified successfully`,
        description: `Verify ${toVerify}`,
      };
    }

    // Pattern 8: Wait
    const waitMatch = step.match(/wait\s+(?:for\s+)?(.+)/i);
    if (waitMatch) {
      const waitFor = waitMatch[1].trim();
      return {
        action: "wait",
        value: waitFor,
        expectedResult: expected || `Waited for ${waitFor}`,
        description: `Wait for ${waitFor}`,
      };
    }

    // Pattern 9: Switch windows
    const switchMatch = step.match(/switch\s+(?:to\s+)?(?:new\s+)?window/i);
    if (switchMatch) {
      return {
        action: "switchWindow",
        expectedResult: expected || "Switched to new window successfully",
        description: "Switch to new window",
      };
    }

    // Default: treat as description
    return {
      action: "unknown",
      value: step,
      expectedResult: expected,
      description: step,
    };
  }

  /**
   * Extract field name and value from "fieldname=value" format
   */
  static extractFieldValue(text: string): { field: string; value: string } {
    const match = text.match(/([^=]+)=(.+)/);
    if (match) {
      return {
        field: match[1].trim().toLowerCase(),
        value: match[2].trim(),
      };
    }

    return {
      field: "unknown",
      value: text,
    };
  }

  /**
   * Extract URL from various formats
   */
  static extractUrl(text: string): string | null {
    const urlMatch = text.match(/(https?:\/\/[^\s"']+)/i);
    return urlMatch ? urlMatch[1] : null;
  }

  /**
   * Get locator for common field names
   */
  static getFieldLocator(fieldName: string): string {
    const field = fieldName.toLowerCase().replace(/\s+/g, '');

    const locators: Record<string, string> = {
      fullname: "//input[@name='fullName' or @id='fullName' or @placeholder='Full Name']",
      username: "//input[@name='username' or @id='username' or @placeholder='Username']",
      password: "//input[@name='password' or @id='password' or @placeholder='Password' or @type='password']",
      email: "//input[@name='email' or @id='email' or @placeholder='Email' or @type='email']",
      firstname: "//input[@name='firstName' or @id='firstName' or @placeholder='First Name']",
      lastname: "//input[@name='lastName' or @id='lastName' or @placeholder='Last Name']",
      phone: "//input[@name='phone' or @id='phone' or @placeholder='Phone']",
      search: "//input[@name='search' or @id='search' or @placeholder='Search']",
      submit: "//button[@type='submit' or contains(text(), 'Submit')]",
      login: "//button[contains(text(), 'Login') or contains(text(), 'Sign In')]",
      continue: "//button[contains(text(), 'Continue')]",
      next: "//button[contains(text(), 'Next')]",
      previous: "//button[contains(text(), 'Previous')]",
      cancel: "//button[contains(text(), 'Cancel')]",
      save: "//button[contains(text(), 'Save')]",
      delete: "//button[contains(text(), 'Delete')]",
    };

    return locators[field] || `//input[@name='${fieldName}' or @id='${fieldName}']`;
  }

  /**
   * Get locator for radio buttons
   */
  static getRadioButtonLocator(optionValue: string): string {
    const value = optionValue.toLowerCase().trim();
    return `//input[@type='radio' and @value='${value}'] | //label[contains(text(), '${optionValue}')]//input[@type='radio']`;
  }

  /**
   * Get locator for checkbox
   */
  static getCheckboxLocator(label: string): string {
    return `//input[@type='checkbox' and (@value='${label}' or following-sibling::label[contains(text(), '${label}')])]`;
  }

  /**
   * Get dropdown locator
   */
  static getDropdownLocator(dropdownName: string): string {
    return `//select[@name='${dropdownName}' or @id='${dropdownName}']`;
  }
}
