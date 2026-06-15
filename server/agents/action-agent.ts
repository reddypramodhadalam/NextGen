// ============================================================================
// AITAS Multi-Agent System — Action Agent
// Executes browser interactions using a 7-strategy selector waterfall
// Playwright-first with accessibility role as primary strategy
// ============================================================================

import type { Page, Frame, Locator } from 'playwright';
import type { ParsedAction, SemanticDOM, DOMElement } from './types.js';
import { memoryAgent } from './memory-agent.js';

export interface ActionResult {
  success: boolean;
  selectorUsed?: string;
  strategy?: string;
  error?: string;
  logs: string[];
  screenshot?: string;
}

export class ActionAgent {
  // ─── Main Execute Method ──────────────────────────────────────────────────

  async execute(
    page: Page,
    action: ParsedAction,
    dom: SemanticDOM,
    testData: Map<string, string>,
    logs: string[]
  ): Promise<ActionResult> {
    // Resolve test data placeholders in value
    const resolvedValue = action.value ? this.resolvePlaceholders(action.value, testData) : action.value;
    const resolvedAction = { ...action, value: resolvedValue };

    logs.push(`[Action] Executing: ${resolvedAction.type} | Target: "${resolvedAction.target || resolvedAction.url || ''}" | Value: "${resolvedAction.type === 'fill' && resolvedAction.target?.toLowerCase().includes('pass') ? '[MASKED]' : (resolvedValue || '')}"`);

    try {
      switch (resolvedAction.type) {
        case 'navigate':    return await this.doNavigate(page, resolvedAction, logs);
        case 'click':       return await this.doClick(page, resolvedAction, dom, logs);
        case 'fill':        return await this.doFill(page, resolvedAction, dom, logs, testData);
        case 'select':      return await this.doSelect(page, resolvedAction, dom, logs);
        case 'check':       return await this.doCheckbox(page, resolvedAction, dom, logs, true);
        case 'uncheck':     return await this.doCheckbox(page, resolvedAction, dom, logs, false);
        case 'hover':       return await this.doHover(page, resolvedAction, dom, logs);
        case 'scroll':      return await this.doScroll(page, resolvedAction, dom, logs);
        case 'press':       return await this.doPress(page, resolvedAction, logs);
        case 'wait':        return await this.doWait(page, resolvedAction, logs);
        case 'waitForText': return await this.doWaitForText(page, resolvedAction, logs);
        case 'waitForElement': return await this.doWaitForElement(page, resolvedAction, dom, logs);
        case 'switchIframe':   return await this.doSwitchIframe(page, resolvedAction, logs);
        case 'exitIframe':     return this.doExitIframe(logs);
        case 'switchWindow':   return await this.doSwitchWindow(page, resolvedAction, logs);
        case 'acceptAlert':    return await this.doAlert(page, 'accept', logs);
        case 'dismissAlert':   return await this.doAlert(page, 'dismiss', logs);
        case 'screenshot':     return await this.doScreenshot(page, logs);
        case 'verify':         return { success: true, logs, strategy: 'skip-verify-to-validation' };
        default:
          return { success: false, error: `Unknown action type: ${resolvedAction.type}`, logs };
      }
    } catch (err: any) {
      logs.push(`[Action] Error: ${err.message}`);
      return { success: false, error: err.message, logs };
    }
  }

  // ─── Navigate ─────────────────────────────────────────────────────────────

  private async doNavigate(page: Page, action: ParsedAction, logs: string[]): Promise<ActionResult> {
    const url = action.url || action.value || action.target || '';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(500);
    logs.push(`[Action] Navigated to: ${url}`);
    return { success: true, selectorUsed: url, strategy: 'navigate', logs };
  }

  // ─── Click ────────────────────────────────────────────────────────────────

  private async doClick(
    page: Page,
    action: ParsedAction,
    dom: SemanticDOM,
    logs: string[]
  ): Promise<ActionResult> {
    const target = action.target || '';
    const result = await this.resolveAndAct(page, target, dom, logs, async (locator, strategy) => {
      await locator.first().waitFor({ state: 'visible', timeout: 10000 });
      await locator.first().scrollIntoViewIfNeeded();
      await locator.first().click({ timeout: 10000 });
      await page.waitForTimeout(500); // Allow page to react
      logs.push(`[Action] ✓ Clicked "${target}" via ${strategy}`);
      return { success: true, strategy, logs, selectorUsed: target };
    });
    return result;
  }

