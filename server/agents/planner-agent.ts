// ============================================================================
// AITAS Multi-Agent System — Planner Agent
// Converts raw test steps into structured ExecutionSteps with parsed actions
// Uses LLM for intelligent step parsing + falls back to rule-based parser
// ============================================================================

import { getAiClient } from '../ai-client.js';
import type {
  PlannerInput,
  PlannerOutput,
  ExecutionStep,
  ParsedAction,
  ActionType,
  SemanticDOM,
} from './types.js';

// Action keyword maps for rule-based parsing
const NAVIGATE_PATTERNS = /(?:navigate|go to|open|visit|browse to|load)\s+(?:url\s+|page\s+|the\s+)?(https?:\/\/[^\s]+|\/[^\s]*)/i;
const CLICK_PATTERNS = /(?:click|press|tap|select|choose)\s+(?:on\s+)?(?:the\s+)?(.+?)(?:\s+button|\s+link|\s+icon|\s+item|\s+option|\s+tab|\s+menu)?$/i;
const FILL_PATTERNS = /(?:enter|type|input|fill|write|put|set)\s+(?:the\s+value\s+)?["']?([^"']+?)["']?\s+(?:in(?:to)?|on|at|for)\s+(?:the\s+)?(?:["'])?(.+?)(?:["'])?(?:\s+field|\s+input|\s+box|\s+area)?$/i;
const FILL_PLACEHOLDER = /(?:enter|type|input|fill)\s+(?:the\s+)?(?:username|password|email|name|search|phone|address)/i;
const SELECT_PATTERNS = /(?:select|choose|pick)\s+["']?([^"']+?)["']?\s+(?:from|in)\s+(?:the\s+)?(.+?)(?:\s+dropdown|\s+list|\s+select)?$/i;
const CHECK_PATTERNS = /(?:check|tick|enable)\s+(?:the\s+)?(.+?)(?:\s+checkbox|\s+option)?$/i;
const UNCHECK_PATTERNS = /(?:uncheck|untick|disable)\s+(?:the\s+)?(.+?)(?:\s+checkbox)?$/i;
const HOVER_PATTERNS = /(?:hover|mouse over|move to)\s+(?:over\s+)?(?:the\s+)?(.+)/i;
const SCROLL_PATTERNS = /scroll\s+(up|down|top|bottom|to\s+.+)/i;
const WAIT_PATTERNS = /(?:wait|pause)\s+(?:for\s+)?(\d+)\s*(?:seconds?|secs?|ms|milliseconds?)?/i;
const SWITCH_IFRAME = /switch\s+to\s+(?:iframe|frame|the\s+iframe)\s+(?:named?\s+|with\s+(?:title|id|name)\s+)?["']?([^"']+)["']?/i;
const EXIT_IFRAME = /switch\s+(?:back\s+to|to)\s+(?:default|main|parent)\s*(?:content|page|frame)?/i;
const SWITCH_WINDOW = /switch\s+to\s+(?:new\s+)?(?:window|tab|popup)/i;
const VERIFY_PATTERNS = /(?:verify|assert|check|confirm|ensure|validate)\s+(?:that\s+)?(.+)/i;
const PRESS_ENTER = /(?:press|hit|click)\s+(?:the\s+)?(?:enter|return)\s+(?:key)?/i;
const PRESS_TAB = /(?:press|hit)\s+(?:the\s+)?tab\s+(?:key)?/i;

export class PlannerAgent {
  /**
   * Convert raw test steps to structured ExecutionSteps
   */
  async plan(input: PlannerInput): Promise<PlannerOutput> {
    console.log(`[Planner] Planning ${input.rawSteps.length} steps for: ${input.targetUrl}`);

    const steps: ExecutionStep[] = [];
    const warnings: string[] = [];

    // Try AI-powered planning first
    let aiParsedSteps: ParsedAction[] | null = null;
    try {
      aiParsedSteps = await this.planWithAI(input);
      console.log(`[Planner] AI planning succeeded for ${aiParsedSteps?.length ?? 0} steps`);
    } catch (err: any) {
      console.warn(`[Planner] AI planning failed, using rule-based: ${err.message}`);
    }

    for (let i = 0; i < input.rawSteps.length; i++) {
      const raw = input.rawSteps[i];
      const stepId = `step_${i + 1}_${Date.now()}`;

      // Use AI result if available, else rule-based
      const parsedAction = aiParsedSteps?.[i] ?? this.parseStepRuleBased(raw.step, raw.expected, input.testData);

      steps.push({
        id: stepId,
        stepNumber: i + 1,
        rawAction: raw.step,
        rawExpected: raw.expected,
        parsedAction,
        status: 'pending',
        retries: 0,
        maxRetries: 3,
      });
    }

    // Detect first step navigation
    if (steps.length > 0 && steps[0].parsedAction?.type !== 'navigate') {
      // Auto-prepend navigation if URL provided and first step isn't navigate
      const firstAction = steps[0].rawAction.toLowerCase();
      if (!firstAction.includes('navigate') && !firstAction.includes('go to') && !firstAction.includes('open')) {
        warnings.push('First step does not navigate to URL. Auto-navigation will be applied.');
      }
    }

    return {
      steps,
      strategy: aiParsedSteps ? 'ai-powered' : 'rule-based',
      warnings,
      estimatedDuration: steps.length * 3000, // 3 seconds per step estimate
    };
  }

  // ─── AI-Powered Planning ──────────────────────────────────────────────────

  private async planWithAI(input: PlannerInput): Promise<ParsedAction[]> {
    const aiClient = await getAiClient();

    const domContext = input.domSnapshot
      ? `\n\nCURRENT PAGE DOM:\n${JSON.stringify(input.domSnapshot, null, 2).slice(0, 2000)}`
      : '';

    const testDataContext = input.testData && Object.keys(input.testData).length > 0
      ? `\n\nTEST DATA:\n${Object.entries(input.testData).map(([k, v]) => `${k} = "${k.toLowerCase().includes('pass') ? '[MASKED]' : v}"`).join('\n')}`
      : '';

    const systemPrompt = `You are a world-class test automation planner. Convert test steps into structured JSON actions.

For each step, return a JSON object with:
{
  "type": "ACTION_TYPE",
  "target": "human-readable element description",
  "value": "value to type/select (ACTUAL value from test data, not placeholder)",
  "selector": "CSS selector if obvious",
  "role": "accessibility role if known",
  "name": "accessibility name if known",
  "url": "for navigate action only",
  "key": "for press action only",
  "expected": "what to verify",
  "confidence": 85,
  "reasoning": "brief explanation"
}

ACTION TYPES:
- navigate: Go to URL
- click: Click element (button, link, etc.)
- fill: Type into input field
- select: Select from dropdown
- check: Check checkbox
- uncheck: Uncheck checkbox
- hover: Hover over element
- scroll: Scroll (up/down/top/bottom/to element)
- press: Press keyboard key
- wait: Wait N milliseconds
- waitForText: Wait for text to appear
- waitForElement: Wait for element to appear
- switchIframe: Switch to iframe
- exitIframe: Exit iframe / switch to default content
- switchWindow: Switch to new window/popup
- acceptAlert: Accept alert/confirm
- dismissAlert: Dismiss alert
- verify: Verify expected condition

CRITICAL RULES:
1. For fill actions: value MUST be the ACTUAL test data value, NOT {{placeholder}}
2. Resolve ALL {{key}} placeholders using the TEST DATA provided
3. Be specific about targets: "Login button", "Email input field", "Password field"
4. For navigate steps, extract the URL exactly
5. Return an ARRAY of ${input.rawSteps.length} ParsedAction objects (one per step)`;

    const userPrompt = `Convert these ${input.rawSteps.length} test steps for ${input.targetUrl}:

${input.rawSteps.map((s, i) => `Step ${i + 1}: "${s.step}" → Expected: "${s.expected}"`).join('\n')}${testDataContext}${domContext}

Return a JSON ARRAY of ${input.rawSteps.length} objects.`;

    const response = await aiClient.chat([{ role: 'user', content: userPrompt }], systemPrompt);
    const parsed = this.extractJsonArray(response);
    if (!parsed || !Array.isArray(parsed)) {
      throw new Error('AI returned invalid JSON array');
    }
    return parsed as ParsedAction[];
  }

  // ─── Rule-Based Parser ────────────────────────────────────────────────────

  parseStepRuleBased(
    step: string,
    expected: string,
    testData?: Record<string, string>
  ): ParsedAction {
    // Resolve placeholders first
    const resolvedStep = this.resolvePlaceholders(step, testData);
    const resolvedExpected = this.resolvePlaceholders(expected, testData);
    const stepLower = resolvedStep.toLowerCase().trim();

    // NAVIGATE
    const navigateMatch = resolvedStep.match(NAVIGATE_PATTERNS);
    if (navigateMatch) {
      return {
        type: 'navigate',
        url: navigateMatch[1],
        expected: resolvedExpected,
        confidence: 95,
        reasoning: 'Matched navigation pattern',
      };
    }

    // PRESS ENTER
    if (PRESS_ENTER.test(stepLower)) {
      return {
        type: 'press',
        key: 'Enter',
        expected: resolvedExpected,
        confidence: 95,
        reasoning: 'Matched press Enter pattern',
      };
    }

    // PRESS TAB
    if (PRESS_TAB.test(stepLower)) {
      return {
        type: 'press',
        key: 'Tab',
        expected: resolvedExpected,
        confidence: 95,
        reasoning: 'Matched press Tab pattern',
      };
    }

    // SWITCH TO IFRAME
    const iframeMatch = resolvedStep.match(SWITCH_IFRAME);
    if (iframeMatch) {
      return {
        type: 'switchIframe',
        target: iframeMatch[1],
        expected: resolvedExpected,
        confidence: 90,
        reasoning: 'Matched iframe switch pattern',
      };
    }

    // EXIT IFRAME
    if (EXIT_IFRAME.test(stepLower)) {
      return {
        type: 'exitIframe',
        expected: resolvedExpected,
        confidence: 95,
        reasoning: 'Matched exit iframe pattern',
      };
    }

    // SWITCH WINDOW
    if (SWITCH_WINDOW.test(stepLower)) {
      return {
        type: 'switchWindow',
        expected: resolvedExpected,
        confidence: 90,
        reasoning: 'Matched window switch pattern',
      };
    }

    // WAIT
    const waitMatch = resolvedStep.match(WAIT_PATTERNS);
    if (waitMatch) {
      const amount = parseInt(waitMatch[1]);
      const isMs = /ms|millisec/.test(resolvedStep.toLowerCase());
      return {
        type: 'wait',
        value: String(isMs ? amount : amount * 1000),
        expected: resolvedExpected,
        confidence: 90,
        reasoning: 'Matched wait pattern',
      };
    }

    // FILL (with extracted value and field name)
    const fillMatch = resolvedStep.match(FILL_PATTERNS);
    if (fillMatch) {
      return {
        type: 'fill',
        value: fillMatch[1].trim(),
        target: fillMatch[2].trim(),
        expected: resolvedExpected,
        confidence: 85,
        reasoning: 'Matched fill/type pattern with value',
      };
    }

    // FILL (generic - uses test data to infer value)
    if (FILL_PLACEHOLDER.test(stepLower)) {
      const inferredValue = this.inferValueFromContext(stepLower, testData);
      return {
        type: 'fill',
        value: inferredValue,
        target: this.extractTargetFromStep(stepLower),
        expected: resolvedExpected,
        confidence: 75,
        reasoning: 'Matched fill pattern, inferred value from test data',
      };
    }

    // SELECT
    const selectMatch = resolvedStep.match(SELECT_PATTERNS);
    if (selectMatch) {
      return {
        type: 'select',
        value: selectMatch[1].trim(),
        target: selectMatch[2].trim(),
        expected: resolvedExpected,
        confidence: 85,
        reasoning: 'Matched select/dropdown pattern',
      };
    }

    // CHECK
    const checkMatch = resolvedStep.match(CHECK_PATTERNS);
    if (checkMatch && !CLICK_PATTERNS.test(stepLower)) {
      return {
        type: 'check',
        target: checkMatch[1].trim(),
        expected: resolvedExpected,
        confidence: 80,
        reasoning: 'Matched checkbox check pattern',
      };
    }

    // UNCHECK
    const uncheckMatch = resolvedStep.match(UNCHECK_PATTERNS);
    if (uncheckMatch) {
      return {
        type: 'uncheck',
        target: uncheckMatch[1].trim(),
        expected: resolvedExpected,
        confidence: 80,
        reasoning: 'Matched uncheck pattern',
      };
    }

    // HOVER
    const hoverMatch = resolvedStep.match(HOVER_PATTERNS);
    if (hoverMatch) {
      return {
        type: 'hover',
        target: hoverMatch[1].trim(),
        expected: resolvedExpected,
        confidence: 85,
        reasoning: 'Matched hover pattern',
      };
    }

    // SCROLL
    const scrollMatch = resolvedStep.match(SCROLL_PATTERNS);
    if (scrollMatch) {
      return {
        type: 'scroll',
        value: scrollMatch[1].trim(),
        expected: resolvedExpected,
        confidence: 85,
        reasoning: 'Matched scroll pattern',
      };
    }

    // VERIFY / ASSERT
    const verifyMatch = resolvedStep.match(VERIFY_PATTERNS);
    if (verifyMatch) {
      return {
        type: 'verify',
        expected: verifyMatch[1].trim() || resolvedExpected,
        confidence: 80,
        reasoning: 'Matched verify/assert pattern',
      };
    }

    // CLICK (broad match - last resort among action types)
    const clickMatch = resolvedStep.match(CLICK_PATTERNS);
    if (clickMatch || stepLower.includes('click') || stepLower.includes('tap')) {
      const target = clickMatch?.[1] || this.extractTargetFromStep(stepLower);
      return {
        type: 'click',
        target: target.trim(),
        expected: resolvedExpected,
        confidence: 70,
        reasoning: 'Matched click/press pattern',
      };
    }

    // Default: treat as a click if it mentions a UI element
    if (stepLower.includes('button') || stepLower.includes('link') || stepLower.includes('menu')) {
      return {
        type: 'click',
        target: this.extractTargetFromStep(stepLower),
        expected: resolvedExpected,
        confidence: 55,
        reasoning: 'Inferred click from UI element keywords',
      };
    }

    // Unknown — mark as verify and let the action agent figure it out
    return {
      type: 'verify',
      expected: resolvedExpected,
      confidence: 30,
      reasoning: 'Could not parse step, defaulting to verify',
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private resolvePlaceholders(text: string, testData?: Record<string, string>): string {
    if (!testData || !text) return text;
    return text.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const val = testData[key.trim()] ?? testData[key.trim().toLowerCase()];
      return val !== undefined ? val : match;
    });
  }

  private inferValueFromContext(stepLower: string, testData?: Record<string, string>): string {
    if (!testData) return '';
    if (stepLower.includes('username') || stepLower.includes('user id') || stepLower.includes('email') || stepLower.includes('login')) {
      return testData['username'] ?? testData['email'] ?? testData['user'] ?? '';
    }
    if (stepLower.includes('password') || stepLower.includes('pwd') || stepLower.includes('pass')) {
      return testData['password'] ?? testData['pass'] ?? testData['pwd'] ?? '';
    }
    if (stepLower.includes('search')) {
      return testData['searchTerm'] ?? testData['search'] ?? testData['query'] ?? '';
    }
    if (stepLower.includes('phone') || stepLower.includes('mobile')) {
      return testData['phone'] ?? testData['mobile'] ?? '';
    }
    return '';
  }

  private extractTargetFromStep(stepLower: string): string {
    // Remove common verb prefixes and return the rest
    const cleaned = stepLower
      .replace(/^(?:click|press|tap|select|choose|enter|type|input|fill|hover|check|verify|assert|confirm)\s+(?:on\s+|the\s+)?/i, '')
      .replace(/\s+(?:button|link|icon|item|field|input|box|area|dropdown|menu|tab|element)\s*$/i, '')
      .trim();
    return cleaned || stepLower;
  }

  private extractJsonArray(response: string): any[] | null {
    try {
      return JSON.parse(response);
    } catch { /* */ }

    const codeBlock = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) {
      try { return JSON.parse(codeBlock[1].trim()); } catch { /* */ }
    }

    const arrayMatch = response.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try { return JSON.parse(arrayMatch[0]); } catch { /* */ }
    }

    return null;
  }
}

export const plannerAgent = new PlannerAgent();
