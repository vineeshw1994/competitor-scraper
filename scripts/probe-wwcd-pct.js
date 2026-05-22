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
    const card = document.querySelector('#Comp47174') || document.querySelector('[id="Comp47174"]');
    if (!card) return { error: 'no Comp47174' };
    const details = card.querySelector('.CompDetails');
    return {
      title: card.querySelector('.CompTitle')?.textContent?.trim(),
      cost: card.querySelector('.cost')?.textContent?.trim(),
      tnum: card.querySelector('.TNum')?.innerHTML?.slice(0, 200),
      tnumSold: card.querySelector('.TNumSold')?.innerHTML?.slice(0, 200),
      detailsText: details?.textContent?.replace(/\s+/g, ' ').trim(),
      detailsHtml: details?.innerHTML?.slice(0, 400),
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