  // ─── Fill ─────────────────────────────────────────────────────────────────

  private async doFill(
    page: Page,
    action: ParsedAction,
    dom: SemanticDOM,
    logs: string[],
    testData: Map<string, string>
  ): Promise<ActionResult> {
    const target = action.target || '';
    const value = action.value ?? '';

    if (!value && target) {
      // Try to infer value from test data based on target description
      const inferredValue = this.inferValueFromTarget(target, testData);
      if (inferredValue) {
        action = { ...action, value: inferredValue };
      }
    }

    const finalValue = action.value ?? '';
    const isPassword = target.toLowerCase().includes('password') || target.toLowerCase().includes('pass');
    logs.push(`[Action] Filling "${target}" with "${isPassword ? '[MASKED]' : finalValue}"`);

    return await this.resolveAndAct(page, target, dom, logs, async (locator, strategy) => {
      await locator.first().waitFor({ state: 'visible', timeout: 10000 });
      await locator.first().scrollIntoViewIfNeeded();
      await locator.first().click().catch(() => {});
      await locator.first().fill(finalValue, { timeout: 10000 });
      // Dispatch input events for React/Angular/Vue
      await locator.first().dispatchEvent('input');
      await locator.first().dispatchEvent('change');
      logs.push(`[Action] ✓ Filled "${target}" via ${strategy}`);
      return { success: true, strategy, logs, selectorUsed: target };
    }, 'input');
  }

  // ─── Select Dropdown ──────────────────────────────────────────────────────

  private async doSelect(
    page: Page,
    action: ParsedAction,
    dom: SemanticDOM,
    logs: string[]
  ): Promise<ActionResult> {
    const target = action.target || '';
    const value = action.value || '';

    return await this.resolveAndAct(page, target, dom, logs, async (locator, strategy) => {
      await locator.first().waitFor({ state: 'visible', timeout: 10000 });

      const tagName = await locator.first().evaluate(el => el.tagName.toLowerCase()).catch(() => 'div');

      if (tagName === 'select') {
        // Native HTML select
        try {
          await locator.first().selectOption({ label: value }, { timeout: 5000 });
        } catch {
          try {
            await locator.first().selectOption({ value }, { timeout: 5000 });
          } catch {
            await locator.first().selectOption(value, { timeout: 5000 });
          }
        }
      } else {
        // Custom dropdown: click to open, then find option
        await locator.first().click();
        await page.waitForTimeout(500);

        // Find option by text
        const optionLocator = page.getByRole('option', { name: new RegExp(value, 'i') })
          .or(page.locator(`[role="listbox"] [role="option"]:has-text("${value}")`)
          .or(page.locator(`li:has-text("${value}")`)));

        await optionLocator.first().click({ timeout: 5000 });
      }

      logs.push(`[Action] ✓ Selected "${value}" in "${target}" via ${strategy}`);
      return { success: true, strategy, logs, selectorUsed: target };
    }, 'select');
  }

  // ─── Checkbox ─────────────────────────────────────────────────────────────

  private async doCheckbox(
    page: Page,
    action: ParsedAction,
    dom: SemanticDOM,
    logs: string[],
    shouldBeChecked: boolean
  ): Promise<ActionResult> {
    const target = action.target || '';

    return await this.resolveAndAct(page, target, dom, logs, async (locator, strategy) => {
      await locator.first().waitFor({ state: 'visible', timeout: 10000 });
      const isChecked = await locator.first().isChecked().catch(() => false);

      if (isChecked !== shouldBeChecked) {
        await locator.first().click();
      }

      logs.push(`[Action] ✓ Checkbox "${target}" ${shouldBeChecked ? 'checked' : 'unchecked'} via ${strategy}`);
      return { success: true, strategy, logs, selectorUsed: target };
    }, 'checkbox');
  }

  // ─── Hover ────────────────────────────────────────────────────────────────

