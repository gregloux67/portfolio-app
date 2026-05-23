const fetch = globalThis.fetch || require('node-fetch');

export default async (req, context) => {
  try {
    const response = await fetch("https://api.frankfurter.app/latest?from=EUR&to=USD", {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 5000
    });
    const data = await response.json();
    const eur_usd = data?.rates?.USD || 1.08;

    return new Response(JSON.stringify({ eur_usd }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (e) {
    console.error('Error fetching FX:', e);
    return new Response(JSON.stringify({ eur_usd: 1.08 }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};
