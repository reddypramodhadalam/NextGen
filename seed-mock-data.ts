/**
 * AITAS Mock Data Seeder
 * Seeds rich realistic data across all features for headed UI testing
 */

const BASE = "http://127.0.0.1:5000";
let sessionCookie = "";

async function api(method: string, path: string, body?: any) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sessionCookie) headers["Cookie"] = sessionCookie;
  const res = await fetch(`${BASE}${path}`, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) sessionCookie = setCookie.split(";")[0];
  try { return await res.json(); } catch { return {}; }
}

async function seed() {
  console.log("\n🌱 Seeding AITAS mock data...\n");

  // ── Auth ──────────────────────────────────────────────────────────────────
  await api("POST", "/api/auth/login", { email: "admin@aitas.com", password: "AitasMaster2024!" });
  console.log("✓ Authenticated");

  // ── Requirements ─────────────────────────────────────────────────────────
  const reqs = [
    { title: "User Authentication & SSO", description: "Support login via email/password and SSO providers", priority: "critical", status: "active" },
    { title: "Dashboard Analytics", description: "Real-time test execution metrics and trend charts", priority: "high", status: "active" },
    { title: "Multi-Environment Support", description: "Run tests across dev, staging, and production", priority: "high", status: "in_progress" },
    { title: "AI Test Generation", description: "Generate test cases from natural language requirements", priority: "medium", status: "active" },
    { title: "CI/CD Pipeline Integration", description: "Trigger tests from GitHub Actions, Jenkins, Azure DevOps", priority: "high", status: "active" },
    { title: "Visual Regression Testing", description: "Pixel-perfect screenshot comparison across releases", priority: "medium", status: "active" },
    { title: "Performance Benchmarking", description: "Load testing with p95/p99 latency thresholds", priority: "medium", status: "pending" },
    { title: "Mobile App Testing", description: "iOS and Android test automation via Appium", priority: "low", status: "active" },
  ];
  for (const r of reqs) {
    await api("POST", "/api/requirements", r);
  }
  console.log(`✓ ${reqs.length} requirements seeded`);

  // ── Environments ─────────────────────────────────────────────────────────
  const envs = [
    { name: "development", displayName: "Development", baseUrl: "http://localhost:3000", variables: { API_URL: "http://localhost:3000/api", DEBUG: "true", LOG_LEVEL: "verbose" }, isDefault: false },
    { name: "staging", displayName: "Staging", baseUrl: "https://staging.myapp.com", variables: { API_URL: "https://staging.myapp.com/api", FEATURE_FLAGS: "all" }, isDefault: true },
    { name: "production", displayName: "Production", baseUrl: "https://myapp.com", variables: { API_URL: "https://myapp.com/api", ANALYTICS: "true" }, isDefault: false },
    { name: "qa", displayName: "QA Environment", baseUrl: "https://qa.myapp.com", variables: { API_URL: "https://qa.myapp.com/api", MOCK_PAYMENTS: "true" }, isDefault: false },
  ];
  for (const e of envs) {
    await api("POST", "/api/environments", e);
  }
  console.log(`✓ ${envs.length} environments seeded`);

  // ── Test Suites ───────────────────────────────────────────────────────────
  const suiteData = [
    { name: "Authentication & Authorization", description: "Login, logout, SSO, MFA, password reset flows", tags: ["auth", "security", "smoke"] },
    { name: "E-Commerce Checkout Flow", description: "Cart, payment, order confirmation end-to-end", tags: ["checkout", "payments", "critical"] },
    { name: "User Profile Management", description: "Profile update, avatar upload, preferences", tags: ["profile", "settings"] },
    { name: "API Integration Tests", description: "REST and GraphQL endpoint validation", tags: ["api", "integration"] },
    { name: "Mobile Regression Suite", description: "iOS and Android core feature regression", tags: ["mobile", "regression"] },
    { name: "Performance Baseline", description: "Load time and Core Web Vitals benchmarks", tags: ["performance", "baseline"] },
  ];
  const suiteIds: string[] = [];
  for (const s of suiteData) {
    const res = await api("POST", "/api/test-suites", s);
    if (res?.id) suiteIds.push(res.id);
  }
  console.log(`✓ ${suiteIds.length} test suites seeded`);

  // ── Test Cases ────────────────────────────────────────────────────────────
  const testCases = [
    // Auth suite
    { suiteId: suiteIds[0], title: "Login with valid email and password", priority: "critical", tags: ["smoke", "auth"], steps: [{ step: "Navigate to /login", expected: "Login page loads" }, { step: "Enter valid email", expected: "Email accepted" }, { step: "Enter valid password", expected: "Password accepted" }, { step: "Click Sign In", expected: "Redirected to dashboard" }] },
    { suiteId: suiteIds[0], title: "Login fails with wrong password", priority: "high", tags: ["negative", "auth"], steps: [{ step: "Navigate to /login", expected: "Login page loads" }, { step: "Enter valid email", expected: "Email accepted" }, { step: "Enter wrong password", expected: "Password accepted" }, { step: "Click Sign In", expected: "Error message shown" }] },
    { suiteId: suiteIds[0], title: "Password reset via email link", priority: "high", tags: ["auth", "email"], steps: [{ step: "Click Forgot Password", expected: "Reset form shown" }, { step: "Enter registered email", expected: "Email accepted" }, { step: "Submit form", expected: "Confirmation message shown" }, { step: "Click link in email", expected: "Reset password page opens" }] },
    { suiteId: suiteIds[0], title: "SSO login via Google OAuth", priority: "medium", tags: ["sso", "oauth"], steps: [{ step: "Click Sign in with Google", expected: "Google OAuth popup opens" }, { step: "Select Google account", expected: "Account selected" }, { step: "Grant permissions", expected: "Permissions granted" }, { step: "Redirected back to app", expected: "User logged in" }] },
    { suiteId: suiteIds[0], title: "Session expires after inactivity", priority: "medium", tags: ["session", "security"], steps: [{ step: "Login successfully", expected: "User logged in" }, { step: "Wait 30 minutes idle", expected: "Session timer runs" }, { step: "Attempt any action", expected: "Redirected to login" }] },
    // Checkout suite
    { suiteId: suiteIds[1], title: "Add item to cart and checkout", priority: "critical", tags: ["checkout", "smoke"], steps: [{ step: "Browse product catalog", expected: "Products listed" }, { step: "Click Add to Cart", expected: "Item added, cart count updates" }, { step: "Navigate to cart", expected: "Cart shows item" }, { step: "Click Checkout", expected: "Checkout form shown" }, { step: "Enter payment details", expected: "Payment form accepted" }, { step: "Confirm order", expected: "Order confirmation shown" }] },
    { suiteId: suiteIds[1], title: "Apply discount coupon code", priority: "high", tags: ["checkout", "discount"], steps: [{ step: "Add item to cart", expected: "Item in cart" }, { step: "Enter coupon SAVE20", expected: "Coupon field accepts input" }, { step: "Apply coupon", expected: "20% discount applied" }, { step: "Verify total", expected: "Total reflects discount" }] },
    { suiteId: suiteIds[1], title: "Payment fails with invalid card", priority: "high", tags: ["checkout", "negative", "payments"], steps: [{ step: "Proceed to checkout", expected: "Checkout page shown" }, { step: "Enter invalid card number", expected: "Card field accepts input" }, { step: "Submit payment", expected: "Payment error shown" }] },
    // Profile suite
    { suiteId: suiteIds[2], title: "Update user display name", priority: "medium", tags: ["profile"], steps: [{ step: "Navigate to profile settings", expected: "Profile page loads" }, { step: "Edit display name field", expected: "Field is editable" }, { step: "Save changes", expected: "Success toast shown" }, { step: "Refresh page", expected: "New name persists" }] },
    { suiteId: suiteIds[2], title: "Upload profile avatar image", priority: "low", tags: ["profile", "upload"], steps: [{ step: "Click avatar upload button", expected: "File picker opens" }, { step: "Select valid image file", expected: "Image preview shown" }, { step: "Confirm upload", expected: "Avatar updated" }] },
    // API suite
    { suiteId: suiteIds[3], title: "GET /api/users returns 200", priority: "high", tags: ["api", "rest"], steps: [{ step: "Send GET /api/users with auth token", expected: "200 OK response" }, { step: "Verify response is array", expected: "Array of user objects" }, { step: "Verify each user has id and email", expected: "Schema valid" }] },
    { suiteId: suiteIds[3], title: "POST /api/orders creates order", priority: "critical", tags: ["api", "rest", "orders"], steps: [{ step: "Send POST /api/orders with valid payload", expected: "201 Created" }, { step: "Verify order ID in response", expected: "Order ID present" }, { step: "GET /api/orders/:id", expected: "Order retrievable" }] },
    { suiteId: suiteIds[3], title: "GraphQL query returns user data", priority: "medium", tags: ["api", "graphql"], steps: [{ step: "Send GraphQL query { user { id name email } }", expected: "200 OK" }, { step: "Verify data.user exists", expected: "User object returned" }] },
  ];
  let tcCount = 0;
  for (const tc of testCases) {
    const res = await api("POST", "/api/test-cases", { ...tc, status: "active", generatedByAI: Math.random() > 0.5 });
    if (res?.id) tcCount++;
  }
  console.log(`✓ ${tcCount} test cases seeded`);

  // ── Agents ────────────────────────────────────────────────────────────────
  const agents = [
    { name: "Chrome Headless Agent", type: "browser", status: "online", capabilities: ["screenshot", "video", "network-logging", "performance-metrics"] },
    { name: "Firefox Agent", type: "browser", status: "online", capabilities: ["screenshot", "video"] },
    { name: "REST API Agent", type: "api", status: "online", capabilities: ["network-logging", "performance-metrics"] },
    { name: "Mobile iOS Agent", type: "mobile", status: "offline", capabilities: ["screenshot", "video"] },
    { name: "Mobile Android Agent", type: "mobile", status: "offline", capabilities: ["screenshot"] },
    { name: "SAP GUI Agent", type: "desktop", status: "online", capabilities: ["screenshot"] },
  ];
  for (const a of agents) {
    await api("POST", "/api/agents", a);
  }
  console.log(`✓ ${agents.length} agents seeded`);

  // ── Executions with results ───────────────────────────────────────────────
  const execStatuses = ["passed", "failed", "passed", "passed", "failed", "passed", "running", "passed"];
  for (let i = 0; i < Math.min(suiteIds.length, execStatuses.length); i++) {
    const exec = await api("POST", "/api/executions", {
      suiteId: suiteIds[i % suiteIds.length],
      targetUrl: "https://staging.myapp.com",
      framework: "playwright",
      environment: "staging",
    });
    if (exec?.id) {
      // Simulate completion
      await api("PATCH", `/api/executions/${exec.id}`, {
        status: execStatuses[i],
        passedTests: Math.floor(Math.random() * 8) + 2,
        failedTests: execStatuses[i] === "failed" ? Math.floor(Math.random() * 3) + 1 : 0,
        totalTests: 10,
      });
    }
  }
  console.log(`✓ ${execStatuses.length} executions seeded`);

  // ── Schedules ─────────────────────────────────────────────────────────────
  const schedules = [
    { name: "Nightly Full Regression", suiteId: suiteIds[0], frequency: "daily", environment: "staging", isActive: true },
    { name: "Hourly Smoke Tests", suiteId: suiteIds[0], frequency: "hourly", environment: "staging", isActive: true },
    { name: "Weekly Performance Baseline", suiteId: suiteIds[5] || suiteIds[0], frequency: "weekly", environment: "production", isActive: true },
    { name: "Pre-Deploy Checkout Tests", suiteId: suiteIds[1] || suiteIds[0], frequency: "every_15min", environment: "staging", isActive: false },
  ];
  for (const s of schedules) {
    await api("POST", "/api/schedules", s);
  }
  console.log(`✓ ${schedules.length} schedules seeded`);

  // ── CI/CD Webhooks ────────────────────────────────────────────────────────
  const webhooks = [
    { name: "GitHub Actions — Main Branch", provider: "github_actions", webhookUrl: "https://api.github.com/repos/myorg/myapp/actions/workflows/test.yml/dispatches", triggerOn: ["push", "pull_request"], suiteId: suiteIds[0], isActive: true },
    { name: "Jenkins — Nightly Build", provider: "jenkins", webhookUrl: "https://jenkins.mycompany.com/job/myapp/build", triggerOn: ["schedule"], suiteId: suiteIds[1] || suiteIds[0], isActive: true },
    { name: "Azure DevOps — Release Pipeline", provider: "azure_devops", webhookUrl: "https://dev.azure.com/myorg/myproject/_apis/pipelines/1/runs", triggerOn: ["tag"], suiteId: suiteIds[2] || suiteIds[0], isActive: false },
    { name: "GitLab CI — MR Tests", provider: "gitlab_ci", webhookUrl: "https://gitlab.com/api/v4/projects/123/trigger/pipeline", triggerOn: ["pull_request"], suiteId: suiteIds[3] || suiteIds[0], isActive: true },
  ];
  for (const w of webhooks) {
    await api("POST", "/api/cicd/webhooks", w);
  }
  console.log(`✓ ${webhooks.length} CI/CD webhooks seeded`);

  // ── Data Factory Datasets ─────────────────────────────────────────────────
  const datasets = [
    { name: "Test Users — 20 records", schema: { type: "person", count: 20 } },
    { name: "Payment Cards — Masked", schema: { type: "finance", count: 10, maskFields: ["creditCard", "cvv", "bankAccount"] } },
    { name: "Product Orders — 15 records", schema: { type: "order", count: 15 } },
    { name: "E-Commerce Products", schema: { type: "product", count: 12 } },
    { name: "Company Addresses", schema: { type: "address", count: 8 } },
  ];
  for (const d of datasets) {
    await api("POST", "/api/data-factory/generate", d);
  }
  console.log(`✓ ${datasets.length} data factory datasets seeded`);

  // ── Settings ──────────────────────────────────────────────────────────────
  await api("POST", "/api/settings/bulk", {
    settings: [
      { category: "notifications", key: "slack_webhook", value: "https://hooks.slack.com/services/mock/webhook" },
      { category: "notifications", key: "notify_on_fail", value: "true" },
      { category: "notifications", key: "notify_on_pass", value: "false" },
      { category: "execution", key: "default_timeout", value: "30000" },
      { category: "execution", key: "max_retries", value: "3" },
      { category: "execution", key: "screenshot_on_fail", value: "true" },
      { category: "reporting", key: "auto_generate", value: "true" },
      { category: "reporting", key: "retention_days", value: "90" },
      { category: "ai", key: "model", value: "claude-3-5-sonnet" },
      { category: "ai", key: "max_tokens", value: "4096" },
    ],
  });
  console.log("✓ Platform settings seeded");

  // ── Mobile Devices ────────────────────────────────────────────────────────
  const devices = [
    { name: "iPhone 15 Pro Simulator", platform: "ios", platformVersion: "17.0", deviceName: "iPhone 15 Pro", automationName: "XCUITest", isReal: false },
    { name: "iPhone 14 Real Device", platform: "ios", platformVersion: "16.4", deviceName: "iPhone 14", udid: "00008110-001A2B3C4D5E6F70", automationName: "XCUITest", isReal: true },
    { name: "Pixel 7 Emulator", platform: "android", platformVersion: "13.0", deviceName: "Pixel 7", automationName: "UiAutomator2", isReal: false },
    { name: "Samsung Galaxy S23", platform: "android", platformVersion: "13.0", deviceName: "Samsung Galaxy S23", udid: "R3CT204ABCD", automationName: "UiAutomator2", isReal: true },
  ];
  for (const d of devices) {
    await api("POST", "/api/mobile-devices", d);
  }
  console.log(`✓ ${devices.length} mobile devices seeded`);

  // ── Visual Baselines ──────────────────────────────────────────────────────
  const img1x1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const allTCs = await api("GET", "/api/test-cases");
  if (Array.isArray(allTCs) && allTCs.length > 0) {
    for (let i = 0; i < Math.min(3, allTCs.length); i++) {
      await api("POST", "/api/visual/baseline", {
        testCaseId: allTCs[i].id,
        name: `baseline-${i + 1}`,
        imageBase64: img1x1,
        threshold: 2.0,
      });
    }
    console.log("✓ 3 visual baselines seeded");
  }

  // ── Admin Roles ───────────────────────────────────────────────────────────
  const roles = [
    { name: "qa_lead", displayName: "QA Lead", description: "Manages test suites and team", permissions: ["view", "create", "edit", "execute", "manage_users"] },
    { name: "developer", displayName: "Developer", description: "Can view and run tests", permissions: ["view", "execute"] },
    { name: "release_manager", displayName: "Release Manager", description: "Approves releases and views reports", permissions: ["view", "execute", "delete"] },
  ];
  for (const r of roles) {
    await api("POST", "/api/admin/roles", r);
  }
  console.log(`✓ ${roles.length} custom roles seeded`);

  // ── Projects ──────────────────────────────────────────────────────────────
  const projects = [
    { name: "MyApp Web Platform", description: "Main web application test project" },
    { name: "Mobile Banking App", description: "iOS and Android banking app tests" },
    { name: "API Gateway Tests", description: "Microservices API integration tests" },
  ];
  for (const p of projects) {
    await api("POST", "/api/projects", p);
  }
  console.log(`✓ ${projects.length} projects seeded`);

  console.log("\n✅ Mock data seeding complete!\n");
}

seed().catch((e) => { console.error("Seeding failed:", e); process.exit(1); });
