export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { symbols = '' } = req.query;
  const symbolList = String(symbols)
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);

  if (symbolList.length === 0) {
    return res.status(200).json({});
  }

  const results = {};
  await Promise.all(symbolList.map(async (sym) => {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`;
      const upstream = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      const json = await upstream.json();
      const meta = json?.chart?.result?.[0]?.meta;
      if (meta) {
        let price = meta.regularMarketPrice || meta.chartPreviousClose;
        let prev = meta.chartPreviousClose || price;
        let chg = (prev && prev > 0) ? Number((((price - prev) / prev) * 100).toFixed(2)) : 0;
        let curr = meta.currency || (sym.endsWith('.NS') || sym.endsWith('.BO') ? 'INR' : 'USD');
        results[sym] = {
          symbol: sym,
          price: Number(price.toFixed(2)),
          previousClose: Number(prev.toFixed(2)),
          changePercent: chg,
          currency: curr,
          shortName: meta.shortName || sym
        };
      }
    } catch {}
  }));

  return res.status(200).json(results);
}
