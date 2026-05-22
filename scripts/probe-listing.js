#!/usr/bin/env node
/** Quick listing probe — prints card count + sample URLs per site */
require('dotenv').config();
const puppeteer = require('puppeteer');
const { getSite } = require('../sites');

const slug = process.argv[2] || 'wwc';
const site = getSite(slug);

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  );
  const url = site.listingUrls[0];
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
  const info = await page.evaluate((sel) => {
    const cards = document.querySelectorAll(sel.cards);
    const samples = [];
    cards.forEach((card, i) => {
      if (i > 4) return;
      const link =
        card.querySelector('a[href*="/competition/"]') ||
        card.querySelector('a[href*="/product/"]') ||
        card.querySelector('a.woocommerce-LoopProduct-link') ||
        card.querySelector('a[href]');
      samples.push({
        href: link?.href || null,
        title: card.querySelector(sel.title)?.textContent?.trim()?.slice(0, 60),
        text: (card.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      });
    });
    const allLinks = Array.from(
      new Set(
        Array.from(document.querySelectorAll('a[href]'))
          .map((a) => a.href)
          .filter((h) => /competition|product/i.test(h))
      )
    ).slice(0, 8);
    return { cardCount: cards.length, samples, allLinks };
  }, site.selectors.listing);
  console.log(JSON.stringify({ slug, url, ...info }, null, 2));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
