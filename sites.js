/**
 * Competitor site configs. Ryse uses the Zap/WooCommerce platform.
 * Selectors verified via Chrome DevTools — May 2026.
 */

const SITES = [
  {
    slug: 'rys',
    name: "Ryse Competitions",
    listingUrls: [
      'https://www.ryscompetitions.com/competitions/',
      'https://www.ryscompetitions.com/competitions/page/2/',
    ],
    listingPaginate: true,
    extractor: 'zap',
    selectors: {
      listing: {
        paginationNav: '.container.default-content-container nav ul, nav.woocommerce-pagination ul',
        cards: 'ul.products li.product.type-product, li.product.type-product',
        link: 'a.woocommerce-LoopProduct-link, a[href*="/competition/"]',
        title: 'h2.woocommerce-loop-product__title',
        progress: '.zap-competitions-progress-loop',
        progressBar: '.zap-competitions-progress-loop div',
        price: '.price .woocommerce-Price-amount, p.price bdi',
      },
      single: {
        title: '.summary.entry-summary h1',
        price: '.zap-competition-qty p.price .woocommerce-Price-amount, .zap-competition-qty p.price bdi',
        ticketsSold: 'span[class*="zapc-refresh-sold"]',
        ticketsMax: 'span[class*="zapc-refresh-max"]',
        progressBar: '.zap-competitions-progress .progress-track div[style*="width"]',
        progressText: '.zap-competitions-progress, .tickets-sold-label',
        drawDate: '.zapc-date-banner div',
        totalIw: '.info-pills .total-iw',
        iwContainer: '#zapciw-prize-container',
        iwGroup: '#zapciw-prize-container > div.zapciw-prize-group, #zapciw-prize-container > div',
        iwGroupHeader: '.zapciw-prize-group-header h3, .zapciw-prize-group-header a h3',
        iwRow: '.zapciw-prize-row, .zapciw-prize-item, table.zapciw-prizes tr',
        soldOut: '.sold-out, .competition-closed, .out-of-stock',
      },
    },
  },
  {
    slug: 'royalux',
    name: 'Royalux Competitions',
    listingUrls: [
      'https://www.royaluxcompetitions.co.uk/competitions/',
      'https://www.royaluxcompetitions.co.uk/competitions/page/1/',
      'https://www.royaluxcompetitions.co.uk/competitions/page/2/',
      'https://www.royaluxcompetitions.co.uk/competitions/page/3/',
    ],
    listingPaginate: true,
    extractor: 'zap',
    selectors: {
      listing: {
        paginationNav: '.container.main-container nav ul, nav.woocommerce-pagination ul',
        cards: 'ul.products li.product.type-product, .zapct-products li.product.type-product, li.product.type-product',
        link: 'a[href*="/competition/"]',
        title: 'h2.woocommerce-loop-product__title, .woocommerce-loop-product__title',
        progress: '.zap-competitions-progress-loop, .product',
        progressBar: '.zap-competitions-progress-loop div',
        price: '.price .woocommerce-Price-amount, p.price bdi, .amount',
      },
      single: {
        title: '.zapct-page-title h1, .summary.entry-summary h1',
        price: '.summary.entry-summary p.price span, .summary.entry-summary p > span, .zap-competition-qty p.price bdi',
        ticketsSold: 'span[class*="zapc-refresh-sold"]',
        ticketsMax: 'span[class*="zapc-refresh-max"]',
        progressBar: '.progress-track div[style*="width"]',
        progressText: '.tickets-sold-label, .zapct-add-to-cart-button-wrapper',
        pctLabel: '.percentage-label span',
        drawDate: '.zapct-page-title div div, .zapc-date-banner div',
        totalIw: '.info-pills .total-iw',
        iwContainer: '#zapciw-prize-container, #zapciw-instant-wins',
        iwInstantMarker: '#zapciw-instant-wins',
        iwGroup: '.zapciw-prize-group, #zapciw-instant-wins > div',
        iwGroupHeader: '.zapciw-prize-group-header h3, .zapciw-prize-group-header a h3',
        iwRow: '.zapciw-prize-row, .zapciw-prize-item',
        soldOut: '.sold-out, .competition-closed, .out-of-stock',
      },
    },
  },
  {
    slug: 'wwc',
    name: 'Winner Winner Competitions',
    listingUrls: [
      'https://www.winnerwinnercompetitions.co.uk/competitions',
      'https://www.winnerwinnercompetitions.co.uk/competitions?filter=ending-soon',
    ],
    listingPaginate: false,
    extractor: 'wwc',
    competitionUrlPatterns: ['/competitions/'],
    selectors: {
      listing: {
        cards: 'section .grid.grid-cols-2 > div, div.max-w-7xl .grid.lg\\:grid-cols-3 > div',
        link: 'a[href*="/competitions/"]',
        title: 'a h3, h3',
        progressPct: 'div.flex.items-center.justify-between span',
        progressBar: 'div.ww-progress-track',
        progressBarFill: 'div.ww-progress-track > div',
        price: 'span.text-lg.font-black, span.md\\:text-3xl.font-black',
      },
      single: {
        title: 'main h1, div.rounded-\\[2\\.5rem\\] h1',
        price: 'div.text-xl.font-black.text-white',
        pctLabel: 'div.flex.justify-between.text-xs.font-black span:nth-child(1)',
        ticketsLine: 'div.flex.justify-between.text-xs.font-black span:nth-child(2)',
        progressBar: 'div.w-full.h-4.rounded-full > div',
        progressText: 'div.w-full.h-4.rounded-full',
        drawDate: 'div.mb-4.flex.flex-row.flex-wrap div:nth-child(2)',
        totalIw: 'section .flex.gap-0.rounded-2xl > div:nth-child(1)',
        iwContainer: 'section .p-6.md\\:p-10 .grid.grid-cols-1',
        iwRow: 'section .grid.grid-cols-1.md\\:grid-cols-2 > div',
        soldOut: 'section .flex.gap-0.rounded-2xl > div:nth-child(3)',
      },
    },
  },
  {
    slug: 'd2r',
    name: 'Dreams2Reality',
    listingUrls: [
      'https://www.dreams2reality.co.uk/competitions/all-competitions/',
      'https://www.dreams2reality.co.uk/competitions/all-competitions/page/2/',
    ],
    listingPaginate: false,
    extractor: 'zap',
    competitionUrlPatterns: ['/competition/'],
    selectors: {
      listing: {
        paginationNav:
          'nav.woocommerce-pagination ul, .woocommerce-pagination ul, .container.default-content-container nav ul',
        cards:
          '.container.default-content-container ul.products li.product.type-product, ul.products li.product.type-product',
        link: 'a.woocommerce-LoopProduct-link, a[href*="/competition/"]',
        title: 'h2.woocommerce-loop-product__title',
        progress: '.zap-competitions-progress.zap-competitions-progress-loop',
        progressBar:
          '.zap-competitions-progress-loop div[style*="width"], .zap-competitions-progress-loop .progress-track div',
        price: '.price .woocommerce-Price-amount bdi, .price bdi, p.price',
      },
      single: {
        title: '.summary.entry-summary h1, h1.product_title',
        price: '.summary.entry-summary p.price span, .summary.entry-summary p.price bdi',
        ticketsSold: 'span[class*="zapc-refresh-sold"]',
        ticketsMax: 'span[class*="zapc-refresh-max"]',
        progressBar: '.progress-track div[style*="width"], .zap-competitions-progress div[style*="width"]',
        progressText:
          '.zap-competitions-progress, .tickets-sold-left, .zap-competition-qty, .summary.entry-summary form',
        drawDate: '.draw-date-time.h5, .requirement-date .draw-date-time, .zapc-date-banner div',
        totalIw: '.zapc-game-type-banner.instant-wins .game-type, .info-pills .total-iw',
        iwInstantMarker: '.zapc-game-type-banner.instant-wins, #zapciw-prize-container',
        iwContainer: '#zapciw-prize-container',
        iwGroup: '#zapciw-prize-container > .zapciw-prize-group, #zapciw-prize-container > div.zapciw-prize-group',
        iwGroupHeader: '.zapciw-prize-group-header h3, #heading-instant_wins h2 button',
        iwRow: '.zapciw-prize-row, .zapciw-prize-item, .zapciw-prize-details .zapciw-prize-row',
        soldOut: '.sold-out, .out-of-stock, .competition-closed',
      },
    },
  },
  {
    slug: 'mrg',
    name: 'Mr Giveaways',
    listingUrls: ['https://mrgiveaways.co.uk/'],
    listingPaginate: false,
    deepMax: 10,
    fillMissingMax: 15,
    extractor: 'mrg',
    competitionUrlPatterns: ['/competition/'],
    selectors: {
      listing: {
        cardLink: 'main a[href*="/competition/"]',
        title: 'h2',
        price: 'p.text-xs.font-bold, p.font-bold, p.sm\\:text-base.font-bold',
        progress: '[class*="progress"], .bg-gray-700',
        progressBar: 'div[style*="width"], .h-full.rounded-full',
      },
      single: {
        title: '#competition main h1, main h1',
        price:
          '#competition main .lg\\:col-span-6 h1 + p, main .flex.justify-between h1 + p, main h1 + p',
        ticketsProgress: '#obsidian-progress',
        progressBar:
          '#obsidian-progress div[style*="width"], form .bg-gray-700 div[style*="width"], form .bg-gray-700 .rounded-full',
        progressText: '#obsidian-progress, form .bg-gray-700.grid',
        drawDate: '#competition main .mt-2 p, main .lg\\:col-span-6 .mt-2 p',
        totalIw: 'main section .text-gray-50, main .grid p.font-bold',
        iwContainer: '#competition main section:nth-of-type(2) > div, main section:nth-of-type(2) > div',
        iwGroup: 'main section:nth-of-type(2) .grid.lg\\:grid-cols-2 > div',
        iwGroupHeader: 'main section:nth-of-type(2) .mb-4 p, main section:nth-of-type(2) h2',
        iwRow:
          'main section:nth-of-type(2) .grid > div > div.flex.justify-between, main section:nth-of-type(2) .grid.lg\\:grid-cols-2 > div',
        soldOut: '[data-sold-out], .sold-out',
      },
    },
  },
  {
    slug: 'wwcd',
    name: 'Winner Winner Chicken Dinner',
    listingUrls: ['https://www.winnerwinnerchickendinner.co.uk/?D=Competitions'],
    listingPaginate: false,
    deepMax: 15,
    fillMissingMax: 25,
    extractor: 'wwcd',
    competitionUrlPatterns: ['D=Competition', 'Gid='],
    selectors: {
      listing: {
        cards: 'a[id^="Comp"]',
        link: 'a[href*="Gid="]',
        title: '.CompTitle',
        ticketsSold: '.TNum div',
        ticketsRemaining: '.TNumSold div',
        progress: '.CompDetails',
        listingPct: '.CompDetails',
        drawDate: '.DrawDate',
        price: '.cost',
      },
      single: {
        title: '#page .container h1, h1',
        price: '.TicPrice',
        ticketsAvailable: '.TicsLeft, .TicsLeft h3',
        drawDate: '.DrawTime',
        description: '#page .container',
        soldOut: '.SoldOut, .sold-out',
      },
    },
  },
];

function getSite(slug) {
  const site = SITES.find((s) => s.slug === slug);
  if (!site) throw new Error(`Unknown site slug: ${slug}`);
  return site;
}

function getAllSites() {
  return SITES;
}

module.exports = { SITES, getSite, getAllSites };
