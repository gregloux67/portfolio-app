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

// Boursorama symbols — all assets via single source
const BOURSORAMA_SYMBOLS = {
  pust:  { sym: "1rTPUST",  currency: "EUR" },
  paeem: { sym: "1rTPAEEM", currency: "EUR" },
  urnu:  { sym: "1zURNU",   currency: "EUR" },
  vvmx:  { sym: "1zVVMX",   currency: "EUR" },
  mstr:  { sym: "MSTR",     currency: "USD" }  // NASDAQ price in USD
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

    // Fetch USD→EUR rate if MSTR needs conversion
    let usdToEur = null;
    if (toFetch.includes('mstr')) {
      usdToEur = await fetchEurUsd();
    }

    await Promise.all(toFetch.map(async (assetId) => {
      let price = null;

      if (assetId in BOURSORAMA_SYMBOLS) {
        const { sym, currency } = BOURSORAMA_SYMBOLS[assetId];
        price = await fetchBoursoramaPrice(sym);
        if (price && currency === 'USD' && usdToEur) {
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
