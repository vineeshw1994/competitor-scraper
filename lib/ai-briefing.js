/**
 * Claude daily competitor briefing — one API call per scrape run.
 */

const db = require('./db');

const DEFAULT_MODEL = 'claude-3-5-haiku-latest';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

function table(name) {
  const prefix = process.env.DB_TABLE_PREFIX || 'wp_';
  return `${prefix}${name}`;
}

function enabled() {
  if (process.env.AI_BRIEFING_ENABLED === '0' || process.env.AI_BRIEFING_ENABLED === 'false') {
    return false;
  }
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function maxComps() {
  const n = parseInt(process.env.AI_BRIEFING_MAX_COMPS || '20', 10);
  return Math.max(5, Math.min(30, Number.isFinite(n) ? n : 20));
}

function maxTokens() {
  const n = parseInt(process.env.AI_BRIEFING_MAX_TOKENS || '1200', 10);
  return Math.max(400, Math.min(2000, Number.isFinite(n) ? n : 1200));
}

async function ensureBriefingsTable() {
  const pool = await db.getPool();
  const t = table('competitor_ai_briefings');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${t} (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      scraper_run_id INT UNSIGNED NULL DEFAULT NULL,
      generated_at DATETIME NOT NULL,
      model VARCHAR(80) NOT NULL DEFAULT '',
      status VARCHAR(20) NOT NULL DEFAULT 'ok',
      error_message VARCHAR(500) NULL DEFAULT NULL,
      prompt_tokens INT UNSIGNED NULL DEFAULT NULL,
      completion_tokens INT UNSIGNED NULL DEFAULT NULL,
      summary_json JSON NOT NULL,
      PRIMARY KEY (id),
      KEY idx_scraper_run (scraper_run_id),
      KEY idx_generated (generated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

/**
 * Top competitions for the prompt (HIGH first, then by sell-through).
 */
async function fetchTopCompsForBriefing(limit) {
  const pool = await db.getPool();
  const t = table('competitor_competitions');
  const lim = Math.max(1, Math.min(30, limit));
  const [rows] = await pool.query(
    `SELECT title, site_name, type, confidence_tier, sell_speed,
            ticket_price, pct_sold, daily_sellthrough, tickets_remaining,
            total_tickets, jackpot_prize, operator_revenue_at_sellout,
            iw_total_count, iw_density_pct, competition_url
     FROM ${t}
     WHERE confidence_tier IN ('HIGH', 'MEDIUM')
        OR (pct_sold IS NOT NULL AND pct_sold >= 50)
     ORDER BY
       FIELD(confidence_tier, 'HIGH', 'MEDIUM', 'LOW'),
       daily_sellthrough DESC,
       pct_sold DESC
     LIMIT ${lim}`
  );
  return rows;
}

function compactCompForPrompt(row) {
  return {
    site: row.site_name,
    title: String(row.title || '').slice(0, 120),
    type: row.type,
    tier: row.confidence_tier,
    speed: row.sell_speed,
    ticket: row.ticket_price,
    pct_sold: row.pct_sold,
    daily_pct: row.daily_sellthrough,
    remaining: row.tickets_remaining,
    jackpot: row.jackpot_prize ? String(row.jackpot_prize).slice(0, 80) : null,
    op_profit: row.operator_revenue_at_sellout,
    iw_count: row.iw_total_count,
  };
}

function buildPrompt(comps, runMeta) {
  const lines = comps.map((c, i) => `${i + 1}. ${JSON.stringify(compactCompForPrompt(c))}`);
  return `You are a competition-site intelligence analyst for Letswin (UK prize competitions operator).

Analyze these competitor competitions from our latest scrape (${runMeta.total || comps.length} comps in DB; showing top ${comps.length}).

Data (JSON per line):
${lines.join('\n')}

Respond with ONLY valid JSON (no markdown fences) in this shape:
{
  "headline": "one sentence executive summary",
  "bullets": ["3-6 short strategic insights for Letswin"],
  "top_watch": [
    {"title": "comp title", "site": "site name", "reason": "one line why watch/copy"}
  ]
}

Focus on: fast sellers, pricing patterns, instant-win density, operator margin signals, what Letswin should launch or monitor this week. Be specific and concise.`;
}

function parseClaudeJson(text) {
  const raw = String(text || '').trim();
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    const parsed = JSON.parse(stripped);
    if (parsed && typeof parsed === 'object') {
      return {
        headline: String(parsed.headline || '').trim(),
        bullets: Array.isArray(parsed.bullets)
          ? parsed.bullets.map((b) => String(b).trim()).filter(Boolean).slice(0, 8)
          : [],
        top_watch: Array.isArray(parsed.top_watch)
          ? parsed.top_watch.slice(0, 5).map((w) => ({
              title: String(w.title || '').trim(),
              site: String(w.site || w.site_name || '').trim(),
              reason: String(w.reason || '').trim(),
            }))
          : [],
        full_text: stripped,
      };
    }
  } catch (_) {
    // fall through
  }
  const bullets = raw
    .split(/\n+/)
    .map((l) => l.replace(/^[-*•]\s*/, '').trim())
    .filter((l) => l.length > 20)
    .slice(0, 6);
  return {
    headline: 'Competitor intelligence briefing',
    bullets: bullets.length ? bullets : [raw.slice(0, 500)],
    top_watch: [],
    full_text: raw,
  };
}

async function callClaude(prompt, apiKeyOverride, modelOverride) {
  const apiKey = apiKeyOverride || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }
  const model = modelOverride || process.env.CLAUDE_MODEL || DEFAULT_MODEL;

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens(),
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const body = await res.json();
  if (!res.ok) {
    const msg = body?.error?.message || body?.error || res.statusText;
    throw new Error(`Anthropic API ${res.status}: ${msg}`);
  }

  const text = (body.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  return {
    model: body.model || model,
    text,
    usage: body.usage || {},
  };
}

async function saveBriefing({ runId, model, status, errorMessage, summary, usage }) {
  await ensureBriefingsTable();
  const pool = await db.getPool();
  const t = table('competitor_ai_briefings');
  const [result] = await pool.query(
    `INSERT INTO ${t}
     (scraper_run_id, generated_at, model, status, error_message,
      prompt_tokens, completion_tokens, summary_json)
     VALUES (?, NOW(), ?, ?, ?, ?, ?, ?)`,
    [
      runId || null,
      model || '',
      status,
      errorMessage || null,
      usage?.input_tokens ?? usage?.prompt_tokens ?? null,
      usage?.output_tokens ?? usage?.completion_tokens ?? null,
      JSON.stringify(summary),
    ]
  );
  return result.insertId;
}

async function getLatestBriefing() {
  await ensureBriefingsTable();
  const pool = await db.getPool();
  const t = table('competitor_ai_briefings');
  const [rows] = await pool.query(
    `SELECT id, scraper_run_id, generated_at, model, status, error_message,
            prompt_tokens, completion_tokens, summary_json
     FROM ${t}
     ORDER BY id DESC
     LIMIT 1`
  );
  if (!rows[0]) return null;
  const row = rows[0];
  let summary = {};
  try {
    summary = typeof row.summary_json === 'string'
      ? JSON.parse(row.summary_json)
      : row.summary_json;
  } catch (_) {
    summary = { full_text: String(row.summary_json || '') };
  }
  return {
    id: row.id,
    scraper_run_id: row.scraper_run_id,
    generated_at: row.generated_at,
    model: row.model,
    status: row.status,
    error_message: row.error_message,
    prompt_tokens: row.prompt_tokens,
    completion_tokens: row.completion_tokens,
    summary,
  };
}

/**
 * @param {number|null} runId
 * @param {{ apiKey?: string, totalFound?: number, model?: string }} opts
 */
async function generateForRun(runId, opts = {}) {
  if (!opts.apiKey && !enabled()) {
    return { ok: false, skipped: true, reason: 'ANTHROPIC_API_KEY not configured' };
  }

  const comps = await fetchTopCompsForBriefing(maxComps());
  if (!comps.length) {
    return { ok: false, skipped: true, reason: 'No competitions in database for briefing' };
  }

  const runMeta = { run_id: runId, total: opts.totalFound ?? comps.length };
  const prompt = buildPrompt(comps, runMeta);
  const model = opts.model || process.env.CLAUDE_MODEL || DEFAULT_MODEL;

  try {
    const { text, usage, model: usedModel } = await callClaude(prompt, opts.apiKey, opts.model);
    const summary = parseClaudeJson(text);
    const id = await saveBriefing({
      runId,
      model: usedModel || model,
      status: 'ok',
      errorMessage: null,
      summary,
      usage,
    });
    return {
      ok: true,
      briefing_id: id,
      run_id: runId,
      model: usedModel || model,
      comps_analyzed: comps.length,
      summary,
    };
  } catch (e) {
    const id = await saveBriefing({
      runId,
      model,
      status: 'error',
      errorMessage: String(e.message || e).slice(0, 500),
      summary: { headline: '', bullets: [], top_watch: [], full_text: '' },
      usage: {},
    });
    return {
      ok: false,
      briefing_id: id,
      run_id: runId,
      error: e.message || String(e),
    };
  }
}

module.exports = {
  enabled,
  ensureBriefingsTable,
  fetchTopCompsForBriefing,
  generateForRun,
  getLatestBriefing,
};
