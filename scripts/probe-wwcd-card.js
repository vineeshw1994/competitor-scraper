#!/usr/bin/env node
const puppeteer = require('puppeteer');

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
  await new Promise((r) => setTimeout(r, 3000));
  const info = await page.evaluate(() => {
    const card = document.querySelector('#Comp47153');
    if (!card) return { error: 'no card' };
    const drawEl = card.querySelector('[class*="Draw"], .DrawDate, .LatestDrawDate');
    return {
      sold: card.querySelector('.TNum div')?.textContent?.trim(),
      rem: card.querySelector('.TNumSold div')?.textContent?.trim(),
      cost: card.querySelector('.cost')?.textContent?.trim(),
      iw: card.textContent.match(/(\d+)\s+Instant Wins/i)?.[0],
      drawCandidates: Array.from(card.querySelectorAll('*'))
        .filter((el) => /draw date|latest draw/i.test(el.textContent || ''))
        .slice(0, 3)
        .map((el) => ({ tag: el.tagName, class: el.className, text: el.textContent?.trim().slice(0, 80) })),
      cardTail: card.textContent.replace(/\s+/g, ' ').slice(-120),
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
