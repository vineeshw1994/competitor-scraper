#!/usr/bin/env node
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.goto('https://www.mrgiveaways.co.uk/competitions/', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const s = await page.evaluate(() => ({
      title: document.title,
      products: document.querySelectorAll('li.product').length,
      compLinks: Array.from(document.querySelectorAll('a[href*="competition"], a[href*="product"]'))
        .map((a) => a.href)
        .slice(0, 8),
    }));
    console.log('poll', i, s);
    if (s.products > 0 || s.compLinks.length > 2) break;
  }
  await browser.close();
})();
