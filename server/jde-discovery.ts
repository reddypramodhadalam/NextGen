/**
 * ============================================================================
 * AITAS — JDE Live Discovery Harness (Phases 1-4, 9-11)
 * ============================================================================
 *
 * Captures JDE EnterpriseOne screen intelligence from the LIVE DOM and turns it
 * into Object Repository records:
 *   • Phase 1 — Screen intelligence (application, form, title, tab, section)
 *   • Phase 2 — Frame discovery (iframe hierarchy / frame_path)
 *   • Phase 3 — Object discovery (inputs, buttons, dropdowns, grid headers/cells)
 *   • Phase 4 — JDE metadata capture (DD item, control id)
 *   • Phase 5/6 — Locator candidates + anchors (delegated to repository helpers)
 *
 * The browser-side scan script (JDE_SCAN_SCRIPT) is framework-agnostic: it runs
 * via Selenium executeScript OR Playwright page.evaluate and returns a plain
 * JSON object. The pure mapper (mapScanToObjects) converts that into
 * StoredJDEObject[] for persistence — no browser needed, so it is unit-testable.
 * ============================================================================
 */

import {
  type Anchor,
  type LocatorCandidate,
  type LocatorStrategy,
} from "./jde-object-repository";
import { type StoredJDEObject } from "./jde-object-store";

// ----------------------------------------------------------------------------
// Browser-side scan script (string so it runs in Selenium OR Playwright).
// Returns a RawScreenScan JSON object. MUST be self-contained (no closures from
// here) because it executes inside the page.
// ----------------------------------------------------------------------------
export const JDE_SCAN_SCRIPT = `(function () {
  function txt(el) { return ((el && (el.textContent || el.innerText)) || '').replace(/\\s+/g, ' ').trim(); }
  function attr(el, n) { try { return el.getAttribute(n); } catch (e) { return null; } }

  // ── Phase 1: screen intelligence ──────────────────────────────────────────
  var title = txt(document.querySelector('#TITLE_TEXT, div.title_text, .formTitle')) || document.title || '';
  // JDE app id (Pxxxxx) / form id (Wxxxxx...) commonly appear in title, url, or a hidden field.
  var hay = (title + ' ' + location.href + ' ' + (document.body ? document.body.className : ''));
  var appMatch = hay.match(/\\bP\\d{4,6}\\b/);
  var formMatch = hay.match(/\\bW\\d{4,6}[A-Z]?\\b/);
  // Also probe common JDE globals if present.
  var jdeApp = null, jdeForm = null;
  try { if (window.JDEDTAFactory || window.e1) { /* hook points if exposed */ } } catch (e) {}

  var application = (appMatch ? appMatch[0] : (jdeApp || ''));
  var form = (formMatch ? formMatch[0] : (jdeForm || ''));

  var activeTab = txt(document.querySelector('.x-tab-strip-active, li.active[role="tab"], .tab.selected'));
  var section = txt(document.querySelector('.formSubtitle, .sectionTitle, fieldset > legend'));

  // ── Phase 2: frame discovery ──────────────────────────────────────────────
  var iframes = Array.prototype.slice.call(document.querySelectorAll('iframe')).map(function (f, i) {
    return { index: i, id: f.id || null, name: f.name || null, src: f.src || null };
  });

  // ── Phase 3 + 4: object + JDE metadata discovery ──────────────────────────
  var objects = [];
  var seen = {};
  function pushField(el, kind) {
    var id = el.id || '';
    var name = el.name || '';
    var key = kind + '::' + (id || name || txt(el));
    if (!key || seen[key]) return;
    seen[key] = true;

    // JDE DD item: typically the trailing token of the id/name (e.g. ..._AN8, mnAddressNumber_AN8).
    var ddItem = null, controlId = null;
    var idScan = (id || name);
    var ddm = idScan.match(/(?:^|[_\\-])([A-Z]{2,5}\\d{0,3})$/);
    if (ddm) ddItem = ddm[1];
    var cidm = idScan.match(/(?:_|\\b)(\\d{1,4})(?:_|$)/);
    if (cidm) controlId = cidm[1];

    // Business label: associated <label for>, aria-label, title, or nearest preceding label.
    var label = attr(el, 'aria-label') || attr(el, 'title') || '';
    if (!label && id) {
      var lab = document.querySelector('label[for="' + id + '"]');
      if (lab) label = txt(lab);
    }

    objects.push({
      object_name: name || id || label || txt(el) || (kind + '_' + objects.length),
      object_type: kind,
      business_label: label || null,
      html_id: id || null,
      html_name: name || null,
      aria_label: attr(el, 'aria-label'),
      title: attr(el, 'title'),
      data_fieldname: attr(el, 'data-fieldname'),
      dd_item: ddItem,
      control_id: controlId,
      tag: el.tagName ? el.tagName.toLowerCase() : null
    });
  }

  document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button])').forEach(function (el) { pushField(el, 'textbox'); });
  document.querySelectorAll('select').forEach(function (el) { pushField(el, 'dropdown'); });
  document.querySelectorAll('input[type=checkbox]').forEach(function (el) { pushField(el, 'checkbox'); });
  document.querySelectorAll('input[type=radio]').forEach(function (el) { pushField(el, 'radio'); });
  document.querySelectorAll('button, input[type=button], input[type=submit], [role=button]').forEach(function (el) { pushField(el, 'button'); });

  // Toolbar buttons (JDE hc_* convention).
  document.querySelectorAll('[id^="hc_"]').forEach(function (el) {
    var id = el.id || '';
    if (seen['toolbar::' + id]) return; seen['toolbar::' + id] = true;
    objects.push({
      object_name: id.replace(/^hc_/, '') || id,
      object_type: 'toolbar_button',
      business_label: attr(el, 'title') || txt(el) || null,
      html_id: id, html_name: null, dd_item: null, control_id: null, tag: 'button'
    });
  });

  // ── Phase 9: grid intelligence — capture VISIBLE headers (no indexes) ──────
  var gridHeaders = [];
  document.querySelectorAll('table thead th, tr.HEADER_ROW td, .gridHeader .cell').forEach(function (th) {
    var t = txt(th);
    if (t) gridHeaders.push(t);
  });

  // ── Phase 10: lazy-load hints ─────────────────────────────────────────────
  var virtualGrid = !!document.querySelector('.virtualGrid, [data-virtual], .x-grid3-scroller');

  return {
    application: application,
    form: form,
    title: title,
    tab: activeTab || null,
    section: section || null,
    url: location.href,
    iframes: iframes,
    objects: objects.slice(0, 400),
    gridHeaders: gridHeaders,
    virtualGrid: virtualGrid
  };
})()`;

