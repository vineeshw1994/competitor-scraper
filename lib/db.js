/**
 * MySQL upsert for wp_competitor_competitions and wp_scraper_runs.
 */

const mysql = require('mysql2/promise');

let pool = null;

function table(name) {
  const prefix = process.env.DB_TABLE_PREFIX || 'wp_';
  return `${prefix}${name}`;
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
  const iwJson = row.iw_prizes ? JSON.stringify(row.iw_prizes) : null;

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
    row.title,
    row.site_name,
    row.competition_url,
    row.type || 'unknown',
    row.ticket_price,
    row.total_tickets,
    row.tickets_sold,
    row.tickets_remaining,
    row.pct_sold,
    row.days_running,
    row.daily_sellthrough,
    row.total_ticket_revenue,
    row.jackpot_prize,
    row.jackpot_value,
    row.draw_date,
    row.status || 'Live',
    row.game_type,
    row.confidence_tier,
    row.sell_speed,
    iwJson,
    row.iw_total_count,
    row.iw_total_value,
    row.total_prize_cost,
    row.iw_density_pct,
    row.iw_value_pct,
    row.operator_revenue_at_sellout,
  ];

  await db.query(sql, params);
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
  startRun,
  finishRun,
  closePool,
};
