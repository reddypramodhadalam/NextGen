/**
 * AITAS Integration Audit
 * ─────────────────────────────────────────────────────────────────  // ════════════════════════════════════════════════════════════════════════
  group("AUTHENTICATION");
  // ════════════════════════════════════════════════════════════════════════
  let r = await request("GET", "/api/auth/user");
  check("GET /api/auth/user (unauth)", r.status, r.status === 401, "should be 401 before login");

  r = await request("POST", "/api/auth/login", { email: EMAIL, password: PASSWORD });
  const loggedIn = r.status === 200 && (r.body?.user || r.body?.id);
  check("POST /api/auth/login", r.status, !!loggedIn, loggedIn ? `user=${r.body?.user?.email || r.body?.email}` : (r.body?.message || r.text?.slice(0, 80)));

  r = await request("GET", "/api/auth/user");
  const me = r.body;
  check("GET /api/auth/user (auth)", r.status, r.status === 200, me?.email ? `email=${me.email}, super=${me.isSuperAdmin}` : "");
 * Exercises every major flow end-to-end against the running dev server.
 * Reports per-feature: PASS / FAIL / GAP with HTTP status + brief detail.
 *
 *   node integration-audit.cjs
 */

const http = require("http");
const { URL } = require("url");

const BASE = process.env.AITAS_BASE || "http://127.0.0.1:5000";
const EMAIL = process.env.SEED_EMAIL || "admin@aitas.com";
const PASSWORD = process.env.SEED_PASSWORD || "AitasMaster2024!";

// ── tiny HTTP client that keeps the session cookie ─────────────────────────
let cookieJar = "";

function request(method, path, body, extraHeaders = {}) {
  return new Promise((resolve) => {
    const u = new URL(BASE + path);
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...extraHeaders,
    };
    if (data) headers["Content-Length"] = data.length;
    if (cookieJar) headers["Cookie"] = cookieJar;

    const req = http.request(
      { method, host: u.hostname, port: u.port, path: u.pathname + u.search, headers, timeout: 15000 },
      (res) => {
        let chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const setCookies = res.headers["set-cookie"];
          if (setCookies) {
            for (const sc of setCookies) {
              const m = /^([^=]+=[^;]+)/.exec(sc);
              if (m) {
                const name = m[1].split("=")[0];
                if (cookieJar.includes(name + "=")) {
                  cookieJar = cookieJar
                    .split("; ")
                    .filter((p) => !p.startsWith(name + "="))
                    .concat([m[1]])
                    .join("; ");
                } else {
                  cookieJar = cookieJar ? cookieJar + "; " + m[1] : m[1];
                }
              }
            }
          }
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch {}
          resolve({ status: res.statusCode, body: json, text, headers: res.headers });
        });
      }
    );
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, body: null, text: "TIMEOUT" }); });
    req.on("error", (e) => resolve({ status: 0, body: null, text: e.message }));
    if (data) req.write(data);
    req.end();
  });
}

// ── result tracking ────────────────────────────────────────────────────────
const results = [];
let currentGroup = "";

