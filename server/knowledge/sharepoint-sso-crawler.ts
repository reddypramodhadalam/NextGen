/**
 * SharePoint SSO Browser Crawler (no token)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Crawls an on-prem / SSO-protected SharePoint document library WITHOUT an OAuth
 * token. It reuses the SAME persistent Chrome profile the test executor uses for
 * JDE SSO, so the user signs in ONCE (interactively) and the crawler rides that
 * authenticated session.
 *
 *   Library URL (…/Forms/AllItems.aspx?RootFolder=/sites/.../SOP)
 *       ↓
 *   Headed Chrome with persistent SSO profile  → user signs in once
 *       ↓
 *   Read _spPageContextInfo (web URL) + parse RootFolder (target folder)
 *       ↓
 *   SharePoint REST (_api/web/GetFolderByServerRelativeUrl) via the BROWSER fetch
 *       ↓  (recursive into subfolders)
 *   Download each PDF/PPT/DOCX/Image  (node fetch w/ session cookies, browser fallback)
 *       ↓
 *   For each file:  IngestionEngine.ingest()  ← same pipeline as upload/Graph crawl
 *       ↓
 *   Structured knowledge + vector index
 *
 * Why a browser instead of Microsoft Graph?
 *   - The target (worksites.baxter.com) is on-prem SharePoint Server. Microsoft
 *     Graph only works for SharePoint Online, so Graph + token cannot reach it.
 *   - Claims/ADFS SSO uses session cookies which the persistent Chrome profile
 *     already holds after the user's one-time interactive login.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import nodePath from "path";
import * as os from "os";
import * as fs from "fs";
import { Builder, WebDriver } from "selenium-webdriver";
import { Options as ChromeOptions } from "selenium-webdriver/chrome";
import { ingestionEngine } from "./ingestion-engine";
import { knowledgeStorage } from "../knowledge-storage";
import { resolveIngestionTarget, sha256, recordSourceFingerprint } from "./idempotent-ingest";

export interface SsoCrawlConfig {
  /** The full library URL the user copied from the browser (AllItems.aspx?RootFolder=…) */
  libraryUrl: string;
  /** Default application identity for stored knowledge (e.g. "JDE"). */
  application?: string;
  /** Module tag for ingestion (e.g. JDE_SUPPLYCHAIN). */
  moduleTag?: string;
  /** Recurse into subfolders under the target folder. Default true. */
  recursive?: boolean;
  /** Maximum files to ingest (safety). Default 200. */
  maxFiles?: number;
  /** Max recursion depth. Default 10. */
  maxDepth?: number;
  /** How long (ms) to wait for the user to complete SSO sign-in. Default 180000. */
  loginTimeoutMs?: number;
}

interface DiscoveredFile {
  name: string;
  /** Server-relative URL, e.g. /sites/.../SOP/Spec.docx (decoded, raw spaces) */
  serverRelativeUrl: string;
  size: number;
  /** Folder path it was found in (for logging) */
  folder: string;
}

/** Filename extensions we know how to ingest. Anything else is skipped. */
const SUPPORTED_EXTS = new Set([
  ".pdf",
  ".pptx", ".ppt",
  ".docx", ".doc",
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp",
  ".txt", ".md", ".csv",
]);

/** SharePoint system folders that never contain real documents. */
const SKIP_FOLDER_NAMES = new Set(["forms", "_catalogs", "_private", "attachments"]);

/** Largest file (bytes) we will pull through the in-browser base64 fallback. */
const MAX_BROWSER_DOWNLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

export class SharePointSsoCrawler {
  // ────────────────────────────────────────────────────────────────────────────
  // Profile dir — mirror the test executor's "safe profile" logic so the SSO
  // cookies are SHARED with the JDE session (sign in once, reuse everywhere).
  // ────────────────────────────────────────────────────────────────────────────
  private resolveSafeProfileDir(): string {
    const safeDefault = nodePath.join(os.homedir(), ".aitas", "chrome-profile");
    const configured = (process.env.CHROME_PROFILE_DIR || "").trim();
    if (!configured) return safeDefault;

    const norm = nodePath.normalize(configured).replace(/[\\/]+$/, "").toLowerCase();
    const realChromeDirs = [
      process.env.LOCALAPPDATA ? nodePath.join(process.env.LOCALAPPDATA, "Google", "Chrome", "User Data") : null,
      nodePath.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "User Data"),
      nodePath.join(os.homedir(), "Library", "Application Support", "Google", "Chrome"),
      nodePath.join(os.homedir(), ".config", "google-chrome"),
    ]
      .filter((d): d is string => Boolean(d))
      .map((d) => nodePath.normalize(d).replace(/[\\/]+$/, "").toLowerCase());

