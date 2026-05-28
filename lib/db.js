/**
 * MySQL upsert for wp_competitor_competitions and wp_scraper_runs.
 */

const mysql = require('mysql2/promise');

let pool = null;

function table(name) {
  const prefix = process.env.DB_TABLE_PREFIX || 'wp_';
  return `${prefix}${name}`;
}

function toNumOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toIntOrNull(v) {
  const n = toNumOrNull(v);
  return n === null ? null : Math.trunc(n);
}

function clampNum(v, min, max) {
  const n = toNumOrNull(v);
  if (n === null) return null;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function cleanDbText(v) {
  if (v === null || v === undefined) return null;
  const s = String(v)
    .normalize('NFKD')
    // remove emoji and astral symbols
    .replace(/[\u{10000}-\u{10FFFF}]/gu, '')
    // normalize smart punctuation to plain text where possible
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    // final fallback: keep printable ascii to avoid charset errors
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
  return s === '' ? null : s;
}

function normalizeCompetitionRow(row) {
  return {
    title: cleanDbText(row.title) || '',
    site_name: cleanDbText(row.site_name) || '',
    competition_url: cleanDbText(row.competition_url) || '',
    type: row.type || 'unknown',
    ticket_price: toNumOrNull(row.ticket_price),
    total_tickets: toIntOrNull(row.total_tickets),
    tickets_sold: toIntOrNull(row.tickets_sold),
    tickets_remaining: toIntOrNull(row.tickets_remaining),
    // DB-safe percentage (prevents "Out of range value for column pct_sold").
    pct_sold: clampNum(row.pct_sold, 0, 100),
    days_running: toIntOrNull(row.days_running),
    daily_sellthrough: toNumOrNull(row.daily_sellthrough),
    total_ticket_revenue: toNumOrNull(row.total_ticket_revenue),
    jackpot_prize: cleanDbText(row.jackpot_prize),
    jackpot_value: toNumOrNull(row.jackpot_value),
    draw_date: cleanDbText(row.draw_date),
    status: cleanDbText(row.status) || 'Live',
    game_type: cleanDbText(row.game_type),
    confidence_tier: cleanDbText(row.confidence_tier),
    sell_speed: cleanDbText(row.sell_speed),
    iw_prizes: Array.isArray(row.iw_prizes) ? row.iw_prizes : null,
    iw_total_count: toIntOrNull(row.iw_total_count),
    iw_total_value: toNumOrNull(row.iw_total_value),
    total_prize_cost: toNumOrNull(row.total_prize_cost),
    iw_density_pct: toNumOrNull(row.iw_density_pct),
    iw_value_pct: toNumOrNull(row.iw_value_pct),
    operator_revenue_at_sellout: toNumOrNull(row.operator_revenue_at_sellout),
  };
}

async function getPool() {
  if (pool) return pool;
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
  });
  return pool;
}

async function getFirstSeenAt(competitionUrl) {
  const db = await getPool();
  const [rows] = await db.query(
    `SELECT first_seen_at FROM ${table('competitor_competitions')} WHERE competition_url = ? LIMIT 1`,
    [competitionUrl]
  );
  return rows[0]?.first_seen_at || null;
}

