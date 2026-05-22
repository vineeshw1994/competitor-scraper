#!/usr/bin/env node
/**
 * Dry-run a site and print field coverage for review.
 * Usage: node scripts/review-scrape.js d2r
 *        node scripts/review-scrape.js mrg
 */
require('dotenv').config();

const puppeteer = require('puppeteer');
const { getSite } = require('../sites');
const EXTRACTORS = {
  zap: require('../extractors/zap'),
  wwc: require('../extractors/wwc'),
  wwcd: require('../extractors/wwcd'),
  mrg: require('../extractors/mrg'),
};

const FIELDS = [
  'title',
  'competition_url',
  'ticket_price',
  'pct_sold',
  'tickets_sold',
  'total_tickets',
  'tickets_remaining',
  'draw_date',
  'type',
  'jackpot_prize',
  'iw_prizes',
  'confidence_tier',
];

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error('Usage: node scripts/review-scrape.js <site-slug>  (e.g. d2r, mrg)');
    process.exit(1);
  }

  const site = getSite(slug);
  const extractor = EXTRACTORS[site.extractor];
  if (!extractor) {
    console.error(`No extractor: ${site.extractor}`);
    process.exit(1);
  }

  const threshold = parseInt(process.env.SCRAPER_THRESHOLD || '50', 10);
  const deepMax = site.deepMax ?? parseInt(process.env.DEEP_MAX_COMPS_PER_SITE || '3', 10);
  const { enrichMetrics } = require('../lib/metrics');

  const browser = await puppeteer.launch({
    headless: process.env.HEADLESS !== 'false',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1366, height: 900 });

  try {
    console.log(`\n=== Review scrape: ${site.name} (${slug}) ===\n`);
    let listing = await extractor.scanListing(page, site);
    if (extractor.fillMissingListing) {
      listing = await extractor.fillMissingListing(page, site, listing);
    }

    const hot = listing.filter((c) => c.pct_sold != null && c.pct_sold >= threshold);
    let toDeep = hot.slice(0, deepMax);
    if (!toDeep.length) {
      toDeep = listing
        .filter((c) => c.pct_sold != null)
        .sort((a, b) => (b.pct_sold || 0) - (a.pct_sold || 0))
        .slice(0, Math.min(3, deepMax));
      if (toDeep.length) {
        console.log(`(No comps ≥${threshold}% — deep scraping top ${toDeep.length} by pct for review)\n`);
      }
    }
    const results = [];

    for (const item of listing) {
      const needsDeep = toDeep.some((h) => h.competition_url === item.competition_url);
      if (needsDeep) {
        const detail = await extractor.scrapeSingle(page, site, item);
        results.push(enrichMetrics(detail, null, threshold));
      } else {
        results.push(
          enrichMetrics(
            {
              ...item,
              type: item.type || 'unknown',
              jackpot_prize: item.jackpot_prize || item.title,
              game_type: 'Unknown',
            },
            null,
            threshold
          )
        );
      }
    }

    console.log(`Found: ${results.length} competitions`);
    console.log(`≥${threshold}% sold: ${hot.length} | deep scraped: ${toDeep.length}\n`);

    console.log('Field coverage (% of comps with non-null value):');
    for (const field of FIELDS) {
      const filled = results.filter((r) => r[field] != null && r[field] !== '').length;
      const pct = Math.round((filled / results.length) * 100);
      console.log(`  ${field.padEnd(20)} ${filled}/${results.length} (${pct}%)`);
    }

    const missingPct = results.filter((r) => r.pct_sold == null);
    if (missingPct.length) {
      console.log(`\nMissing pct_sold (${missingPct.length}):`);
      missingPct.forEach((r) => console.log(`  - ${r.title}`));
    }

    console.log('\n--- Sample (first deep-scraped or first comp) ---');
    const sample =
      results.find((r) => toDeep.some((d) => d.competition_url === r.competition_url)) ||
      results[0];
    console.log(JSON.stringify(sample, null, 2));
  } finally {
    await page.close();
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
