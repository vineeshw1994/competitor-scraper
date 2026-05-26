/**
 * Read-only (+ sites CRUD) queries for the dashboard HTTP API.
 */

const db = require('./db');

function table(name) {
  const prefix = process.env.DB_TABLE_PREFIX || 'wp_';
  return `${prefix}${name}`;
}

async function listCompetitions(limit = 500) {
  const pool = await db.getPool();
  const t = table('competitor_competitions');
  const lim = Math.max(1, Math.min(1000, parseInt(limit, 10) || 500));
  const [rows] = await pool.query(
    `SELECT * FROM ${t} ORDER BY last_scraped_at DESC, pct_sold DESC LIMIT ${lim}`
  );
  return rows;
}

async function countCompetitions() {
  const pool = await db.getPool();
  const t = table('competitor_competitions');
  const [rows] = await pool.query(`SELECT COUNT(*) AS n FROM ${t}`);
  return rows[0]?.n || 0;
}

async function lastRun() {
  const pool = await db.getPool();
  const t = table('scraper_runs');
  const [tables] = await pool.query(`SHOW TABLES LIKE '${t}'`);
  if (!tables.length) return null;
  const [rows] = await pool.query(
    `SELECT id, run_start, run_end, total_competitions_found, status
     FROM ${t} ORDER BY id DESC LIMIT 1`
  );
  return rows[0] || null;
}

async function listSites() {
  const pool = await db.getPool();
  const t = table('competitor_sites');
  const [tables] = await pool.query(`SHOW TABLES LIKE '${t}'`);
  if (!tables.length) return [];
  const [rows] = await pool.query(
    `SELECT * FROM ${t} WHERE is_active = 1 ORDER BY sort_order ASC, name ASC`
  );
  return rows;
}

async function addSite(name, url) {
  const pool = await db.getPool();
  const t = table('competitor_sites');
  const cleanUrl = String(url)
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '');
  const cleanName = String(name).trim();
  if (!cleanName || !cleanUrl) return null;

  const [existing] = await pool.query(`SELECT id FROM ${t} WHERE url = ? LIMIT 1`, [cleanUrl]);
  if (existing.length) {
    await pool.query(`UPDATE ${t} SET name = ?, is_active = 1 WHERE id = ?`, [
      cleanName,
      existing[0].id,
    ]);
    const [row] = await pool.query(`SELECT * FROM ${t} WHERE id = ?`, [existing[0].id]);
    return row[0];
  }

  const [maxRow] = await pool.query(`SELECT COALESCE(MAX(sort_order), 0) AS m FROM ${t}`);
  const sortOrder = (maxRow[0]?.m || 0) + 1;
  const slug = cleanUrl.split('.')[0].slice(0, 20);

  await pool.query(
    `INSERT INTO ${t} (name, url, slug, extractor, is_active, sort_order)
     VALUES (?, ?, ?, 'zap', 1, ?)`,
    [cleanName, cleanUrl, slug, sortOrder]
  );
  const [row] = await pool.query(`SELECT * FROM ${t} WHERE url = ? LIMIT 1`, [cleanUrl]);
  return row[0] || null;
}

async function removeSite(id) {
  const pool = await db.getPool();
  const t = table('competitor_sites');
  const siteId = parseInt(id, 10);
  if (!siteId) return false;
  const [result] = await pool.query(`UPDATE ${t} SET is_active = 0 WHERE id = ?`, [siteId]);
  return result.affectedRows > 0;
}

async function meta() {
  const pool = await db.getPool();
  const compsT = table('competitor_competitions');
  const runsT = table('scraper_runs');
  const [compsTables] = await pool.query(`SHOW TABLES LIKE '${compsT}'`);
  const [runsTables] = await pool.query(`SHOW TABLES LIKE '${runsT}'`);
  const compsTable = compsTables.length > 0;
  const runsTable = runsTables.length > 0;
  return {
    db_name: process.env.DB_NAME || '',
    comps_table_exists: compsTable,
    runs_table_exists: runsTable,
    comps_count: compsTable ? await countCompetitions() : 0,
    last_run: runsTable ? await lastRun() : null,
  };
}

module.exports = {
  listCompetitions,
  countCompetitions,
  lastRun,
  listSites,
  addSite,
  removeSite,
  meta,
};
