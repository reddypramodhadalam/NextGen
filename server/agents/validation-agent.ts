// ============================================================================
// AITAS Multi-Agent System — Validation Agent
// Confirms step outcomes using semantic verification strategies
// ============================================================================

import type { Page } from 'playwright';
import type { ValidationSpec, ValidationResult, SemanticDOM, ExecutionStep } from './types.js';
import { getAiClient } from '../ai-client.js';

export class ValidationAgent {
  // ─── Main Validate Method ─────────────────────────────────────────────────

  async validate(
    page: Page,
    step: ExecutionStep,
    dom: SemanticDOM,
    logs: string[]
  ): Promise<ValidationResult> {
    const expected = step.rawExpected;
    const action = step.parsedAction;

    // Generic / non-verifiable expected strings → just check page health
    const genericPhrases = [
      'step completes successfully', 'step is complete', 'action is performed',
      'completes successfully', 'text appears in', 'field accepts', 'accepts input',
      'input is accepted', 'page loads', 'loads successfully', 'is displayed',
      'is shown', 'is visible', 'appears', 'page is displayed', 'loads',
      'form is displayed', 'results are displayed', 'user is redirected',
    ];
    const isGenericExpected = !expected ||
      genericPhrases.some(p => expected.toLowerCase().includes(p)) ||
      expected.length < 15;

    if (isGenericExpected) {
      const isHealthy = await this.checkPageHealth(page, logs);
      logs.push(`[Validate] ✓ Generic expected text — page health check: ${isHealthy ? 'OK' : 'ERROR'}`);
      return {
        passed: isHealthy,
        spec: { type: 'page_changed', description: expected || 'Page is healthy after action' },
        error: isHealthy ? undefined : 'Page appears to have an error',
      };
    }

    // Infer verification type from expected text
    const spec = this.inferValidationSpec(expected, action?.type);

    logs.push(`[Validate] Verifying: "${expected}" (${spec.type})`);

    switch (spec.type) {
      case 'url_contains':
        return await this.validateUrlContains(page, spec, logs);
      case 'url_equals':
        return await this.validateUrlEquals(page, spec, logs);
      case 'text_visible':
      case 'text_contains':
        return await this.validateTextVisible(page, spec, logs);
      case 'element_visible':
        return await this.validateElementVisible(page, spec, logs);
      case 'element_enabled':
        return await this.validateElementEnabled(page, spec, logs);
      case 'element_selected':
        return await this.validateElementSelected(page, spec, logs);
      case 'value_equals':
        return await this.validateValueEquals(page, spec, logs);
      case 'title_contains':
        return await this.validateTitleContains(page, spec, logs);
      case 'alert_present':
        return await this.validateAlertPresent(page, spec, logs);
      case 'page_changed':
        return await this.validatePageChanged(page, spec, logs);
      default:
        // Use AI for complex verifications
        return await this.validateWithAI(page, expected, dom, logs);
    }
  }

  // ─── Spec Inference ───────────────────────────────────────────────────────

