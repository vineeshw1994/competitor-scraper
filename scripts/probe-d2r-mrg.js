#!/usr/bin/env node
const puppeteer = require('puppeteer');

async function probeD2r(page) {
  await page.goto('https://www.dreams2reality.co.uk/competitions/all-competitions/', {
    waitUntil: 'networkidle2',
    timeout: 90000,
  });
  const listing = await page.evaluate(() => {
    const card = document.querySelector('ul.products li.product');
    if (!card) return { error: 'no card' };
    const prog = card.querySelector('.zap-competitions-progress-loop');
    const bars = prog ? Array.from(prog.querySelectorAll('div')).filter((d) => d.style.width) : [];
    return {
      cards: document.querySelectorAll('ul.products li.product').length,
      title: card.querySelector('h2')?.textContent?.trim(),
      href: card.querySelector('a.woocommerce-LoopProduct-link')?.href,
      miniLabel: card.querySelector('.mini-label')?.textContent?.trim(),
      progText: prog?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 150),
      barWidths: bars.map((b) => b.style.width),
      price: card.querySelector('.price')?.textContent?.trim(),
    };
  });
  console.log('\n=== D2R listing ===');
  console.log(JSON.stringify(listing, null, 2));

  await page.goto('https://www.dreams2reality.co.uk/competition/500-daily-cash-draw-7/', {
    waitUntil: 'networkidle2',
    timeout: 90000,
  });
  const single = await page.evaluate(() => ({
    title: document.querySelector('.summary.entry-summary h1')?.textContent?.trim(),
    sold: document.querySelector('span[class*="zapc-refresh-sold"]')?.textContent?.trim(),
    max: document.querySelector('span[class*="zapc-refresh-max"]')?.textContent?.trim(),
    draw: document.querySelector('.draw-date-time')?.textContent?.trim(),
    barWidth: document.querySelector('.progress-track div[style*="width"]')?.style?.width,
    rangeWrap: document.querySelector('.zap-competition-range-wrap-outer')?.textContent?.slice(0, 80),
    iwGroups: document.querySelectorAll('#zapciw-prize-container .zapciw-prize-group').length,
  }));
  console.log('\n=== D2R single ===');
  console.log(JSON.stringify(single, null, 2));
}

async function probeMrg(page) {
  await page.goto('https://mrgiveaways.co.uk/', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await new Promise((r) => setTimeout(r, 5000));
  const blocked = await page.evaluate(() => {
    const t = document.title || '';
    const body = document.body?.innerText || '';
    return t.includes('Just a moment') || body.includes('security verification');
  });
  if (blocked) {
    console.log('\n=== MRG blocked by Cloudflare ===');
    return;
  }

  const listing = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('main a[href*="/competition/"]'));
    const uniq = new Map();
    links.forEach((a) => {
      const href = a.href.split('?')[0];
      if (uniq.has(href)) return;
      const card =
        a.closest('div.rounded-2xl') ||
        a.closest('div[class*="shadow"]') ||
        a.closest('div.grid')?.parentElement ||
        a.parentElement?.parentElement;
      const h2 = card?.querySelector('h2');
      const priceEl = card?.querySelector('p.text-xs.font-bold, p.font-bold');
      const progressEl = card?.querySelector('[id*="progress"], .bg-gray-700');
      uniq.set(href, {
        href,
        title: h2?.textContent?.trim(),
        price: priceEl?.textContent?.trim(),
        cardSnippet: (card?.textContent || '').replace(/\s+/g, ' ').slice(0, 120),
        hasProgress: !!progressEl,
      });
    });
    return { linkCount: uniq.size, samples: Array.from(uniq.values()).slice(0, 4) };
  });
  console.log('\n=== MRG listing ===');
  console.log(JSON.stringify(listing, null, 2));

  await page.goto('https://mrgiveaways.co.uk/competition/bank-of-dave-20', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await new Promise((r) => setTimeout(r, 3000));
  const single = await page.evaluate(() => {
    const progress = document.querySelector('#obsidian-progress');
    return {
      title: document.querySelector('main h1')?.textContent?.trim(),
      price: document.querySelector('main h1')?.parentElement?.querySelector('p')?.textContent?.trim(),
      progressText: progress?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 200),
      progressHtml: progress?.innerHTML?.slice(0, 300),
      drawDate: document.querySelector('main .lg\\:col-span-6 p')?.textContent?.trim(),
      iwSection: document.querySelector('main section:nth-of-type(2)')?.textContent?.slice(0, 100),
      iwCards: document.querySelectorAll('main section:nth-of-type(2) .grid > div').length,
    };
  });
  console.log('\n=== MRG single ===');
  console.log(JSON.stringify(single, null, 2));
}

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1366, height: 900 });
  try {
    await probeD2r(page);
    await probeMrg(page);
  } catch (e) {
    console.error(e.message);
  }
  await browser.close();
})();
