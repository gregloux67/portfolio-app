// Calculate mNAV from raw data
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const data = JSON.parse(event.body);
    const {
      mstr_price_usd,
      btc_price_usd,
      btc_holdings,
      market_cap_usd,
      debt_usd = 0,
      pref_usd = 0,
      cash_usd = 0
    } = data;

    if (!mstr_price_usd || !btc_price_usd || !btc_holdings || !market_cap_usd) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required parameters" })
      };
    }

    // Calculate mNAV
    const market_cap = parseFloat(market_cap_usd);
    const debt = parseFloat(debt_usd) || 0;
    const pref = parseFloat(pref_usd) || 0;
    const cash = parseFloat(cash_usd) || 0;
    const btc_hold = parseFloat(btc_holdings);
    const btc_price = parseFloat(btc_price_usd);

    // Enterprise Value = Market Cap + Debt + Pref - Cash
    const ev = market_cap + debt + pref - cash;

    // Bitcoin NAV = BTC Holdings × BTC Price
    const btc_nav = btc_hold * btc_price;

    if (btc_nav <= 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid BTC NAV" })
      };
    }

    // mNAV = EV / BTC NAV
    let mnav = ev / btc_nav;

    // Validate result
    if (mnav > 0.5 && mnav < 10) {
      mnav = Math.round(mnav * 100) / 100;
      console.log(`✓ mnav (calc): ${mnav}`);

      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({ mnav })
      };
    }

    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid mNAV result", mnav })
    };
  } catch (err) {
    console.error("mNAV Calc Error:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message })
    };
  }
};
