# Letswin Competitor Scraper

Nightly scraper for competitor intelligence (Marc's brief).

**Sites:** Ryse, Royalux, Winner Winner, Dreams2Reality, Mr Giveaways, Winner Winner Chicken Dinner.

## Setup

```bash
cd competitor-scraper
npm install
copy .env.example .env
```

Edit `.env` with your WordPress MySQL credentials.

## Run

```bash
# Dry run — summary only (no DB, compact output)
npm run test:four

# One site
npm run test:wwc
npm run test:d2r
npm run test:wwcd

# Live scrape → wp_competitor_competitions (needs .env + server DB)
npm run scrape:four
npm run scrape:rys
```

**Note:** Mr Giveaways uses Cloudflare. If `test:mrg` fails locally with a Cloudflare error, run on **Cloudways** (same server as WordPress).

## How it works

1. **Pass 1** — scans Ryse homepage + `/competitions/`, dedupes cards, reads `% sold` from listing
2. **Pass 2** — deep-scrapes up to 3 comps at ≥50% sold (configurable via `DEEP_MAX_COMPS_PER_SITE`)
3. **All listing comps** — saved as LOW confidence stubs; hot comps get full IW/financial data
4. **Upserts** into `wp_competitor_competitions` (preserves `first_seen_at`)

## Env vars

| Variable | Default | Description |
|----------|---------|-------------|
| `SCRAPER_THRESHOLD` | 50 | Min % sold for deep scrape + HIGH/MEDIUM tier |
| `DEEP_MAX_COMPS_PER_SITE` | 3 | Max deep scrapes per site per run |
| `REQUEST_DELAY_MS` | 1500 | Delay between page loads |

## Project layout

```
competitor-scraper/
  scraper.js          Main entry
  sites.js            Per-site URLs + selectors
  extractors/zap.js   Zap/WooCommerce DOM parser
  lib/db.js           MySQL upsert
  lib/metrics.js      pct_sold, confidence, financial calcs
```

## Next sites

Royalux and Winner Winner use the same Zap platform — add entries to `sites.js` with the same extractor.
