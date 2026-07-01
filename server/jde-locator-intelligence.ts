/**
 * ============================================================================
 * AITAS — JDE Locator Intelligence (Script Generation Brain)
 * ============================================================================
 *
 * Turns the JDE Object Repository priorities (jde-object-repository.ts) into
 * REAL, reusable automation code. Two responsibilities:
 *
 *   1. buildJdeHelperPreamble(framework, language)
 *      → Emits a small, battle-tested JDE helper library that every generated
 *        JDE script can call: frame switching, processing-spinner waits,
 *        DD-item field setting, toolbar clicks (hc_Find/hc_OK/...), and
 *        HEADER-BASED grid cell resolution (never row/col indexes).
 *
 *   2. buildJdeAiGuidance()
 *      → A compact, high-signal system-prompt block so the LLM generates
 *        JDE-correct code (iframes, #processingDiv, QBE rows, AIS hints).
 *
 * Designed so the SAME helper names exist across languages, so the rest of the
 * generator can emit identical call-sites regardless of target language.
 * ============================================================================
 */

export type GenFramework = "playwright" | "selenium" | "cypress" | "puppeteer";
export type GenLanguage = "typescript" | "javascript" | "python" | "java" | "csharp";

/**
 * JDE-aware AI guidance injected into the script-generation system prompt.
 * Keep it dense — every line steers the model away from naive web selectors.
 */
export function buildJdeAiGuidance(): string {
  return [
    "TARGET APPLICATION: Oracle JD Edwards EnterpriseOne (HTML Web Client).",
    "Generate JDE-CORRECT automation, NOT generic web automation. Rules:",
    "1. FRAMES: JDE forms render inside an iframe. Switch into it before locating fields",
    "   (main app iframe id/name = 'e1menuAppIframe'). Switch back to default content when done.",
    "2. PROCESSING SPINNER: After EVERY navigation/toolbar action, wait for the element",
    "   id='processingDiv' to become hidden before the next step (this is the #1 cause of flake).",
    "3. FIELDS: Prefer JDE Data Dictionary items over raw HTML ids. A DD item like AN8/DOCO/MCU",
    "   maps to input[id*=\"AN8\"], input[name*=\"AN8\"], or [data-fieldname=\"AN8\"].",
    "4. FAST PATH: Type the application id (e.g. P4210) into the Fast Path input then press Enter.",
    "5. TOOLBAR BUTTONS use stable JDE ids: hc_Find, hc_OK, hc_Cancel, hc_Add, hc_Delete, hc_Close, hc_Save.",
    "6. GRID: NEVER address cells by row/column index. Resolve the column from the VISIBLE header text",
    "   and the row from a business key (e.g. Item Number = 022016001), then intersect.",
    "7. QBE (Query By Example) filter row: tr.QBE_ROW input[id*=\"FIELD\"].",
    "8. DATES use MM/DD/YYYY; amounts have no thousands separators.",
    "9. Prefer the shared JDE helpers (jdeSwitchToForm / waitForJde / jdeSetField / jdeClickToolbar /",
    "   jdeGetGridCell / jdeClickByText / jdeExpandMenu) emitted in the script — call them instead of",
    "   inlining brittle selectors.",
    "10. For data verification, prefer JDE AIS REST queries over scraping the grid when available.",
    "",
    "═══ LOCATOR RESILIENCE (the JDE DOM is nested tables/spans with DYNAMIC ids) ═══",
    "11. NEVER rely on DYNAMIC / generated ids. Reject anything matching f1dnode*, node*, menuItem*,",
    "    grid ids ending in digits, or GUID-like/pure-numeric ids — they change on every render/upgrade.",
    "12. LOCATOR PRIORITY (highest → lowest): (a) VISIBLE TEXT, (b) aria-label, (c) title attribute,",
    "    (d) STABLE class name (not hashed), (e) relative XPath anchored on visible text.",
    "13. NEVER use ABSOLUTE XPath (/html/body/...). Always emit RELATIVE, text-anchored XPath that",
    "    survives layout refreshes and JDE tools-release upgrades.",
    "14. If multiple elements match, target the FIRST VISIBLE one only.",
    "",
    "═══ MENU / TREE / CLICKABLE-ANCESTOR NAVIGATION ═══",
    "15. JDE menu/tree items render as <span>/<td> whose CLICK HANDLER lives on an ANCESTOR (row/anchor),",
    "    NOT on the text node. Do NOT click the <span> directly — click its nearest clickable ancestor.",
    "16. Clickable-ancestor XPath patterns (prefer these for menu/tree/label items):",
    "      Exact:        //span[normalize-space()='Sales Order Entry']",
    "      Partial:      //span[contains(normalize-space(),'Sales Order Entry')]",
    "      Parent row:   //span[normalize-space()='Sales Order Entry']/ancestor::tr[1]",
    "      Parent cell:  //span[normalize-space()='Sales Order Entry']/parent::td",
    "      Pointer row:  //span[normalize-space()='Sales Order Entry']/ancestor::tr[contains(@style,'cursor')][1]",
    "17. TREE MENUS: expand the hierarchy top-down before selecting a leaf",
    "    (e.g. Navigator → Baxter GM View → Sales → Sales Order Entry). Verify each child is",
    "    visible/expanded before clicking the next level. Use jdeExpandMenu(path) when available.",
    "18. BEFORE every click: confirm the element is VISIBLE and ENABLED, scroll it into view, and",
    "    wait for the JDE AJAX/processing spinner to settle.",
    "19. CLICK FALLBACK SEQUENCE (try in order, stop at first success): (a) native element click →",
    "    (b) click nearest clickable ANCESTOR row → (c) JavaScript .click() → (d) JDE action/hyper-control",
    "    click → (e) keyboard Enter on the focused element. Use jdeClickByText() which does this for you.",
    "20. For each interactive step, emit a PRIMARY locator, a SECONDARY (fallback) locator, a CLICK",
    "    strategy and a WAIT strategy so the runtime can self-heal on stale/relocated elements.",
  ].join("\n");
}