async function upsertCompetition(row) {
  const db = await getPool();
  const t = table('competitor_competitions');
  const nrow = normalizeCompetitionRow(row);
  const iwJson = nrow.iw_prizes ? JSON.stringify(nrow.iw_prizes) : null;

  const sql = `
    INSERT INTO ${t} (
      title, site_name, competition_url, type, ticket_price,
      total_tickets, tickets_sold, tickets_remaining, pct_sold,
      days_running, daily_sellthrough, total_ticket_revenue,
      jackpot_prize, jackpot_value, draw_date, status, game_type,
      confidence_tier, sell_speed, iw_prizes, iw_total_count,
      iw_total_value, total_prize_cost, iw_density_pct, iw_value_pct,
      operator_revenue_at_sellout, first_seen_at, last_scraped_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    ON DUPLICATE KEY UPDATE
      title = VALUES(title),
      site_name = VALUES(site_name),
      type = VALUES(type),
      ticket_price = VALUES(ticket_price),
      total_tickets = VALUES(total_tickets),
      tickets_sold = VALUES(tickets_sold),
      tickets_remaining = VALUES(tickets_remaining),
      pct_sold = VALUES(pct_sold),
      days_running = VALUES(days_running),
      daily_sellthrough = VALUES(daily_sellthrough),
      total_ticket_revenue = VALUES(total_ticket_revenue),
      jackpot_prize = VALUES(jackpot_prize),
      jackpot_value = VALUES(jackpot_value),
      draw_date = VALUES(draw_date),
      status = VALUES(status),
      game_type = VALUES(game_type),
      confidence_tier = VALUES(confidence_tier),
      sell_speed = VALUES(sell_speed),
      iw_prizes = VALUES(iw_prizes),
      iw_total_count = VALUES(iw_total_count),
      iw_total_value = VALUES(iw_total_value),
      total_prize_cost = VALUES(total_prize_cost),
      iw_density_pct = VALUES(iw_density_pct),
      iw_value_pct = VALUES(iw_value_pct),
      operator_revenue_at_sellout = VALUES(operator_revenue_at_sellout),
      last_scraped_at = NOW()
  `;

  const params = [
    nrow.title,
    nrow.site_name,
    nrow.competition_url,
    nrow.type || 'unknown',
    nrow.ticket_price,
    nrow.total_tickets,
    nrow.tickets_sold,
    nrow.tickets_remaining,
    nrow.pct_sold,
    nrow.days_running,
    nrow.daily_sellthrough,
    nrow.total_ticket_revenue,
    nrow.jackpot_prize,
    nrow.jackpot_value,
    nrow.draw_date,
    nrow.status || 'Live',
    nrow.game_type,
    nrow.confidence_tier,
    nrow.sell_speed,
    iwJson,
    nrow.iw_total_count,
    nrow.iw_total_value,
    nrow.total_prize_cost,
    nrow.iw_density_pct,
    nrow.iw_value_pct,
    nrow.operator_revenue_at_sellout,
  ];

  await db.query(sql, params);
}

function hostFromUrl(url) {
  try {
    const raw = String(url || '').trim();
    if (!raw) return '';
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return (u.hostname || '').replace(/^www\./i, '').toLowerCase();
  } catch (_) {
    return '';
  }
}

function slugFromSiteName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 20);
}

async function upsertSiteFromCompetition(row) {
  const db = await getPool();
  const t = table('competitor_sites');
  const siteName = cleanDbText(row.site_name) || '';
  const host = hostFromUrl(row.competition_url);
  if (!siteName || !host) return false;
  const slug = slugFromSiteName(siteName) || 'site';
  const sql = `
    INSERT INTO ${t} (name, url, slug, extractor, is_active)
    VALUES (?, ?, ?, 'zap', 1)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      is_active = 1
  `;
  await db.query(sql, [siteName, host, slug]);
  return true;
}

async function importCompetitionsPayload(payload) {
  const comps = Array.isArray(payload)
    ? payload
    : (Array.isArray(payload?.competitions) ? payload.competitions : []);

  if (!comps.length) {
    throw new Error('No competitions in payload');
  }

  const perSiteErrors = {};
  let saved = 0;
  let sitesTouched = 0;
  const runId = await startRun();

  try {
    for (const row of comps) {
      const key = String(row?.site_name || 'unknown');
      if (!perSiteErrors[key]) perSiteErrors[key] = [];
      try {
        await upsertCompetition(row);
        saved += 1;
        try {
          const ok = await upsertSiteFromCompetition(row);
          if (ok) sitesTouched += 1;
        } catch (_) {
          // site sync should not block competition import
        }
      } catch (e) {
        perSiteErrors[key].push({ url: row?.competition_url || '', error: e.message });
      }
    }

    const status = Object.values(perSiteErrors).some((list) => list && list.length) ? 'partial' : 'success';
    await finishRun(runId, {
      totalFound: comps.length,
      perSiteErrors,
      status,
    });
    return { runId, total: comps.length, saved, sitesTouched, status, perSiteErrors };
  } catch (e) {
    await finishRun(runId, {
      totalFound: comps.length,
      perSiteErrors: { import: [{ error: e.message }] },
      status: 'failed',
    });
    throw e;
  }
}

async function startRun() {
  const db = await getPool();
  const [result] = await db.query(
    `INSERT INTO ${table('scraper_runs')} (run_start, status) VALUES (NOW(), 'running')`
  );
  return result.insertId;
}

async function finishRun(runId, { totalFound, perSiteErrors, status }) {
  const db = await getPool();
  await db.query(
    `UPDATE ${table('scraper_runs')}
     SET run_end = NOW(), total_competitions_found = ?, per_site_errors = ?, status = ?
     WHERE id = ?`,
    [totalFound, JSON.stringify(perSiteErrors || {}), status, runId]
  );
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  getPool,
  getFirstSeenAt,
  upsertCompetition,
  upsertSiteFromCompetition,
  importCompetitionsPayload,
  startRun,
  finishRun,
  closePool,
};
