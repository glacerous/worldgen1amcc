const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`);
  });

  page.on('pageerror', err => {
    console.error(`[BROWSER ERROR] ${err.toString()}`);
  });

  try {
    console.log("Navigating to tour page...");
    await page.goto('http://localhost:3000/buildings/3305bd84-3f92-4598-8ff9-b0cc451f834b/tour', { waitUntil: 'networkidle0' });
    console.log("Page loaded. Waiting 2 seconds...");
    await new Promise(resolve => setTimeout(resolve, 2000));
  } catch (e) {
    console.error(`Navigation failed: ${e}`);
  } finally {
    await browser.close();
    console.log("Browser closed.");
  }
})();
