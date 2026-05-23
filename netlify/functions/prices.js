const fetch = globalThis.fetch || require('node-fetch');

// Stooq tickers (covers European ETFs)
const STOOQ_TICKERS = {
  pust:  "pust.pa",
  paeem: "paeem.pa",
  mstr:  "miga.f",
  urnu:  "urnu.mi",
  vvmx:  "vvmx.de"
};

const PRICE_CACHE = {};
const CACHE_TTL = 300;

async function fetchStooqPrice(ticker) {
  try {
    const url = `https://stooq.com/q/l/?s=${ticker}&f=sd2t2ohlcv&h&e=csv`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const text = await response.text();
    // CSV format: Symbol,Date,Time,Open,High,Low,Close,Volume
    const lines = text.trim().split('\n');
    if (lines.length < 2) return null;
    const cols = lines[1].split(',');
    const close = parseFloat(cols[6]);
    return close > 0 ? close : null;
  } catch (e) {
    console.error(`Stooq error for ${ticker}:`, e.message);
    return null;
  }
}

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const reqData = await req.json();
    const tickers = reqData.tickers || {};
    const prices = {};
    const now = Date.now() / 1000;

    const toFetch = {};
    for (const assetId of Object.keys(tickers)) {
      if (PRICE_CACHE[assetId]) {
        const [cacheTime, cachedPrice] = PRICE_CACHE[assetId];
        if (now - cacheTime < CACHE_TTL) {
          prices[assetId] = cachedPrice;
          continue;
        }
      }
      if (assetId in STOOQ_TICKERS) {
        toFetch[assetId] = STOOQ_TICKERS[assetId];
      }
    }

    await Promise.all(Object.entries(toFetch).map(async ([assetId, ticker]) => {
      const price = await fetchStooqPrice(ticker);
      if (price) {
        prices[assetId] = price;
        PRICE_CACHE[assetId] = [now, price];
        console.log(`✓ ${assetId}: ${price}`);
      } else {
        console.log(`✗ ${assetId}: no price found`);
      }
    }));

    return new Response(JSON.stringify(prices), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (e) {
    console.error('Error:', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