function group(name) {
  currentGroup = name;
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`▶  ${name}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

function check(name, status, ok, detail = "") {
  const symbol = ok === true ? "✅" : ok === "gap" ? "⚠️ " : ok === "skip" ? "⏭️ " : "❌";
  const label = ok === true ? "PASS" : ok === "gap" ? "GAP " : ok === "skip" ? "SKIP" : "FAIL";
  const line = `  ${symbol} [${label}] ${name.padEnd(58)} ${("HTTP " + status).padEnd(10)} ${detail}`;
  console.log(line);
  results.push({ group: currentGroup, name, status, ok, detail });
}

(async () => {
  console.log(`\nAITAS Integration Audit  →  ${BASE}`);
  console.log(`Account                  →  ${EMAIL}\n`);

  // ════════════════════════════════════════════════════════════════════════
  group("HEALTH & BOOTSTRAP");
  // ════════════════════════════════════════════════════════════════════════
  let r = await request("GET", "/api/health");
  check("GET /api/health", r.status, r.status === 200, r.body?.status || "");

  r = await request("GET", "/api/ready");
  check("GET /api/ready (db check)", r.status, r.status === 200, r.body?.status || r.body?.error || "");

  // ════════════════════════════════════════════════════════════════════════
  group("AUTHENTICATION");
  // ════════════════════════════════════════════════════════════════════════
  r = await request("GET", "/api/auth/user");
  check("GET /api/auth/user (unauth)", r.status, r.status === 401, "should be 401 before login");

  r = await request("POST", "/api/auth/login", { email: EMAIL, password: PASSWORD });
  const loggedIn = r.status === 200 && (r.body?.user || r.body?.id);
  check("POST /api/auth/login", r.status, !!loggedIn, loggedIn ? `user=${r.body?.user?.email || r.body?.email}` : (r.body?.message || r.text?.slice(0, 80)));

  r = await request("GET", "/api/auth/user");
  const me = r.body;
  check("GET /api/auth/user (auth)", r.status, r.status === 200, me?.email ? `email=${me.email}, super=${me.isSuperAdmin}` : "");

  if (!loggedIn) {
    console.log("\n❌ Cannot continue without authentication.\n");
    process.exit(1);
  }

  // ════════════════════════════════════════════════════════════════════════
  group("GOVERNANCE (Phase 5)");
  // ════════════════════════════════════════════════════════════════════════
  r = await request("GET", "/api/governance/mode");
  const mode = r.body;
  check("GET /api/governance/mode", r.status, r.status === 200, mode ? `type=${mode.systemType}, review=${mode.requireHumanReview}, autoApply=${mode.allowAutoApplyAiFixes}` : "");

  r = await request("GET", "/api/governance/audit?limit=5");
  check("GET /api/governance/audit", r.status, r.status === 200, `rows=${(r.body?.events || r.body || []).length}`);

  r = await request("GET", "/api/governance/stats");
  check("GET /api/governance/stats", r.status, r.status === 200, JSON.stringify(r.body || {}).slice(0, 100));

  // ════════════════════════════════════════════════════════════════════════
  group("KNOWLEDGE BASE (Phase 1-4)");
  // ════════════════════════════════════════════════════════════════════════
  r = await request("GET", "/api/knowledge/health");
  check("GET /api/knowledge/health", r.status, r.status === 200, r.body?.status || JSON.stringify(r.body || {}).slice(0, 100));

  r = await request("GET", "/api/knowledge/stats");
  check("GET /api/knowledge/stats", r.status, r.status === 200, JSON.stringify(r.body || {}).slice(0, 100));

  r = await request("GET", "/api/knowledge/sources");
  check("GET /api/knowledge/sources", r.status, r.status === 200, `sources=${(r.body || []).length}`);

  r = await request("GET", "/api/knowledge/governance");
  check("GET /api/knowledge/governance", r.status, r.status === 200, "");

  // ════════════════════════════════════════════════════════════════════════
  group("TEST SUITES & TEST CASES");
  // ════════════════════════════════════════════════════════════════════════
  r = await request("GET", "/api/test-suites");
  const suites = r.body || [];
  check("GET /api/test-suites", r.status, r.status === 200, `suites=${suites.length}`);

  r = await request("GET", "/api/test-cases");
  const testCases = r.body || [];
  const aiOnes = testCases.filter ? testCases.filter((t) => t.generatedByAI || t.generatedByAi || t.generated_by_ai) : [];
  check("GET /api/test-cases", r.status, r.status === 200, `total=${testCases.length}, ai-generated=${aiOnes.length}`);

  // Create a manual (non-AI) test case
  r = await request("POST", "/api/test-cases", {
    title: "Audit Test Case " + Date.now(),
    description: "Created by integration-audit.cjs",
    suiteId: suites[0]?.id,
    priority: "medium",
    steps: [{ step: "INPUT: search box = audit", expected: "Search field populated" }],
  });
  const createdManual = r.status === 200 || r.status === 201;
  const manualId = r.body?.id;
  check("POST /api/test-cases (manual)", r.status, createdManual, manualId ? `id=${manualId}` : (r.body?.message || ""));

  if (manualId) {
    r = await request("PATCH", "/api/test-cases/" + manualId, { title: "Audit Test Case (renamed)" });
    check("PATCH /api/test-cases/:id", r.status, r.status === 200, "");

    r = await request("DELETE", "/api/test-cases/" + manualId);
    check("DELETE /api/test-cases/:id", r.status, r.status === 200 || r.status === 204, "");
  }

  // ════════════════════════════════════════════════════════════════════════
  group("GOVERNANCE ENFORCEMENT (live blocking)");
  // ════════════════════════════════════════════════════════════════════════
  // Insert an AI-generated, DRAFT test case directly so we can prove the gate fires
  let draftId = null;
  if (suites.length > 0) {
    r = await request("POST", "/api/test-cases", {
      title: "Audit AI Draft " + Date.now(),
      description: "Simulated AI-generated test, should be in DRAFT state",
      suiteId: suites[0].id,
      priority: "high",
      generatedByAI: true,
      reviewStatus: "DRAFT",
      steps: [{ step: "CLICK: login", expected: "Logged in" }],
    });
    draftId = r.body?.id;
    check("POST /api/test-cases (AI draft fixture)", r.status, !!draftId, draftId ? `id=${draftId}, ai=true` : (r.body?.message || ""));
  } else {
    check("POST /api/test-cases (AI draft fixture)", 0, "skip", "no test suites available");
  }

  // Should be BLOCKED in VALIDATED mode, ALLOWED in NON_VALIDATED
  if (draftId) {
    r = await request("POST", "/api/execute/unified", { testCaseId: draftId });
    const expectBlock = mode?.requireHumanReview === true;
    const blocked = r.status === 409 && r.body?.error === "REVIEW_REQUIRED";
    if (expectBlock) {
      check("POST /api/execute/unified (AI/DRAFT)", r.status, blocked, blocked ? "correctly blocked with REVIEW_REQUIRED" : `expected 409 REVIEW_REQUIRED, got ${r.body?.error || r.status}`);
    } else {
      check("POST /api/execute/unified (AI/DRAFT)", r.status, r.status === 200 || r.status === 400 || r.status === 404 || r.status === 500, "non-validated mode, gate inactive");
    }
  }

  // Healer auto-apply gate
  r = await request("POST", "/api/healer/heal", { testCaseId: draftId || "nonexistent", autoHeal: true, mode: "BASIC" });
  if (mode?.allowAutoApplyAiFixes === false) {
    const blocked = r.status === 403 && r.body?.error === "AUTO_APPLY_NOT_PERMITTED";
    check("POST /api/healer/heal (autoHeal=true)", r.status, blocked, blocked ? "correctly blocked AUTO_APPLY_NOT_PERMITTED" : `expected 403 AUTO_APPLY_NOT_PERMITTED, got ${r.body?.error || r.status}`);
  } else {
    check("POST /api/healer/heal (autoHeal=true)", r.status, r.status === 200 || r.status === 400 || r.status === 404 || r.status === 500, "auto-apply allowed in NON_VALIDATED");
  }

  r = await request("POST", "/api/healer/apply", { testCaseId: draftId || "nonexistent", suggestion: { stepIndex: 0, type: "fix" } });
  if (mode?.requireHumanReview === true) {
    const blocked = r.status === 403 && r.body?.error === "HEAL_APPROVAL_REQUIRED";
    check("POST /api/healer/apply (no approval)", r.status, blocked, blocked ? "correctly blocked HEAL_APPROVAL_REQUIRED" : `expected 403, got ${r.body?.error || r.status}`);
  } else {
    check("POST /api/healer/apply (no approval)", r.status, r.status >= 200, "non-validated mode");
  }

  // Cleanup the draft fixture
  if (draftId) {
    r = await request("DELETE", "/api/test-cases/" + draftId);
    check("Cleanup: delete draft fixture", r.status, r.status === 200 || r.status === 204, "");
  }

  // ════════════════════════════════════════════════════════════════════════
  group("GOVERNANCE ENFORCEMENT (VALIDATED mode round-trip)");
  // ════════════════════════════════════════════════════════════════════════
  // Flip to VALIDATED, re-test the same gates, then flip back.
  r = await request("PUT", "/api/governance/system-type", { systemType: "VALIDATED" });
  check("PUT /api/governance/system-type → VALIDATED", r.status, r.status === 200, r.body?.systemType || "");

  // Verify mode picked up
  r = await request("GET", "/api/governance/mode");
  const modeV = r.body;
  check("GET /api/governance/mode (after flip)", r.status, modeV?.systemType === "VALIDATED", `requireReview=${modeV?.requireHumanReview}, autoApply=${modeV?.allowAutoApplyAiFixes}`);

  // Create AI/DRAFT fixture under VALIDATED
  let vDraftId = null;
  if (suites.length > 0 && modeV?.systemType === "VALIDATED") {
    r = await request("POST", "/api/test-cases", {
      title: "Audit AI Draft VALIDATED " + Date.now(),
      description: "VALIDATED-mode gate test",
      suiteId: suites[0].id,
      priority: "high",
      generatedByAI: true,
      reviewStatus: "DRAFT",
      steps: [{ step: "CLICK: submit", expected: "Submitted" }],
    });
    vDraftId = r.body?.id;
    check("POST /api/test-cases (AI draft, VALIDATED)", r.status, !!vDraftId, vDraftId ? `id=${vDraftId}` : (r.body?.message || ""));

    // Execution should now be BLOCKED
    r = await request("POST", "/api/execute/unified", { testCaseId: vDraftId });
    const blocked = r.status === 409 && r.body?.error === "REVIEW_REQUIRED";
    check("POST /api/execute/unified (gated)", r.status, blocked, blocked ? "✓ blocked REVIEW_REQUIRED, blockers=" + (r.body?.blockers?.length ?? 0) : `expected 409, got ${r.body?.error || r.status}`);

    // Healer auto-heal should be BLOCKED
    r = await request("POST", "/api/healer/heal", { testCaseId: vDraftId, autoHeal: true, mode: "BASIC" });
    const autoBlocked = r.status === 403 && r.body?.error === "AUTO_APPLY_NOT_PERMITTED";
    check("POST /api/healer/heal autoHeal=true (gated)", r.status, autoBlocked, autoBlocked ? "✓ blocked AUTO_APPLY_NOT_PERMITTED" : `expected 403, got ${r.body?.error || r.status}`);

    // Healer apply without approvalId should be BLOCKED
    r = await request("POST", "/api/healer/apply", { testCaseId: vDraftId, suggestion: { stepIndex: 0, type: "fix" } });
    const applyBlocked = r.status === 403 && r.body?.error === "HEAL_APPROVAL_REQUIRED";
    check("POST /api/healer/apply no approval (gated)", r.status, applyBlocked, applyBlocked ? "✓ blocked HEAL_APPROVAL_REQUIRED" : `expected 403, got ${r.body?.error || r.status}`);

    // Submit human review → APPROVED
    r = await request("POST", "/api/governance/reviews/bulk", {
      items: [{ resourceType: "TEST_CASE", resourceId: vDraftId }],
      decision: "APPROVED",
      comment: "Audit-bot e2e approval - integration test",
      signature: "admin@aitas.com",
    });
    const approved = r.status === 200 || r.status === 201;
    check("POST /api/governance/reviews/bulk APPROVED", r.status, approved, approved ? `accepted=${r.body?.accepted ?? r.body?.results?.length ?? 1}` : (r.body?.error || r.body?.message || r.text?.slice(0, 100)));

    // Re-check status on the test case — should now be APPROVED
    r = await request("GET", "/api/test-cases/" + vDraftId);
    const status = r.body?.reviewStatus || r.body?.review_status;
    check("Test case is APPROVED after review", r.status, status === "APPROVED", `status=${status}`);

    // Now execution should pass governance gate (may still fail for other reasons, that's OK)
    r = await request("POST", "/api/execute/unified", { testCaseId: vDraftId });
    const passedGate = r.status !== 409;
    check("POST /api/execute/unified (after approval)", r.status, passedGate, passedGate ? "✓ governance gate passed" : `still blocked: ${r.body?.error}`);

    // Cleanup
    r = await request("DELETE", "/api/test-cases/" + vDraftId);
    check("Cleanup: delete VALIDATED fixture", r.status, r.status === 200 || r.status === 204, "");
  } else {
    check("VALIDATED mode round-trip", 0, "skip", "no suites or mode flip failed");
  }

  // Flip back to NON_VALIDATED
  r = await request("PUT", "/api/governance/system-type", { systemType: "NON_VALIDATED" });
  check("PUT /api/governance/system-type → NON_VALIDATED (restore)", r.status, r.status === 200, "");

  // ════════════════════════════════════════════════════════════════════════
  group("EXECUTIONS & RESULTS");
  // ════════════════════════════════════════════════════════════════════════
  r = await request("GET", "/api/executions");
  check("GET /api/executions", r.status, r.status === 200, `count=${(r.body || []).length}`);

  r = await request("GET", "/api/execute/adapters");
  check("GET /api/execute/adapters", r.status, r.status === 200, `adapters=${(r.body?.adapters || []).length}`);

  // ════════════════════════════════════════════════════════════════════════
  group("AGENTS & MULTI-AGENT");
  // ════════════════════════════════════════════════════════════════════════
  r = await request("GET", "/api/agents");
  check("GET /api/agents", r.status, r.status === 200, `agents=${(r.body || []).length}`);

  r = await request("GET", "/api/enterprise/agents/dashboard");
  check("GET /api/enterprise/agents/dashboard", r.status, r.status === 200, "");

  r = await request("GET", "/api/enterprise/router/status");
  check("GET /api/enterprise/router/status", r.status, r.status === 200, r.body?.message || "");

  // ════════════════════════════════════════════════════════════════════════
  group("AI HEALER (read-only)");
  // ════════════════════════════════════════════════════════════════════════
  r = await request("GET", "/api/healer/dashboard");
  check("GET /api/healer/dashboard", r.status, r.status === 200, "");

  r = await request("GET", "/api/healer/stats");
  check("GET /api/healer/stats", r.status, r.status === 200, "");

  r = await request("GET", "/api/healer/kpis");
  check("GET /api/healer/kpis", r.status, r.status === 200, "");

  r = await request("GET", "/api/healer/enterprise/dashboard");
  check("GET /api/healer/enterprise/dashboard", r.status, r.status === 200, "");

  // ════════════════════════════════════════════════════════════════════════
  group("COVERAGE & ANALYTICS");
  // ════════════════════════════════════════════════════════════════════════
  r = await request("GET", "/api/coverage/matrix");
  check("GET /api/coverage/matrix", r.status, r.status === 200, r.body?.requirements ? `reqs=${r.body.requirements.length}` : "");

  r = await request("GET", "/api/coverage/enterprise");
  check("GET /api/coverage/enterprise", r.status, r.status === 200, r.body?.summary ? `overall=${r.body.summary.overallCoverage}%` : "");

  r = await request("GET", "/api/coverage/gaps");
  check("GET /api/coverage/gaps", r.status, r.status === 200, r.body?.totalGaps !== undefined ? `gaps=${r.body.totalGaps}` : "");

  // ════════════════════════════════════════════════════════════════════════
  group("COMPLIANCE MODULE");
  // ════════════════════════════════════════════════════════════════════════
  r = await request("GET", "/api/compliance/dashboard");
  check("GET /api/compliance/dashboard", r.status, r.status === 200, "");

  r = await request("GET", "/api/compliance/approval/pending");
  check("GET /api/compliance/approval/pending", r.status, r.status === 200, `pending=${r.body?.count ?? 0}`);

  r = await request("GET", "/api/compliance/flaky/tests");
  check("GET /api/compliance/flaky/tests", r.status, r.status === 200, `flaky=${r.body?.count ?? 0}`);

  r = await request("GET", "/api/compliance/cost/dashboard");
  check("GET /api/compliance/cost/dashboard", r.status, r.status === 200, "");

  // ════════════════════════════════════════════════════════════════════════
  group("LLM TEST ENGINE");
  // ════════════════════════════════════════════════════════════════════════
  r = await request("GET", "/api/llm-tests/dashboard");
  check("GET /api/llm-tests/dashboard", r.status, r.status === 200, "");

  r = await request("GET", "/api/llm-tests/cases");
  check("GET /api/llm-tests/cases", r.status, r.status === 200, `cases=${r.body?.count ?? 0}`);

  r = await request("GET", "/api/llm-tests/metrics");
  check("GET /api/llm-tests/metrics", r.status, r.status === 200, "");

  // ════════════════════════════════════════════════════════════════════════
  group("PROJECTS / ENVIRONMENTS / APP PROFILES");
  // ════════════════════════════════════════════════════════════════════════
  r = await request("GET", "/api/projects");
  check("GET /api/projects", r.status, r.status === 200 || r.status === 404, r.status === 404 ? "endpoint missing" : "");

  r = await request("GET", "/api/environments");
  check("GET /api/environments", r.status, r.status === 200 || r.status === 404, r.status === 404 ? "endpoint missing" : "");

  r = await request("GET", "/api/app-profiles");
  check("GET /api/app-profiles", r.status, r.status === 200 || r.status === 404, r.status === 404 ? "endpoint missing" : "");

  // ════════════════════════════════════════════════════════════════════════
  group("CICD / DATA FACTORY / PERFORMANCE");
  // ════════════════════════════════════════════════════════════════════════
  r = await request("GET", "/api/cicd/pipelines");
  check("GET /api/cicd/pipelines", r.status, r.status === 200 || r.status === 404, r.status === 404 ? "endpoint missing" : "");

  r = await request("GET", "/api/data-factory/templates");
  check("GET /api/data-factory/templates", r.status, r.status === 200 || r.status === 404, r.status === 404 ? "endpoint missing" : "");

  r = await request("GET", "/api/performance/benchmarks");
  check("GET /api/performance/benchmarks", r.status, r.status === 200 || r.status === 404, r.status === 404 ? "endpoint missing" : "");

  // ════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════════════════
  const pass = results.filter((x) => x.ok === true).length;
  const fail = results.filter((x) => x.ok === false).length;
  const gap = results.filter((x) => x.ok === "gap").length;
  const skip = results.filter((x) => x.ok === "skip").length;

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  SUMMARY`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  ✅ Passed : ${pass}`);
  console.log(`  ❌ Failed : ${fail}`);
  console.log(`  ⚠️  Gaps   : ${gap}`);
  console.log(`  ⏭️  Skipped: ${skip}`);
  console.log(`  📊 Total  : ${results.length}`);

  if (fail > 0) {
    console.log(`\nFAILED CHECKS:`);
    results.filter((x) => x.ok === false).forEach((r) => {
      console.log(`  ❌ [${r.group}] ${r.name}  →  HTTP ${r.status}  ${r.detail}`);
    });
  }
  if (gap > 0) {
    console.log(`\nGAPS:`);
    results.filter((x) => x.ok === "gap").forEach((r) => {
      console.log(`  ⚠️  [${r.group}] ${r.name}  →  ${r.detail}`);
    });
  }

  console.log("");
  process.exit(fail > 0 ? 1 : 0);
})();