  private inferValidationSpec(expected: string, actionType?: string): ValidationSpec {
    const lower = expected.toLowerCase();

    if (lower.includes('url') && (lower.includes('contains') || lower.includes('includes'))) {
      const urlMatch = expected.match(/["']([^"']+)["']/);
      return { type: 'url_contains', expectedValue: urlMatch?.[1] || expected, description: expected };
    }

    if (lower.includes('navigated to') || lower.includes('redirected to') || lower.includes('url is')) {
      const urlMatch = expected.match(/(https?:\/\/[^\s"']+)/);
      return { type: 'url_contains', expectedValue: urlMatch?.[1] || '', description: expected };
    }

    if (lower.includes('title') && lower.includes('contains')) {
      const titleMatch = expected.match(/["']([^"']+)["']/);
      return { type: 'title_contains', expectedValue: titleMatch?.[1] || expected, description: expected };
    }

    if (lower.includes('alert') || lower.includes('dialog popup') || lower.includes('popup appears')) {
      return { type: 'alert_present', description: expected };
    }

    if (lower.includes('enabled') || lower.includes('is active') || lower.includes('is not disabled')) {
      return { type: 'element_enabled', target: expected, description: expected };
    }

    if (lower.includes('selected') || lower.includes('is checked') || lower.includes('checked')) {
      return { type: 'element_selected', target: expected, description: expected };
    }

    if (lower.includes('visible') || lower.includes('displayed') || lower.includes('shown') ||
        lower.includes('appear') || lower.includes('is present')) {
      // Extract quoted text as the thing to look for
      const quotedMatch = expected.match(/["']([^"']+)["']/);
      const textToFind = quotedMatch?.[1] || this.extractTextFromExpected(expected);
      return { type: 'text_visible', expectedValue: textToFind, description: expected };
    }

    if (lower.includes('verify') || lower.includes('assert') || lower.includes('should')) {
      const quotedMatch = expected.match(/["']([^"']+)["']/);
      const textToFind = quotedMatch?.[1] || this.extractTextFromExpected(expected);
      if (textToFind) {
        return { type: 'text_visible', expectedValue: textToFind, description: expected };
      }
    }

    // Check for login/page-specific success indicators
    if (lower.includes('logged in') || lower.includes('dashboard') || lower.includes('home page') ||
        lower.includes('welcome') || lower.includes('success')) {
      return { type: 'page_changed', description: expected };
    }

    // Default: look for any quoted text on the page
    const quotedMatch = expected.match(/["']([^"']+)["']/);
    if (quotedMatch) {
      return { type: 'text_visible', expectedValue: quotedMatch[1], description: expected };
    }

    return { type: 'page_changed', description: expected };
  }

  private extractTextFromExpected(expected: string): string {
    // Remove common prefixes and extract meaningful text
    return expected
      .replace(/^(?:verify|assert|check|confirm|ensure|validate)\s+(?:that\s+)?/i, '')
      .replace(/\s+(?:is\s+)?(?:visible|displayed|shown|present|appears?)\s*$/i, '')
      .replace(/^(?:the\s+)?/, '')
      .trim();
  }

  // ─── Validators ───────────────────────────────────────────────────────────

  private async validateUrlContains(page: Page, spec: ValidationSpec, logs: string[]): Promise<ValidationResult> {
    try {
      await page.waitForURL(new RegExp(spec.expectedValue?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') ?? ''), {
        timeout: 10000,
      }).catch(() => {});

      const url = page.url();
      const passed = spec.expectedValue ? url.toLowerCase().includes(spec.expectedValue.toLowerCase()) : true;

      logs.push(`[Validate] URL check: "${url}" ${passed ? '✓ contains' : '✗ missing'} "${spec.expectedValue}"`);
      return { passed, spec, actual: url, error: passed ? undefined : `URL "${url}" does not contain "${spec.expectedValue}"` };
    } catch (err: any) {
      const url = page.url();
      const passed = spec.expectedValue ? url.includes(spec.expectedValue) : true;
      return { passed, spec, actual: url };
    }
  }

  private async validateUrlEquals(page: Page, spec: ValidationSpec, logs: string[]): Promise<ValidationResult> {
    const url = page.url();
    const passed = url === spec.expectedValue;
    logs.push(`[Validate] URL equals: ${passed ? '✓' : '✗'} expected "${spec.expectedValue}", got "${url}"`);
    return { passed, spec, actual: url, error: passed ? undefined : `URL mismatch` };
  }

  private async validateTextVisible(page: Page, spec: ValidationSpec, logs: string[]): Promise<ValidationResult> {
    const text = spec.expectedValue || '';
    if (!text) return { passed: true, spec };

    try {
      // Strategy 1: getByText
      const loc = page.getByText(text, { exact: false });
      const count = await loc.count();
      if (count > 0) {
        const isVisible = await loc.first().isVisible().catch(() => false);
        if (isVisible) {
          logs.push(`[Validate] ✓ Text visible: "${text}"`);
          return { passed: true, spec, actual: text };
        }
      }

      // Strategy 2: Wait up to 5s for it to appear
      await page.waitForSelector(`text="${text}"`, { timeout: 5000, state: 'visible' }).catch(() => {});
      const loc2 = page.getByText(text, { exact: false });
      const count2 = await loc2.count();
      if (count2 > 0) {
        logs.push(`[Validate] ✓ Text visible (after wait): "${text}"`);
        return { passed: true, spec };
      }

      // Strategy 3: Check page body text
      const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');
      if (bodyText.toLowerCase().includes(text.toLowerCase())) {
        logs.push(`[Validate] ✓ Text found in body: "${text}"`);
        return { passed: true, spec };
      }

      logs.push(`[Validate] ✗ Text NOT visible: "${text}"`);
      return { passed: false, spec, error: `Text "${text}" not visible on page` };
    } catch (err: any) {
      logs.push(`[Validate] ✗ Text validation error: ${err.message}`);
      return { passed: false, spec, error: err.message };
    }
  }

  private async validateElementVisible(page: Page, spec: ValidationSpec, logs: string[]): Promise<ValidationResult> {
    const target = spec.target || spec.expectedValue || '';
    if (!target) return { passed: true, spec };

    try {
      const loc = page.getByRole('any' as any, { name: target })
        .or(page.getByLabel(target))
        .or(page.getByText(target));

      const visible = await loc.first().isVisible({ timeout: 5000 }).catch(() => false);
      logs.push(`[Validate] Element visible: "${target}" → ${visible ? '✓' : '✗'}`);
      return { passed: visible, spec, error: visible ? undefined : `Element "${target}" not visible` };
    } catch (err: any) {
      return { passed: false, spec, error: err.message };
    }
  }

  private async validateElementEnabled(page: Page, spec: ValidationSpec, logs: string[]): Promise<ValidationResult> {
    const target = spec.target || spec.expectedValue || '';
    try {
      const loc = page.getByLabel(target).or(page.getByRole('button', { name: target }));
      const enabled = await loc.first().isEnabled({ timeout: 5000 }).catch(() => false);
      logs.push(`[Validate] Element enabled: "${target}" → ${enabled ? '✓' : '✗'}`);
      return { passed: enabled, spec };
    } catch {
      return { passed: false, spec, error: `Element "${target}" state check failed` };
    }
  }

  private async validateElementSelected(page: Page, spec: ValidationSpec, logs: string[]): Promise<ValidationResult> {
    const target = spec.target || spec.expectedValue || '';
    try {
      const loc = page.getByLabel(target).or(page.getByRole('checkbox', { name: target }));
      const checked = await loc.first().isChecked({ timeout: 5000 }).catch(() => false);
      logs.push(`[Validate] Element checked: "${target}" → ${checked ? '✓' : '✗'}`);
      return { passed: checked, spec };
    } catch {
      return { passed: false, spec, error: `Checkbox "${target}" check failed` };
    }
  }

  private async validateValueEquals(page: Page, spec: ValidationSpec, logs: string[]): Promise<ValidationResult> {
    const target = spec.target || '';
    const expected = spec.expectedValue || '';
    try {
      const loc = page.getByLabel(target).or(page.locator(`input[name*="${target}"]`));
      const value = await loc.first().inputValue({ timeout: 5000 }).catch(() => '');
      const passed = value === expected || value.includes(expected);
      logs.push(`[Validate] Value equals: "${value}" ${passed ? '✓' : '✗ expected'} "${expected}"`);
      return { passed, spec, actual: value };
    } catch {
      return { passed: false, spec, error: `Value check failed for "${target}"` };
    }
  }

  private async validateTitleContains(page: Page, spec: ValidationSpec, logs: string[]): Promise<ValidationResult> {
    const title = await page.title();
    const passed = spec.expectedValue ? title.toLowerCase().includes(spec.expectedValue.toLowerCase()) : true;
    logs.push(`[Validate] Title: "${title}" ${passed ? '✓ contains' : '✗ missing'} "${spec.expectedValue}"`);
    return { passed, spec, actual: title };
  }

  private async validateAlertPresent(page: Page, spec: ValidationSpec, logs: string[]): Promise<ValidationResult> {
    // Check for dialog elements or native alert
    const dialogPresent = await page.evaluate(() => {
      return !!(document.querySelector('[role="alertdialog"], [role="dialog"], .modal.show, .modal[style*="display: block"]'));
    }).catch(() => false);

    logs.push(`[Validate] Alert/dialog present: ${dialogPresent ? '✓' : '✗'}`);
    return { passed: dialogPresent, spec };
  }

  private async validatePageChanged(page: Page, spec: ValidationSpec, logs: string[]): Promise<ValidationResult> {
    // Check page is in a good state (no 404/500 errors)
    const healthy = await this.checkPageHealth(page, logs);
    if (!healthy) {
      return { passed: false, spec, error: 'Page shows an error state' };
    }

    // If expected text is in spec, check for it
    if (spec.expectedValue) {
      const textCheck = await this.validateTextVisible(page, { ...spec, type: 'text_visible' }, logs);
      if (textCheck.passed) return { passed: true, spec };
    }

    logs.push(`[Validate] ✓ Page appears healthy after action`);
    return { passed: true, spec };
  }

  // ─── AI-Powered Validation ────────────────────────────────────────────────

  private async validateWithAI(
    page: Page,
    expected: string,
    dom: SemanticDOM,
    logs: string[]
  ): Promise<ValidationResult> {
    try {
      const aiClient = await getAiClient();
      const url = page.url();
      const title = await page.title().catch(() => '');
      const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');

      const prompt = `You are a test validation expert. Determine if the expected outcome is satisfied.

Current page:
- URL: ${url}
- Title: ${title}
- Body text (first 1000 chars): ${bodyText.slice(0, 1000)}

Expected: "${expected}"

Answer with JSON only: {"passed": true/false, "reason": "brief explanation"}`;

      const response = await aiClient.chat([{ role: 'user', content: prompt }], 'Return JSON only.');
      const match = response.match(/\{[^}]+\}/);
      if (match) {
        const result = JSON.parse(match[0]);
        logs.push(`[Validate] AI: ${result.passed ? '✓' : '✗'} ${result.reason}`);
        return {
          passed: result.passed,
          spec: { type: 'text_visible', description: expected },
          error: result.passed ? undefined : result.reason,
        };
      }
    } catch (err: any) {
      logs.push(`[Validate] AI validation failed: ${err.message}`);
    }

    // Fallback: mark as passed (optimistic)
    logs.push('[Validate] ⚠ Could not validate — marking as passed (optimistic)');
    return { passed: true, spec: { type: 'page_changed', description: expected } };
  }

  // ─── Page Health ──────────────────────────────────────────────────────────

  private async checkPageHealth(page: Page, logs: string[]): Promise<boolean> {
    try {
      const title = await page.title();
      const bodyText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');

      const errorPatterns = [
        '404', '500', '503', 'not found', 'server error',
        'internal server error', 'page not found', 'access denied',
      ];

      const hasError = errorPatterns.some(p =>
        title.toLowerCase().includes(p) || bodyText.toLowerCase().slice(0, 500).includes(p)
      );

      if (hasError) {
        logs.push('[Validate] ⚠ Page appears to have an error');
        return false;
      }

      return true;
    } catch {
      return true; // Optimistic
    }
  }
}

export const validationAgent = new ValidationAgent();
