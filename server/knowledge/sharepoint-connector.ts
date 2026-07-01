/**
 * SharePoint Connector
 * ═══════════════════════════════════════════════════════════════════════════════
 * Crawls a SharePoint site, downloads documents (PDF/PPT/DOCX/Images), and
 * funnels each file into the existing IngestionEngine. This keeps SharePoint
 * inside the same Knowledge Base pipeline — no separate database, no separate
 * UI tab, no parallel code path.
 *
 *   SharePoint Site URL
 *       ↓
 *   Microsoft Graph API (OAuth 2.0)
 *       ↓
 *   Recursive folder traversal
 *       ↓
 *   Application-aware filtering (JDE/SAP/etc.)
 *       ↓
 *   For each file:  IngestionEngine.ingest()
 *       ↓
 *   Standard structured knowledge + vector index
 *
 * Authentication: Microsoft Graph supports three modes:
 *   1. Client credentials (app-only) - for enterprise admin-installed apps
 *   2. Authorization code (delegated) - for user-context access
 *   3. Bearer token passthrough - if the caller has obtained a token already
 *
 * For simplicity and zero-config testing, this connector accepts a bearer
 * token directly. In production, plug in your tenant-specific OAuth flow.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import nodePath from "path";
import { ingestionEngine } from "./ingestion-engine";
import { knowledgeStorage } from "../knowledge-storage";
import { resolveIngestionTarget, sha256, recordSourceFingerprint, purgeSourceKnowledge } from "./idempotent-ingest";

export interface SharePointConfig {
  /** e.g. https://contoso.sharepoint.com/sites/JDEDocs */
  siteUrl: string;
  /** Optional folder path inside the site, e.g. "Shared Documents/Specs" */
  folderPath?: string;
  /** OAuth bearer token (or client credentials token) for Microsoft Graph */
  accessToken: string;
  /** Restrict crawling to files mentioning these applications */
  applicationScope?: Array<"JDE" | "SAP" | "SALESFORCE" | "CUSTOM">;
  /** Module tag for ingestion (e.g. JDE_PROCUREMENT) */
  moduleTag?: string;
  /** Default application if no scope provided */
  application?: "JDE" | "SAP" | "SALESFORCE" | "CUSTOM";
  /** Maximum files to crawl per source (safety) */
  maxFiles?: number;
  /** Max recursion depth */
  maxDepth?: number;
}

interface SharePointFile {
  id: string;
  name: string;
  size: number;
  webUrl: string;
  downloadUrl: string;
  parentPath: string;
  mimeType?: string;
}

/** Filename extensions we know how to ingest. Anything else is skipped. */
const SUPPORTED_EXTS = new Set([
  ".pdf",
  ".pptx", ".ppt",
  ".docx", ".doc",
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp",
  ".txt", ".md", ".csv",
]);

/** Application detection heuristics — same logic as the structurer.
 *  This is the "application-aware filtering" step that prevents SAP docs from
 *  polluting JDE knowledge and vice versa. */
const APP_SIGNALS: Record<string, RegExp[]> = {
  JDE: [
    /\bP\d{4,5}\b/, // P4310, P0411
    /\bR\d{4,5}\b/, // R43500
    /\bF\d{4,5}\b/, // F4311
    /\bJDE\b/i,
    /JD\s*Edwards/i,
    /Orchestrator/i,
  ],
  SAP: [
    /\bME21N\b/, /\bVA01\b/, /\bMM\d{2}\b/, // T-codes
    /\bBAPI[_\s]/i,
    /\bSAP\b/,
    /S\/4\s*HANA/i,
    /\b(EKKO|EKPO|MARA|MARD)\b/, // SAP tables
  ],
  SALESFORCE: [
    /\bOpportunity\b/i,
    /\bSalesforce\b/i,
    /\bApex\b/,
    /\bSOQL\b/,
    /Lightning/i,
  ],
};

/** Returns the list of applications a piece of text appears to reference. */
function detectApplications(text: string): string[] {
  const apps: string[] = [];
  for (const [app, patterns] of Object.entries(APP_SIGNALS)) {
    if (patterns.some((re) => re.test(text))) {
      apps.push(app);
    }
  }
  return apps;
}

export class SharePointConnector {
  /**
   * Parse a SharePoint site URL into the hostname + site path needed by Graph.
   * Examples accepted:
   *   https://contoso.sharepoint.com/sites/JDEDocs
   *   https://contoso.sharepoint.com/teams/Finance
   */
  private parseSiteUrl(siteUrl: string): { hostname: string; sitePath: string } {
    try {
      const u = new URL(siteUrl);
      // sitePath should NOT have a leading slash for the Graph sites endpoint
      const sitePath = u.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
      return { hostname: u.hostname, sitePath };
    } catch {
      throw new Error(`Invalid SharePoint site URL: ${siteUrl}`);
    }
  }

