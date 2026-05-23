export default async (req, context) => {
  try {
    // mNAV scraping from Strategy.com would require browser automation (Playwright)
    // which is not available on Netlify Functions.
    // Use the mnav-calc endpoint instead with live prices for accurate mNAV.
    return new Response(JSON.stringify({ mnav: null }), {
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
