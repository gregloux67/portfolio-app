const https = require('https');

function httpGet(url, headers = {}, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const opts = { headers: { 'User-Agent': 'Mozilla/5.0', ...headers } };
    https.get(url, opts, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && maxRedirects > 0) {
        resolve(httpGet(res.headers.location, headers, maxRedirects - 1));
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// Boursorama symbols for Euronext Paris ETFs
const BOURSORAMA_SYMBOLS = {
  pust:  "1rTPUST",
  paeem: "1rTPAEEM"
};

// Stooq tickers for other assets
const STOOQ_TICKERS = {
  mstr: "mstr.us",   // USD — will be converted via FX
  urnu: "urnu.de",   // EUR
  vvmx: "vvmx.de"    // EUR
};

async function fetchBoursoramaPrice(symbol) {
  try {
    const url = `https://www.boursorama.com/bourse/action/graph/ws/GetTicksEOD?symbol=${symbol}&length=1&period=0&guid=`;
    const text = await httpGet(url, { 'Referer': 'https://www.boursorama.com/' });
    const data = JSON.parse(text);
    const close = data?.d?.qd?.c || data?.d?.qv?.c;
    return close > 0 ? close : null;
  } catch (e) {
    console.error(`Boursorama error for ${symbol}:`, e.message);
    return null;
  }
}

async function fetchStooqPrice(ticker) {
  try {
    const url = `https://stooq.com/q/l/?s=${ticker}&f=sd2t2ohlcv&h&e=csv`;
    const text = await httpGet(url);
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

async function fetchEurUsd() {
  try {
    const url = 'https://api.frankfurter.app/latest?from=USD&to=EUR';
    const text = await httpGet(url);
    const data = JSON.parse(text);
    return data?.rates?.EUR || null;
  } catch (e) {
    return null;
  }
}

const PRICE_CACHE = {};
const CACHE_TTL = 300;

exports.handler = async (event, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const reqData = JSON.parse(event.body || '{}');
    const tickers = reqData.tickers || {};
    const prices = {};
    const now = Date.now() / 1000;

    // Check cache first
    const toFetch = [];
    for (const assetId of Object.keys(tickers)) {
      if (PRICE_CACHE[assetId]) {
        const [cacheTime, cachedPrice] = PRICE_CACHE[assetId];
        if (now - cacheTime < CACHE_TTL) {
          prices[assetId] = cachedPrice;
          continue;
        }
      }
      toFetch.push(assetId);
    }

    // Fetch USD→EUR rate once if MSTR needs it
    let usdToEur = null;
    if (toFetch.includes('mstr')) {
      usdToEur = await fetchEurUsd();
    }

    await Promise.all(toFetch.map(async (assetId) => {
      let price = null;

      if (assetId in BOURSORAMA_SYMBOLS) {
        price = await fetchBoursoramaPrice(BOURSORAMA_SYMBOLS[assetId]);
      } else if (assetId in STOOQ_TICKERS) {
        price = await fetchStooqPrice(STOOQ_TICKERS[assetId]);
        // Convert USD to EUR for MSTR
        if (assetId === 'mstr' && price && usdToEur) {
          price = Math.round(price * usdToEur * 100) / 100;
        }
      }

      if (price) {
        prices[assetId] = price;
        PRICE_CACHE[assetId] = [now, price];
        console.log(`✓ ${assetId}: ${price}`);
      } else {
        console.log(`✗ ${assetId}: not found`);
      }
    }));

    return { statusCode: 200, headers, body: JSON.stringify(prices) };
  } catch (e) {
    console.error('Error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
