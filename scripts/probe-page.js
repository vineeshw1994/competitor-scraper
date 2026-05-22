#!/usr/bin/env node
require('dotenv').config();
const puppeteer = require('puppeteer');

const urls = process.argv.slice(2);
if (!urls.length) {
  console.error('Usage: node scripts/probe-page.js <url> [url2...]');
  process.exit(1);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  );
  for (const url of urls) {
    try {
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await new Promise((r) => setTimeout(r, 3000));
      const info = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href]'))
          .map((a) => a.href)
          .filter((h) => /competition|product|giveaway|enter/i.test(h));
        return {
          title: document.title,
          status: document.body?.className?.slice(0, 80),
          productCount: document.querySelectorAll('li.product, .product-card, [class*="competition"]').length,
          h1: document.querySelector('h1')?.textContent?.trim(),
          sampleLinks: [...new Set(links)].slice(0, 15),
          bodyStart: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 400),
        };
      });
      console.log(JSON.stringify({ url, httpStatus: res?.status(), ...info }, null, 2));
    } catch (e) {
      console.log(JSON.stringify({ url, error: e.message }));
    }
  }
  await browser.close();
})();
