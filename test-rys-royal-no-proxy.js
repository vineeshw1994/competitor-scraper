#!/usr/bin/env node
/**
 * Test Ryse and Royalux — NO proxy, NO database
 * Just check if sites are accessible from GitHub Actions
 */

const puppeteer = require('puppeteer');

const SITES = {
  rys: {
    name: 'Ryse Competitions',
    url: 'https://www.ryscompetitions.com/competitions/',
  },
  royalux: {
    name: 'Royalux Competitions',
    url: 'https://www.royaluxcompetitions.co.uk/competitions/',
  },
};

async function testSite(siteKey, siteConfig) {
  console.log(`\n🔍 Testing ${siteConfig.name}...`);
  console.log(`URL: ${siteConfig.url}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
  );

  try {
    // Set timeout to 30 seconds
    await page.goto(siteConfig.url, { 
      waitUntil: 'domcontentloaded', 
      timeout: 30000 
    });
    
    // Get page title and check for block
    const title = await page.title();
    const pageText = await page.content();
    
    if (pageText.includes('Just a moment...') || pageText.includes('Cloudflare') || pageText.includes('Attention Required')) {
      console.log(`❌ ${siteConfig.name} — BLOCKED by Cloudflare`);
      console.log(`   Page title: ${title}`);
    } else {
      // Try to find competitions
      const competitions = await page.evaluate(() => {
        const items = document.querySelectorAll('.competition, .product, .item, li, .card');
        const titles = [];
        
        items.forEach((item) => {
          const text = item.innerText || '';
          const hasPrice = text.match(/£[\d\.]+|\d+p/);
          const hasPrize = text.match(/win|WIN|prize|PRIZE/i);
          
          if ((hasPrice || hasPrize) && text.length > 20 && text.length < 500) {
            const firstLine = text.split('\n')[0];
            if (firstLine && firstLine.length > 5) {
              titles.push(firstLine.slice(0, 60));
            }
          }
        });
        
        return [...new Set(titles)].slice(0, 10);
      });
      
      if (competitions.length > 0) {
        console.log(`✅ ${siteConfig.name} — ACCESSIBLE`);
        console.log(`   Found ${competitions.length} competition titles:`);
        competitions.forEach((c, i) => console.log(`   ${i + 1}. ${c}`));
      } else {
        console.log(`⚠️ ${siteConfig.name} — Loaded but no competitions found`);
        console.log(`   Page title: ${title}`);
      }
    }
    
  } catch (error) {
    console.log(`❌ ${siteConfig.name} — ERROR: ${error.message}`);
  }

  await browser.close();
}

async function main() {
  console.log('='.repeat(60));
  console.log('Testing Ryse and Royalux - NO PROXY, NO DATABASE');
  console.log('Just checking if sites are accessible from GitHub Actions');
  console.log('='.repeat(60));

  await testSite('rys', SITES.rys);
  await testSite('royalux', SITES.royalux);

  console.log('\n✅ Test complete!');
  console.log('\nResult interpretation:');
  console.log('  - "BLOCKED by Cloudflare" → GitHub IPs are blocked');
  console.log('  - "ACCESSIBLE" → GitHub IPs work, scraper can run for free');
}

main().catch(console.error);