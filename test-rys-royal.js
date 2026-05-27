#!/usr/bin/env node
/**
 * Quick test for Ryse and Royalux only — no database
 */

require('dotenv').config();

const puppeteer = require('puppeteer');

const SITES = {
  rys: {
    name: 'Ryse Competitions',
    url: 'https://www.ryscompetitions.com/competitions/',
    listingSelector: '.competition-item, .product-item, li.product',
    titleSelector: 'h2, h3, .product-title',
    priceSelector: '.price, .product-price',
  },
  royalux: {
    name: 'Royalux Competitions',
    url: 'https://www.royaluxcompetitions.co.uk/competitions/',
    listingSelector: '.competition-item, .product-item, li.product',
    titleSelector: 'h2, h3, .product-title',
    priceSelector: '.price, .product-price',
  },
};

async function scrapeSite(siteConfig) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const page = await browser.newPage();
  
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
  );

  console.log(`\n🔍 Scraping ${siteConfig.name}...`);
  console.log(`URL: ${siteConfig.url}`);

  try {
    await page.goto(siteConfig.url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Check if blocked
    const pageText = await page.content();
    if (pageText.includes('Just a moment...') || pageText.includes('Cloudflare')) {
      console.log(`❌ ${siteConfig.name} — BLOCKED by Cloudflare`);
      await browser.close();
      return;
    }

    // Wait for listings
    await page.waitForSelector(siteConfig.listingSelector, { timeout: 10000 }).catch(() => {
      console.log(`⚠️ No listings found on ${siteConfig.name}`);
    });

    // Extract competitions
    const competitions = await page.evaluate((config) => {
      const items = document.querySelectorAll(config.listingSelector);
      const results = [];
      
      items.forEach((item) => {
        const title = item.querySelector(config.titleSelector)?.innerText?.trim() || '';
        const price = item.querySelector(config.priceSelector)?.innerText?.trim() || '';
        
        if (title) {
          results.push({ title: title.slice(0, 80), price });
        }
      });
      
      return results;
    }, siteConfig);

    console.log(`✅ Found ${competitions.length} competitions on ${siteConfig.name}`);
    competitions.slice(0, 5).forEach((comp, i) => {
      console.log(`   ${i + 1}. ${comp.title} | ${comp.price}`);
    });

  } catch (error) {
    console.log(`❌ Error scraping ${siteConfig.name}: ${error.message}`);
  }

  await browser.close();
}

async function main() {
  console.log('='.repeat(50));
  console.log('Scraping Ryse and Royalux - Test Mode (No DB)');
  console.log('='.repeat(50));

  await scrapeSite(SITES.rys);
  await scrapeSite(SITES.royalux);

  console.log('\n✅ Test complete!');
}

main().catch(console.error);