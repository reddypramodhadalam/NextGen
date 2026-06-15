// ============================================================================
// AITAS Multi-Agent System — DOM Intelligence Agent
// Uses Playwright Accessibility Tree for semantic DOM extraction
// This is the CORE innovation: semantic understanding > raw XPath
// ============================================================================

import type { Page } from 'playwright';
import type {
  SemanticDOM,
  DOMElement,
  FormDOM,
  TableDOM,
  IframeDOM,
  AccessibilityNode,
} from './types.js';
import { memoryAgent } from './memory-agent.js';

export class DOMIntelligenceAgent {
  // ─── Main Entry Point ─────────────────────────────────────────────────────

  /**
   * Capture a full semantic representation of the current page.
   * Uses Playwright accessibility tree as the primary source of truth.
   */
  async capture(page: Page): Promise<SemanticDOM> {
    const url = page.url();
    const title = await page.title().catch(() => '');

    // Check memory first (avoid re-capturing if fresh)
    const cached = memoryAgent.getPageState(url);
    if (cached?.snapshot) {
      console.log(`[DOM] Using cached snapshot for ${url}`);
      return cached.snapshot as SemanticDOM;
    }

    console.log(`[DOM] Capturing semantic DOM for: ${url}`);

    // 1. Playwright Accessibility Tree (primary - semantic meaning)
    const accessibilityTree = await this.captureAccessibilityTree(page);

    // 2. Enhanced DOM extraction via JavaScript
    const rawElements = await this.extractElementsFromDOM(page);

    // 3. Build semantic DOM from both sources
    const semanticDOM = await this.buildSemanticDOM(page, accessibilityTree, rawElements, url, title);

    // 4. Cache in memory
    memoryAgent.savePageState(url, semanticDOM);

    console.log(`[DOM] Captured: ${semanticDOM.inputs.length} inputs, ${semanticDOM.buttons.length} buttons, ${semanticDOM.forms.length} forms`);
    return semanticDOM;
  }

  // ─── Accessibility Tree Capture ───────────────────────────────────────────

  private async captureAccessibilityTree(page: Page): Promise<AccessibilityNode | null> {
    try {
      // page.accessibility is deprecated in newer Playwright but still works
      const pageAny = page as any;
      if (pageAny.accessibility?.snapshot) {
        const snapshot = await pageAny.accessibility.snapshot({ interestingOnly: false });
        return snapshot as AccessibilityNode | null;
      }
      // Fallback: build a minimal accessibility tree from ARIA roles
      const tree = await page.evaluate(`
        (function() {
          function getNode(el, depth) {
            if (depth > 8 || !el) return null;
            var role = el.getAttribute('role') || el.tagName.toLowerCase();
            var name = el.getAttribute('aria-label') || (el.innerText || '').slice(0, 80);
            var children = Array.prototype.slice.call(el.children)
              .map(function(c) { return getNode(c, depth + 1); })
              .filter(Boolean);
            return { role: role, name: name, children: children.length ? children : undefined };
          }
          return getNode(document.body, 0);
        })()
      `).catch(() => null);
      return tree as AccessibilityNode | null;
    } catch (err: any) {
      console.warn(`[DOM] Accessibility tree capture failed: ${err.message}`);
      return null;
    }
  }

  // ─── Raw DOM Element Extraction ───────────────────────────────────────────