  /**
   * Microsoft Graph API helper. Throws on non-2xx.
   */
  private async graphFetch(url: string, token: string): Promise<any> {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Graph API ${res.status}: ${body.slice(0, 300)}`);
    }
    return res.json();
  }

  /**
   * Resolves a site path to a Graph site ID.
   * GET /v1.0/sites/{hostname}:/sites/{sitePath}
   */
  private async resolveSiteId(siteUrl: string, token: string): Promise<string> {
    const { hostname, sitePath } = this.parseSiteUrl(siteUrl);
    const url = `https://graph.microsoft.com/v1.0/sites/${hostname}:/${sitePath}`;
    const site = await this.graphFetch(url, token);
    if (!site?.id) {
      throw new Error(`Could not resolve SharePoint site: ${siteUrl}`);
    }
    return site.id;
  }

  /**
   * Recursively traverse the drive items starting at a folder.
   * Yields one file at a time so we can apply filtering before download.
   */
  private async *crawlDrive(
    siteId: string,
    folderPath: string | undefined,
    token: string,
    maxDepth: number,
    currentDepth = 0,
    parentPath = ""
  ): AsyncGenerator<SharePointFile> {
    if (currentDepth > maxDepth) return;

    // Build the items URL for either root or a specific folder
    const itemsUrl = folderPath
      ? `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodeURIComponent(folderPath)}:/children`
      : `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root/children`;

    let nextLink: string | null = itemsUrl;
    while (nextLink) {
      const page: any = await this.graphFetch(nextLink, token);
      const items: any[] = page.value || [];

      for (const item of items) {
        const fullPath = parentPath ? `${parentPath}/${item.name}` : item.name;

        if (item.folder) {
          // Recurse into subfolder
          const childFolderPath = folderPath
            ? `${folderPath}/${item.name}`
            : item.name;
          yield* this.crawlDrive(
            siteId,
            childFolderPath,
            token,
            maxDepth,
            currentDepth + 1,
            fullPath
          );
        } else if (item.file) {
          const ext = nodePath.extname(item.name).toLowerCase();
          if (!SUPPORTED_EXTS.has(ext)) continue;

          yield {
            id: item.id,
            name: item.name,
            size: item.size || 0,
            webUrl: item.webUrl,
            downloadUrl: item["@microsoft.graph.downloadUrl"],
            parentPath: fullPath,
            mimeType: item.file?.mimeType,
          };
        }
      }

      nextLink = page["@odata.nextLink"] || null;
    }
  }

