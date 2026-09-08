/**
 * importer.js - Historical Excel (.xlsx) & CSV Parser
 * Uses SheetJS in-browser to parse 2-3 years of past monthly investment records,
 * with smart column mapping and live preview.
 */

import { DB } from '../db.js';

export const ImporterService = {
  /**
   * Standard Column Schema
   */
  targetFields: [
    { key: 'month', label: 'Month (YYYY-MM)', required: true, aliases: ['month', 'date', 'period', 'snapshot_date', 'year_month'] },
    { key: 'assetName', label: 'Asset Name', required: true, aliases: ['asset', 'name', 'fund', 'scheme', 'stock', 'instrument', 'holding'] },
    { key: 'category', label: 'Category', required: false, aliases: ['category', 'type', 'asset_type', 'class', 'group'] },
    { key: 'investedValue', label: 'Invested Value', required: true, aliases: ['invested', 'cost', 'cost_basis', 'principal', 'buy_value', 'investment'] },
    { key: 'currentValue', label: 'Current Value', required: true, aliases: ['current', 'value', 'market_value', 'balance', 'valuation', 'nav_value'] },
    { key: 'freshSalaryAdded', label: 'Fresh Salary Added', required: false, aliases: ['fresh', 'salary', 'added', 'sip', 'contribution', 'deposit'] }
  ],

  /**
   * Generate downloadable sample CSV template
   */
  generateSampleCSV() {
    const headers = ['Month', 'Asset Name', 'Category', 'Invested Value', 'Current Value', 'Fresh Salary Added'];
    const sampleRows = [
      ['2025-01', 'Parag Parikh Flexi Cap', 'Mutual Funds', '150000', '162000', '10000'],
      ['2025-01', 'TCS Ltd', 'Direct Stocks', '80000', '89000', '0'],
      ['2025-01', 'HDFC 3-Yr Bank FD', 'Fixed Deposits', '200000', '208000', '0'],
      ['2025-01', 'Gold BeES ETF', 'Gold', '50000', '54500', '5000'],
      ['2025-02', 'Parag Parikh Flexi Cap', 'Mutual Funds', '160000', '175000', '10000'],
      ['2025-02', 'TCS Ltd', 'Direct Stocks', '80000', '92500', '0'],
      ['2025-02', 'HDFC 3-Yr Bank FD', 'Fixed Deposits', '200000', '209200', '0'],
      ['2025-02', 'Gold BeES ETF', 'Gold', '55000', '59000', '5000']
    ];

    const csvContent = [headers.join(','), ...sampleRows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'finance_planner_sample_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  /**
   * Parse uploaded Excel or CSV file
   * @param {File} file
   * @returns {Promise<{rawHeaders: string[], rawRows: Array<Object>}>}
   */
  async parseFile(file) {
    if (!window.XLSX) {
      throw new Error('SheetJS library is still loading. Please try again in a moment.');
    }

    const data = await file.arrayBuffer();
    const workbook = window.XLSX.read(data, { type: 'array', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // Convert sheet to array of JSON objects
    const rawRows = window.XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    if (!rawRows || rawRows.length === 0) {
      throw new Error('The selected spreadsheet appears to be empty.');
    }

    const rawHeaders = Object.keys(rawRows[0] || {});

    // Check if this is a Horizontal Monthly Matrix (like revathy.xlsx)
    // where columns after column 1 are month names (e.g. Jun 24, Jul 24... or Jan 25)
    const monthColumns = [];
    const monthRegex = /^(jan|feb|mar|apr|may|jun|june|jul|july|aug|sep|sept|oct|nov|dec)\s*\d{2,4}$/i;
    
    rawHeaders.forEach(h => {
      if (monthRegex.test(h.trim())) {
        monthColumns.push(h.trim());
      }
    });

    if (monthColumns.length >= 3) {
      // Detected Horizontal Matrix format! Unpivot into standard rows
      const unpivotedRows = this.unpivotMatrix(rawRows, rawHeaders, monthColumns);
      return {
        fileName: file.name,
        isMatrix: true,
        totalRows: unpivotedRows.length,
        rawHeaders: ['Month', 'Asset Name', 'Category', 'Invested Value', 'Current Value', 'Fresh Salary Added'],
        rawRows: unpivotedRows,
        detectedMapping: {
          month: 'Month',
          assetName: 'Asset Name',
          category: 'Category',
          investedValue: 'Invested Value',
          currentValue: 'Current Value',
          freshSalaryAdded: 'Fresh Salary Added'
        }
      };
    }

    const detectedMapping = this.autoDetectMapping(rawHeaders);

    return {
      fileName: file.name,
      isMatrix: false,
      totalRows: rawRows.length,
      rawHeaders,
      rawRows,
      detectedMapping
    };
  },

  /**
   * Unpivot horizontal matrix rows into vertical records
   */
  unpivotMatrix(rawRows, headers, monthColumns) {
    const unpivoted = [];
    const catCol = headers[0]; // e.g. 'Category'
    const nameCol = headers[1]; // e.g. 'Column 1' or 'Asset'

    for (const r of rawRows) {
      const assetName = String(r[nameCol] || '').trim();
      const category = String(r[catCol] || '').trim();

      // Skip summary or blank rows
      if (!assetName || /^(total|growth|system\.xml)/i.test(assetName)) continue;

      for (const mCol of monthColumns) {
        const val = parseFloat(r[mCol]);
        if (!isNaN(val) && val > 0) {
          const normMonth = this.normalizeMonthName(mCol);
          if (normMonth) {
            unpivoted.push({
              'Month': normMonth,
              'Asset Name': assetName,
              'Category': category,
              'Invested Value': val,
              'Current Value': val,
              'Fresh Salary Added': 0
            });
          }
        }
      }
    }
    return unpivoted;
  },

  /**
   * Convert "Jun 24" -> "2024-06"
   */
  normalizeMonthName(str) {
    if (!str) return '';
    const parts = str.trim().split(/\s+/);
    if (parts.length < 2) return '';
    const mName = parts[0].toLowerCase();
    let yr = parts[1];
    if (yr.length === 2) yr = '20' + yr;

    const map = {
      jan: '01', feb: '02', mar: '03', apr: '04',
      may: '05', jun: '06', june: '06', jul: '07', july: '07',
      aug: '08', sep: '09', sept: '09', oct: '10', nov: '11', dec: '12'
    };
    return map[mName] ? `${yr}-${map[mName]}` : '';
  },

  /**
   * Auto-match Excel headers with target schema
   */
  autoDetectMapping(headers) {
    const mapping = {};
    for (const field of this.targetFields) {
      const match = headers.find(h => {
        const clean = h.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        return field.aliases.some(alias => clean.includes(alias.replace(/[^a-z0-9]/g, '')));
      });
      mapping[field.key] = match || '';
    }
    return mapping;
  },

  /**
   * Normalize category text to internal category ID
   */
  normalizeCategory(catStr) {
    if (!catStr) return 'equity_mf';
    const s = String(catStr).trim().toLowerCase();
    if (s === 'sa' || s.includes('savings') || s.includes('cash') || s.includes('liquid')) return 'liquid_cash';
    if (s === 'lic' || s.includes('bond') || s.includes('ppf') || s.includes('epf')) return 'bond';
    if (s === 'fd' || s === 'rd' || s.includes('deposit') || s.includes('fixed')) return 'fixed_deposit';
    if (s.includes('gold') || s.includes('silver') || s.includes('sgb') || s.includes('bullion')) return 'gold';
    if (s.includes('stock') || s.includes('usstocks') || s.includes('crypto')) return 'equity_stock';
    if (s.includes('fund') || s.includes('mf') || s.includes('etf') || s.includes('ulip')) return 'equity_mf';
    return 'equity_mf';
  },

  /**
   * Normalize date/month string to YYYY-MM
   */
  normalizeMonth(val) {
    if (!val) return '';
    if (val instanceof Date) {
      return val.toISOString().substring(0, 7);
    }
    const str = String(val).trim();
    // Match YYYY-MM
    const match = str.match(/^(\d{4})[-/.](\d{1,2})/);
    if (match) {
      return `${match[1]}-${match[2].padStart(2, '0')}`;
    }
    // Match MM-YYYY or DD-MM-YYYY
    const reverseMatch = str.match(/(\d{1,2})[-/.](\d{4})$/);
    if (reverseMatch) {
      return `${reverseMatch[2]}-${reverseMatch[1].padStart(2, '0')}`;
    }
    return str.substring(0, 7);
  },

  /**
   * Commit parsed rows into DB: updates Assets and builds Monthly Snapshots
   */
  async commitImport(rawRows, columnMapping) {
    const monthlyGroups = new Map();
    const assetsMap = new Map();

    for (const row of rawRows) {
      const monthRaw = row[columnMapping.month];
      const month = this.normalizeMonth(monthRaw);
      const assetName = String(row[columnMapping.assetName] || '').trim();
      const category = this.normalizeCategory(row[columnMapping.category]);
      const invested = Number(row[columnMapping.investedValue]) || 0;
      const current = Number(row[columnMapping.currentValue]) || invested;
      const freshAdded = Number(row[columnMapping.freshSalaryAdded]) || 0;

      if (!month || !assetName) continue;

      // Group by month
      if (!monthlyGroups.has(month)) {
        monthlyGroups.set(month, {
          month,
          items: [],
          totalInvested: 0,
          totalCurrent: 0,
          freshAdded: 0
        });
      }

      const group = monthlyGroups.get(month);
      group.items.push({ assetName, category, invested, current, freshAdded });
      group.totalInvested += invested;
      group.totalCurrent += current;
      group.freshAdded += freshAdded;

      // Track latest asset state
      const assetKey = `${category}_${assetName.toLowerCase()}`;
      assetsMap.set(assetKey, {
        name: assetName,
        category,
        investedValue: invested,
        currentValue: current,
        units: 1,
        buyPrice: invested,
        currentPrice: current
      });
    }

    // 1. Save latest assets to Assets store
    for (const [_, assetData] of assetsMap) {
      const existingAssets = await DB.getAllAssets();
      const match = existingAssets.find(a => a.name.toLowerCase() === assetData.name.toLowerCase());
      if (match) {
        await DB.saveAsset({ ...match, ...assetData });
      } else {
        await DB.saveAsset(assetData);
      }
    }

    // 2. Build and save historical snapshots chronologically
    const sortedMonths = Array.from(monthlyGroups.keys()).sort();
    let prevTotal = 0;

    for (const m of sortedMonths) {
      const grp = monthlyGroups.get(m);
      if (!grp || grp.totalCurrent <= 0) continue; // Skip zero/empty projection months

      const netChange = prevTotal > 0 ? grp.totalCurrent - prevTotal : grp.totalCurrent - grp.totalInvested;
      const organicMarketGain = prevTotal > 0 ? grp.totalCurrent - (prevTotal + grp.freshAdded) : netChange;

      const snapshot = {
        month: m,
        date: `${m}-01T00:00:00.000Z`,
        totalNetWorth: grp.totalCurrent,
        totalInvested: grp.totalInvested,
        freshSalaryAdded: grp.freshAdded,
        organicMarketGain: Math.round(organicMarketGain),
        netChange: Math.round(netChange),
        notes: `Imported from Excel spreadsheet.`,
        holdings: grp.items.map(it => ({
          name: it.assetName,
          category: it.category,
          invested: it.invested,
          current: it.current
        }))
      };

      await DB.saveSnapshot(snapshot);
      prevTotal = grp.totalCurrent;
    }

    return {
      importedMonthsCount: sortedMonths.length,
      importedAssetsCount: assetsMap.size
    };
  },

  /**
   * Commit parsed data from Gemini AI Agent into DB
   */
  async commitAiImport(parsedData) {
    let assetsCount = 0;
    let snapshotsCount = 0;
    let replacedCount = 0;

    // 0. Handle replaceHoldingNames (e.g. replacing 'nuvama' with individual stocks/bonds)
    if (parsedData.replaceHoldingNames && Array.isArray(parsedData.replaceHoldingNames)) {
      const existingAssets = await DB.getAllAssets();
      for (const repName of parsedData.replaceHoldingNames) {
        const cleanRep = repName.trim().toLowerCase();
        if (!cleanRep) continue;
        const matches = existingAssets.filter(a => {
          const aName = a.name.toLowerCase();
          return aName === cleanRep || aName.includes(cleanRep) || cleanRep.includes(aName);
        });
        for (const m of matches) {
          await DB.deleteAsset(m.id);
          replacedCount++;
        }
      }
    }

    // 1. Commit assets with de-duplication
    if (parsedData.assets && Array.isArray(parsedData.assets)) {
      const existingAssets = await DB.getAllAssets();
      for (const a of parsedData.assets) {
        const val = Number(a.currentValue) || 0;
        const inv = Number(a.investedValue) || val;
        const assetData = {
          name: a.name,
          category: this.normalizeCategory(a.category),
          currentValue: val,
          investedValue: inv,
          units: Number(a.units) || 1,
          buyPrice: Number(a.buyPrice) || inv,
          currentPrice: Number(a.currentPrice) || val,
          symbolOrCode: a.symbolOrCode || '',
          notes: a.notes || ''
        };

        const match = existingAssets.find(ex => ex.name.trim().toLowerCase() === a.name.trim().toLowerCase());
        if (match) {
          await DB.saveAsset({ ...match, ...assetData, id: match.id });
        } else {
          const saved = await DB.saveAsset(assetData);
          existingAssets.push(saved);
        }
        assetsCount++;
      }
    }

    // 2. Commit snapshots
    if (parsedData.snapshots && Array.isArray(parsedData.snapshots)) {
      const sorted = [...parsedData.snapshots]
        .filter(s => s.totalNetWorth && Number(s.totalNetWorth) > 0)
        .sort((a, b) => a.month.localeCompare(b.month));
      let prevTotal = 0;

      for (const s of sorted) {
        const total = Number(s.totalNetWorth) || 0;
        if (total <= 0) continue;
        const fresh = Number(s.freshSalaryAdded) || 0;
        const netChange = prevTotal > 0 ? total - prevTotal : 0;
        const organic = prevTotal > 0 ? total - (prevTotal + fresh) : 0;

        await DB.saveSnapshot({
          month: s.month,
          date: `${s.month}-01T00:00:00.000Z`,
          totalNetWorth: total,
          totalInvested: Number(s.totalInvested) || total,
          freshSalaryAdded: fresh,
          organicMarketGain: Math.round(organic),
          netChange: Math.round(netChange),
          notes: s.notes || 'Imported via AI Agent',
          holdings: s.holdings || []
        });

        prevTotal = total;
        snapshotsCount++;
      }
    }

    return { assetsCount, snapshotsCount };
  }
};