  private async doHover(
    page: Page,
    action: ParsedAction,
    dom: SemanticDOM,
    logs: string[]
  ): Promise<ActionResult> {
    const target = action.target || '';

    return await this.resolveAndAct(page, target, dom, logs, async (locator, strategy) => {
      await locator.first().scrollIntoViewIfNeeded();
      await locator.first().hover({ timeout: 10000 });
      await page.waitForTimeout(300);
      logs.push(`[Action] ✓ Hovered "${target}" via ${strategy}`);
      return { success: true, strategy, logs, selectorUsed: target };
    });
  }

  // ─── Scroll ───────────────────────────────────────────────────────────────

  private async doScroll(page: Page, action: ParsedAction, dom: SemanticDOM, logs: string[]): Promise<ActionResult> {
    const direction = (action.value || 'down').toLowerCase();

    try {
      if (direction === 'top') {
        await page.evaluate(() => window.scrollTo(0, 0));
      } else if (direction === 'bottom') {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      } else if (direction === 'up') {
        await page.evaluate(() => window.scrollBy(0, -400));
      } else if (direction === 'down') {
        await page.evaluate(() => window.scrollBy(0, 400));
      } else if (action.target) {
        // Scroll to element
        return await this.resolveAndAct(page, action.target, dom, logs, async (locator) => {
          await locator.first().scrollIntoViewIfNeeded();
          logs.push(`[Action] ✓ Scrolled to "${action.target}"`);
          return { success: true, logs };
        });
      }
      logs.push(`[Action] ✓ Scrolled ${direction}`);
      return { success: true, strategy: 'scroll', logs };
    } catch (err: any) {
      return { success: false, error: err.message, logs };
    }
  }

  // ─── Key Press ────────────────────────────────────────────────────────────

  private async doPress(page: Page, action: ParsedAction, logs: string[]): Promise<ActionResult> {
    const key = action.key || action.value || 'Enter';
    await page.keyboard.press(key);
    await page.waitForTimeout(300);
    logs.push(`[Action] ✓ Pressed key: ${key}`);
    return { success: true, strategy: 'keyboard', logs, selectorUsed: key };
  }

  // ─── Wait ─────────────────────────────────────────────────────────────────

  private async doWait(page: Page, action: ParsedAction, logs: string[]): Promise<ActionResult> {
    const ms = parseInt(action.value || '1000');
    await page.waitForTimeout(Math.min(ms, 30000)); // Cap at 30s
    logs.push(`[Action] ✓ Waited ${ms}ms`);
    return { success: true, strategy: 'wait', logs };
  }

  private async doWaitForText(page: Page, action: ParsedAction, logs: string[]): Promise<ActionResult> {
    const text = action.value || action.expected || '';
    await page.waitForSelector(`text=${text}`, { timeout: 30000 });
    logs.push(`[Action] ✓ Text appeared: "${text}"`);
    return { success: true, strategy: 'waitForText', logs };
  }

  private async doWaitForElement(page: Page, action: ParsedAction, dom: SemanticDOM, logs: string[]): Promise<ActionResult> {
    const target = action.target || '';
    return await this.resolveAndAct(page, target, dom, logs, async (locator, strategy) => {
      await locator.first().waitFor({ state: 'visible', timeout: 30000 });
      logs.push(`[Action] ✓ Element appeared: "${target}"`);
      return { success: true, strategy, logs };
    });
  }

  // ─── Iframe / Window / Alert ──────────────────────────────────────────────

  private async doSwitchIframe(page: Page, action: ParsedAction, logs: string[]): Promise<ActionResult> {
    const iframeName = action.target || action.value || '';
    try {
      // Locate iframe
      const frame = page.frame({ name: iframeName }) ??
        page.frames().find(f => f.url().includes(iframeName));

      if (frame) {
        logs.push(`[Action] ✓ Switched to iframe: "${iframeName}"`);
        return { success: true, strategy: 'iframe-name', logs };
      }

      // Try by title/locator
      const iframeEl = page.frameLocator(`iframe[name="${iframeName}"], iframe[id="${iframeName}"], iframe[title="${iframeName}"]`);
      if (iframeEl) {
        logs.push(`[Action] ✓ Switched to iframe via locator: "${iframeName}"`);
        return { success: true, strategy: 'iframe-locator', logs };
      }

      logs.push(`[Action] ⚠ Could not find iframe: "${iframeName}" — proceeding`);
      return { success: true, strategy: 'iframe-skip', logs };
    } catch (err: any) {
      logs.push(`[Action] ⚠ Iframe switch failed: ${err.message} — proceeding`);
      return { success: true, logs }; // Non-fatal
    }
  }