  private async extractElementsFromDOM(page: Page): Promise<any[]> {
    // NOTE: pass as string literal to avoid esbuild __name injection breaking page.evaluate
    const script = `(function() {
      var elements = [];
      var seen = {};

      function getSel(el) {
        if (el.id) return '#' + CSS.escape(el.id);
        var testid = el.getAttribute('data-testid');
        if (testid) return '[data-testid="' + testid + '"]';
        var aria = el.getAttribute('aria-label');
        if (aria) return '[aria-label="' + aria.replace(/"/g,'\\"') + '"]';
        var nm = el.getAttribute('name');
        if (nm) return el.tagName.toLowerCase() + '[name="' + nm + '"]';
        var parts = []; var cur = el;
        while (cur && cur !== document.body) {
          var tag = cur.tagName.toLowerCase();
          var par = cur.parentElement;
          if (par) {
            var sibs = Array.prototype.slice.call(par.children).filter(function(c){return c.tagName===cur.tagName;});
            var idx = sibs.indexOf(cur);
            parts.unshift(idx > 0 ? tag+':nth-of-type('+(idx+1)+')' : tag);
          } else { parts.unshift(tag); }
          cur = cur.parentElement;
        }
        return parts.join(' > ');
      }

      function getXP(el) {
        if (el.id) return '//*[@id="'+el.id+'"]';
        var parts = []; var cur = el;
        while (cur && cur.nodeType === 1) {
          var idx=1; var sib=cur.previousElementSibling;
          while(sib){if(sib.tagName===cur.tagName)idx++;sib=sib.previousElementSibling;}
          parts.unshift(cur.tagName.toLowerCase()+'['+idx+']');
          cur=cur.parentElement;
        }
        return '/'+parts.join('/');
      }

      function isVis(el) {
        var r=el.getBoundingClientRect();
        if(r.width===0||r.height===0) return false;
        var s=window.getComputedStyle(el);
        return s.visibility!=='hidden'&&s.display!=='none'&&s.opacity!=='0';
      }

      var sels = [
        'input:not([type="hidden"])','textarea','select',
        'button','[role="button"]','[type="submit"]',
        'a[href]','[role="link"]','[role="combobox"]','[role="listbox"]',
        '[role="checkbox"]','[role="radio"]',
        '[role="dialog"]','[role="alertdialog"]',
        'table','iframe','[data-testid]','[aria-label]'
      ];

      for (var si=0; si<sels.length; si++) {
        var nodes = document.querySelectorAll(sels[si]);
        for (var ni=0; ni<nodes.length; ni++) {
          var el = nodes[ni];
          var sel = getSel(el);
          if (seen[sel]) continue;
          seen[sel] = true;
          var rect = el.getBoundingClientRect();
          elements.push({
            tag: el.tagName.toLowerCase(),
            type: el.type || null,
            id: el.id || null,
            name: el.name || null,
            textContent: (el.textContent||'').trim().substring(0,200),
            innerText: (el.innerText||'').trim().substring(0,200),
            placeholder: el.placeholder || null,
            ariaLabel: el.getAttribute('aria-label') || null,
            role: el.getAttribute('role') || null,
            value: el.value || null,
            href: el.href || null,
            dataTestId: el.getAttribute('data-testid') || null,
            required: el.required || false,
            disabled: el.disabled || false,
            isVisible: isVis(el),
            isEnabled: !el.disabled,
            selector: sel,
            xpath: getXP(el),
            boundingBox: {x:rect.x,y:rect.y,width:rect.width,height:rect.height}
          });
          if(elements.length>=500) break;
        }
        if(elements.length>=500) break;
      }
      return elements;
    })()`;

    try {
      return await page.evaluate(script) as any[];
    } catch (err: any) {
      console.warn(`[DOM] Raw DOM extraction failed: ${err.message}`);
      return [];
    }
  }

  // ─── Semantic DOM Builder ─────────────────────────────────────────────────

