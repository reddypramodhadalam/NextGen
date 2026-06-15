// ============================================================================
// AITAS Multi-Agent System — Memory Agent
// Stores selectors, DOM snapshots, and workflow history to prevent re-learning
// ============================================================================

import type {
  SelectorMemory,
  PageStateMemory,
  WorkflowMemory,
  SemanticDOM,
  DOMElement,
} from './types.js';

class MemoryAgent {
  // Selector memory: maps "element description" → selector strategies
  private selectorCache = new Map<string, SelectorMemory>();

  // Page state memory: maps URL → last known DOM
  private pageStateCache = new Map<string, PageStateMemory>();

  // Workflow history: maps sessionId → completed workflow
  private workflowHistory = new Map<string, WorkflowMemory>();

  // Known element patterns learned over time
  private elementPatterns = new Map<string, string[]>();

  // Max entries to prevent memory bloat
  private readonly MAX_SELECTORS = 5000;
  private readonly MAX_PAGES = 200;
  private readonly MAX_WORKFLOWS = 500;

  // ─── Selector Memory ─────────────────────────────────────────────────────

  /**
   * Store a successful selector for a given element description
   */
  rememberSelector(
    description: string,
    url: string,
    selector: string,
    success: boolean
  ): void {
    const key = this.normalizeKey(`${url}::${description}`);
    const existing = this.selectorCache.get(key);

    if (existing) {
      if (success) {
        // Move successful selector to front
        const idx = existing.selectors.indexOf(selector);
        if (idx > 0) {
          existing.selectors.splice(idx, 1);
          existing.selectors.unshift(selector);
        } else if (idx === -1) {
          existing.selectors.unshift(selector);
        }
        existing.hits++;
        existing.successRate = Math.min(1, existing.successRate + 0.1);
      } else {
        // Penalize failed selector
        existing.successRate = Math.max(0, existing.successRate - 0.05);
      }
      existing.lastSeen = new Date();
    } else if (success) {
      this.selectorCache.set(key, {
        description,
        url,
        selectors: [selector],
        successRate: 1.0,
        hits: 1,
        lastSeen: new Date(),
      });

      // Evict oldest if over limit
      if (this.selectorCache.size > this.MAX_SELECTORS) {
        const oldest = Array.from(this.selectorCache.entries() as Iterable<[string, SelectorMemory]>)
          .sort((a, b) => a[1].lastSeen.getTime() - b[1].lastSeen.getTime())[0];
        if (oldest) this.selectorCache.delete(oldest[0]);
      }
    }
  }

  /**
   * Recall best selectors for a given description on a page
   */
  recallSelectors(description: string, url: string): string[] {
    // Try exact match first
    const key = this.normalizeKey(`${url}::${description}`);
    const exact = this.selectorCache.get(key);
    if (exact && exact.successRate > 0.3) {
      return [...exact.selectors];
    }

    // Try without URL (cross-page selectors)
    const globalKey = this.normalizeKey(`*::${description}`);
    const global = this.selectorCache.get(globalKey);
    if (global && global.successRate > 0.3) {
      return [...global.selectors];
    }

    // Fuzzy match: find similar descriptions
    const results: { selectors: string[]; score: number }[] = [];
    const descNorm = description.toLowerCase();

    this.selectorCache.forEach((v, k) => {
      if (v.successRate < 0.3) return;
      const similarity = this.similarity(descNorm, v.description.toLowerCase());
      if (similarity > 0.7) {
        results.push({ selectors: v.selectors, score: similarity * v.successRate });
      }
    });

    if (results.length > 0) {
      results.sort((a, b) => b.score - a.score);
      return results[0].selectors;
    }

    return [];
  }

  /**
   * Remember a globally successful selector pattern (not URL-specific)
   */
  rememberGlobalPattern(description: string, selector: string): void {
    const key = this.normalizeKey(`*::${description}`);
    const existing = this.selectorCache.get(key);
    if (existing) {
      if (!existing.selectors.includes(selector)) {
        existing.selectors.unshift(selector);
      }
      existing.hits++;
      existing.lastSeen = new Date();
    } else {
      this.selectorCache.set(key, {
        description,
        url: '*',
        selectors: [selector],
        successRate: 0.9,
        hits: 1,
        lastSeen: new Date(),
      });
    }
  }

  // ─── Page State Memory ────────────────────────────────────────────────────