  private doExitIframe(logs: string[]): ActionResult {
    logs.push('[Action] ✓ Exited iframe (default content)');
    return { success: true, strategy: 'exit-iframe', logs };
  }

  private async doSwitchWindow(page: Page, action: ParsedAction, logs: string[]): Promise<ActionResult> {
    const context = page.context();
    const pages = context.pages();
    if (pages.length > 1) {
      const newPage = pages[pages.length - 1];
      await newPage.waitForLoadState('domcontentloaded').catch(() => {});
      logs.push(`[Action] ✓ Switched to new window: ${newPage.url()}`);
      return { success: true, strategy: 'new-window', logs };
    }

    // Wait for popup
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(500);
      const pgs = context.pages();
      if (pgs.length > 1) {
        await pgs[pgs.length - 1].waitForLoadState('domcontentloaded').catch(() => {});
        logs.push('[Action] ✓ New popup detected and switched');
        return { success: true, strategy: 'popup-wait', logs };
      }
    }

    logs.push('[Action] ⚠ No new window detected — proceeding');
    return { success: true, logs };
  }

  private async doAlert(page: Page, action: 'accept' | 'dismiss', logs: string[]): Promise<ActionResult> {
    try {
      const dialog = await page.waitForEvent('dialog', { timeout: 3000 });
      if (action === 'accept') await dialog.accept();
      else await dialog.dismiss();
      logs.push(`[Action] ✓ ${action === 'accept' ? 'Accepted' : 'Dismissed'} alert`);
      return { success: true, strategy: 'alert', logs };
    } catch {
      logs.push('[Action] No alert present — continuing');
      return { success: true, logs };
    }
  }

  private async doScreenshot(page: Page, logs: string[]): Promise<ActionResult> {
    const buffer = await page.screenshot({ type: 'jpeg', quality: 70 });
    const screenshot = buffer.toString('base64');
    logs.push('[Action] ✓ Screenshot captured');
    return { success: true, strategy: 'screenshot', logs, screenshot };
  }

  // ─── 7-Strategy Selector Resolution Waterfall ─────────────────────────────
  //
  // Strategy 1: Accessibility role + name (MOST RELIABLE)
  // Strategy 2: data-testid
  // Strategy 3: aria-label
  // Strategy 4: Placeholder text
  // Strategy 5: Text content
  // Strategy 6: CSS selector from DOM snapshot
  // Strategy 7: Memory recall

  private async resolveAndAct(
    page: Page,
    target: string,
    dom: SemanticDOM,
    logs: string[],
    action: (locator: Locator, strategy: string) => Promise<ActionResult>,
    elementHint?: string
  ): Promise<ActionResult> {
    const errors: string[] = [];

    // ── Strategy 1: Accessibility role + name ──────────────────────────────
    const roleResult = await this.tryAccessibilityRole(page, target, action, errors);
    if (roleResult) return roleResult;

    // ── Strategy 2: data-testid ────────────────────────────────────────────
    const testIdResult = await this.tryTestId(page, target, action, errors);
    if (testIdResult) return testIdResult;

    // ── Strategy 3: aria-label ─────────────────────────────────────────────
    const ariaResult = await this.tryAriaLabel(page, target, action, errors, logs);
    if (ariaResult) return ariaResult;

    // ── Strategy 4: Placeholder ────────────────────────────────────────────
    const placeholderResult = await this.tryPlaceholder(page, target, action, errors, logs);
    if (placeholderResult) return placeholderResult;

    // ── Strategy 5: Text content ───────────────────────────────────────────
    const textResult = await this.tryText(page, target, action, errors, logs);
    if (textResult) return textResult;

    // ── Strategy 6: CSS from DOM snapshot ─────────────────────────────────
    const domResult = await this.tryDOMSnapshot(page, target, dom, action, errors, elementHint, logs);
    if (domResult) return domResult;

    // ── Strategy 7: Memory recall ──────────────────────────────────────────
    const memoryResult = await this.tryMemory(page, target, dom.url, action, errors, logs);
    if (memoryResult) return memoryResult;

    // All strategies failed
    const errMsg = `Could not find element "${target}" after 7 strategies:\n  ${errors.join('\n  ')}`;
    logs.push(`[Action] ✗ ${errMsg}`);
    return { success: false, error: errMsg, logs };
  }

  private async tryAccessibilityRole(
    page: Page,
    target: string,
    action: (locator: Locator, strategy: string) => Promise<ActionResult>,
    errors: string[]
  ): Promise<ActionResult | null> {
    const roleKeywords: Record<string, string[]> = {
      button: ['button', 'submit', 'btn', 'click', 'press', 'tap', 'continue', 'cancel', 'ok', 'yes', 'no', 'close', 'save', 'login', 'sign in', 'register'],
      textbox: ['input', 'field', 'text', 'email', 'name', 'username', 'password', 'search', 'phone', 'address', 'city', 'state', 'zip', 'enter'],
      link: ['link', 'href', 'navigate'],
      checkbox: ['checkbox', 'check', 'agree', 'terms'],
      radio: ['radio'],
      combobox: ['dropdown', 'select', 'combo', 'choose'],
    };

    const targetLower = target.toLowerCase();

    for (const [role, keywords] of Object.entries(roleKeywords)) {
      if (!keywords.some(kw => targetLower.includes(kw))) continue;

      try {
        // Try exact name
        const exactLocator = page.getByRole(role as any, { name: target, exact: false });
        const exactCount = await exactLocator.count().catch(() => 0);
        if (exactCount > 0) {
          return await action(exactLocator, `role:${role}`);
        }

        // Try keywords as name
        for (const kw of keywords) {
          if (!targetLower.includes(kw)) continue;
          const kwLocator = page.getByRole(role as any, { name: new RegExp(kw, 'i') });
          const kwCount = await kwLocator.count().catch(() => 0);
          if (kwCount > 0) {
            return await action(kwLocator, `role:${role}:keyword`);
          }
        }
      } catch (err: any) {
        errors.push(`role:${role}: ${err.message.slice(0, 100)}`);
      }
    }
    return null;
  }

  private async tryTestId(
    page: Page,
    target: string,
    action: (locator: Locator, strategy: string) => Promise<ActionResult>,
    errors: string[]
  ): Promise<ActionResult | null> {
    const keywords = target.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    for (const kw of keywords) {
      try {
        const loc = page.getByTestId(new RegExp(kw, 'i'));
        const count = await loc.count().catch(() => 0);
        if (count > 0) {
          return await action(loc, 'data-testid');
        }
      } catch (err: any) {
        errors.push(`testid:${kw}: ${err.message.slice(0, 80)}`);
      }
    }
    return null;
  }

  private async tryAriaLabel(
    page: Page,
    target: string,
    action: (locator: Locator, strategy: string) => Promise<ActionResult>,
    errors: string[],
    logs: string[]
  ): Promise<ActionResult | null> {
    try {
      const loc = page.getByLabel(target, { exact: false });
      const count = await loc.count().catch(() => 0);
      if (count > 0) {
        logs.push(`[Selector] Found by aria-label: "${target}"`);
        return await action(loc, 'aria-label');
      }
    } catch (err: any) {
      errors.push(`aria-label: ${err.message.slice(0, 80)}`);
    }
    return null;
  }

  private async tryPlaceholder(
    page: Page,
    target: string,
    action: (locator: Locator, strategy: string) => Promise<ActionResult>,
    errors: string[],
    logs: string[]
  ): Promise<ActionResult | null> {
    try {
      const loc = page.getByPlaceholder(target, { exact: false });
      const count = await loc.count().catch(() => 0);
      if (count > 0) {
        logs.push(`[Selector] Found by placeholder: "${target}"`);
        return await action(loc, 'placeholder');
      }
    } catch (err: any) {
      errors.push(`placeholder: ${err.message.slice(0, 80)}`);
    }
    return null;
  }

  private async tryText(
    page: Page,
    target: string,
    action: (locator: Locator, strategy: string) => Promise<ActionResult>,
    errors: string[],
    logs: string[]
  ): Promise<ActionResult | null> {
    try {
      const loc = page.getByText(target, { exact: false });
      const count = await loc.count().catch(() => 0);
      if (count > 0) {
        // Only if it's a clickable element
        const isClickable = await loc.first().evaluate(el => {
          const tag = el.tagName.toLowerCase();
          return ['button', 'a', 'input', 'label', 'select', 'textarea', 'span', 'div'].includes(tag);
        }).catch(() => true);
        if (isClickable) {
          logs.push(`[Selector] Found by text: "${target}"`);
          return await action(loc, 'text-content');
        }
      }
    } catch (err: any) {
      errors.push(`text: ${err.message.slice(0, 80)}`);
    }
    return null;
  }

  private async tryDOMSnapshot(
    page: Page,
    target: string,
    dom: SemanticDOM,
    action: (locator: Locator, strategy: string) => Promise<ActionResult>,
    errors: string[],
    elementHint: string | undefined,
    logs: string[]
  ): Promise<ActionResult | null> {
    // Search all elements in the DOM snapshot
    const allElements: DOMElement[] = [
      ...dom.inputs,
      ...dom.buttons,
      ...dom.links,
      ...dom.dropdowns,
      ...dom.checkboxes,
      ...dom.radios,
    ];

    const bestMatch = memoryAgent.findBestSelectorFromDOM(target, allElements);
    if (!bestMatch) return null;

    try {
      const loc = page.locator(bestMatch.selector);
      const count = await loc.count().catch(() => 0);
      if (count > 0) {
        logs.push(`[Selector] Found in DOM snapshot: "${bestMatch.selector}"`);
        const result = await action(loc, 'dom-snapshot');
        if (result.success) {
          // Remember this selector
          memoryAgent.rememberSelector(target, dom.url, bestMatch.selector, true);
        }
        return result;
      }
    } catch (err: any) {
      errors.push(`dom-snapshot: ${err.message.slice(0, 80)}`);
    }
    return null;
  }

  private async tryMemory(
    page: Page,
    target: string,
    url: string,
    action: (locator: Locator, strategy: string) => Promise<ActionResult>,
    errors: string[],
    logs: string[]
  ): Promise<ActionResult | null> {
    const remembered = memoryAgent.recallSelectors(target, url);
    for (const selector of remembered.slice(0, 3)) {
      try {
        const loc = page.locator(selector);
        const count = await loc.count().catch(() => 0);
        if (count > 0) {
          logs.push(`[Selector] Found in memory: "${selector}"`);
          return await action(loc, 'memory');
        }
      } catch (err: any) {
        errors.push(`memory:${selector}: ${err.message.slice(0, 80)}`);
      }
    }
    return null;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private resolvePlaceholders(text: string, testData: Map<string, string>): string {
    return text.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const val = testData.get(key.trim()) ?? testData.get(key.trim().toLowerCase());
      return val !== undefined ? val : match;
    });
  }

  private inferValueFromTarget(target: string, testData: Map<string, string>): string {
    const targetLower = target.toLowerCase();
    const checks: [string[], string[]][] = [
      [['username', 'user id', 'user name', 'email', 'login id', 'userid'], ['username', 'email', 'user', 'login']],
      [['password', 'passwd', 'pwd', 'pass'], ['password', 'pass', 'pwd']],
      [['phone', 'mobile', 'cell'], ['phone', 'mobile', 'cell']],
      [['address'], ['address', 'addr']],
      [['search', 'query'], ['searchTerm', 'search', 'query']],
    ];

    for (const [targetKeywords, dataKeys] of checks) {
      if (targetKeywords.some(kw => targetLower.includes(kw))) {
        for (const key of dataKeys) {
          const val = testData.get(key) ?? testData.get(key.toLowerCase());
          if (val) return val;
        }
      }
    }
    return '';
  }
}

export const actionAgent = new ActionAgent();
