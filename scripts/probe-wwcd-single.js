#!/usr/bin/env node
const puppeteer = require('puppeteer');

const url = process.argv[2] || 'https://www.winnerwinnerchickendinner.co.uk/?D=Competition&Gid=47153';

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3000));
  const info = await page.evaluate(() => ({
    title: document.querySelector('h1')?.textContent?.trim(),
    ticPrice: document.querySelector('.TicPrice')?.textContent?.trim(),
    ticsLeft: document.querySelector('.TicsLeft')?.textContent?.trim(),
    ticsLeftH3: document.querySelector('.TicsLeft h3')?.textContent?.trim(),
    drawTime: document.querySelector('.DrawTime')?.textContent?.trim(),
    bodySlice: document.body.innerText.slice(0, 1500),
  }));
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