  /**
   * Downloads a file via the pre-authenticated downloadUrl.
   */
  private async downloadFile(downloadUrl: string): Promise<Buffer> {
    if (!downloadUrl) throw new Error("Missing download URL");
    const res = await fetch(downloadUrl);
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Quick application-aware filter using the file name only. The full
   * application check happens after extraction, but pre-filtering on filename
   * saves a lot of bandwidth.
   */
  private filterByAppScope(
    filename: string,
    scope?: string[]
  ): { keep: boolean; reason: string } {
    if (!scope || scope.length === 0) return { keep: true, reason: "no scope" };
    const detected = detectApplications(filename);
    if (detected.length === 0) {
      // Filename gave no signal — keep it; the post-extraction filter will decide.
      return { keep: true, reason: "filename neutral" };
    }
    const match = detected.some((app) => scope.includes(app));
    return {
      keep: match,
      reason: match ? `matches scope (${detected.join(",")})` : `outside scope (${detected.join(",")} not in ${scope.join(",")})`,
    };
  }

  /**
   * Crawl a SharePoint site and ingest matching files into the Knowledge Base.
   * Each file becomes its own KnowledgeSource record so the UI shows them
   * individually with their status.
   */
  async crawlAndIngest(
    parentSourceId: string,
    config: SharePointConfig
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
    let alreadyReady = 0;
    const maxFiles = config.maxFiles ?? 100;
    const maxDepth = config.maxDepth ?? 5;

    console.log(`[SharePoint] ═══ Starting crawl: ${config.siteUrl} ═══`);
    await knowledgeStorage.updateIngestionStatus(parentSourceId, "INGESTING");

    try {
      const siteId = await this.resolveSiteId(config.siteUrl, config.accessToken);
      console.log(`[SharePoint] Resolved site ID: ${siteId}`);

      for await (const file of this.crawlDrive(
        siteId,
        config.folderPath,
        config.accessToken,
        maxDepth
      )) {
        if (filesFound >= maxFiles) {
          console.log(`[SharePoint] Hit maxFiles limit (${maxFiles}). Stopping.`);
          break;
        }
        filesFound++;

        // Application-scope pre-filter (cheap, filename only)
        const scopeCheck = this.filterByAppScope(file.name, config.applicationScope);
        if (!scopeCheck.keep) {
          console.log(`[SharePoint] Skipping ${file.name} - ${scopeCheck.reason}`);
          filesSkipped++;
          continue;
        }

        try {
          const fileUrl = file.webUrl || `sharepoint://${file.id}`;
          const appForFile = config.application || (config.applicationScope?.[0] ?? "CUSTOM");

          // ── Cheap pre-check (no download): if this exact file is already READY
          //    and the byte size matches, skip it. This is what makes an
          //    interrupted crawl RESUMABLE — ready files cost nothing on re-run.
          const pre = await resolveIngestionTarget({ sourceUrl: fileUrl }, undefined, file.size);
          if (pre.action === "skip") {
            alreadyReady++;
            console.log(`[SharePoint] ⏭  Skip (already ready): ${file.name} — ${pre.reason}`);
            continue;
          }

          console.log(`[SharePoint] Downloading: ${file.parentPath} (${file.size} bytes)`);
          const buffer = await this.downloadFile(file.downloadUrl);
          const checksum = sha256(buffer);

          // ── Authoritative decision now that we have the real content hash.
          const decision = await resolveIngestionTarget({ sourceUrl: fileUrl }, checksum, buffer.length);
          if (decision.action === "skip") {
            alreadyReady++;
            console.log(`[SharePoint] ⏭  Skip (identical content): ${file.name} — ${decision.reason}`);
            continue;
          }

          // Resolve the target source row: reuse on update/resume, create otherwise.
          let sourceId: string;
          if (decision.action === "create") {
            const childSource = await knowledgeStorage.createKnowledgeSource({
              name: `${file.name} (from SharePoint)`,
              sourceType: "SHAREPOINT",
              sourceUrl: fileUrl,
              moduleTag: config.moduleTag,
              application: appForFile,
              authType: "OAUTH",
              status: "PENDING",
              documentCount: 0,
              checksum,
              contentSize: buffer.length,
            } as any);
            if (!childSource.id) throw new Error("Failed to create child source row");
            sourceId = childSource.id;
          } else {
            // update / resume → reuse the existing record (knowledge already purged
            // inside resolveIngestionTarget). Reset status so the pipeline re-runs.
            sourceId = decision.source.id!;
            await knowledgeStorage.updateIngestionStatus(sourceId, "PENDING");
            console.log(`[SharePoint] ♻  ${decision.action === "update" ? "Updating" : "Resuming"}: ${file.name} — ${decision.reason}`);
          }

          // Run the standard ingestion pipeline on this file
          const result = await ingestionEngine.ingest({
            sourceId,
            sourceName: file.name,
            buffer,
            mimeType: file.mimeType,
            extension: nodePath.extname(file.name).toLowerCase(),
            application: appForFile,
            module: config.moduleTag
              ? config.moduleTag.replace(/^[A-Z]+_/, "").replace(/_/g, " ")
              : undefined,
            moduleTag: config.moduleTag,
          });

          if (result.success) {
            filesIngested++;
            await recordSourceFingerprint(sourceId, checksum, buffer.length);
            console.log(`[SharePoint] ✓ Ingested ${file.name} - ${result.storage?.itemsStored ?? 0} items`);
          } else {
            errors.push(`${file.name}: ${result.errorMessage}`);
          }
        } catch (e: any) {
          errors.push(`${file.name}: ${e.message}`);
          console.error(`[SharePoint] Failed ${file.name}:`, e.message);
        }
      }

      // Mark parent source as ready
      await knowledgeStorage.updateIngestionStatus(parentSourceId, "READY");
      await knowledgeStorage.incrementDocumentCount(parentSourceId, filesIngested);

      console.log(
        `[SharePoint] ═══ Crawl complete: ${filesIngested}/${filesFound} files ingested, ${alreadyReady} already-ready skipped, ${filesSkipped} out-of-scope, ${errors.length} errors ═══`
      );

      return {
        success: errors.length < filesFound, // success if at least some files worked
        filesFound,
        filesIngested,
        filesSkipped,
        errors: errors.slice(0, 20), // cap error list
      };
    } catch (e: any) {
      console.error("[SharePoint] Crawl error:", e);
      await knowledgeStorage.updateIngestionStatus(parentSourceId, "FAILED", e.message);
      return {
        success: false,
        filesFound,
        filesIngested,
        filesSkipped,
        errors: [e.message, ...errors],
      };
    }
  }
}

export const sharePointConnector = new SharePointConnector();
