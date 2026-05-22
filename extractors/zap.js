/**
 * Zap/WooCommerce competition platform extractor.
 * Used by Ryse, Royalux, Winner Winner (same DOM patterns).
 */

const { parseMoney, parseIntSafe, calcPctSold, detectType, detectGameType } = require('../lib/metrics');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractPctFromText(text) {
  if (!text) return null;
  let m = text.match(/(\d+(?:\.\d+)?)\s*%\s*sold/i);
  if (m) return parseFloat(m[1]);
  m = text.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? parseFloat(m[1]) : null;
}

/** e.g. "674 / 4800" on Royalux listing cards */
function extractSoldMaxFromText(text) {
  if (!text) return null;
  const m = text.match(/(\d[\d,]*)\s*\/\s*(\d[\d,]*)/);
  if (!m) return null;
  return {
    sold: parseInt(m[1].replace(/,/g, ''), 10),
    max: parseInt(m[2].replace(/,/g, ''), 10),
  };
}

/** @param {string} href
 * @param {{ competitionUrlPatterns?: string[] }} site */
function isCompetitionUrl(href, site) {
  if (!href) return false;
  const patterns = site.competitionUrlPatterns || ['/competition/'];
  return patterns.some((p) => href.includes(p));
}

function extractJackpotFromTitle(title) {
  if (!title) return { prize: null, value: null };
  const valueMatch = title.match(/£([\d,]+(?:\.\d{2})?)/);
  const value = valueMatch ? parseMoney(valueMatch[1]) : null;
  const endMatch = title.match(/([\d,]+)\s*end prize/i);
  const endValue = endMatch ? parseMoney(endMatch[1]) : null;
  return {
    prize: title,
    value: endValue || value,
  };
}

/**
 * Discover WooCommerce competition archive pages (e.g. /competitions/page/2/).
 */
