/**
 * Mr Giveaways — custom Obsidian/Tailwind site (not Zap).
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
  const patterns = site.competitionUrlPatterns || ['/competition/'];
  return patterns.some((p) => href.includes(p)) && /\/competition\/[^/?#]+/i.test(href);
}

async function waitForCloudflare(page, maxWaitMs = 90000) {
  const step = 4000;
  const maxSteps = Math.ceil(maxWaitMs / step);
  for (let i = 0; i < maxSteps; i++) {
    const blocked = await page.evaluate(() => {
      const t = document.title || '';
      const body = document.body?.innerText || '';
      return (
        t.includes('Just a moment') ||
        body.includes('security verification') ||
        body.includes('Performing security verification')
      );
    });
    if (!blocked) return;
    await sleep(step);
  }
  throw new Error(
    'Cloudflare blocked automated access. Run scraper on Cloudways server or retry later.'
  );
}

function parseObsidianProgress(text) {
  if (!text) return { sold: null, max: null, pct: null };
  const soldMax = extractSoldMaxFromText(text);
  const pct = extractPctFromText(text);
  return {
    sold: soldMax?.sold ?? null,
    max: soldMax?.max ?? null,
    pct,
  };
}

/**
 * @param {import('puppeteer').Page} page
 */
async function scanListing(page, site) {
  const sel = site.selectors.listing;
  const listingUrls = site.listingUrls?.length
    ? site.listingUrls
    : ['https://mrgiveaways.co.uk/'];

  console.log(`[${site.slug}] Scanning ${listingUrls.length} listing page(s)`);
  const seen = new Map();

  for (const listingUrl of listingUrls) {
    await page.goto(listingUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitForCloudflare(page);
    await sleep(parseInt(process.env.REQUEST_DELAY_MS || '2500', 10));

    const cards = await page.evaluate((selectors) => {
      const pickIn = (root, key) => {
        const s = selectors[key];
        if (!s || !root) return null;
        for (const part of s.split(',')) {
          const el = root.querySelector(part.trim());
          if (el) return el;
        }
        return null;
      };

      const out = [];
      const linkSel = selectors.cardLink || 'main a[href*="/competition/"]';
      document.querySelectorAll(linkSel).forEach((a) => {
        const href = a.href?.split('?')[0];
        if (!href || !/\/competition\/[^/]+$/i.test(href)) return;

        const card =
          a.closest('div.rounded-2xl') ||
          a.closest('div.shadow-lg') ||
          a.closest('div[class*="shadow"]') ||
          a.parentElement?.parentElement?.parentElement ||
          a.parentElement;

        const title = pickIn(card, 'title')?.textContent?.trim() || a.textContent?.trim();
        const priceText = pickIn(card, 'price')?.textContent?.trim() || '';
        const progressEl = pickIn(card, 'progress');
        const progressText = (progressEl?.textContent || card?.textContent || '')
          .replace(/\s+/g, ' ')
          .trim();

        let barEl = pickIn(card, 'progressBar');
        if (barEl && !barEl.style?.width) {
          barEl = barEl.querySelector('div[style*="width"], .h-full');
        }
        let pctFromBar = null;
        if (barEl?.style?.width) {
          const w = parseFloat(barEl.style.width);
          if (!Number.isNaN(w)) pctFromBar = w;
        }

        const isClosed = /sold out|ended|closed/i.test(progressText);

        out.push({ href, title, priceText, progressText, pctFromBar, isClosed });
      });
      return out;
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

      seen.set(card.href, {
        title: card.title,
        competition_url: card.href,
        ticket_price: parseMoney(card.priceText),
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

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitForCloudflare(page);
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
    const progressEl = pick('ticketsProgress') || pick('progressText');
    const progressText =
      progressEl?.textContent?.replace(/\s+/g, ' ')?.trim() ||
      pick('progressText')?.textContent?.replace(/\s+/g, ' ')?.trim() ||
      '';

    let barEl = pick('progressBar');
    if (barEl && !barEl.style?.width) {
      barEl = barEl.querySelector('div[style*="width"], .h-full.rounded-full, .rounded-full');
    }
    let pctFromBar = null;
    if (barEl?.style?.width) {
      const w = parseFloat(barEl.style.width);
      if (!Number.isNaN(w)) pctFromBar = w;
    }

    const drawDate = text('drawDate');
    const totalIwText = text('totalIw');

    const iwPrizes = [];
    const container = pick('iwContainer');
    if (container) {
      const rowSel = selectors.iwRow
        ? selectors.iwRow.split(',')[0].trim()
        : '.grid > div';
      container.querySelectorAll(rowSel).forEach((row) => {
        const rowText = row.textContent.replace(/\s+/g, ' ').trim();
        if (rowText.length < 4) return;
        const valueMatch = rowText.match(/£([\d,]+(?:\.\d{2})?)/);
        const remainingMatch = rowText.match(/(\d+)\s+of\s+(\d+)/i);
        iwPrizes.push({
          prize: rowText.slice(0, 120),
          value: valueMatch ? parseFloat(valueMatch[1].replace(/,/g, '')) : null,
          qty_total: remainingMatch ? parseInt(remainingMatch[2], 10) : null,
          qty_remaining: remainingMatch ? parseInt(remainingMatch[1], 10) : null,
        });
      });
    }

    const bodyText = document.body.innerText.slice(0, 10000);
    const soldOut =
      !!pick('soldOut') ||
      /sold out|competition closed/i.test(bodyText) ||
      (pctFromBar != null && pctFromBar >= 100);

    return {
      title,
      priceText,
      progressText,
      pctFromBar,
      drawDate,
      totalIwText,
      iwPrizes,
      bodyText,
      soldOut,
    };
  }, sel);

  const obs = parseObsidianProgress(raw.progressText);
  const ticketsSold = obs.sold ?? listingItem.tickets_sold ?? null;
  const totalTickets = obs.max ?? listingItem.total_tickets ?? null;
  const ticketsRemaining =
    totalTickets != null && ticketsSold != null ? totalTickets - ticketsSold : null;

  const pctSold = calcPctSold(
    ticketsSold,
    ticketsRemaining,
    totalTickets,
    obs.pct ?? raw.pctFromBar ?? listingItem.pct_sold
  );

  const ticketPrice = parseMoney(raw.priceText) ?? listingItem.ticket_price;
  const jackpot = extractJackpotFromTitle(raw.title || listingItem.title);

  let type = detectType({
    iwPrizes: raw.iwPrizes,
    pageText: raw.bodyText,
    title: raw.title,
  });
  if (type === 'unknown' && /instant win/i.test(raw.bodyText)) type = 'instant_win';

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

async function fillMissingListing(page, site, listing) {
  const max = site.fillMissingMax ?? 15;
  const gaps = listing
    .filter((c) => c.pct_sold == null && c.competition_url)
    .slice(0, max);
  if (!gaps.length) return listing;

  console.log(
    `[${site.slug}] Filling ${gaps.length} listing gaps from product pages...`
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
        status: detail.status || item.status,
      });
    } catch (err) {
      console.warn(`  [fill] ${item.competition_url}: ${err.message}`);
    }
  }
  return listing;
}

module.exports = { scanListing, scrapeSingle, fillMissingListing, sleep, waitForCloudflare };
