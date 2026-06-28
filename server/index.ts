import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  (req, res, next) => {
    // Skip body parsing entirely for multipart file uploads — multer handles those
    const ct = req.headers["content-type"] || "";
    if (ct.startsWith("multipart/form-data")) return next();
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    })(req, res, next);
  }
);

app.use((req, res, next) => {
  const ct = req.headers["content-type"] || "";
  if (ct.startsWith("multipart/form-data")) return next();
  express.urlencoded({ extended: false })(req, res, next);
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // Only log if request took more than 100ms or is not a polling endpoint
      const isPollingEndpoint = path === "/api/executions" || path.includes("/results");
      const shouldLog = duration > 100 || !isPollingEndpoint;
      
      if (shouldLog) {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        // Only show response body for errors or non-GET requests, truncated
        if (capturedJsonResponse && (res.statusCode >= 400 || req.method !== "GET")) {
          const jsonStr = JSON.stringify(capturedJsonResponse);
          logLine += ` :: ${jsonStr.length > 200 ? jsonStr.substring(0, 200) + '...' : jsonStr}`;
        }
        log(logLine);
      }
    }
  });

  next();
});

(async () => {
  // ========================================
  // NEW: Initialize Enterprise Architecture
  // ========================================
  try {
    const { bootstrapNewArchitecture } = await import("./bootstrap-new-architecture");
    await bootstrapNewArchitecture(app);
    log("✅ New architecture bootstrapped", "bootstrap");
  } catch (error: any) {
    log(`⚠️  New architecture bootstrap warning: ${error.message}`, "bootstrap");
    // Continue anyway - old code still works
  }

  await registerRoutes(httpServer, app);

  // Bootstrap the Knowledge Base vector index (restore from DB if needed)
  try {
    const { bootstrapKnowledgeBase } = await import("./knowledge/bootstrap");
    bootstrapKnowledgeBase().catch((e: any) =>
      log(`⚠️  KB bootstrap warning: ${e.message}`, "kb-bootstrap")
    );
    log("Knowledge Base bootstrap initiated", "kb-bootstrap");
  } catch (error: any) {
    log(`⚠️  KB bootstrap import failed: ${error.message}`, "kb-bootstrap");
  }

  // Start agent health monitor
  const { agentHealthMonitor } = await import("./agent-health-monitor");
  agentHealthMonitor.start();
  log("Agent health monitor started", "agent-health");

  // Start system health monitor periodic checks
  const { healthMonitor } = await import("./health-monitor");
  healthMonitor.startPeriodicChecks(60000);
  log("System health monitor started", "health");

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      log(`serving on port ${port}`);
    },
  );

  // ========================================
  // NEW: Graceful Shutdown
  // ========================================
  process.on("SIGTERM", async () => {
    log("SIGTERM received, shutting down gracefully...", "shutdown");
    try {
      const { shutdownNewArchitecture } = await import("./bootstrap-new-architecture");
      await shutdownNewArchitecture();
    } catch {
      // Ignore shutdown errors
    }
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    log("SIGINT received, shutting down gracefully...", "shutdown");
    try {
      const { shutdownNewArchitecture } = await import("./bootstrap-new-architecture");
      await shutdownNewArchitecture();
    } catch {
      // Ignore shutdown errors
    }
    process.exit(0);
  });
})();
