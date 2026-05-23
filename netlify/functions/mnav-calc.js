export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const reqData = await req.json();
    const mstrPrice = parseFloat(reqData.mstr_price_usd);
    const btcPrice = parseFloat(reqData.btc_price_usd);
    const btcHoldings = parseFloat(reqData.btc_holdings);
    const marketCap = parseFloat(reqData.market_cap_usd);
    const debt = parseFloat(reqData.debt_usd) || 0;
    const pref = parseFloat(reqData.pref_usd) || 0;
    const cash = parseFloat(reqData.cash_usd) || 0;

    if (!mstrPrice || !btcPrice || !btcHoldings || !marketCap) {
      return new Response(JSON.stringify({ mnav: null }), { status: 200 });
    }

    const ev = marketCap + debt + pref - cash;
    const btcNav = btcHoldings * btcPrice;

    if (btcNav <= 0) {
      return new Response(JSON.stringify({ mnav: null }), { status: 200 });
    }

    const mnav = ev / btcNav;
    const result = mnav > 0.5 && mnav < 10 ? parseFloat(mnav.toFixed(2)) : null;

    console.log(`✓ mnav (calc): ${result}`);
    return new Response(JSON.stringify({ mnav: result }), {
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
