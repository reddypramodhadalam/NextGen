/**
 * AITAS UI Screenshot Script
 * Takes screenshots of all key pages to show the new design
 */
import { chromium } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const BASE = "http://127.0.0.1:5000";
const OUT_DIR = path.join(process.cwd(), "ui-screenshots");

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function shot(page: any, name: string) {
  await page.waitForTimeout(1200);
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  📸 Saved: ui-screenshots/${name}.png`);
}

async function login(page: any) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.fill("input[type='email']", "admin@aitas.com");
  await page.fill("input[type='password']", "AitasMaster2024!");
  await page.click("button[type='submit']");
  await page.waitForURL(`${BASE}/`, { timeout: 15000 });
  await page.waitForLoadState("networkidle");
}

(async () => {
  console.log("\n🚀 Launching Chromium for UI screenshots...\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // ── 1. Login page (light mode) ──────────────────────────────────────────
  console.log("📋 Login Page");
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  // Force light mode
  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
    localStorage.setItem("theme", "light");
  });
  await page.waitForTimeout(600);
  await shot(page, "01-login-light");

  // Dark mode login
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
    localStorage.setItem("theme", "dark");
  });
  await page.waitForTimeout(600);
  await shot(page, "02-login-dark");

  // ── 2. Log in ────────────────────────────────────────────────────────────
  console.log("🔐 Logging in...");
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
    localStorage.setItem("theme", "dark");
  });
  await login(page);

  // ── 3. Dashboard ─────────────────────────────────────────────────────────
  console.log("📋 Dashboard");
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await shot(page, "03-dashboard-dark");

  // Light mode dashboard
  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
    localStorage.setItem("theme", "light");
  });
  await page.waitForTimeout(600);
  await shot(page, "04-dashboard-light");

  // ── 4. Repository ─────────────────────────────────────────────────────────
  console.log("📋 Repository");
  await page.goto(`${BASE}/repository`, { waitUntil: "networkidle" });
  await page.evaluate(() => { document.documentElement.classList.add("dark"); });
  await page.waitForTimeout(800);
  await shot(page, "05-repository-dark");

  // ── 5. Executions ─────────────────────────────────────────────────────────
  console.log("📋 Executions");
  await page.goto(`${BASE}/executions`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "06-executions-dark");

  // Open the Run Tests dialog to show buttons/selects/inputs
  const runBtn = page.locator("button:has-text('Run Tests')").first();
  if (await runBtn.isVisible()) {
    await runBtn.click();
    await page.waitForTimeout(700);
    await shot(page, "07-executions-dialog-dark");
    await page.keyboard.press("Escape");
  }

  // ── 6. AI Generator ───────────────────────────────────────────────────────
  console.log("📋 AI Generator");
  await page.goto(`${BASE}/generator`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "08-generator-dark");

  // ── 7. Reports ────────────────────────────────────────────────────────────
  console.log("📋 Reports");
  await page.goto(`${BASE}/reports`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "09-reports-dark");

  // ── 8. Admin (tabs showcase) ──────────────────────────────────────────────
  console.log("📋 Admin");
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "10-admin-dark");

  // ── 9. Settings ───────────────────────────────────────────────────────────
  console.log("📋 Settings");
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "11-settings-dark");

  // ── 10. Environments ──────────────────────────────────────────────────────
  console.log("📋 Environments");
  await page.goto(`${BASE}/environments`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "12-environments-dark");

  // ── 11. Agents ────────────────────────────────────────────────────────────
  console.log("📋 Agents");
  await page.goto(`${BASE}/agents`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "13-agents-dark");

  // ── 12. CI/CD ─────────────────────────────────────────────────────────────
  console.log("📋 CI/CD");
  await page.goto(`${BASE}/cicd`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "14-cicd-dark");

  // ── 13. Performance ───────────────────────────────────────────────────────
  console.log("📋 Performance");
  await page.goto(`${BASE}/performance`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "15-performance-dark");

  // ── 14. Coverage ──────────────────────────────────────────────────────────
  console.log("📋 Coverage");
  await page.goto(`${BASE}/coverage`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "16-coverage-dark");

  // ── 15. Data Factory ──────────────────────────────────────────────────────
  console.log("📋 Data Factory");
  await page.goto(`${BASE}/data-factory`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "17-data-factory-dark");

  // ── 16. AI Healer ─────────────────────────────────────────────────────────
  console.log("📋 AI Healer");
  await page.goto(`${BASE}/ai-healer`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "18-ai-healer-dark");

  // ── 17. Scripts ───────────────────────────────────────────────────────────
  console.log("📋 Scripts");
  await page.goto(`${BASE}/scripts`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "19-scripts-dark");

  // ── 18. Projects ──────────────────────────────────────────────────────────
  console.log("📋 Projects");
  await page.goto(`${BASE}/projects`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "20-projects-dark");

  await browser.close();

  const files = fs.readdirSync(OUT_DIR).filter(f => f.endsWith(".png"));
  console.log(`\n✅ Done! ${files.length} screenshots saved to: ui-screenshots/\n`);
  files.forEach(f => console.log(`   • ${f}`));
})();
