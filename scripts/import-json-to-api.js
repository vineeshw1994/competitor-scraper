#!/usr/bin/env node
/**
 * Post a scrape-results.json file to Server A API /import-json.
 *
 * Usage:
 *   node scripts/import-json-to-api.js output/scrape-results.json
 *
 * Env:
 *   IMPORT_API_URL     default: http://127.0.0.1:3847/import-json
 *   COMPETITOR_API_SECRET  optional auth header
 */
const fs = require('fs');
const path = require('path');

async function main() {
  const fileArg = process.argv[2] || 'output/scrape-results.json';
  const filePath = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(filePath)) {
    throw new Error(`JSON file not found: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf8'); 
  const payload = JSON.parse(raw);

  const url = process.env.IMPORT_API_URL || 'http://127.0.0.1:3847/import-json';
  const headers = { 'content-type': 'application/json' };
  if (process.env.COMPETITOR_API_SECRET) {
    headers['x-lwd-competitor-secret'] = process.env.COMPETITOR_API_SECRET;
  }

  console.log(`Posting ${filePath} -> ${url}`);
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_) {
    // keep raw text below
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${json ? JSON.stringify(json) : text}`);
  }
  console.log(JSON.stringify(json, null, 2));
}

main().catch((err) => {
  console.error('[import-json-to-api] failed:', err.message);
  process.exit(1);
});

