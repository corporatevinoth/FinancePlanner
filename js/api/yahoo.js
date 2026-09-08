/**
 * yahoo.js - Stock and Gold Market Quote Service
 * Fetches market quotes for NSE, BSE, and US tickers (e.g. TCS.NS, INFY.NS, GOLDBEES.NS, AAPL).
 * Uses public endpoints with CORS fallback proxies and offline resilience.
 */

const quoteCache = new Map();

// Helper to get local server API base URL
function getApiBase() {
  if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
    return ''; // same origin: /api/...
  }
  return 'http://localhost:8080';
}

// Fetch with timeout helper
async function fetchWithTimeout(url, options = {}, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

export const MarketService = {
  /**
   * Fetch current market price for a given ticker
   * @param {string} symbol - e.g. "TCS.NS", "RELIANCE.NS", "GOLDBEES.NS", "AAPL"
   * @returns {Promise<{symbol: string, price: number, currency: string, changePercent: number}|null>}
   */
  async getQuote(symbol) {
    if (!symbol) return null;
    const cleanSymbol = symbol.trim().toUpperCase().replace(/\s+/g, '');

    if (quoteCache.has(cleanSymbol)) {
      return quoteCache.get(cleanSymbol);
    }

    // 1. Try local server proxy endpoint first (/api/quote?symbol=...)
    try {
      const apiBase = getApiBase();
      const res = await fetchWithTimeout(`${apiBase}/api/quote?symbol=${encodeURIComponent(cleanSymbol)}`, {}, 3000);
      if (res.ok) {
        const quote = await res.json();
        if (quote && quote.price > 0 && !quote.error) {
          quoteCache.set(cleanSymbol, quote);
          quoteCache.set(quote.symbol || cleanSymbol, quote);
          return quote;
        }
      }
    } catch {
      // Local proxy not running or unreachable; continue to client-side fallback
    }

    // 2. Client-side candidate fallback with strict 2.5s timeouts
    const candidates = [];
    if (cleanSymbol.includes('.') || cleanSymbol.startsWith('^')) {
      candidates.push(cleanSymbol);
    } else {
      candidates.push(`${cleanSymbol}.NS`, `${cleanSymbol}.BO`, cleanSymbol);
    }

    for (const sym of candidates) {
      const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`;
      const fetchAttempts = [
        () => fetchWithTimeout(targetUrl, {}, 2000),
        () => fetchWithTimeout(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`, {}, 2500)
      ];

      for (const attempt of fetchAttempts) {
        try {
          const response = await attempt();
          if (!response.ok) continue;

          const data = await response.json();
          const result = data?.chart?.result?.[0];
          if (!result) continue;

          const meta = result.meta;
          const currentPrice = meta.regularMarketPrice || meta.chartPreviousClose;
          const previousClose = meta.chartPreviousClose || currentPrice;
          const changePercent = previousClose ? ((currentPrice - previousClose) / previousClose) * 100 : 0;

          if (currentPrice !== undefined && !isNaN(currentPrice) && currentPrice > 0) {
            const quote = {
              symbol: sym,
              price: Number(currentPrice.toFixed(2)),
              currency: meta.currency || (sym.endsWith('.NS') || sym.endsWith('.BO') ? 'INR' : 'USD'),
              changePercent: Number(changePercent.toFixed(2)),
              shortName: meta.shortName || sym
            };
            quoteCache.set(cleanSymbol, quote);
            quoteCache.set(sym, quote);
            return quote;
          }
        } catch {
          // Continue to next attempt
        }
      }
    }

    return null;
  },

  /**
   * Batch fetch quotes for multiple tickers in a single concurrent operation
   * @param {string[]} symbols
   * @returns {Promise<Map<string, {symbol: string, price: number, currency: string, changePercent: number}>>}
   */
  async batchFetchQuotes(symbols) {
    const results = new Map();
    const unique = [...new Set(symbols.map(s => s?.trim()?.toUpperCase()))].filter(Boolean);
    if (unique.length === 0) return results;

    // Check which symbols are already cached
    const missing = [];
    for (const s of unique) {
      if (quoteCache.has(s)) {
        results.set(s, quoteCache.get(s));
      } else {
        missing.push(s);
      }
    }

    if (missing.length === 0) return results;

    // 1. Try local batch endpoint (/api/batch-quotes?symbols=...)
    try {
      const apiBase = getApiBase();
      const res = await fetchWithTimeout(
        `${apiBase}/api/batch-quotes?symbols=${encodeURIComponent(missing.join(','))}`,
        {},
        5000
      );
      if (res.ok) {
        let batchData = await res.json();
        if (Array.isArray(batchData)) {
          batchData = batchData.find(x => x && typeof x === 'object' && !Array.isArray(x)) || {};
        }
        if (batchData && typeof batchData === 'object') {
          for (const [key, quote] of Object.entries(batchData)) {
            if (quote && quote.price > 0) {
              quoteCache.set(key, quote);
              results.set(key, quote);
              if (quote.symbol && quote.symbol !== key) {
                quoteCache.set(quote.symbol, quote);
                results.set(quote.symbol, quote);
              }
            }
          }
        }
      }
    } catch {
      // Local batch endpoint not available; fall back to concurrent individual calls
    }

    // 2. Concurrently fetch any remaining missing symbols with individual failover
    const stillMissing = missing.filter(s => !results.has(s));
    if (stillMissing.length > 0) {
      await Promise.allSettled(
        stillMissing.map(async (sym) => {
          const quote = await this.getQuote(sym);
          if (quote && quote.price) {
            results.set(sym, quote);
          }
        })
      );
    }

    return results;
  }
};