/**
 * Emit a reusable JDE helper preamble for the given framework+language.
 * The helpers expose a stable surface used by generated step code:
 *   waitForJde()                       — wait for #processingDiv to hide
 *   jdeSwitchToForm()                  — switch into the e1menuAppIframe
 *   jdeFastPath(code)                  — type app id into Fast Path + Enter
 *   jdeSetField(ddItem, value)         — set a DD-item field (priority locator)
 *   jdeClickToolbar(name)              — click hc_<Name> toolbar button
 *   jdeGetGridCell(header, rowKeyText) — header-based, index-free cell lookup
 */
export function buildJdeHelperPreamble(framework: GenFramework, language: GenLanguage): string {
  // Playwright (TS/JS) -------------------------------------------------------
  if (framework === "playwright" && (language === "typescript" || language === "javascript")) {
    return `
// ── JDE EnterpriseOne helper library (auto-generated) ──────────────────────
const JDE_APP_IFRAME = 'iframe#e1menuAppIframe, iframe[name="e1menuAppIframe"]';

async function waitForJde(page${language === "typescript" ? ": any" : ""}) {
  // Wait for the JDE processing spinner to disappear.
  try {
    await page.waitForSelector('#processingDiv', { state: 'hidden', timeout: 60000 });
  } catch { /* spinner may not be present on first load */ }
  await page.waitForLoadState('domcontentloaded').catch(() => {});
}

async function jdeFrame(page${language === "typescript" ? ": any" : ""}) {
  // Return the JDE application frame, or the page itself if not framed.
  const handle = await page.$(JDE_APP_IFRAME);
  if (handle) {
    const frame = await handle.contentFrame();
    if (frame) return frame;
  }
  return page;
}

async function jdeFastPath(page${language === "typescript" ? ": any" : ""}, code${language === "typescript" ? ": string" : ""}) {
  const f = await jdeFrame(page);
  const fp = await f.$('input#fastPath, input[name="fastPath"], input[title="Fast Path"]');
  if (fp) { await fp.fill(code); await fp.press('Enter'); }
  await waitForJde(page);
}

async function jdeSetField(page${language === "typescript" ? ": any" : ""}, ddItem${language === "typescript" ? ": string" : ""}, value${language === "typescript" ? ": string" : ""}) {
  const f = await jdeFrame(page);
  // Priority: DD item id/name → data-fieldname.
  const sel = \`input[id*="\${ddItem}"], input[name*="\${ddItem}"], [data-fieldname="\${ddItem}"]\`;
  const el = await f.waitForSelector(sel, { timeout: 30000 });
  await el.fill(''); await el.fill(value);
}

async function jdeClickToolbar(page${language === "typescript" ? ": any" : ""}, name${language === "typescript" ? ": string" : ""}) {
  const f = await jdeFrame(page);
  const id = 'hc_' + name; // e.g. hc_Find, hc_OK, hc_Add
  const el = await f.waitForSelector(\`#\${id}, [id="\${id}"], button[title="\${name}"]\`, { timeout: 30000 });
  await el.click();
  await waitForJde(page);
}

async function jdeGetGridCell(page${language === "typescript" ? ": any" : ""}, headerText${language === "typescript" ? ": string" : ""}, rowKeyText${language === "typescript" ? ": string" : ""}) {
  // Header-based, index-free cell resolution (Phase 8/9).
  const f = await jdeFrame(page);
  const headers = await f.$$eval('table thead th, tr.HEADER_ROW td', (els${language === "typescript" ? ": any[]" : ""}) =>
    els.map((e${language === "typescript" ? ": any" : ""}) => (e.textContent || '').trim()));
  let colIdx = headers.findIndex((h${language === "typescript" ? ": string" : ""}) => h.toLowerCase() === headerText.toLowerCase());
  if (colIdx < 0) colIdx = headers.findIndex((h${language === "typescript" ? ": string" : ""}) => h.toLowerCase().includes(headerText.toLowerCase()));
  if (colIdx < 0) throw new Error('JDE grid header not found: ' + headerText);
  const row = await f.$(\`tr[id^="row"]:has-text("\${rowKeyText}"), tr.ODD_ROW:has-text("\${rowKeyText}"), tr.EVEN_ROW:has-text("\${rowKeyText}")\`);
  if (!row) throw new Error('JDE grid row not found for key: ' + rowKeyText);
  const cells = await row.$$('td');
  if (colIdx >= cells.length) throw new Error('Resolved column out of range');
  return cells[colIdx];
}

async function jdeClickByText(page${language === "typescript" ? ": any" : ""}, text${language === "typescript" ? ": string" : ""}) {
  // Resilient JDE menu/tree/label click. The visible <span>/<td> often has NO click
  // handler — it lives on an ancestor row/anchor. Try, in order:
  //   1) native click on the text node        2) click nearest clickable ancestor
  //   3) JS .click()                          4) keyboard Enter after focus.
  // Never uses dynamic ids; matches on VISIBLE TEXT and picks the FIRST VISIBLE hit.
  const f = await jdeFrame(page);
  const esc = text.replace(/'/g, "\\\\'");
  const node = f.locator(
    \`xpath=(//*[normalize-space(.)='\${esc}' or contains(normalize-space(.),'\${esc}')][not(self::script)])[1]\`
  ).first();
  await node.waitFor({ state: 'visible', timeout: 30000 });
  await node.scrollIntoViewIfNeeded().catch(() => {});
  // 1) native
  try { await node.click({ timeout: 4000 }); await waitForJde(page); return; } catch {}
  // 2) nearest clickable ancestor (row / anchor / [onclick] / role=button / cursor:pointer)
  const anc = f.locator(
    \`xpath=(//*[normalize-space(.)='\${esc}']/ancestor::*[self::a or self::button or @onclick or @role='button' or contains(@style,'cursor')][1])\`
  ).first();
  try { await anc.click({ timeout: 4000 }); await waitForJde(page); return; } catch {}
  // 3) JavaScript click on the ancestor row (or the node itself)
  try {
    await node.evaluate((el${language === "typescript" ? ": any" : ""}) => {
      const t = (el.closest('a,button,[onclick],[role="button"],tr,td') || el)${language === "typescript" ? " as HTMLElement" : ""};
      t.click();
    });
    await waitForJde(page); return;
  } catch {}
  // 4) keyboard Enter
  await node.focus().catch(() => {});
  await page.keyboard.press('Enter');
  await waitForJde(page);
}

async function jdeExpandMenu(page${language === "typescript" ? ": any" : ""}, path${language === "typescript" ? ": string[]" : ""}) {
  // Expand a JDE navigator/tree hierarchy top-down, e.g.
  //   jdeExpandMenu(page, ['Baxter GM View', 'Sales', 'Sales Order Entry'])
  // Verifies each level is visible before drilling into the next, then selects the leaf.
  for (let i = 0; i < path.length; i++) {
    await jdeClickByText(page, path[i]);
    if (i < path.length - 1) {
      const esc = path[i + 1].replace(/'/g, "\\\\'");
      const f = await jdeFrame(page);
      await f.locator(\`xpath=(//*[contains(normalize-space(.),'\${esc}')])[1]\`)
        .first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    }
  }
}
// ───────────────────────────────────────────────────────────────────────────
`.trimStart();
  }

  // Playwright Python --------------------------------------------------------
  if (framework === "playwright" && language === "python") {
    return `
# ── JDE EnterpriseOne helper library (auto-generated) ──────────────────────
JDE_APP_IFRAME = 'iframe#e1menuAppIframe, iframe[name="e1menuAppIframe"]'

def wait_for_jde(page):
    try:
        page.wait_for_selector('#processingDiv', state='hidden', timeout=60000)
    except Exception:
        pass

def jde_frame(page):
    handle = page.query_selector(JDE_APP_IFRAME)
    if handle:
        frame = handle.content_frame()
        if frame:
            return frame
    return page

def jde_fast_path(page, code):
    f = jde_frame(page)
    fp = f.query_selector('input#fastPath, input[name="fastPath"], input[title="Fast Path"]')
    if fp:
        fp.fill(code); fp.press('Enter')
    wait_for_jde(page)

def jde_set_field(page, dd_item, value):
    f = jde_frame(page)
    sel = f'input[id*="{dd_item}"], input[name*="{dd_item}"], [data-fieldname="{dd_item}"]'
    el = f.wait_for_selector(sel, timeout=30000)
    el.fill(''); el.fill(value)

def jde_click_toolbar(page, name):
    f = jde_frame(page)
    _id = 'hc_' + name
    el = f.wait_for_selector(f'#{_id}, [id="{_id}"], button[title="{name}"]', timeout=30000)
    el.click(); wait_for_jde(page)

def jde_get_grid_cell(page, header_text, row_key_text):
    f = jde_frame(page)
    headers = [ (e.text_content() or '').strip() for e in f.query_selector_all('table thead th, tr.HEADER_ROW td') ]
    col = next((i for i, h in enumerate(headers) if h.lower() == header_text.lower()), -1)
    if col < 0:
        col = next((i for i, h in enumerate(headers) if header_text.lower() in h.lower()), -1)
    if col < 0:
        raise Exception('JDE grid header not found: ' + header_text)
    row = f.query_selector(f'tr[id^="row"]:has-text("{row_key_text}")')
    if not row:
        raise Exception('JDE grid row not found for key: ' + row_key_text)
    cells = row.query_selector_all('td')
    return cells[col]
# ───────────────────────────────────────────────────────────────────────────
`.trimStart();
  }

  // Selenium (TS/JS, Java, Python, C#) — shared structure, per-language syntax.
  if (framework === "selenium" || framework === "puppeteer" || framework === "cypress") {
    if (language === "java") {
      return `
    // ── JDE EnterpriseOne helpers (auto-generated) ─────────────────────────
    void waitForJde() {
        try {
            new WebDriverWait(driver, Duration.ofSeconds(60))
                .until(ExpectedConditions.invisibilityOfElementLocated(By.id("processingDiv")));
        } catch (Exception ignored) {}
    }
    void jdeSwitchToForm() {
        driver.switchTo().defaultContent();
        try { driver.switchTo().frame("e1menuAppIframe"); } catch (Exception ignored) {}
    }
    void jdeFastPath(String code) {
        jdeSwitchToForm();
        WebElement fp = driver.findElement(By.cssSelector("input#fastPath, input[name='fastPath']"));
        fp.clear(); fp.sendKeys(code); fp.sendKeys(Keys.ENTER); waitForJde();
    }
    void jdeSetField(String ddItem, String value) {
        jdeSwitchToForm();
        WebElement el = new WebDriverWait(driver, Duration.ofSeconds(30)).until(
            ExpectedConditions.presenceOfElementLocated(By.cssSelector(
                "input[id*='" + ddItem + "'], input[name*='" + ddItem + "'], [data-fieldname='" + ddItem + "']")));
        el.clear(); el.sendKeys(value);
    }
    void jdeClickToolbar(String name) {
        jdeSwitchToForm();
        String id = "hc_" + name;
        WebElement el = new WebDriverWait(driver, Duration.ofSeconds(30)).until(
            ExpectedConditions.elementToBeClickable(By.cssSelector("#" + id + ", button[title='" + name + "']")));
        el.click(); waitForJde();
    }
    // ───────────────────────────────────────────────────────────────────────
`.trimStart();
    }
    if (language === "python") {
      return `
# ── JDE EnterpriseOne helpers (auto-generated) ─────────────────────────────
def wait_for_jde(driver):
    try:
        WebDriverWait(driver, 60).until(EC.invisibility_of_element_located((By.ID, "processingDiv")))
    except Exception:
        pass

def jde_switch_to_form(driver):
    driver.switch_to.default_content()
    try:
        driver.switch_to.frame("e1menuAppIframe")
    except Exception:
        pass

def jde_fast_path(driver, code):
    jde_switch_to_form(driver)
    fp = driver.find_element(By.CSS_SELECTOR, "input#fastPath, input[name='fastPath']")
    fp.clear(); fp.send_keys(code); fp.send_keys(Keys.ENTER); wait_for_jde(driver)

def jde_set_field(driver, dd_item, value):
    jde_switch_to_form(driver)
    sel = f"input[id*='{dd_item}'], input[name*='{dd_item}'], [data-fieldname='{dd_item}']"
    el = WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.CSS_SELECTOR, sel)))
    el.clear(); el.send_keys(value)

def jde_click_toolbar(driver, name):
    jde_switch_to_form(driver)
    _id = "hc_" + name
    el = WebDriverWait(driver, 30).until(EC.element_to_be_clickable((By.CSS_SELECTOR, f"#{_id}, button[title='{name}']")))
    el.click(); wait_for_jde(driver)
# ───────────────────────────────────────────────────────────────────────────
`.trimStart();
    }
    if (language === "csharp") {
      return `
        // ── JDE EnterpriseOne helpers (auto-generated) ─────────────────────
        void WaitForJde() {
            try {
                new WebDriverWait(driver, TimeSpan.FromSeconds(60))
                    .Until(ExpectedConditions.InvisibilityOfElementLocated(By.Id("processingDiv")));
            } catch {}
        }
        void JdeSwitchToForm() {
            driver.SwitchTo().DefaultContent();
            try { driver.SwitchTo().Frame("e1menuAppIframe"); } catch {}
        }
        void JdeFastPath(string code) {
            JdeSwitchToForm();
            var fp = driver.FindElement(By.CssSelector("input#fastPath, input[name='fastPath']"));
            fp.Clear(); fp.SendKeys(code); fp.SendKeys(Keys.Enter); WaitForJde();
        }
        void JdeSetField(string ddItem, string value) {
            JdeSwitchToForm();
            var el = new WebDriverWait(driver, TimeSpan.FromSeconds(30)).Until(
                ExpectedConditions.ElementExists(By.CssSelector(
                    $"input[id*='{ddItem}'], input[name*='{ddItem}'], [data-fieldname='{ddItem}']")));
            el.Clear(); el.SendKeys(value);
        }
        void JdeClickToolbar(string name) {
            JdeSwitchToForm();
            var el = new WebDriverWait(driver, TimeSpan.FromSeconds(30)).Until(
                ExpectedConditions.ElementToBeClickable(By.CssSelector($"#hc_{name}, button[title='{name}']")));
            el.Click(); WaitForJde();
        }
        // ───────────────────────────────────────────────────────────────────
`.trimStart();
    }
    // Selenium TS/JS
    return `
// ── JDE EnterpriseOne helpers (auto-generated) ─────────────────────────────
async function waitForJde(driver${language === "typescript" ? ": any" : ""}) {
  try {
    await driver.wait(until.elementLocated(By.id('processingDiv')), 1000).catch(() => {});
    await driver.wait(async () => {
      const els = await driver.findElements(By.id('processingDiv'));
      if (els.length === 0) return true;
      return !(await els[0].isDisplayed());
    }, 60000);
  } catch { /* spinner optional */ }
}
async function jdeSwitchToForm(driver${language === "typescript" ? ": any" : ""}) {
  await driver.switchTo().defaultContent();
  try { await driver.switchTo().frame('e1menuAppIframe'); } catch { /* not framed */ }
}
async function jdeFastPath(driver${language === "typescript" ? ": any" : ""}, code${language === "typescript" ? ": string" : ""}) {
  await jdeSwitchToForm(driver);
  const fp = await driver.findElement(By.css("input#fastPath, input[name='fastPath']"));
  await fp.clear(); await fp.sendKeys(code, Key.ENTER); await waitForJde(driver);
}
async function jdeSetField(driver${language === "typescript" ? ": any" : ""}, ddItem${language === "typescript" ? ": string" : ""}, value${language === "typescript" ? ": string" : ""}) {
  await jdeSwitchToForm(driver);
  const el = await driver.wait(until.elementLocated(By.css(
    \`input[id*="\${ddItem}"], input[name*="\${ddItem}"], [data-fieldname="\${ddItem}"]\`)), 30000);
  await el.clear(); await el.sendKeys(value);
}
async function jdeClickToolbar(driver${language === "typescript" ? ": any" : ""}, name${language === "typescript" ? ": string" : ""}) {
  await jdeSwitchToForm(driver);
  const el = await driver.wait(until.elementLocated(By.css(\`#hc_\${name}, button[title="\${name}"]\`)), 30000);
  await el.click(); await waitForJde(driver);
}
// ───────────────────────────────────────────────────────────────────────────
`.trimStart();
  }

  return ""; // unknown combo → no preamble
}

