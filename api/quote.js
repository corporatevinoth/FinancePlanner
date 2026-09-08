export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { symbol } = req.query;
  if (!symbol) {
    return res.status(400).json({ error: 'Missing symbol parameter' });
  }

  const clean = String(symbol).trim().toUpperCase();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(clean)}?interval=1d&range=1d`;

  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const json = await upstream.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) {
      return res.status(404).json({ error: 'Symbol not found' });
    }

    let price = meta.regularMarketPrice || meta.chartPreviousClose;
    let prev = meta.chartPreviousClose || price;
    let chg = (prev && prev > 0) ? Number((((price - prev) / prev) * 100).toFixed(2)) : 0;
    let curr = meta.currency || (clean.endsWith('.NS') || clean.endsWith('.BO') ? 'INR' : 'USD');

    return res.status(200).json({
      symbol: clean,
      price: Number(price.toFixed(2)),
      previousClose: Number(prev.toFixed(2)),
      changePercent: chg,
      currency: curr,
      shortName: meta.shortName || clean
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch quote', details: err.message });
  }
}