  private async buildSemanticDOM(
    page: Page,
    accessibilityTree: AccessibilityNode | null,
    rawElements: any[],
    url: string,
    title: string
  ): Promise<SemanticDOM> {
    const inputs: DOMElement[] = [];
    const buttons: DOMElement[] = [];
    const links: DOMElement[] = [];
    const dropdowns: DOMElement[] = [];
    const checkboxes: DOMElement[] = [];
    const radios: DOMElement[] = [];
    const forms: FormDOM[] = [];
    const tables: TableDOM[] = [];
    const iframes: IframeDOM[] = [];
    const modals: DOMElement[] = [];

    for (const el of rawElements) {
      const domEl: DOMElement = {
        role: el.role || el.tag,
        name: el.ariaLabel || el.innerText || el.placeholder || el.name || '',
        selector: el.selector,
        xpath: el.xpath,
        id: el.id,
        type: el.type,
        placeholder: el.placeholder,
        value: el.value,
        href: el.href,
        ariaLabel: el.ariaLabel,
        textContent: el.innerText || el.textContent,
        isVisible: el.isVisible,
        isEnabled: el.isEnabled,
        boundingBox: el.boundingBox,
      };

      const tag = el.tag?.toLowerCase();
      const type = el.type?.toLowerCase();
      const role = el.role?.toLowerCase();

      // Classify element
      if (tag === 'input' && type === 'text' || type === 'email' || type === 'tel' ||
          type === 'password' || type === 'search' || type === 'number' ||
          type === 'date' || type === 'url' || !type) {
        if (tag === 'input' || tag === 'textarea') inputs.push(domEl);
      }
      if (tag === 'textarea') inputs.push(domEl);
      if (tag === 'button' || type === 'submit' || type === 'button' ||
          role === 'button') {
        buttons.push(domEl);
      }
      if (tag === 'a' || role === 'link') links.push(domEl);
      if (tag === 'select' || role === 'combobox' || role === 'listbox') {
        dropdowns.push(domEl);
      }
      if (type === 'checkbox' || role === 'checkbox') checkboxes.push(domEl);
      if (type === 'radio' || role === 'radio') radios.push(domEl);
      if (role === 'dialog' || role === 'alertdialog') modals.push(domEl);
    }

    // Extract forms
    const formElements = await this.extractForms(page, rawElements);
    forms.push(...formElements);

    // Extract tables
    const tableElements = await this.extractTables(page);
    tables.push(...tableElements);

    // Extract iframes
    const iframeCount = rawElements.filter(el => el.tag === 'iframe').length;
    for (let i = 0; i < iframeCount; i++) {
      const el = rawElements.filter(e => e.tag === 'iframe')[i];
      iframes.push({
        id: el?.id,
        name: el?.name,
        src: el?.href || el?.src,
        selector: el?.selector || `iframe:nth-of-type(${i + 1})`,
        index: i,
      });
    }

    // Check for alerts
    const hasAlert = await this.checkForAlert(page);

    // Get window count
    const windowCount = page.context().pages().length;

    return {
      url,
      title,
      inputs: this.deduplicateElements(inputs),
      buttons: this.deduplicateElements(buttons),
      links: this.deduplicateElements(links),
      forms,
      dropdowns: this.deduplicateElements(dropdowns),
      checkboxes: this.deduplicateElements(checkboxes),
      radios: this.deduplicateElements(radios),
      tables,
      iframes,
      modals,
      hasAlert,
      windowCount,
      accessibilityTree,
      rawElementCount: rawElements.length,
      capturedAt: new Date(),
    };
  }

  // ─── Form Extraction ──────────────────────────────────────────────────────

  private async extractForms(page: Page, rawElements: any[]): Promise<FormDOM[]> {
    const script = `(function() {
      var forms = [];
      function getSel(el) {
        if(el.id) return '#'+CSS.escape(el.id);
        var nm=el.name; if(nm) return el.tagName.toLowerCase()+'[name="'+nm+'"]';
        return el.tagName.toLowerCase();
      }
      var flist=document.querySelectorAll('form');
      for(var i=0;i<flist.length;i++) {
        var form=flist[i]; var fields=[];
        var finputs=form.querySelectorAll('input:not([type="hidden"]),textarea,select');
        for(var j=0;j<finputs.length;j++) {
          var f=finputs[j];
          fields.push({role:f.type||f.tagName.toLowerCase(),name:f.getAttribute('aria-label')||f.placeholder||f.name||f.id||'',selector:getSel(f),id:f.id||null,type:f.type||null,placeholder:f.placeholder||null,ariaLabel:f.getAttribute('aria-label')||null,isVisible:true,isEnabled:!f.disabled});
        }
        var sub=form.querySelector('[type="submit"],button:not([type="button"])');
        forms.push({id:form.id||null,name:form.getAttribute('name')||null,selector:form.id?'#'+form.id:'form:nth-of-type('+(i+1)+')',action:form.action||null,method:form.method||'get',fields:fields,submitButton:sub?{selector:getSel(sub),textContent:(sub.innerText||'').trim(),role:'button',isVisible:true,isEnabled:!sub.disabled}:null});
      }
      return forms;
    })()`;
    try {
      return await page.evaluate(script) as FormDOM[];
    } catch {
      return [];
    }
  }

  // ─── Table Extraction ─────────────────────────────────────────────────────

