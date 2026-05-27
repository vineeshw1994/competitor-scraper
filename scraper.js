#!/usr/bin/env node
/**
 * Letswin competitor scraper — Ryse first, more sites later.
 *
 * Usage:
 *   npm run scrape:rys          # scrape Ryse → MySQL
 *   npm run test:rys            # dry run, console output only
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { getSite, getAllSites } = require('./sites');
const zapExtractor = require('./extractors/zap');
const wwcExtractor = require('./extractors/wwc');
const wwcdExtractor = require('./extractors/wwcd');
const mrgExtractor = require('./extractors/mrg');
const { enrichMetrics } = require('./lib/metrics');

const EXTRACTORS = {
  zap: zapExtractor,
  wwc: wwcExtractor,
  wwcd: wwcdExtractor,
  mrg: mrgExtractor,
};

/** Slugs for the four sites added after Ryse + Royalux. */
const NEW_SITE_SLUGS = ['wwc', 'd2r', 'mrg', 'wwcd'];

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    site: null,
    sites: null,
    dryRun: false,
    summaryOnly: false,
    outFile: null,
    noProxy: false,
    noEnv: false,
  };
  for (const arg of args) {
    if (arg === '--dry-run') opts.dryRun = true;
    if (arg === '--summary') opts.summaryOnly = true;
    if (arg === '--no-proxy') opts.noProxy = true;
    if (arg === '--no-env') opts.noEnv = true;
    if (arg.startsWith('--site=')) opts.site = arg.split('=')[1];
    if (arg.startsWith('--sites=')) {
      opts.sites = arg
        .split('=')[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (arg === '--new-four') opts.sites = NEW_SITE_SLUGS.slice();
    if (arg.startsWith('--out=')) opts.outFile = arg.split('=')[1];
  }
  return opts;
}

function loadEnv(opts) {
  const onGithub = process.env.GITHUB_ACTIONS === 'true';
  if (!opts.noEnv && !onGithub) {
    require('dotenv').config();
  }
  if (opts.noProxy || onGithub) {
    delete process.env.SCRAPER_PROXY;
  }
}

function scraperProxyUrl() {
  const url = (process.env.SCRAPER_PROXY || '').trim();
  return url || null;
}

async function scrapeSite(browser, site, threshold, deepMax, dryRun = false, db = null) {
  const extractor = EXTRACTORS[site.extractor];
  if (!extractor) throw new Error(`No extractor: ${site.extractor}`);

  const page = await browser.newPage();

  const proxyUrlStr = scraperProxyUrl();
  if (proxyUrlStr) {
    try {
      const proxyUrl = new URL(proxyUrlStr);
      if (proxyUrl.username && proxyUrl.password) {
        await page.authenticate({
          username: decodeURIComponent(proxyUrl.username),
          password: decodeURIComponent(proxyUrl.password),
        });
      }
    } catch (_) { /* invalid URL — skip auth */ }
  }

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-GB,en;q=0.9' });
  await page.setViewport({ width: 1366, height: 900 });

  const errors = [];

  try {
    console.log(`\n[${site.slug}] Pass 1 — listing scan...`);
    let listing = await extractor.scanListing(page, site);
    console.log(`[${site.slug}] Found ${listing.length} unique competitions on listing`);

    if (typeof extractor.fillMissingListing === 'function') {
      listing = await extractor.fillMissingListing(page, site, listing);
      const stillMissing = listing.filter((c) => c.pct_sold == null).length;
      if (stillMissing) {
        console.log(`[${site.slug}] ${stillMissing} still missing pct_sold after fill pass`);
      }
    }

    const hot = listing.filter((c) => c.pct_sold != null && c.pct_sold >= threshold);
    console.log(`[${site.slug}] ${hot.length} at or above ${threshold}% sold`);

    const siteDeepMax =
      site.deepMax != null ? Number(site.deepMax) : deepMax;
    const toDeep = hot.slice(0, siteDeepMax);
    console.log(`[${site.slug}] Pass 2 — deep scraping ${toDeep.length} competitions`);

    const results = [];

    for (const item of listing) {
      const needsDeep = toDeep.some((h) => h.competition_url === item.competition_url);

      if (needsDeep) {
        try {
          const detail = await extractor.scrapeSingle(page, site, item);
          const firstSeen = dryRun ? null : await db.getFirstSeenAt(detail.competition_url);
          const enriched = enrichMetrics(detail, firstSeen, threshold);
          results.push(enriched);
          console.log(
            `  ✓ ${enriched.title?.slice(0, 50)}… | ${enriched.pct_sold}% | ${enriched.confidence_tier}` +
              (enriched.total_tickets != null ? ` | ${enriched.tickets_sold}/${enriched.total_tickets} tix` : '')
          );
        } catch (err) {
          errors.push({ url: item.competition_url, error: err.message });
          console.error(`  ✗ ${item.competition_url}: ${err.message}`);
        }
      } else {
        const firstSeen = dryRun ? null : await db.getFirstSeenAt(item.competition_url);
        const stub = enrichMetrics(
          {
            ...item,
            type: item.type || 'unknown',
            jackpot_prize: item.jackpot_prize || item.title,
            jackpot_value: item.jackpot_value ?? null,
            game_type: item.game_type || 'Unknown',
            iw_prizes: item.iw_prizes ?? null,
          },
          firstSeen,
          threshold
        );
        results.push(stub);
      }
    }

    return { results, errors, totalFound: listing.length };
  } finally {
    await page.close();
  }
}

async function main() {
  const opts = parseArgs();
  loadEnv(opts);
  const db = opts.dryRun ? null : require('./lib/db');

  const threshold = parseInt(process.env.SCRAPER_THRESHOLD || '50', 10);
  const deepMax = parseInt(process.env.DEEP_MAX_COMPS_PER_SITE || '3', 10);
  let sites;
  if (opts.site) {
    sites = [getSite(opts.site)];
  } else if (opts.sites?.length) {
    sites = opts.sites.map((slug) => getSite(slug));
  } else {
    sites = getAllSites();
  }

  console.log('Letswin Competitor Scraper');
  console.log(`Threshold: ${threshold}% | Deep max per site: ${deepMax} | Dry run: ${opts.dryRun}`);

  const proxy = scraperProxyUrl();
  const proxyArgs = proxy ? [`--proxy-server=${proxy}`] : [];
  console.log(proxy ? `Proxy: ${proxy.replace(/:([^@]+)@/, ':***@')}` : 'Proxy: none (direct connection)');
  if (opts.dryRun) {
    console.log('Database: skipped (--dry-run)');
  } else {
    console.log(
      `Database: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '3306'}/${process.env.DB_NAME || '?'}`
    );
  }

  const browser = await puppeteer.launch({
    headless: process.env.HEADLESS !== 'false',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      ...proxyArgs,
    ],
  });

  let runId = null;
  const allErrors = {};
  let totalFound = 0;
  let saved = 0;
  const allResults = [];

  try {
    if (!opts.dryRun) {
      runId = await db.startRun();
    }

    for (const site of sites) {
      try {
        const { results, errors, totalFound: found } = await scrapeSite(
          browser,
          site,
          threshold,
          deepMax,
          opts.dryRun,
          db
        );
        totalFound += found;
        allErrors[site.slug] = errors;

        for (const row of results) {
          if (opts.dryRun) {
            allResults.push(row);
            if (!opts.summaryOnly) {
              console.log(JSON.stringify(row, null, 2));
            }
          } else {
            await db.upsertCompetition(row);
            saved++;
            if (opts.outFile) allResults.push(row);
          }
        }
        if (opts.dryRun || opts.summaryOnly) {
          const hot = results.filter((r) => r.confidence_tier === 'HIGH').length;
          const med = results.filter((r) => r.confidence_tier === 'MEDIUM').length;
          console.log(
            `[${site.slug}] Summary: ${results.length} rows | HIGH ${hot} | MEDIUM ${med} | LOW ${results.length - hot - med}`
          );
          results.slice(0, 5).forEach((r) => {
            console.log(
              `  - ${(r.title || '').slice(0, 55)} | ${r.pct_sold ?? '?'}% | ${r.confidence_tier} | ${r.competition_url}`
            );
          });
        }
      } catch (err) {
        allErrors[site.slug] = [{ error: err.message }];
        console.error(`[${site.slug}] Fatal:`, err.message);
      }
    }

    if (!opts.dryRun && runId) {
      const status = Object.values(allErrors).some((e) => e?.length) ? 'partial' : 'success';
      await db.finishRun(runId, { totalFound, perSiteErrors: allErrors, status });
    }

    // Write JSON output file when in dry-run mode (or when --out= is given)
    const outFile = opts.outFile || (opts.dryRun ? 'output/scrape-results.json' : null);
    if (outFile && allResults.length > 0) {
      const outDir = path.dirname(outFile);
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      const outData = {
        generated_at: new Date().toISOString(),
        total_found: totalFound,
        total_results: allResults.length,
        saved_to_db: saved,
        dry_run: opts.dryRun,
        errors: allErrors,
        competitions: allResults,
      };
      fs.writeFileSync(outFile, JSON.stringify(outData, null, 2), 'utf8');
      console.log(`\nResults written to: ${outFile}`);
    }

    console.log(`\nDone. Found ${totalFound} competitions, saved ${saved} rows.`);
  } finally {
    await browser.close();
    if (!opts.dryRun) await db.closePool();
  }
}

main().catch((err) => {
  console.error('Scraper failed:', err);
  process.exit(1);
});
