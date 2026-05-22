/**
 * Financial and classification calculations per Marc's brief.
 */

function parseMoney(text) {
  if (text == null || text === '') return null;
  const n = parseFloat(String(text).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseIntSafe(text) {
  if (text == null || text === '') return null;
  const n = parseInt(String(text).replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function calcPctSold(ticketsSold, ticketsRemaining, totalTickets, pctFromPage) {
  if (pctFromPage != null && pctFromPage >= 0 && pctFromPage <= 100) {
    return Math.round(pctFromPage * 100) / 100;
  }
  if (ticketsSold != null && totalTickets > 0) {
    return Math.round((ticketsSold / totalTickets) * 10000) / 100;
  }
  if (ticketsRemaining != null && totalTickets > 0) {
    const sold = totalTickets - ticketsRemaining;
    return Math.round((sold / totalTickets) * 10000) / 100;
  }
  return null;
}

function detectType({ iwPrizes, pageText, title }) {
  const hay = `${title || ''} ${pageText || ''}`.toLowerCase();
  if (Array.isArray(iwPrizes) && iwPrizes.length > 0) return 'instant_win';
  if (/instant win|instant wins|scratch card|coin flip|space rocket|darts/.test(hay)) {
    return 'instant_win';
  }
  if (/\bdraw\b|winner drawn|prize draw|auto draw/.test(hay) && !/instant win/.test(hay)) {
    return 'regular_draw';
  }
  return 'unknown';
}

function detectGameType(pageText) {
  const hay = (pageText || '').toLowerCase();
  if (/scratch card/.test(hay)) return 'Scratch Card';
  if (/coin flip/.test(hay)) return 'Coin Flip';
  if (/space rocket/.test(hay)) return 'Space Rockets';
  if (/darts/.test(hay)) return 'Darts';
  return 'Unknown';
}

function calcIwTotals(iwPrizes) {
  if (!Array.isArray(iwPrizes) || iwPrizes.length === 0) {
    return { iw_total_count: null, iw_total_value: null };
  }
  let count = 0;
  let value = 0;
  for (const tier of iwPrizes) {
    const qty = tier.qty_total || 0;
    const val = tier.value || 0;
    count += qty;
    value += qty * val;
  }
  return {
    iw_total_count: count,
    iw_total_value: Math.round(value * 100) / 100,
  };
}

function enrichMetrics(raw, firstSeenAt, threshold = 50) {
  const { iw_total_count, iw_total_value } = calcIwTotals(raw.iw_prizes);
  const ticketPrice = raw.ticket_price;
  const totalTickets = raw.total_tickets;
  const jackpotValue = raw.jackpot_value;

  const totalTicketRevenue =
    ticketPrice != null && totalTickets != null
      ? Math.round(ticketPrice * totalTickets * 100) / 100
      : null;

  const totalPrizeCost =
    raw.type === 'instant_win'
      ? Math.round(((jackpotValue || 0) + (iw_total_value || 0)) * 100) / 100
      : jackpotValue != null
        ? jackpotValue
        : null;

  const operatorRevenue =
    totalTicketRevenue != null && totalPrizeCost != null
      ? Math.round((totalTicketRevenue - totalPrizeCost) * 100) / 100
      : null;

  const iwDensityPct =
    iw_total_count != null && totalTickets > 0
      ? Math.round((iw_total_count / totalTickets) * 10000) / 100
      : null;

  const iwValuePct =
    iw_total_value != null && totalTicketRevenue > 0
      ? Math.round((iw_total_value / totalTicketRevenue) * 10000) / 100
      : null;

  const now = new Date();
  let daysRunning = 1;
  if (firstSeenAt) {
    const ms = now - new Date(firstSeenAt);
    daysRunning = Math.max(1, Math.floor(ms / 86400000));
  }

  const pctSold = raw.pct_sold;
  const dailySellthrough =
    pctSold != null && daysRunning > 0
      ? Math.round((pctSold / daysRunning) * 10000) / 10000
      : null;

  let confidenceTier = 'LOW';
  if (pctSold != null && pctSold >= threshold) {
    if (daysRunning <= 14) confidenceTier = 'HIGH';
    else if (daysRunning <= 30) confidenceTier = 'MEDIUM';
    else confidenceTier = 'LOW';
  }

  let sellSpeed = 'Unknown';
  if (dailySellthrough != null) {
    if (dailySellthrough >= 5) sellSpeed = 'Fast';
    else if (dailySellthrough >= 2) sellSpeed = 'Medium';
    else sellSpeed = 'Slow';
  }

  return {
    ...raw,
    iw_total_count,
    iw_total_value,
    total_ticket_revenue: totalTicketRevenue,
    total_prize_cost: totalPrizeCost,
    iw_density_pct: iwDensityPct,
    iw_value_pct: iwValuePct,
    operator_revenue_at_sellout: operatorRevenue,
    days_running: daysRunning,
    daily_sellthrough: dailySellthrough,
    confidence_tier: confidenceTier,
    sell_speed: sellSpeed,
  };
}

module.exports = {
  parseMoney,
  parseIntSafe,
  calcPctSold,
  detectType,
  detectGameType,
  calcIwTotals,
  enrichMetrics,
};
