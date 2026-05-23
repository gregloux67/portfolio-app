// Use native fetch on Node 18+, fallback to node-fetch
const fetch = globalThis.fetch || require('node-fetch');

const ETF_TICKERS = {
  pust: "PUST.PA",
  paeem: "PAEEM.PA",
  urnu: "URNU.MI",
  vvmx: "VVMX.DE"
};

const PRICE_CACHE = {};
const CACHE_TTL = 300;

async function fetchYahooPrice(ticker) {
  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=price`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 5000
    });
    const data = await response.json();
    const result = data?.quoteSummary?.result?.[0] || {};
    const price = result?.price?.regularMarketPrice?.raw || result?.price?.currentPrice?.raw;
    return price || null;
  } catch (e) {
    console.error(`Error fetching Yahoo price for ${ticker}:`, e.message);
    return null;
  }
}

async function fetchGoogleFinancePrice(ticker) {
  try {
    const url = `https://www.google.com/finance/quote/${ticker}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 5000
    });
    const html = await response.text();
    const match = html.match(/"regularMarketPrice"\s*:\s*([0-9.]+)/);
    if (match) return parseFloat(match[1]);
    const matches = html.match(/([0-9]{1,4}\.[0-9]{2})/g) || [];
    for (let m of matches) {
      const val = parseFloat(m);
      if (val > 0.1) return val;
    }
  } catch (e) {
    console.error(`Error fetching Google price for ${ticker}:`, e.message);
  }
  return null;
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
      if (assetId === "mstr") {
        toFetch[assetId] = "MIGA.F";
      } else if (assetId in ETF_TICKERS) {
        toFetch[assetId] = ETF_TICKERS[assetId];
      }
    }

    const promises = Object.entries(toFetch).map(async ([assetId, ticker]) => {
      let price = await fetchYahooPrice(ticker);
      if (!price) price = await fetchGoogleFinancePrice(ticker);
      if (price) {
        prices[assetId] = price;
        PRICE_CACHE[assetId] = [now, price];
        console.log(`✓ ${assetId}: ${price}`);
      }
    });

    await Promise.all(promises);

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