// ----------------------------------------------------------------------------
// Types for the raw scan result.
// ----------------------------------------------------------------------------
export interface RawScannedObject {
  object_name: string;
  object_type: string;
  business_label?: string | null;
  html_id?: string | null;
  html_name?: string | null;
  aria_label?: string | null;
  title?: string | null;
  data_fieldname?: string | null;
  dd_item?: string | null;
  control_id?: string | null;
  tag?: string | null;
}

export interface RawScreenScan {
  application: string;
  form: string;
  title: string;
  tab?: string | null;
  section?: string | null;
  url: string;
  iframes: Array<{ index: number; id: string | null; name: string | null; src: string | null }>;
  objects: RawScannedObject[];
  gridHeaders: string[];
  virtualGrid: boolean;
}

export interface DiscoveryResult {
  application: string;
  form: string;
  framePath: string[];
  objects: StoredJDEObject[];
  gridHeaders: string[];
  virtualGrid: boolean;
  warnings: string[];
}

// ----------------------------------------------------------------------------
// Pure mapper: RawScreenScan → StoredJDEObject[] (Phase 5/6 candidate+anchor gen)
// ----------------------------------------------------------------------------
export function mapScanToObjects(scan: RawScreenScan, fallbackApp?: string): DiscoveryResult {
  const warnings: string[] = [];
  const application = (scan.application || fallbackApp || "").trim() || "UNKNOWN";
  if (!scan.application) warnings.push("Application id (Pxxxx) not detected on screen; used fallback/UNKNOWN.");
  const form = (scan.form || "").trim();
  if (!form) warnings.push("Form id (Wxxxx) not detected on screen.");

  // Frame path: prefer the known JDE app iframe name, else first iframe.
  const framePath: string[] = [];
  const appFrame = scan.iframes.find((f) => (f.name || f.id || "").toLowerCase().includes("e1menuappiframe"));
  if (appFrame) framePath.push(appFrame.name || appFrame.id || "e1menuAppIframe");
  else if (scan.iframes.length) framePath.push(scan.iframes[0].name || scan.iframes[0].id || "frame0");

  // Screen-level anchors shared by every object.
  const screenAnchors: Anchor[] = [];
  if (application && application !== "UNKNOWN") screenAnchors.push({ type: "application", value: application });
  if (form) screenAnchors.push({ type: "form", value: form });
  if (framePath.length) screenAnchors.push({ type: "frame", value: framePath.join("/") });
  if (scan.tab) screenAnchors.push({ type: "tab", value: scan.tab });
  if (scan.section) screenAnchors.push({ type: "section", value: scan.section });

  const objects: StoredJDEObject[] = scan.objects.map((raw) => {
    const candidates = buildLocatorCandidates(raw);
    const anchors: Anchor[] = [...screenAnchors];
    if (raw.business_label) anchors.push({ type: "label", value: raw.business_label });
    if (raw.object_type) anchors.push({ type: "control_type", value: raw.object_type });

    return {
      object_id: "", // assigned by store
      application,
      form,
      frame_path: framePath,
      tab: scan.tab || undefined,
      section: scan.section || undefined,
      object_name: raw.object_name,
      object_type: raw.object_type || "unknown",
      business_label: raw.business_label || undefined,
      jde_metadata: {
        dd_item: raw.dd_item || undefined,
        control_id: raw.control_id || undefined,
      },
      locator_candidates: candidates,
      anchors,
      self_healing: { enabled: true },
      source_url: scan.url,
    };
  });

  return {
    application,
    form,
    framePath,
    objects,
    gridHeaders: scan.gridHeaders || [],
    virtualGrid: !!scan.virtualGrid,
    warnings,
  };
}

/**
 * Build prioritised locator candidates (Phase 5) from a scanned object's
 * available identifiers. Confidence reflects expected stability.
 */
function buildLocatorCandidates(raw: RawScannedObject): LocatorCandidate[] {
  const out: LocatorCandidate[] = [];
  const add = (strategy: LocatorStrategy, value: string | null | undefined, confidence: number) => {
    if (value && value.trim()) out.push({ strategy, value: value.trim(), confidence });
  };

  add("dd_item", raw.dd_item, 0.99);
  add("control_id", raw.control_id, 0.9);
  // data-fieldname is a strong JDE signal — treat as a name-class locator.
  add("name", raw.data_fieldname || raw.html_name, 0.85);
  add("aria_label", raw.aria_label, 0.75);
  add("title", raw.title, 0.7);
  add("label_anchor", raw.business_label, 0.65);
  // HTML id last among "real" locators — JDE ids can be dynamic.
  if (raw.html_id) {
    const dynamic = /\d{5,}/.test(raw.html_id);
    add("xpath", `//*[@id="${raw.html_id}"]`, dynamic ? 0.4 : 0.6);
  }
  return out;
}
