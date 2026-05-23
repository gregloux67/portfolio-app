// Fetch EUR to USD exchange rate
exports.handler = async (event) => {
  try {
    const res = await fetch(
      "https://api.frankfurter.app/latest?from=EUR&to=USD",
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );

    if (!res.ok) throw new Error("FX API error");

    const data = await res.json();
    const eur_usd = data.rates?.USD || 1.08;

    console.log(`✓ EUR/USD: ${eur_usd}`);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ eur_usd })
    };
  } catch (err) {
    console.error("FX Error:", err);
    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ eur_usd: 1.08 }) // Fallback rate
    };
  }
};
