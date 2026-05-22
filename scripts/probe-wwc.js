#!/usr/bin/env node
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.goto('https://www.winnerwinnercompetitions.co.uk/competitions', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await new Promise((r) => setTimeout(r, 4000));
  const info = await page.evaluate(() => {
    const items = [];
    document.querySelectorAll('a[href*="/competitions/"]').forEach((a) => {
      const href = a.href.split('?')[0];
      if (!/\/competitions\/[a-z0-9-]+/i.test(href)) return;
      const card = a.closest('article, li, div[class*="card"], div[class*="competition"]') || a.parentElement;
      const text = (card?.textContent || a.textContent || '').replace(/\s+/g, ' ').trim();
      items.push({ href, title: a.textContent.trim().slice(0, 80), text: text.slice(0, 150) });
    });
    const uniq = new Map();
    items.forEach((i) => {
      if (!uniq.has(i.href)) uniq.set(i.href, i);
    });
    return { count: uniq.size, samples: Array.from(uniq.values()).slice(0, 8) };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
