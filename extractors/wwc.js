/**
 * Winner Winner Competitions — selector-driven (DevTools May 2026).
 */

const {
  parseMoney,
  parseIntSafe,
  calcPctSold,
  detectType,
  detectGameType,
} = require('../lib/metrics');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractPctFromText(text) {
  if (!text) return null;
  let m = text.match(/🔥\s*(\d+(?:\.\d+)?)\s*%/);
  if (m) return parseFloat(m[1]);
  m = text.match(/(\d+(?:\.\d+)?)\s*%\s*sold/i);
  if (m) return parseFloat(m[1]);
  m = text.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? parseFloat(m[1]) : null;
}

function extractSoldMaxFromText(text) {
  if (!text) return null;
  const m = text.match(/(\d[\d,]*)\s*\/\s*(\d[\d,]*)/);
  if (!m) return null;
  return {
    sold: parseInt(m[1].replace(/,/g, ''), 10),
    max: parseInt(m[2].replace(/,/g, ''), 10),
  };
}

function extractJackpotFromTitle(title) {
  if (!title) return { prize: null, value: null };
  const valueMatch = title.match(/£([\d,]+(?:\.\d{2})?)/);
  const value = valueMatch ? parseMoney(valueMatch[1]) : null;
  return { prize: title, value };
}

