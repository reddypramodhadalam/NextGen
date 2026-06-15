import { chromium } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const BASE = "http://127.0.0.1:5000";
const OUT = path.join(process.cwd(), "ui-screenshots");
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Set dark mode
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
    localStorage.setItem("theme", "dark");
  });

  // Login
  await page.fill("input[type='email']", "admin@aitas.com");
  await page.fill("input[type='password']", "AitasMaster2024!");
  await page.click("button[type='submit']");
  await page.waitForURL(`${BASE}/`, { timeout: 15000 });
  await page.waitForLoadState("networkidle");

  // Navigate to Scripts page
  await page.goto(`${BASE}/scripts`, { waitUntil: "networkidle" });
  await page.evaluate(() => { document.documentElement.classList.add("dark"); });
  await page.waitForTimeout(1000);

  // Screenshot 1: Default state showing Language dropdown closed
  await page.screenshot({ path: path.join(OUT, "scripts-01-default.png") });
  console.log("📸 scripts-01-default.png");

  // Screenshot 2: Open the Language dropdown to show C# option
  const langTrigger = page.locator("#language");
  await langTrigger.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, "scripts-02-language-dropdown-open.png") });
  console.log("📸 scripts-02-language-dropdown-open.png — Language dropdown open showing C#");

  // Screenshot 3: Select C# and show it selected
  const csharpOption = page.locator("[role='option']:has-text('C#')").first();
  await csharpOption.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, "scripts-03-csharp-selected.png") });
  console.log("📸 scripts-03-csharp-selected.png — C# selected in dropdown");

  // Light mode version
  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
    localStorage.setItem("theme", "light");
  });
  await page.waitForTimeout(400);

  // Open dropdown again in light mode
  await langTrigger.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, "scripts-04-language-dropdown-light.png") });
  console.log("📸 scripts-04-language-dropdown-light.png — Light mode dropdown with C#");

  await browser.close();
  console.log("\n✅ Done! Screenshots saved to ui-screenshots/");
})();