  /**
   * Save a DOM snapshot for a URL
   */
  savePageState(url: string, snapshot: Partial<SemanticDOM>): void {
    const normalized = this.normalizeUrl(url);
    this.pageStateCache.set(normalized, {
      url: normalized,
      title: snapshot.title || '',
      snapshot,
      timestamp: new Date(),
    });

    // Evict oldest if over limit
    if (this.pageStateCache.size > this.MAX_PAGES) {
      const oldest = Array.from(this.pageStateCache.entries())
        .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime())[0];
      if (oldest) this.pageStateCache.delete(oldest[0]);
    }
  }

  /**
   * Get last known DOM snapshot for a URL
   */
  getPageState(url: string): PageStateMemory | null {
    const normalized = this.normalizeUrl(url);
    const state = this.pageStateCache.get(normalized);
    if (!state) return null;

    // Only return if fresh (< 5 minutes)
    const age = Date.now() - state.timestamp.getTime();
    if (age > 5 * 60 * 1000) return null;

    return state;
  }

  // ─── Workflow Memory ──────────────────────────────────────────────────────

  /**
   * Save workflow history for a session
   */
  saveWorkflow(workflow: WorkflowMemory): void {
    this.workflowHistory.set(workflow.sessionId, workflow);

    // Also learn selectors from completed workflow
    for (const [stepId, selector] of Object.entries(workflow.selectors)) {
      this.rememberGlobalPattern(stepId, selector);
    }

    if (this.workflowHistory.size > this.MAX_WORKFLOWS) {
      const oldest = Array.from(this.workflowHistory.entries())
        .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime())[0];
      if (oldest) this.workflowHistory.delete(oldest[0]);
    }
  }

  /**
   * Get workflow memory for a session
   */
  getWorkflow(sessionId: string): WorkflowMemory | null {
    return this.workflowHistory.get(sessionId) ?? null;
  }

  // ─── Element Pattern Learning ─────────────────────────────────────────────

  /**
   * Learn common element patterns (e.g. "login button" → ['.btn-login', '#login-btn'])
   */
  learnElementPattern(elementType: string, selectors: string[]): void {
    const existing = this.elementPatterns.get(elementType) ?? [];
    const combined = [...selectors, ...existing];
    const seen = new Set<string>();
    const merged = combined.filter(s => seen.has(s) ? false : (seen.add(s), true)).slice(0, 10);
    this.elementPatterns.set(elementType, merged);
  }

  /**
   * Get known patterns for an element type
   */
  getElementPatterns(elementType: string): string[] {
    return this.elementPatterns.get(elementType) ?? [];
  }

  // ─── Best Selector Resolution ─────────────────────────────────────────────

  /**
   * Find best selector from a DOM snapshot for a given description
   * Used when memory doesn't have a match
   */
  findBestSelectorFromDOM(description: string, elements: DOMElement[]): DOMElement | null {
    if (!elements.length) return null;

    const descLower = description.toLowerCase();
    const keywords = descLower.split(/\s+/).filter(w => w.length > 2);

    let bestMatch: DOMElement | null = null;
    let bestScore = 0;

    for (const el of elements) {
      if (!el.isVisible || !el.isEnabled) continue;
      let score = 0;

      // Check text content
      if (el.textContent?.toLowerCase().includes(descLower)) score += 10;
      if (el.name?.toLowerCase().includes(descLower)) score += 10;
      if (el.ariaLabel?.toLowerCase().includes(descLower)) score += 9;
      if (el.placeholder?.toLowerCase().includes(descLower)) score += 8;
      if (el.id?.toLowerCase().includes(descLower.replace(/\s/g, ''))) score += 7;

      // Keyword matching
      for (const kw of keywords) {
        if (el.textContent?.toLowerCase().includes(kw)) score += 2;
        if (el.ariaLabel?.toLowerCase().includes(kw)) score += 2;
        if (el.id?.toLowerCase().includes(kw)) score += 1;
        if (el.placeholder?.toLowerCase().includes(kw)) score += 1;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = el;
      }
    }

    return bestScore > 0 ? bestMatch : null;
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  getStats() {
    return {
      selectorCacheSize: this.selectorCache.size,
      pageStateCacheSize: this.pageStateCache.size,
      workflowHistorySize: this.workflowHistory.size,
      elementPatternsSize: this.elementPatterns.size,
      topSelectors: Array.from(this.selectorCache.values())
        .sort((a, b) => b.hits - a.hits)
        .slice(0, 10)
        .map(s => ({ description: s.description, hits: s.hits, successRate: s.successRate })),
    };
  }

  clearAll(): void {
    this.selectorCache.clear();
    this.pageStateCache.clear();
    this.workflowHistory.clear();
    this.elementPatterns.clear();
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private normalizeKey(key: string): string {
    return key.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  private normalizeUrl(url: string): string {
    try {
      const u = new URL(url);
      return `${u.hostname}${u.pathname}`;
    } catch {
      return url;
    }
  }

  private similarity(a: string, b: string): number {
    const aWords = a.split(/\s+/);
    const bWords = b.split(/\s+/);
    const bSet = new Set(bWords);
    const intersection = aWords.filter(w => bSet.has(w));
    const allWords = [...aWords, ...bWords];
    const unionSize = new Set(allWords).size;
    return intersection.length / Math.max(unionSize, 1);
  }
}

export const memoryAgent = new MemoryAgent();
