// Fetch prices from yfinance via HTTP
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const data = JSON.parse(event.body);
    const tickers = data.tickers || {};
    const prices = {};

    // Map tickers to fetch URLs
    const tickerMap = {
      pust: "PUST.PA",
      paeem: "PAEEM.PA",
      urnu: "URNU.MI",
      vvmx: "VVMX.DE",
      mstr: "MIGA.F"
    };

    // Fetch prices in parallel
    const promises = Object.entries(tickerMap).map(async ([id, ticker]) => {
      try {
        // Try direct yahoo finance query (may fail due to rate limiting)
        const res = await fetch(
          `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=price`,
          { headers: { "User-Agent": "Mozilla/5.0" } }
        );

        if (!res.ok) throw new Error(`Status ${res.status}`);

        const json = await res.json();
        const price = json.quoteSummary?.result?.[0]?.price?.regularMarketPrice;

        if (price) {
          prices[id] = price;
          console.log(`✓ ${id}: ${price}`);
        }
      } catch (e) {
        console.error(`✗ Error fetching ${id}:`, e.message);
      }
    });

    await Promise.all(promises);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(prices)
    };
  } catch (err) {
    console.error("Error:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message })
    };
  }
};
