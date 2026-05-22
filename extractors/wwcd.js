/**
 * Winner Winner Chicken Dinner — selector-driven (DevTools May 2026).
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
  const m = text.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? parseFloat(m[1]) : null;
}

/** Only accept sensible sell-through % (listing card / ticket math). */
function clampPct(p) {
  if (p == null || !Number.isFinite(p)) return null;
  if (p < 0 || p > 100) return null;
  return Math.round(p * 100) / 100;
}

/**
 * WWCD listing: .TNum = sold count, .TNumSold = remaining (misleading class names).
 * Speedo gauge uses rotate:Ndeg in .CompDetails (~deg/180*100 ≈ % sold).
 */
function listingPctFromCard(card) {
  const sold = parseIntSafe(card.ticketsSoldCount ?? card.soldText);
  const remaining = parseIntSafe(card.ticketsRemainingCount ?? card.maxText);
  const total =
    sold != null && remaining != null ? sold + remaining : parseIntSafe(card.maxText);

  if (sold != null && total != null && total > 0 && sold >= 0 && sold <= total) {
    return clampPct(Math.round((sold / total) * 10000) / 100);
  }

  if (card.speedoRotate != null) {
    const pct = clampPct((card.speedoRotate / 180) * 100);
    if (pct != null) return pct;
  }

  const sources = [card.listingPctText, card.progressText].filter(Boolean);
  for (const text of sources) {
    const pct = clampPct(extractPctFromText(text));
    if (pct != null) return pct;
  }

  return null;
}

function parseTicketsAvailable(text) {
  if (!text) return { remaining: null, total: null, sold: null };
  const avail = text.match(/Tickets Available:\s*(\d[\d,]*)\s+of\s+(\d[\d,]*)/i);
  if (avail) {
    const remaining = parseInt(avail[1].replace(/,/g, ''), 10);
    const total = parseInt(avail[2].replace(/,/g, ''), 10);
    return {
      remaining,
      total,
      sold: total - remaining,
    };
  }
  const ofM = text.match(/(\d[\d,]*)\s+of\s+(\d[\d,]*)/i);
  if (ofM) {
    const remaining = parseInt(ofM[1].replace(/,/g, ''), 10);
    const total = parseInt(ofM[2].replace(/,/g, ''), 10);
    return {
      remaining,
      total,
      sold: total - remaining,
    };
  }
  const slash = text.match(/(\d[\d,]*)\s*\/\s*(\d[\d,]*)/);
  if (slash) {
    const sold = parseInt(slash[1].replace(/,/g, ''), 10);
    const total = parseInt(slash[2].replace(/,/g, ''), 10);
    return { sold, total, remaining: total - sold };
  }
  return { remaining: null, total: null, sold: null };
}

function cleanDrawDate(text) {
  if (!text) return null;
  const t = text.replace(/\s+/g, ' ').trim();
  const m = t.match(/(\d{1,2}\/\d{1,2}\/\d{2,4}\s*\d{1,2}:\d{2}\s*(?:am|pm)?)/i);
  if (m) return m[1];
  if (/\d+\s*Days/i.test(t)) return t.replace(/\s+/g, ' ').slice(0, 80);
  return t.length <= 80 ? t : t.slice(0, 80);
}

function instantWinCountFromText(text) {
  if (!text) return null;
  const m = text.match(/(\d[\d,]*)\s+Instant Wins/i);
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
}

function extractJackpotFromTitle(title) {
  if (!title) return { prize: null, value: null };
  const valueMatch = title.match(/£([\d,]+(?:\.\d{2})?)/);
  const value = valueMatch ? parseMoney(valueMatch[1]) : null;
  return { prize: title, value };
}

function isValidCompetitionHref(href) {
  return /Gid=\d+/i.test(href || '');
}