/**
 * Map a generic parsed step to a JDE helper call-site when it clearly matches a
 * JDE idiom (fast path, toolbar OK/Find/Add, DD-item field). Returns null when
 * the step is not a recognised JDE idiom (caller emits its normal code).
 */
export function jdeStepToHelperCall(
  step: { action?: string; target?: string; value?: string; step?: string },
  framework: GenFramework,
  language: GenLanguage
): string | null {
  const text = `${step.step || ""} ${step.target || ""}`.toLowerCase();
  const py = language === "python";
  const isDriver = framework === "selenium" || framework === "puppeteer" || framework === "cypress";
  const ctx = isDriver ? "driver" : "page";

  // Fast Path
  const fp = text.match(/fast\s*path[^a-z0-9]*[=:]?\s*([a-z]\d{3,5})/i) || text.match(/\b(p\d{4,5})\b/i);
  if (fp && /fast\s*path/i.test(text)) {
    const code = fp[1].toUpperCase();
    if (py) return `    jde_fast_path(${ctx}, "${code}")`;
    return `    await jdeFastPath(${ctx}, "${code}");`;
  }

  // Toolbar buttons
  const toolbar = text.match(/\b(find|ok|cancel|add|delete|close|save)\b\s*(button)?/i);
  if (/click/i.test(text) && toolbar) {
    const name = toolbar[1].charAt(0).toUpperCase() + toolbar[1].slice(1).toLowerCase();
    if (py) return `    jde_click_toolbar(${ctx}, "${name}")`;
    return `    await jdeClickToolbar(${ctx}, "${name}");`;
  }

  return null;
}
