#!/usr/bin/env node
const puppeteer = require('puppeteer');

const GIDS = ['47080', '47280', '44814', '47261', '47153'];

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.goto('https://www.winnerwinnerchickendinner.co.uk/?D=Competitions', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await new Promise((r) => setTimeout(r, 4000));

  const info = await page.evaluate((gids) => {
    const out = {};
    for (const gid of gids) {
      const card =
        document.querySelector(`#Comp${gid}`) ||
        document.querySelector(`[id="Comp${gid}"]`) ||
        Array.from(document.querySelectorAll('div[id^="Comp"]')).find((c) =>
          c.querySelector(`a[href*="Gid=${gid}"]`)
        );
      if (!card) {
        out[gid] = { error: 'no card element' };
        continue;
      }
      const detailsHtml = card.querySelector('.CompDetails')?.innerHTML || '';
      const rotM = detailsHtml.match(/rotate:\s*([\d.]+)deg/i);
      out[gid] = {
        id: card.id,
        title: card.querySelector('.CompTitle')?.textContent?.trim()?.slice(0, 60),
        sold: card.querySelector('.TNum div')?.textContent?.trim(),
        rem: card.querySelector('.TNumSold div')?.textContent?.trim(),
        tnumHtml: card.querySelector('.TNum')?.innerHTML?.slice(0, 200),
        tnumsoldHtml: card.querySelector('.TNumSold')?.innerHTML?.slice(0, 200),
        cost: card.querySelector('.cost')?.textContent?.trim(),
        draw: card.querySelector('.DrawDate')?.textContent?.trim(),
        speedoRotate: rotM ? parseFloat(rotM[1]) : null,
        hasCompDetails: !!card.querySelector('.CompDetails'),
        altNums: Array.from(card.querySelectorAll('[class*="TNum"], [class*="Sold"], [class*="Remain"]'))
          .slice(0, 8)
          .map((el) => ({ class: el.className, text: el.textContent?.replace(/\s+/g, ' ').trim().slice(0, 40) })),
        snippet: card.textContent.replace(/\s+/g, ' ').slice(0, 350),
      };
    }
    const sample = Array.from(document.querySelectorAll('[id^="Comp"]')).slice(0, 6);
    return {
      totalCompDivs: document.querySelectorAll('div[id^="Comp"]').length,
      totalCompAny: document.querySelectorAll('[id^="Comp"]').length,
      sampleTags: sample.map((el) => `${el.tagName}#${el.id}`),
      cards: out,
    };
  }, GIDS);

  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
