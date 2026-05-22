#!/usr/bin/env node
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  const url = 'https://www.winnerwinnerchickendinner.co.uk/?D=Competitions';
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3000));
  const info = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="Gid="]')).map((a) => ({
      href: a.href,
      text: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100),
    }));
    return {
      title: document.title,
      linkCount: links.length,
      samples: links.slice(0, 10),
      body: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 600),
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