  private async extractTables(page: Page): Promise<TableDOM[]> {
    const script = `(function() {
      var tables=[]; var tlist=document.querySelectorAll('table');
      for(var i=0;i<tlist.length;i++) {
        var table=tlist[i]; var headers=[];
        var ths=table.querySelectorAll('thead th,thead td,tr:first-child th');
        for(var j=0;j<ths.length;j++) headers.push((ths[j].innerText||'').trim());
        tables.push({selector:table.id?'#'+table.id:'table:nth-of-type('+(i+1)+')',headers:headers,rowCount:table.querySelectorAll('tbody tr').length});
      }
      return tables;
    })()`;
    try {
      return await page.evaluate(script) as TableDOM[];
    } catch {
      return [];
    }
  }

  // ─── Alert Detection ──────────────────────────────────────────────────────

  private async checkForAlert(page: Page): Promise<boolean> {
    try {
      return await page.evaluate(`!!(document.querySelector('[role="alertdialog"],[role="dialog"]'))`) as boolean;
    } catch {
      return false;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private deduplicateElements(elements: DOMElement[]): DOMElement[] {
    const seen = new Set<string>();
    return elements.filter(el => {
      const key = el.selector + (el.textContent || '').slice(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ─── Targeted Capture ─────────────────────────────────────────────────────

  /**
   * Find the best locator for a described element using accessibility semantics
   */
  async findElement(
    page: Page,
    description: string,
    dom: SemanticDOM
  ): Promise<{ selector: string; strategy: string } | null> {
    const descLower = description.toLowerCase();

    // Strategy 1: Accessibility role + name (most reliable)
    const roleMatch = await this.findByAccessibilityRole(page, descLower);
    if (roleMatch) {
      console.log(`[DOM] Found by accessibility role: ${roleMatch.selector}`);
      return { selector: roleMatch.selector, strategy: 'accessibility-role' };
    }

    // Strategy 2: data-testid
    const testIdMatch = await this.findByTestId(page, descLower);
    if (testIdMatch) {
      console.log(`[DOM] Found by data-testid: ${testIdMatch}`);
      return { selector: testIdMatch, strategy: 'data-testid' };
    }

    // Strategy 3: Label / placeholder / aria-label
    const labelMatch = this.findInElements(descLower, [
      ...dom.inputs,
      ...dom.buttons,
      ...dom.dropdowns,
    ]);
    if (labelMatch) {
      console.log(`[DOM] Found by label/placeholder: ${labelMatch.selector}`);
      return { selector: labelMatch.selector, strategy: 'label-match' };
    }

    // Strategy 4: Text content match
    const textMatch = this.findByText(descLower, [...dom.buttons, ...dom.links]);
    if (textMatch) {
      console.log(`[DOM] Found by text: ${textMatch.selector}`);
      return { selector: textMatch.selector, strategy: 'text-match' };
    }

    // Strategy 5: Memory recall
    const remembered = memoryAgent.recallSelectors(description, dom.url);
    if (remembered.length > 0) {
      console.log(`[DOM] Found in memory: ${remembered[0]}`);
      return { selector: remembered[0], strategy: 'memory' };
    }

    console.warn(`[DOM] Could not find element: "${description}"`);
    return null;
  }

  private async findByAccessibilityRole(
    page: Page,
    description: string
  ): Promise<{ selector: string } | null> {
    const roleMap: Record<string, string[]> = {
      button: ['button', 'submit', 'btn'],
      textbox: ['input', 'field', 'text', 'email', 'name', 'search'],
      link: ['link', 'anchor', 'href'],
      checkbox: ['check', 'checkbox'],
      radio: ['radio'],
      combobox: ['dropdown', 'select', 'combo'],
      listbox: ['list', 'options'],
    };

    for (const [role, keywords] of Object.entries(roleMap)) {
      if (keywords.some(kw => description.includes(kw))) {
        try {
          // Try with the description as name
          const loc = page.getByRole(role as any, { name: new RegExp(description.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });
          const count = await loc.count().catch(() => 0);
          if (count > 0) {
            return { selector: `[role="${role}"][name*="${description}"]` };
          }
        } catch { /* continue */ }
      }
    }
    return null;
  }

  private async findByTestId(page: Page, description: string): Promise<string | null> {
    const keywords = description.split(/\s+/).filter(w => w.length > 2);
    for (const kw of keywords) {
      try {
        const loc = page.getByTestId(new RegExp(kw, 'i'));
        const count = await loc.count().catch(() => 0);
        if (count > 0) return `[data-testid*="${kw}"]`;
      } catch { /* continue */ }
    }
    return null;
  }

  private findInElements(description: string, elements: DOMElement[]): DOMElement | null {
    const descWords = description.split(/\s+/);
    let bestMatch: DOMElement | null = null;
    let bestScore = 0;

    for (const el of elements) {
      if (!el.isVisible || !el.isEnabled) continue;
      let score = 0;

      const fields = [
        el.ariaLabel,
        el.placeholder,
        el.textContent,
        el.name,
        el.id,
      ].map(f => (f || '').toLowerCase());

      for (const field of fields) {
        if (field.includes(description)) { score += 10; break; }
        for (const word of descWords) {
          if (word.length > 2 && field.includes(word)) score += 2;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = el;
      }
    }

    return bestScore > 3 ? bestMatch : null;
  }

  private findByText(description: string, elements: DOMElement[]): DOMElement | null {
    const descWords = description.split(/\s+/);

    // Exact match
    let match = elements.find(el =>
      el.isVisible &&
      el.textContent?.toLowerCase().trim() === description.trim()
    );
    if (match) return match;

    // Partial match
    match = elements.find(el =>
      el.isVisible &&
      el.textContent?.toLowerCase().includes(description)
    );
    if (match) return match;

    // Word match
    match = elements.find(el =>
      el.isVisible &&
      descWords.every(w => w.length <= 2 || el.textContent?.toLowerCase().includes(w))
    );
    return match || null;
  }

  /**
   * Generate a semantic summary of the DOM for AI consumption
   */
  summarizeForAI(dom: SemanticDOM): string {
    const lines: string[] = [
      `Page: "${dom.title}" at ${dom.url}`,
      `Windows: ${dom.windowCount}, Iframes: ${dom.iframes.length}, Alert: ${dom.hasAlert}`,
      '',
    ];

    if (dom.inputs.length > 0) {
      lines.push(`INPUTS (${dom.inputs.length}):`);
      dom.inputs.slice(0, 15).forEach(el => {
        const label = el.ariaLabel || el.placeholder || el.name || el.id || 'unknown';
        lines.push(`  [${el.type || 'text'}] "${label}" → ${el.selector}`);
      });
    }

    if (dom.buttons.length > 0) {
      lines.push(`BUTTONS (${dom.buttons.length}):`);
      dom.buttons.slice(0, 10).forEach(el => {
        const text = el.textContent || el.name || el.ariaLabel || el.id || 'button';
        lines.push(`  "${text}" → ${el.selector}`);
      });
    }

    if (dom.forms.length > 0) {
      lines.push(`FORMS (${dom.forms.length}):`);
      dom.forms.forEach(f => {
        lines.push(`  Form "${f.id || f.name || 'unnamed'}" (${f.fields.length} fields)`);
      });
    }

    if (dom.dropdowns.length > 0) {
      lines.push(`DROPDOWNS (${dom.dropdowns.length}):`);
      dom.dropdowns.slice(0, 5).forEach(el => {
        lines.push(`  "${el.name || el.ariaLabel || el.id}" → ${el.selector}`);
      });
    }

    if (dom.iframes.length > 0) {
      lines.push(`IFRAMES (${dom.iframes.length}):`);
      dom.iframes.forEach(f => {
        lines.push(`  "${f.name || f.id || f.src || `index:${f.index}`}" → ${f.selector}`);
      });
    }

    if (dom.accessibilityTree) {
      lines.push('');
      lines.push('ACCESSIBILITY TREE (top level):');
      const children = dom.accessibilityTree.children?.slice(0, 20) || [];
      for (const child of children) {
        if (child.name && child.role !== 'generic') {
          lines.push(`  [${child.role}] "${child.name}"`);
        }
      }
    }

    return lines.join('\n');
  }
}

export const domIntelligenceAgent = new DOMIntelligenceAgent();
