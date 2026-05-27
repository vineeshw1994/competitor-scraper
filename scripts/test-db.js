#!/usr/bin/env node
/**
 * Quick MySQL connectivity check (GitHub Actions pre-flight).
 * Usage: DB_HOST=... DB_USER=... node scripts/test-db.js
 */
const mysql = require('mysql2/promise');

async function main() {
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const pass = process.env.DB_PASSWORD;
  const name = process.env.DB_NAME;
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const prefix = process.env.DB_TABLE_PREFIX || 'wp_';

  if (!host || !user || !name) {
    console.error('Missing DB_HOST, DB_USER, or DB_NAME');
    process.exit(1);
  }

  console.log(`Connecting to MySQL ${host}:${port}/${name} ...`);
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
  process.exit(1);
});
