/**
 * mfapi.js - Free, Open AMFI Indian Mutual Funds API Client
 * Uses official community endpoints at api.mfapi.in
 * 100% Free, No API key required, supports CORS.
 */

const BASE_URL = 'https://api.mfapi.in/mf';
const navCache = new Map();

export const MFApiService = {
  /**
   * Search for mutual fund schemes by name
   * @param {string} query - e.g. "Parag Parikh", "HDFC Top 100", "Mirae Asset Large Cap"
   * @returns {Promise<Array<{schemeCode: number, schemeName: string}>>}
   */
  async searchSchemes(query) {
    if (!query || query.trim().length < 2) return [];

    try {
      const response = await fetch(`${BASE_URL}/search?q=${encodeURIComponent(query.trim())}`);
      if (!response.ok) {
        throw new Error(`MF search failed: ${response.statusText}`);
      }
      const data = await response.json();
      return Array.isArray(data) ? data.slice(0, 15) : [];
    } catch (err) {
      console.warn('MF Search API failed, using local fallback:', err);
      return [];
    }
  },

  /**
   * Fetch the latest NAV for a specific scheme code
   * @param {number|string} schemeCode - AMFI scheme code e.g. 122639
   * @returns {Promise<{schemeCode: number, schemeName: string, nav: number, date: string}|null>}
   */
  async getLatestNav(schemeCode) {
    const code = String(schemeCode).trim();
    if (!code) return null;

    // Check cache first (valid for current session)
    if (navCache.has(code)) {
      return navCache.get(code);
    }

    try {
      const response = await fetch(`${BASE_URL}/${code}/latest`);
      if (!response.ok) {
        throw new Error(`Failed to fetch NAV for ${code}`);
      }
      const data = await response.json();

      if (data && data.data && data.data.length > 0) {
        const latest = data.data[0];
        const result = {
          schemeCode: data.meta?.scheme_code || code,
          schemeName: data.meta?.scheme_name || 'Mutual Fund',
          nav: parseFloat(latest.nav),
          date: latest.date
        };
        navCache.set(code, result);
        return result;
      }
      return null;
    } catch (err) {
      console.warn(`Error fetching NAV for scheme ${code}:`, err);
      return null;
    }
  },

  /**
   * Batch fetch latest NAVs for an array of scheme codes
   * @param {Array<string|number>} schemeCodes
   * @returns {Promise<Map<string, number>>} Map of schemeCode -> NAV
   */
  async batchFetchNavs(schemeCodes) {
    const results = new Map();
    const uniqueCodes = [...new Set(schemeCodes.map(c => String(c).trim()))].filter(Boolean);

    await Promise.allSettled(
      uniqueCodes.map(async (code) => {
        const data = await this.getLatestNav(code);
        if (data && !isNaN(data.nav)) {
          results.set(code, data.nav);
        }
      })
    );

    return results;
  }
};