function isCompetitionUrl(href, site) {
  if (!href) return false;
  const patterns = site.competitionUrlPatterns || ['/competitions/'];
  return patterns.some((p) => href.includes(p)) && /\/competitions\/[^/?#]+/i.test(href);
}

/**
 * @param {import('puppeteer').Page} page
 */
async function scanListing(page, site) {
  const sel = site.selectors.listing;
  const seen = new Map();
  const listingUrls = site.listingUrls?.length
    ? site.listingUrls
    : ['https://www.winnerwinnercompetitions.co.uk/competitions'];

  console.log(`[${site.slug}] Scanning ${listingUrls.length} listing page(s)`);

  for (const listingUrl of listingUrls) {
    await page.goto(listingUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await sleep(parseInt(process.env.REQUEST_DELAY_MS || '2000', 10));

    const cards = await page.$$eval(sel.cards, (nodes, selectors) => {
      const pick = (root, key) => {
        const s = selectors[key];
        if (!s) return null;
        for (const part of s.split(',')) {
          const el = root.querySelector(part.trim());
          if (el) return el;
        }
        return null;
      };
      const pickText = (root, key) => pick(root, key)?.textContent?.trim() || '';

      return nodes.map((card) => {
        const linkEl =
          pick(card, 'link') || card.querySelector('a[href*="/competitions/"]');
        let href = linkEl?.href || null;
        if (href) href = href.split('?')[0];

        const title = pickText(card, 'title');
        const pctText = pickText(card, 'progressPct');
        const priceText = pickText(card, 'price');
        const barEl = pick(card, 'progressBarFill') || pick(card, 'progressBar');
        let pctFromBar = null;
        if (barEl?.style?.width) {
          const w = parseFloat(barEl.style.width);
          if (!Number.isNaN(w)) pctFromBar = w;
        }
        const cardText = card.textContent?.replace(/\s+/g, ' ') || '';
        const isClosed = /sold out|closed/i.test(cardText);

        return { href, title, pctText, priceText, pctFromBar, cardText, isClosed };
      });
    }, sel);

    for (const card of cards) {
      if (!card.href || !isCompetitionUrl(card.href, site)) continue;
      if (seen.has(card.href)) continue;

      const pctFromText = extractPctFromText(card.pctText || card.cardText);
      let pctSold = card.pctFromBar ?? pctFromText;
      const soldMax = extractSoldMaxFromText(card.cardText);
      if (pctSold == null && soldMax?.sold != null && soldMax?.max > 0) {
        pctSold = Math.round((soldMax.sold / soldMax.max) * 10000) / 100;
      }

      const ticketPrice = parseMoney(card.priceText);
      const title =
        card.title && card.title.length > 2
          ? card.title
          : (card.href.split('/').pop() || '').replace(/-/g, ' ');

      seen.set(card.href, {
        title,
        competition_url: card.href,
        ticket_price: ticketPrice,
        pct_sold: pctSold,
        tickets_sold: soldMax?.sold ?? null,
        total_tickets: soldMax?.max ?? null,
        site_name: site.name,
        status: card.isClosed ? 'Sold Out' : 'Live',
      });
    }
  }

  return Array.from(seen.values());
}

/**
 * @param {import('puppeteer').Page} page
 */
async function scrapeSingle(page, site, listingItem) {
  const sel = site.selectors.single;
  const url = listingItem.competition_url;

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(parseInt(process.env.REQUEST_DELAY_MS || '1500', 10));

  const raw = await page.evaluate((selectors) => {
    const pick = (key) => {
      const s = selectors[key];
      if (!s) return null;
      for (const part of s.split(',')) {
        const el = document.querySelector(part.trim());
        if (el) return el;
      }
      return null;
    };
    const text = (key) => pick(key)?.textContent?.trim() || null;

    const title = text('title');
    const priceText = text('price');
    const pctLabel = text('pctLabel');
    const ticketsLine = text('ticketsLine');
    const progressText = pick('progressText')?.textContent || '';
    const drawDate = text('drawDate');

    let pctFromBar = null;
    const barEl = pick('progressBar');
    if (barEl?.style?.width) {
      const w = parseFloat(barEl.style.width);
      if (!Number.isNaN(w)) pctFromBar = w;
    }

    let pctFromLabel = null;
    if (pctLabel) {
      const pm = pctLabel.match(/(\d+(?:\.\d+)?)\s*%/);
      if (pm) pctFromLabel = parseFloat(pm[1]);
    }

    const iwPrizes = [];
    const container = pick('iwContainer');
    if (container) {
      const rows = container.querySelectorAll(
        selectors.iwRow ? selectors.iwRow.split(',')[0].trim() : 'div'
      );
      rows.forEach((row) => {
        const rowText = row.textContent.replace(/\s+/g, ' ').trim();
        if (rowText.length < 3) return;
        const valueMatch = rowText.match(/£([\d,]+(?:\.\d{2})?)/);
        const remainingMatch = rowText.match(/(\d+)\s+of\s+(\d+)\s+remaining/i);
        const qtyMatch = rowText.match(/(\d+)\s*x/i);
        iwPrizes.push({
          prize: rowText.split('£')[0].trim().slice(0, 120) || rowText.slice(0, 80),
          value: valueMatch ? parseFloat(valueMatch[1].replace(/,/g, '')) : null,
          qty_total: remainingMatch
            ? parseInt(remainingMatch[2], 10)
            : qtyMatch
              ? parseInt(qtyMatch[1], 10)
              : null,
          qty_remaining: remainingMatch ? parseInt(remainingMatch[1], 10) : null,
        });
      });
    }

    const soldOut = !!pick('soldOut');
    const bodyText = document.body.innerText.slice(0, 8000);
    const hasIw = iwPrizes.length > 0 || /instant win/i.test(bodyText);

    return {
      title,
      priceText,
      ticketsLine,
      progressText: progressText + ' ' + ticketsLine,
      pctFromBar,
      pctFromLabel,
      drawDate,
      iwPrizes,
      bodyText,
      soldOut,
      hasIw,
    };
  }, sel);

  const soldMax = extractSoldMaxFromText(raw.ticketsLine || raw.progressText);
  const ticketsSold = soldMax?.sold ?? listingItem.tickets_sold ?? null;
  const totalTickets = soldMax?.max ?? listingItem.total_tickets ?? null;
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
  if (type === 'unknown' && raw.hasIw) type = 'instant_win';

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