    const clashesWithLiveChrome = realChromeDirs.some((d) => norm === d || norm.startsWith(d + nodePath.sep));
    if (clashesWithLiveChrome) {
      console.warn(
        `[SP-SSO] ⚠️  CHROME_PROFILE_DIR points at your LIVE Chrome profile; using a dedicated ` +
        `profile instead: ${safeDefault}`
      );
      return safeDefault;
    }
    return configured;
  }

  private clearStaleProfileLocks(profileDir: string): void {
    for (const name of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
      try { fs.rmSync(nodePath.join(profileDir, name), { force: true }); } catch {}
    }
  }

  private async launchBrowser(): Promise<WebDriver> {
    const options = new ChromeOptions();
    options.addArguments(
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--start-maximized",
      "--disable-popup-blocking",
      "--disable-notifications",
      "--disable-background-networking",
      "--disable-sync",
      "--log-level=3",
    );
    options.excludeSwitches("enable-automation", "enable-logging");

    // Reuse the persistent SSO profile (same as JDE). Headed so the user can sign in.
    if (process.env.REUSE_BROWSER_PROFILE !== "false") {
      const profileDir = this.resolveSafeProfileDir();
      try { fs.mkdirSync(profileDir, { recursive: true }); } catch {}
      this.clearStaleProfileLocks(profileDir);
      options.addArguments(`--user-data-dir=${profileDir}`, "--profile-directory=Default");
      console.log(`[SP-SSO] SSO profile reuse ON → ${profileDir} (headed; sign in once if prompted)`);
    }

    const driver = await new Builder().forBrowser("chrome").setChromeOptions(options).build();
    await driver.manage().setTimeouts({ implicit: 0, pageLoad: 60000, script: 60000 });
    return driver;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // URL parsing
  // ────────────────────────────────────────────────────────────────────────────

  /** Extract the target folder's server-relative URL from the library link. */
  private extractRootFolder(libraryUrl: string): string | null {
    try {
      const u = new URL(libraryUrl);
      const rf = u.searchParams.get("RootFolder") || u.searchParams.get("rootfolder") || u.searchParams.get("id");
      if (rf) return decodeURIComponent(rf);
      // No RootFolder param — derive from the path before "/Forms/"
      const path = decodeURIComponent(u.pathname);
      const formsIdx = path.toLowerCase().indexOf("/forms/");
      if (formsIdx > 0) return path.slice(0, formsIdx);
      return null;
    } catch {
      return null;
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Browser-context helpers (use the authenticated session automatically)
  // ────────────────────────────────────────────────────────────────────────────

  /** Wait until SharePoint has loaded and (if needed) the user has signed in. */
  private async waitForSignedInContext(
    driver: WebDriver,
    loginTimeoutMs: number
  ): Promise<{ webAbsoluteUrl: string; webServerRelativeUrl: string } | null> {
    const deadline = Date.now() + loginTimeoutMs;
    let announced = false;
    while (Date.now() < deadline) {
      const ctx = (await driver.executeScript(`
        try {
          var c = window._spPageContextInfo;
          if (c && c.webAbsoluteUrl) {
            return { ok:true, webAbsoluteUrl:c.webAbsoluteUrl, webServerRelativeUrl:c.webServerRelativeUrl };
          }
          return { ok:false, href: location.href, ready: document.readyState };
        } catch (e) { return { ok:false, error:String(e) }; }
      `)) as any;

      if (ctx && ctx.ok) {
        console.log(`[SP-SSO] ✓ Signed-in SharePoint context: ${ctx.webAbsoluteUrl}`);
        return { webAbsoluteUrl: ctx.webAbsoluteUrl, webServerRelativeUrl: ctx.webServerRelativeUrl };
      }
      if (!announced) {
        console.log(`[SP-SSO] Waiting for SharePoint/SSO to load… (sign in if prompted). href=${ctx?.href || "?"}`);
        announced = true;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    return null;
  }

  /** List one folder's files + subfolders via SharePoint REST (verbose), in-browser. */
  private async listFolder(
    driver: WebDriver,
    webAbsoluteUrl: string,
    folderServerRelativeUrl: string
  ): Promise<{ ok: boolean; files: Array<{ name: string; url: string; size: number }>; folders: Array<{ name: string; url: string }>; error?: string }> {
    const result = (await driver.executeAsyncScript(
      `
      var web = arguments[0].replace(/\\/$/, '');
      var folder = arguments[1];
      var cb = arguments[arguments.length - 1];
      function esc(p){ return p.replace(/'/g, "''"); }
      var fEsc = encodeURIComponent(esc(folder));
      var filesUrl   = web + "/_api/web/GetFolderByServerRelativeUrl('" + fEsc + "')/Files?$select=Name,ServerRelativeUrl,Length";
      var foldersUrl = web + "/_api/web/GetFolderByServerRelativeUrl('" + fEsc + "')/Folders?$select=Name,ServerRelativeUrl";
      var H = { headers: { Accept: 'application/json;odata=verbose' }, credentials: 'include' };
      Promise.all([
        fetch(filesUrl, H).then(function(r){ return r.ok ? r.json() : Promise.reject('files ' + r.status); }),
        fetch(foldersUrl, H).then(function(r){ return r.ok ? r.json() : Promise.reject('folders ' + r.status); })
      ]).then(function(res){
        var f = ((res[0].d && res[0].d.results) || []).map(function(x){ return { name:x.Name, url:x.ServerRelativeUrl, size:x.Length||0 }; });
        var d = ((res[1].d && res[1].d.results) || []).map(function(x){ return { name:x.Name, url:x.ServerRelativeUrl }; });
        cb({ ok:true, files:f, folders:d });
      }).catch(function(e){ cb({ ok:false, files:[], folders:[], error:String(e) }); });
      `,
      webAbsoluteUrl,
      folderServerRelativeUrl
    )) as any;
    return result;
  }

  /** DOM-scrape fallback: collect file links on the current AllItems.aspx page. */
  private async scrapePageForFiles(driver: WebDriver): Promise<Array<{ name: string; url: string; size: number }>> {
    const exts = Array.from(SUPPORTED_EXTS);
    const files = (await driver.executeScript(
      `
      var exts = arguments[0];
      var out = [];
      var seen = {};
      var anchors = Array.prototype.slice.call(document.querySelectorAll('a[href]'));
      anchors.forEach(function(a){
        var href = a.getAttribute('href') || '';
        try { href = decodeURIComponent(href); } catch(e){}
        var lower = href.toLowerCase();
        for (var i=0;i<exts.length;i++){
          if (lower.indexOf(exts[i]) === lower.length - exts[i].length && lower.length > exts[i].length){
            var name = href.split('/').pop().split('?')[0];
            if (!seen[href]) { seen[href] = 1; out.push({ name:name, url:href, size:0 }); }
            break;
          }
        }
      });
      return out;
      `,
      exts
    )) as Array<{ name: string; url: string; size: number }>;
    return files || [];
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Download — primary: node fetch w/ session cookies; fallback: in-browser base64
  // ────────────────────────────────────────────────────────────────────────────

  private async downloadFile(
    driver: WebDriver,
    origin: string,
    serverRelativeUrl: string,
    cookieHeader: string,
    size: number
  ): Promise<Buffer> {
    const absUrl = origin + encodeURI(serverRelativeUrl);

    // Strategy 1: node fetch with the browser's session cookies (handles big binaries).
    try {
      const res = await fetch(absUrl, {
        headers: { Cookie: cookieHeader, Accept: "application/octet-stream,*/*" },
        redirect: "follow",
      });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 0) return buf;
      } else {
        console.warn(`[SP-SSO] node download ${res.status} for ${serverRelativeUrl} — trying browser fallback`);
      }
    } catch (e: any) {
      console.warn(`[SP-SSO] node download failed (${e.message}) — trying browser fallback`);
    }

    // Strategy 2: in-browser fetch → base64 (works even with NTLM/Kerberos). Size-capped.
    if (size > 0 && size > MAX_BROWSER_DOWNLOAD_BYTES) {
      throw new Error(`File too large for browser fallback (${size} bytes) and node download failed`);
    }
    const b64 = (await driver.executeAsyncScript(
      `
      var url = arguments[0];
      var cb = arguments[arguments.length - 1];
      fetch(url, { credentials:'include' }).then(function(r){
        if (!r.ok) { cb({ ok:false, error:'HTTP ' + r.status }); return; }
        return r.blob();
      }).then(function(blob){
        if (!blob) return;
        var reader = new FileReader();
        reader.onloadend = function(){ cb({ ok:true, data: String(reader.result).split(',')[1] || '' }); };
        reader.onerror = function(){ cb({ ok:false, error:'read error' }); };
        reader.readAsDataURL(blob);
      }).catch(function(e){ cb({ ok:false, error:String(e) }); });
      `,
      absUrl
    )) as any;

    if (!b64 || !b64.ok || !b64.data) {
      throw new Error(`Browser download failed: ${b64?.error || "unknown"}`);
    }
    return Buffer.from(b64.data, "base64");
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Main entry
  // ────────────────────────────────────────────────────────────────────────────

  async crawlAndIngest(
    parentSourceId: string,
    config: SsoCrawlConfig
  ): Promise<{
    success: boolean;
    filesFound: number;
    filesIngested: number;
    filesSkipped: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let filesFound = 0;
    let filesIngested = 0;
    let filesSkipped = 0;
    const maxFiles = config.maxFiles ?? 200;
    const maxDepth = config.maxDepth ?? 10;
    const recursive = config.recursive !== false;
    const loginTimeoutMs = config.loginTimeoutMs ?? 180000;

    console.log(`[SP-SSO] ═══ Starting SSO crawl: ${config.libraryUrl} ═══`);
    await knowledgeStorage.updateIngestionStatus(parentSourceId, "INGESTING");

    let driver: WebDriver | null = null;
    try {
      // 1) Launch browser with the persistent SSO profile.
      try {
        driver = await this.launchBrowser();
      } catch (e: any) {
        throw new Error(
          `Could not launch Chrome with the SSO profile. If a JDE test browser is open, close it first ` +
          `(Chrome allows only one instance per profile). Details: ${e.message}`
        );
      }

      // 2) Navigate to the library and wait for SSO/context.
      await driver.get(config.libraryUrl);
      const ctx = await this.waitForSignedInContext(driver, loginTimeoutMs);
      if (!ctx) {
        throw new Error(
          `SharePoint did not finish loading / sign-in within ${Math.round(loginTimeoutMs / 1000)}s. ` +
          `Complete the SSO login in the opened Chrome window and retry.`
        );
      }
      const origin = new URL(ctx.webAbsoluteUrl).origin;

      // 3) Resolve the target folder from the RootFolder param (or web root).
      const targetFolder = this.extractRootFolder(config.libraryUrl) || ctx.webServerRelativeUrl;
      console.log(`[SP-SSO] Target folder: ${targetFolder} (recursive=${recursive}, maxDepth=${maxDepth})`);

      // 4) Grab session cookies for node-side binary downloads.
      const cookies = await driver.manage().getCookies();
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
      console.log(`[SP-SSO] Captured ${cookies.length} session cookie(s) for downloads`);

      // 5) Enumerate files (recursive BFS) via REST; fall back to DOM scrape.
      const discovered: DiscoveredFile[] = [];
      const queue: Array<{ folder: string; depth: number }> = [{ folder: targetFolder, depth: 0 }];
      let restWorked = false;

      while (queue.length > 0 && discovered.length < maxFiles) {
        const { folder, depth } = queue.shift()!;
        const listing = await this.listFolder(driver, ctx.webAbsoluteUrl, folder);

        if (!listing.ok) {
          console.warn(`[SP-SSO] REST listing failed for ${folder}: ${listing.error}`);
          continue;
        }
        restWorked = true;

        for (const f of listing.files) {
          const ext = nodePath.extname(f.name).toLowerCase();
          if (!SUPPORTED_EXTS.has(ext)) { filesSkipped++; continue; }
          discovered.push({ name: f.name, serverRelativeUrl: f.url, size: f.size, folder });
          if (discovered.length >= maxFiles) break;
        }

        if (recursive && depth < maxDepth) {
          for (const sub of listing.folders) {
            const base = sub.name.toLowerCase();
            if (SKIP_FOLDER_NAMES.has(base) || base.startsWith("_")) continue;
            queue.push({ folder: sub.url, depth: depth + 1 });
          }
        }
      }

      // 5b) Fallback: if REST never worked, scrape the current page for file links.
      if (!restWorked && discovered.length === 0) {
        console.warn(`[SP-SSO] REST API unavailable — falling back to DOM scrape of the library page`);
        const scraped = await this.scrapePageForFiles(driver);
        for (const f of scraped) {
          const ext = nodePath.extname(f.name).toLowerCase();
          if (!SUPPORTED_EXTS.has(ext)) { filesSkipped++; continue; }
          // f.url may be absolute or server-relative; normalize to server-relative.
          let srv = f.url;
          try { srv = new URL(f.url, origin).pathname; } catch {}
          discovered.push({ name: f.name, serverRelativeUrl: srv, size: 0, folder: targetFolder });
          if (discovered.length >= maxFiles) break;
        }
      }

      console.log(`[SP-SSO] Discovered ${discovered.length} ingestable file(s) (${filesSkipped} unsupported skipped)`);

      // 6) Download + ingest each file through the standard pipeline.
      //    IDEMPOTENT + RESUMABLE: files already ingested (READY, same size) are
      //    skipped without re-downloading; changed files update in place; an
      //    interrupted crawl can be re-run to finish only the missing/failed ones.
      let alreadyReady = 0;
      for (const file of discovered) {
        if (filesFound >= maxFiles) break;
        filesFound++;
        const fileUrl = origin + encodeURI(file.serverRelativeUrl);
        try {
          // 6a) Cheap pre-check: if this URL is already READY with the same byte
          //     size, skip it entirely (no re-download, no AI cost).
          const pre = await resolveIngestionTarget({ sourceUrl: fileUrl }, undefined, file.size);
          if (pre.action === "skip") {
            alreadyReady++;
            filesSkipped++;
            console.log(`[SP-SSO] ⏭️  (${filesFound}/${discovered.length}) Skip ${file.name} — ${pre.reason}`);
            continue;
          }

          console.log(`[SP-SSO] (${filesFound}/${discovered.length}) Downloading ${file.name} from ${file.folder}`);
          const buffer = await this.downloadFile(driver, origin, file.serverRelativeUrl, cookieHeader, file.size);
          const checksum = sha256(buffer);

          // 6b) Full decision now that we have the real bytes/checksum.
          const decision = await resolveIngestionTarget({ sourceUrl: fileUrl }, checksum, buffer.length);
          if (decision.action === "skip") {
            alreadyReady++;
            filesSkipped++;
            console.log(`[SP-SSO] ⏭️  Skip ${file.name} — ${decision.reason}`);
            continue;
          }

          // Reuse the existing record (update/resume) or create a new one.
          let childId: string;
          if (decision.action === "create") {
            const childSource = await knowledgeStorage.createKnowledgeSource({
              name: `${file.name} (from SharePoint)`,
              sourceType: "SHAREPOINT",
              sourceUrl: fileUrl,
              moduleTag: config.moduleTag,
              application: config.application || "CUSTOM",
              authType: "NONE",
              status: "PENDING",
              documentCount: 0,
              checksum,
              contentSize: buffer.length,
            } as any);
            if (!childSource.id) throw new Error("Failed to create child source row");
            childId = childSource.id;
          } else {
            childId = decision.source.id!;
            console.log(`[SP-SSO] ♻️  ${decision.action} ${file.name} — ${decision.reason}`);
            await knowledgeStorage.updateKnowledgeSource(childId, {
              status: "PENDING",
              errorMessage: undefined,
              checksum,
              contentSize: buffer.length,
            } as any);
          }

          const result = await ingestionEngine.ingest({
            sourceId: childId,
            sourceName: file.name,
            buffer,
            extension: nodePath.extname(file.name).toLowerCase(),
            application: config.application || "CUSTOM",
            module: config.moduleTag ? config.moduleTag.replace(/^[A-Z]+_/, "").replace(/_/g, " ") : undefined,
            moduleTag: config.moduleTag,
          });

          if (result.success) {
            filesIngested++;
            await recordSourceFingerprint(childId, checksum, buffer.length);
            console.log(`[SP-SSO] ✓ Ingested ${file.name} — ${result.storage?.itemsStored ?? 0} knowledge item(s)`);
          } else {
            errors.push(`${file.name}: ${result.errorMessage}`);
            await knowledgeStorage.updateIngestionStatus(childId, "FAILED", result.errorMessage);
          }
        } catch (e: any) {
          errors.push(`${file.name}: ${e.message}`);
          console.error(`[SP-SSO] ✗ Failed ${file.name}: ${e.message}`);
        }
      }

      await knowledgeStorage.updateIngestionStatus(parentSourceId, "READY");
      await knowledgeStorage.incrementDocumentCount(parentSourceId, filesIngested);

      console.log(
        `[SP-SSO] ═══ Crawl complete: ${filesIngested} ingested, ${alreadyReady} already-ready skipped, ` +
        `${filesSkipped} total skipped, ${errors.length} error(s) ═══`
      );

      return {
        success: filesIngested > 0 || alreadyReady > 0,
        filesFound,
        filesIngested,
        filesSkipped,
        errors: errors.slice(0, 20),
      };
    } catch (e: any) {
      console.error(`[SP-SSO] Crawl error: ${e.message}`);
      await knowledgeStorage.updateIngestionStatus(parentSourceId, "FAILED", e.message);
      return {
        success: false,
        filesFound,
        filesIngested,
        filesSkipped,
        errors: [e.message, ...errors],
      };
    } finally {
      if (driver) {
        try { await driver.quit(); } catch {}
      }
    }
  }
}

export const sharePointSsoCrawler = new SharePointSsoCrawler();