/** Fallback when Comp* card nodes are not in DOM yet. */
async function scanListingFromLinks(page, site) {
  const sel = site.selectors.listing;
  const items = await page.evaluate((selectors) => {
    const seen = new Set();
    const out = [];
    document.querySelectorAll('a[href*="Gid="]').forEach((a) => {
      const href = a.href.split('#')[0];
      if (!/D=Competition/i.test(href) || !/Gid=\d+/i.test(href) || seen.has(href)) return;
      seen.add(href);
      const card = a.closest('[id^="Comp"]') || a.parentElement;
      const title =
        card?.querySelector('.CompTitle')?.textContent?.trim() ||
        a.textContent.replace(/\s+/g, ' ').trim();
      const priceText = card?.querySelector('.cost')?.textContent?.trim() || '';
      const details = card?.querySelector('.CompDetails');
      const soldCount = card?.querySelector('.TNum div')?.textContent?.trim() || '';
      const remainingCount = card?.querySelector('.TNumSold div')?.textContent?.trim() || '';
      const drawDateText = card?.querySelector('.DrawDate')?.textContent?.trim() || '';
      const detailsHtml = details?.innerHTML || '';
      const rotM = detailsHtml.match(/rotate:\s*([\d.]+)deg/i);
      out.push({
        href,
        title,
        priceText,
        ticketsSoldCount: soldCount,
        ticketsRemainingCount: remainingCount,
        speedoRotate: rotM ? parseFloat(rotM[1]) : null,
        drawDateText,
        listingPctText: details?.textContent?.replace(/\s+/g, ' ') || '',
        progressText: details?.textContent?.replace(/\s+/g, ' ') || '',
        cardText: card?.textContent?.replace(/\s+/g, ' ') || '',
      });
    });
    return out;
  }, sel);

  return mapListingCards(items, site);
}

function mapListingCards(cards, site) {
  const seen = new Map();
  for (const card of cards) {
    if (!card.href || !isValidCompetitionHref(card.href)) continue;
    if (seen.has(card.href)) continue;

    const title =
      (card.title || '').replace(/\(\d+\s+Tickets?\s+Left\)/i, '').trim() || 'Competition';
    const ticketPrice = parseMoney(card.priceText);
    const leftM = (card.cardText || '').match(/(\d+)\s+Tickets?\s+Left/i);

    const soldN = parseIntSafe(card.ticketsSoldCount ?? card.soldText);
    const remN = parseIntSafe(card.ticketsRemainingCount);
    const totalTickets =
      soldN != null && remN != null ? soldN + remN : parseIntSafe(card.maxText);
    const ticketsSold = soldN;
    const ticketsRemaining =
      remN ?? (leftM ? parseIntSafe(leftM[1]) : null) ??
      (totalTickets != null && ticketsSold != null ? totalTickets - ticketsSold : null);
    const pctSold = listingPctFromCard(card);
    const drawDate = cleanDrawDate(card.drawDateText);
    const iwCount = instantWinCountFromText(card.cardText || '');
    const isInstant = iwCount != null && iwCount > 0;

    seen.set(card.href, {
      title,
      competition_url: card.href,
      ticket_price: ticketPrice,
      pct_sold: pctSold,
      tickets_sold: ticketsSold,
      total_tickets: totalTickets,
      tickets_remaining: ticketsRemaining,
      draw_date: drawDate,
      type: isInstant ? 'instant_win' : 'unknown',
      iw_total_count: isInstant ? iwCount : null,
      jackpot_prize: title,
      jackpot_value: extractJackpotFromTitle(title).value,
      site_name: site.name,
      status: /sold out|ended/i.test(card.cardText || '') ? 'Sold Out' : 'Live',
    });
  }
  return Array.from(seen.values());
}

/**
 * @param {import('puppeteer').Page} page
 */
