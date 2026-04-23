/**
 * E2E Smoke Test — Shift Grabber V9
 *
 * Prerequisites:
 *   npm install puppeteer@21
 *   Chrome must be installed
 *
 * Run:
 *   node tests/e2e/smoke.test.js
 */

const puppeteer = require("puppeteer");
const path = require("path");

const EXTENSION_PATH = path.resolve(__dirname, "../../dist");

(async () => {
  console.log("[E2E] Launching browser with extension...");

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      "--no-sandbox",
      "--disable-setuid-sandbox"
    ]
  });

  const page = await browser.newPage();

  // 1. Test popup loads without errors
  const popupUrl = `chrome-extension://${await getExtensionId(browser)}/popup/index.html`;
  console.log("[E2E] Opening popup...");
  await page.goto(popupUrl, { waitUntil: "networkidle0" });

  const bodyText = await page.evaluate(() => document.body.innerText);
  if (!bodyText.includes("Shift Grabber")) {
    throw new Error("Popup did not render correctly.");
  }
  console.log("[E2E] ✓ Popup renders");

  // 2. Test tab switching
  await page.click("#tabControls");
  await page.waitForTimeout(200);
  const controlsVisible = await page.evaluate(() => {
    const el = document.getElementById("panelControls");
    return el && !el.hidden;
  });
  if (!controlsVisible) throw new Error("Controls tab did not open.");
  await page.click("#tabSettings");
  await page.waitForTimeout(200);
  const settingsVisible = await page.evaluate(() => {
    const el = document.getElementById("panelSettings");
    return el && !el.hidden;
  });
  if (!settingsVisible) throw new Error("Settings tab did not open.");
  console.log("[E2E] ✓ Tab switching works");

  // 3. Test license input
  await page.type("#licenseInput", "sg_test_12345678");
  const inputValue = await page.evaluate(() => document.getElementById("licenseInput").value);
  if (inputValue !== "sg_test_12345678") throw new Error("License input failed.");
  console.log("[E2E] ✓ License input works");

  // 4. Test service worker is alive (via extension messaging)
  const workerTarget = await browser.waitForTarget(
    t => t.type() === "service_worker",
    { timeout: 5000 }
  );
  if (!workerTarget) throw new Error("Service worker did not start.");
  console.log("[E2E] ✓ Service worker alive");

  // 5. Test storage API works
  await page.evaluate(() => {
    chrome.storage.local.set({ sg_e2e_test: "hello" });
  });
  await page.waitForTimeout(200);
  const stored = await page.evaluate(() =>
    new Promise(resolve => chrome.storage.local.get("sg_e2e_test", resolve))
  );
  if (stored.sg_e2e_test !== "hello") throw new Error("Storage API not working.");
  console.log("[E2E] ✓ Storage API works");

  console.log("\n[E2E] All smoke tests passed.\n");
  await browser.close();
})();

async function getExtensionId(browser) {
  const targets = await browser.targets();
  const extTarget = targets.find(t => t.type() === "service_worker" && t.url().startsWith("chrome-extension://"));
  if (!extTarget) throw new Error("Could not find extension service worker.");
  const url = new URL(extTarget.url());
  return url.hostname;
}
