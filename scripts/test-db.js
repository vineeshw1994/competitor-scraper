#!/usr/bin/env node
/**
 * Quick MySQL connectivity check (GitHub Actions pre-flight).
 * Usage: DB_HOST=... DB_USER=... node scripts/test-db.js
 */
const mysql = require('mysql2/promise');

async function main() {
  const host = (process.env.DB_HOST || '').trim();
  const user = (process.env.DB_USER || '').trim();
  const pass = process.env.DB_PASSWORD;
  const name = (process.env.DB_NAME || '').trim();
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const prefix = process.env.DB_TABLE_PREFIX || 'wp_';

  if (!host || !user || !name) {
    console.error('Missing GitHub secret(s). Required: DB_HOST, DB_USER, DB_NAME');
    console.error(`  DB_HOST: ${host ? 'set' : 'MISSING'}`);
    console.error(`  DB_USER: ${user ? 'set' : 'MISSING'}`);
    console.error(`  DB_NAME: ${name ? 'set' : 'MISSING'}`);
    process.exit(1);
  }

  const badHosts = ['localhost', '127.0.0.1', '::1'];
  if (badHosts.includes(host.toLowerCase())) {
    console.error(`DB_HOST="${host}" only works on the server itself, not from GitHub Actions.`);
    console.error('Use the Cloudways PUBLIC IP from Access Details (e.g. 52.56.159.106).');
    process.exit(1);
  }
  if (host.includes('://') || host.includes('/')) {
    console.error('DB_HOST must be IP or hostname only — no http:// and no path.');
    process.exit(1);
  }

  console.log(`Connecting to MySQL ${host}:${port}/${name} as ${user} ...`);
  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password: pass,
    database: name,
    connectTimeout: 20000,
  });

  const compsT = `${prefix}competitor_competitions`;
  const runsT = `${prefix}scraper_runs`;

  const [compRows] = await conn.query(`SELECT COUNT(*) AS n FROM ${compsT}`);
  const [runRows] = await conn.query(`SELECT COUNT(*) AS n FROM ${runsT}`);

  console.log(`OK — ${compsT}: ${compRows[0].n} rows, ${runsT}: ${runRows[0].n} rows`);
  await conn.end();
}

main().catch((err) => {
  console.error('MySQL connection failed:', err.message);
  if (err.code === 'ENOTFOUND' || /ENOTFOUND/i.test(err.message)) {
    console.error('');
    console.error('ENOTFOUND = DB_HOST hostname cannot be resolved. Check GitHub secret DB_HOST:');
    console.error('  • Secret name must be exactly: DB_HOST (all caps)');
    console.error('  • Value = Cloudways public IP only, e.g. 52.56.159.106');
    console.error('  • NOT localhost, NOT 127.0.0.1, NOT the DB name (erbeaaustu)');
    console.error('  • No http://, no spaces, no quotes in the secret value');
  }
  if (err.code === 'ECONNREFUSED') {
    console.error('ECONNREFUSED = IP reachable but MySQL port 3306 blocked. Ask Cloudways to whitelist GitHub IPs.');
  }
  if (err.code === 'ER_ACCESS_DENIED_ERROR') {
    console.error('Wrong DB_USER or DB_PASSWORD — use erbeaaustu app credentials from Cloudways Access Details.');
  }
  process.exit(1);
});