async function resolveListingUrls(page, site) {
  const urls = new Set(site.listingUrls.map((u) => u.split('?')[0]));

  if (!site.listingPaginate) {
    return Array.from(urls);
  }

  const start =
    site.listingUrls.find((u) => u.includes('/competitions')) || site.listingUrls[0];
  if (!start) return Array.from(urls);

  const navSel = site.selectors?.listing?.paginationNav;

  try {
    await page.goto(start, { waitUntil: 'domcontentloaded', timeout: 90000 });
    const discovered = await page.evaluate((paginationNav) => {
      const found = new Set();
      const addUrl = (href) => {
        if (!href) return;
        let u = href.split('?')[0];
        if (!/\/competitions/i.test(u) || /\/competition\//i.test(u)) return;
        if (!u.endsWith('/')) u += '/';
        found.add(u);
      };

      document.querySelectorAll('a[href*="/competitions"]').forEach((a) => addUrl(a.href));

      if (paginationNav) {
        paginationNav.split(',').forEach((sel) => {
          document.querySelectorAll(`${sel.trim()} a[href]`).forEach((a) => addUrl(a.href));
        });
      }

      return Array.from(found);
    }, navSel || '');
    discovered.forEach((u) => urls.add(u));
  } catch (_) {
    /* use explicit listingUrls only */
  }

  return Array.from(urls).sort();
}

/**
 * Pass 1 — scan listing pages, dedupe by URL.
 */
async function scanListing(page, site) {
  const sel = site.selectors.listing;
  const seen = new Map();
  const listingUrls = await resolveListingUrls(page, site);
  console.log(`[${site.slug}] Scanning ${listingUrls.length} listing page(s)`);

  for (const listingUrl of listingUrls) {
    await page.goto(listingUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await sleep(parseInt(process.env.REQUEST_DELAY_MS || '2500', 10));
    try {
      await page.waitForSelector('ul.products li.product, li.product.type-product', {
        timeout: 15000,
      });
    } catch (_) {
      /* continue — may still parse partial HTML */
    }

    let cardNodes = 0;
    try {
      cardNodes = await page.$$eval(sel.cards, (nodes) => nodes.length);
    } catch (_) {
      cardNodes = 0;
    }
    if (!cardNodes) {
      const hint = await page.evaluate(() => ({
        title: document.title || '',
        products: document.querySelectorAll('ul.products li.product').length,
        blocked: /just a moment|security verification|cloudflare|access denied/i.test(
          document.body?.innerText || ''
        ),
      }));
      console.warn(
        `[${site.slug}] 0 cards on ${listingUrl} — page="${hint.title.slice(0, 60)}" ` +
          `li.product=${hint.products} blocked=${hint.blocked}`
      );
    }

    const cards = await page.$$eval(sel.cards, (nodes, selectors) => {
      return nodes.map((card) => {
        const linkEl = card.querySelector(selectors.link.split(',')[0].trim())
          || card.querySelector('a[href*="/competition/"]');
        const href = linkEl?.href || null;
        const title = card.querySelector(selectors.title)?.textContent?.trim() || null;
        const progressEl = card.querySelector(selectors.progress);
        const progressText = progressEl?.textContent?.trim() || card.textContent || '';
        const priceText = card.querySelector(selectors.price)?.textContent?.trim() || '';
        let barEl = card.querySelector(selectors.progressBar);
        if (barEl && !barEl.style?.width) {
          barEl =
            barEl.querySelector('div[style*="width"]') ||
            barEl.querySelector('.progress-track div[style*="width"]');
        }
        let pctFromBar = null;
        if (barEl?.style?.width) {
          const w = parseFloat(barEl.style.width);
          if (!Number.isNaN(w)) pctFromBar = w;
        }
        const classes = card.className || '';
        const isClosed = /competition-closed|outofstock|sold-out/.test(classes);
        return { href, title, progressText, priceText, pctFromBar, isClosed };
      });
    }, sel);

    for (const card of cards) {
      if (!card.href || !isCompetitionUrl(card.href, site)) continue;
      if (seen.has(card.href)) continue;

      const soldMax = extractSoldMaxFromText(card.progressText);
      const pctFromText = extractPctFromText(card.progressText);
      let pctSold = card.pctFromBar ?? pctFromText;
      if (pctSold == null && soldMax?.sold != null && soldMax?.max > 0) {
        pctSold = Math.round((soldMax.sold / soldMax.max) * 10000) / 100;
      }
      const ticketPrice = parseMoney(card.priceText);

      seen.set(card.href, {
        title: card.title,
        competition_url: card.href.split('?')[0],
        ticket_price: ticketPrice,
        pct_sold: pctSold,
        tickets_sold: soldMax?.sold ?? null,
        total_tickets: soldMax?.max ?? null,
        status: card.isClosed ? 'Sold Out' : 'Live',
        site_name: site.name,
      });
    }
  }

  return Array.from(seen.values());
}

/**
 * Pass 2 — deep scrape a single competition page.
 */
async function scrapeSingle(page, site, listingItem) {
  const sel = site.selectors.single;
  const url = listingItem.competition_url;

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(parseInt(process.env.REQUEST_DELAY_MS || '1500', 10));

  const raw = await page.evaluate((selectors) => {
    const text = (el) => el?.textContent?.trim() || null;
    const num = (el) => text(el);

    const title = text(document.querySelector(selectors.title));
    const priceEl = document.querySelector(selectors.price);
    const priceText = text(priceEl);

    const soldEl = document.querySelector(selectors.ticketsSold);
    const maxEl = document.querySelector(selectors.ticketsMax);
    const soldText = num(soldEl);
    const maxText = num(maxEl);

    const progressRoot = document.querySelector(selectors.progressText);
    const progressText = progressRoot?.textContent || document.body.innerText.slice(0, 5000);

    let pctFromBar = null;
    let barEl = document.querySelector(selectors.progressBar);
    if (barEl && !barEl.style?.width) {
      barEl =
        barEl.querySelector('div[style*="width"]') ||
        barEl.querySelector('.progress-track div[style*="width"]');
    }
    if (barEl?.style?.width) {
      const w = parseFloat(barEl.style.width);
      if (!Number.isNaN(w)) pctFromBar = w;
    }

    const drawDate = text(document.querySelector(selectors.drawDate));
    const totalIwText = text(document.querySelector(selectors.totalIw));

    let pctFromLabel = null;
    if (selectors.pctLabel) {
      pctFromLabel = text(document.querySelector(selectors.pctLabel));
      const pm = (pctFromLabel || '').match(/(\d+(?:\.\d+)?)\s*%/);
      if (pm) pctFromLabel = parseFloat(pm[1]);
      else pctFromLabel = null;
    }

    const hasInstantWinSection = selectors.iwInstantMarker
      ? !!document.querySelector(selectors.iwInstantMarker)
      : false;

    const iwPrizes = [];
    const container = document.querySelector(selectors.iwContainer);
    if (container) {
      const groups = container.querySelectorAll(selectors.iwGroup);
      groups.forEach((group) => {
        const header = group.querySelector(selectors.iwGroupHeader);
        const headerText = header?.textContent?.trim() || '';

        const rows = group.querySelectorAll(selectors.iwRow);
        if (rows.length > 0) {
          rows.forEach((row) => {
            const rowText = row.textContent.replace(/\s+/g, ' ').trim();
            const valueMatch = rowText.match(/£([\d,]+(?:\.\d{2})?)/);
            const qtyMatch = rowText.match(/(\d+)\s*(?:x|×|of|\/)/i) || rowText.match(/x\s*(\d+)/i);
            const remainingMatch = rowText.match(/(\d+)\s+of\s+(\d+)\s+remaining/i);
            const prizeName = row.querySelector('td:first-child, .prize-name, strong')?.textContent?.trim()
              || rowText.split('£')[0].trim();
            iwPrizes.push({
              prize: prizeName || headerText,
              value: valueMatch ? parseFloat(valueMatch[1].replace(/,/g, '')) : null,
              qty_total: remainingMatch ? parseInt(remainingMatch[2], 10) : (qtyMatch ? parseInt(qtyMatch[1], 10) : null),
              qty_remaining: remainingMatch ? parseInt(remainingMatch[1], 10) : null,
            });
          });
        } else if (headerText) {
          const valueMatch = headerText.match(/£([\d,]+(?:\.\d{2})?)/);
          const qtyMatch = headerText.match(/(\d+)\s*x/i);
          iwPrizes.push({
            prize: headerText,
            value: valueMatch ? parseFloat(valueMatch[1].replace(/,/g, '')) : null,
            qty_total: qtyMatch ? parseInt(qtyMatch[1], 10) : 1,
            qty_remaining: null,
          });
        }
      });
    }

    const bodyText = document.body.innerText.slice(0, 8000);
    const soldOut = !!document.querySelector(selectors.soldOut);

    return {
      title,
      priceText,
      soldText,
      maxText,
      progressText,
      pctFromBar,
      pctFromLabel,
      drawDate,
      totalIwText,
      iwPrizes,
      bodyText,
      soldOut,
      hasInstantWinSection,
    };
  }, sel);

  const ticketsSold = parseIntSafe(raw.soldText) ?? listingItem.tickets_sold;
  const totalTickets = parseIntSafe(raw.maxText) ?? listingItem.total_tickets;
  const ticketsRemaining =
    totalTickets != null && ticketsSold != null ? totalTickets - ticketsSold : null;

  const pctFromText = extractPctFromText(raw.progressText);
  const pctSold = calcPctSold(
    ticketsSold,
    ticketsRemaining,
    totalTickets,
    raw.pctFromLabel ?? raw.pctFromBar ?? pctFromText ?? listingItem.pct_sold
  );

  const ticketPrice = parseMoney(raw.priceText) ?? listingItem.ticket_price;
  const jackpot = extractJackpotFromTitle(raw.title || listingItem.title);

  let type = detectType({
    iwPrizes: raw.iwPrizes,
    pageText: raw.bodyText,
    title: raw.title,
  });
  if (type === 'unknown' && raw.hasInstantWinSection) type = 'instant_win';

  const gameType = detectGameType(raw.bodyText);

  let status = listingItem.status || 'Live';
  if (raw.soldOut || (pctSold != null && pctSold >= 100)) status = 'Sold Out';

  return {
    title: raw.title || listingItem.title,
    site_name: site.name,
    competition_url: url,
    type,
    ticket_price: ticketPrice,
    total_tickets: totalTickets,
    tickets_sold: ticketsSold,
    tickets_remaining: ticketsRemaining,
    pct_sold: pctSold,
    jackpot_prize: jackpot.prize,
    jackpot_value: jackpot.value,
    draw_date: raw.drawDate,
    status,
    game_type: gameType,
    iw_prizes: raw.iwPrizes.length > 0 ? raw.iwPrizes : null,
  };
}

module.exports = { scanListing, scrapeSingle, sleep };