async function scanListing(page, site) {
  const sel = site.selectors.listing;
  const listingUrl =
    site.listingUrls?.[0] || 'https://www.winnerwinnerchickendinner.co.uk/?D=Competitions';
  console.log(`[${site.slug}] Scanning listing: ${listingUrl}`);

  await page.goto(listingUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(parseInt(process.env.REQUEST_DELAY_MS || '2500', 10));
  try {
    await page.waitForSelector('a[id^="Comp"], a[href*="Gid="]', { timeout: 15000 });
  } catch (_) {
    /* continue with fallback */
  }

  let cardSelector = sel.cards;
  let cardCount = await page.$$eval(cardSelector, (nodes) => nodes.length);
  if (!cardCount) {
    cardSelector = 'a[id^="Comp"], [id^="Comp"]';
    cardCount = await page.$$eval(cardSelector, (nodes) => nodes.length);
  }
  if (!cardCount) {
    console.log(`[${site.slug}] No cards matched "${sel.cards}" — using Gid link fallback`);
    return scanListingFromLinks(page, site);
  }

  const cards = await page.$$eval(cardSelector, (nodes, selectors) => {
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
      const linkEl = pick(card, 'link') || card.querySelector('a[href*="Gid="]');
      let href = linkEl?.href || null;
      if (!href && card.id && card.id.startsWith('Comp')) {
        const gid = card.id.replace(/^Comp/i, '');
        href = `${window.location.origin}/?D=Competition&Gid=${gid}`;
      }
      if (href) href = href.split('#')[0];

      const title = pickText(card, 'title');
      const priceText = pickText(card, 'price');
      const soldCount = pickText(card, 'ticketsSold');
      const remainingCount = pickText(card, 'ticketsRemaining');
      const progressEl = pick(card, 'progress');
      const progressText = progressEl?.textContent?.replace(/\s+/g, ' ') || '';
      const drawDateText = pickText(card, 'drawDate');
      const detailsHtml = progressEl?.innerHTML || card.innerHTML || '';
      const rotM = detailsHtml.match(/rotate:\s*([\d.]+)deg/i);
      const cardText = card.textContent?.replace(/\s+/g, ' ') || '';

      return {
        href,
        title,
        priceText,
        ticketsSoldCount: soldCount,
        ticketsRemainingCount: remainingCount,
        speedoRotate: rotM ? parseFloat(rotM[1]) : null,
        drawDateText,
        listingPctText: progressText,
        progressText,
        cardText,
        soldText: soldCount,
        maxText: remainingCount,
      };
    });
  }, sel);

  return mapListingCards(cards, site);
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
    const ticketsText = text('ticketsAvailable');
    const drawDate = text('drawDate');
    const bodyText = document.body.innerText.slice(0, 12000);
    const soldOut = !!pick('soldOut') || /sold out/i.test(bodyText);

    return {
      title,
      priceText,
      ticketsText,
      drawDate,
      bodyText,
      soldOut,
    };
  }, sel);

  const tickets = parseTicketsAvailable(raw.ticketsText || raw.bodyText);
  const totalTickets =
    tickets.total ?? listingItem.total_tickets ?? null;
  const ticketsRemaining =
    tickets.remaining ?? listingItem.tickets_remaining ?? null;
  const ticketsSold =
    tickets.sold ??
    listingItem.tickets_sold ??
    (totalTickets != null && ticketsRemaining != null
      ? totalTickets - ticketsRemaining
      : null);

  const pctFromTickets = calcPctSold(
    ticketsSold,
    ticketsRemaining,
    totalTickets,
    null
  );
  const pctSold = clampPct(listingItem.pct_sold) ?? pctFromTickets;

  const ticketPrice = parseMoney(raw.priceText) ?? listingItem.ticket_price;
  const jackpot = extractJackpotFromTitle(raw.title || listingItem.title);

  let type = listingItem.type || 'unknown';
  if (type === 'unknown') {
    type = detectType({ pageText: raw.bodyText, title: raw.title });
  }

  const gameType = detectGameType(raw.bodyText);
  let status = listingItem.status || 'Live';
  if (raw.soldOut || (pctSold != null && pctSold >= 100)) status = 'Sold Out';

  const drawDate =
    cleanDrawDate(listingItem.draw_date) ||
    cleanDrawDate(raw.drawDate);

  const iwTotalCount = listingItem.iw_total_count ?? null;

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
    jackpot_prize: jackpot.prize || listingItem.jackpot_prize,
    jackpot_value: jackpot.value ?? listingItem.jackpot_value,
    draw_date: drawDate,
    status,
    game_type: gameType,
    iw_prizes: null,
    iw_total_count: iwTotalCount,
    iw_total_value: null,
  };
}

/**
 * Compact listing cards (hero row) have no .TNum / speedo — load tickets from product page.
 */
async function fillMissingListing(page, site, listing) {
  const max = site.fillMissingMax ?? 25;
  const gaps = listing
    .filter((c) => c.pct_sold == null && c.competition_url)
    .slice(0, max);
  if (!gaps.length) return listing;

  console.log(
    `[${site.slug}] Filling ${gaps.length} listing gaps (no sold/remaining on card)...`
  );

  for (const item of gaps) {
    try {
      const detail = await scrapeSingle(page, site, item);
      Object.assign(item, {
        title: detail.title || item.title,
        ticket_price: detail.ticket_price ?? item.ticket_price,
        pct_sold: detail.pct_sold,
        tickets_sold: detail.tickets_sold,
        total_tickets: detail.total_tickets,
        tickets_remaining: detail.tickets_remaining,
        draw_date: detail.draw_date ?? item.draw_date,
        type: detail.type !== 'unknown' ? detail.type : item.type,
        iw_total_count: detail.iw_total_count ?? item.iw_total_count,
        jackpot_prize: detail.jackpot_prize || item.jackpot_prize,
        jackpot_value: detail.jackpot_value ?? item.jackpot_value,
        status: detail.status || item.status,
      });
    } catch (err) {
      console.warn(`  [fill] ${item.competition_url}: ${err.message}`);
    }
  }
  return listing;
}

module.exports = { scanListing, scrapeSingle, fillMissingListing, sleep };
