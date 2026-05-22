#!/usr/bin/env node
/**
 * Quick listing probe — run on server vs local to compare.
 * Usage: node scripts/probe-zap-listing.js rys
 *        node scripts/probe-zap-listing.js royalux
 *        node scripts/probe-zap-listing.js d2r
 */
require('dotenv').config();
const puppeteer = require('puppeteer');
const { getSite } = require('../sites');

const slug = process.argv[2] || 'rys';

(async () => {
  const site = getSite(slug);
  const sel = site.selectors.listing;
  const url = site.listingUrls[0];

  const browser = await puppeteer.launch({
    headless: process.env.HEADLESS !== 'false',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  );

  console.log('\n=== Probe', site.name, '===');
  console.log('URL:', url);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await new Promise((r) => setTimeout(r, 3000));

    const info = await page.evaluate((selectors) => {
      const cards = document.querySelectorAll(selectors.cards.split(',')[0].trim());
      const links = document.querySelectorAll('a[href*="/competition"]');
      const body = document.body?.innerText || '';
      return {
        title: document.title,
        cardCount: cards.length,
        competitionLinks: links.length,
        bodyLen: body.length,
        bodyStart: body.slice(0, 200).replace(/\s+/g, ' '),
        hasCloudflare: /just a moment|security verification|cloudflare/i.test(body),
        hasProducts: !!document.querySelector('ul.products'),
        sampleHref: links[0]?.href || null,
      };
    }, sel);

    console.log(JSON.stringify(info, null, 2));

    if (info.cardCount === 0) {
      console.log('\n⚠ 0 cards — likely: old scraper code on server, blocked IP, or wrong selectors.');
      console.log('Compare with: npm run test:' + slug);
    }
  } catch (e) {
    console.error('Probe failed:', e.message);
  }

  await browser.close();
})();
