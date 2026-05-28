#!/usr/bin/env node
/**
 * HTTP API for WordPress dashboard (cross-server).
 * Run on the SAME server as npm run scrape (wftxhgbmuh DB).
 *
 *   npm run api
 *
 * WordPress competitor-db.local.php:
 *   define('LWD_COMPETITOR_API_URL', 'http://NODE_SERVER_IP:3847');
 *   define('LWD_COMPETITOR_API_SECRET', 'same-as-COMPETITOR_API_SECRET-in-env');
 */

require('dotenv').config();
const http = require('http');
const api = require('./lib/api-read');
const db = require('./lib/db');

const PORT = parseInt(process.env.COMPETITOR_API_PORT || '3847', 10);
const SECRET = process.env.COMPETITOR_API_SECRET || '';

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(json);
}

function unauthorized(res) {
  send(res, 401, { ok: false, error: 'Unauthorized' });
}

function checkAuth(req) {
  if (!SECRET) return true;
  const header = req.headers['x-lwd-competitor-secret'] || '';
  const url = new URL(req.url, 'http://localhost');
  const q = url.searchParams.get('secret') || '';
  return header === SECRET || q === SECRET;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 25 * 1024 * 1024) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

async function handle(req, res) {
  if (!checkAuth(req)) return unauthorized(res);

  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.replace(/\/+$/, '') || '/';

  try {
    if (req.method === 'GET' && path === '/health') {
      return send(res, 200, { ok: true, service: 'letswin-competitor-api' });
    }

    if (req.method === 'GET' && path === '/meta') {
      return send(res, 200, { ok: true, ...(await api.meta()) });
    }

    if (req.method === 'GET' && path === '/competitions') {
      const limit = url.searchParams.get('limit') || '500';
      const rows = await api.listCompetitions(limit);
      return send(res, 200, { ok: true, comps: rows, count: rows.length });
    }

    if (req.method === 'GET' && path === '/last-run') {
      return send(res, 200, { ok: true, lastRun: await api.lastRun() });
    }

    if (req.method === 'GET' && path === '/sites') {
      const sites = await api.listSites();
      return send(res, 200, { ok: true, sites });
    }

    if (req.method === 'POST' && path === '/sites') {
      const body = await readBody(req);
      const row = await api.addSite(body.name, body.url);
      if (!row) return send(res, 400, { ok: false, error: 'Could not add site' });
      const sites = await api.listSites();
      return send(res, 200, { ok: true, site: row, sites });
    }

    if (req.method === 'POST' && path === '/sites/remove') {
      const body = await readBody(req);
      const ok = await api.removeSite(body.id);
      if (!ok) return send(res, 400, { ok: false, error: 'Could not remove site' });
      const sites = await api.listSites();
      return send(res, 200, { ok: true, sites });
    }

    if (req.method === 'POST' && path === '/import-json') {
      const body = await readBody(req);
      const result = await db.importCompetitionsPayload(body);
      return send(res, 200, {
        ok: true,
        imported: {
          run_id: result.runId,
          total: result.total,
          saved: result.saved,
          sites_touched: result.sitesTouched,
          status: result.status,
          errors: result.perSiteErrors,
        },
      });
    }

    send(res, 404, { ok: false, error: 'Not found' });
  } catch (e) {
    console.error('[api]', e);
    send(res, 500, { ok: false, error: e.message || 'Server error' });
  }
}

const server = http.createServer((req, res) => {
  handle(req, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Letswin competitor API listening on 0.0.0.0:${PORT}`);
  console.log(`DB: ${process.env.DB_NAME || '(not set)'}`);
  if (!SECRET) {
    console.warn('WARNING: COMPETITOR_API_SECRET not set — API is open to anyone who can reach this port');
  }
});

process.on('SIGTERM', async () => {
  await db.closePool();
  process.exit(0);
});
