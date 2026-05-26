const { scrapeSite } = require('./scraper');
const fs = require('fs');

async function test() {
  console.log('Testing GitHub Actions with file output...');
  
  // Scrape just one site for testing
  const results = await scrapeSite('wwc'); // or 'rys'
  
  // Write to file
  fs.writeFileSync('scrape-results.json', JSON.stringify(results, null, 2));
  
  console.log(`Saved ${results.length} competitions to scrape-results.json`);
}

test();