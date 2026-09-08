/**
 * portfolio.js - Core Portfolio & Holdings Management
 * Organizes holdings across 5 asset tiers, manages CRUD operations,
 * and handles live valuation sync.
 */

import { DB } from '../db.js';
import { MFApiService } from '../api/mfapi.js';
import { MarketService } from '../api/yahoo.js';
import { CompoundingEngine } from '../api/compounding.js';
import { INITIAL_HOLDINGS, INITIAL_SNAPSHOTS } from '../initialData.js';

export const ASSET_CATEGORIES = {
  equity_stock: {
    id: 'equity_stock',
    name: 'Direct Stocks',
    group: 'Equity',
    color: '#3B82F6', // Blue
    icon: 'trending-up',
    isMarketLinked: true
  },
  equity_mf: {
    id: 'equity_mf',
    name: 'Mutual Funds',
    group: 'Equity',
    color: '#6366F1', // Indigo
    icon: 'pie-chart',
    isMarketLinked: true
  },
  fixed_deposit: {
    id: 'fixed_deposit',
    name: 'Fixed Deposits (FD/RD)',
    group: 'Debt',
    color: '#10B981', // Emerald
    icon: 'shield-check',
    isContractual: true
  },
  bond: {
    id: 'bond',
    name: 'Bonds & PPF/EPF',
    group: 'Debt',
    color: '#14B8A6', // Teal
    icon: 'lock',
    isContractual: true
  },
  gold: {
    id: 'gold',
    name: 'Gold (Physical & Digital)',
    group: 'Commodities',
    color: '#F59E0B', // Amber
    icon: 'award',
    isMarketLinked: true
  },
  liquid_cash: {
    id: 'liquid_cash',
    name: 'Emergency Fund & Cash',
    group: 'Liquid',
    color: '#8B5CF6', // Violet
    icon: 'wallet',
    isCash: true
  }
};

export const PortfolioService = {
  /**
   * Get all holdings from DB
   */
  async getHoldings() {
    return await DB.getAllAssets();
  },

  /**
   * Add or update an asset
   */
  async saveAsset(assetData) {
    const asset = {
      ...assetData,
      units: Number(assetData.units) || 1,
      buyPrice: Number(assetData.buyPrice) || 0,
      currentPrice: Number(assetData.currentPrice) || Number(assetData.buyPrice) || 0,
      interestRate: Number(assetData.interestRate) || 0,
      lastSyncedAt: new Date().toISOString()
    };

    // Calculate invested and current value
    if (asset.category === 'liquid_cash') {
      const balance = assetData.currentValue !== undefined && !isNaN(Number(assetData.currentValue))
        ? Number(assetData.currentValue)
        : (Number(assetData.buyPrice) || Number(assetData.investedValue) || 0);
      asset.units = 1;
      asset.buyPrice = balance;
      asset.currentPrice = balance;
      asset.investedValue = balance;
      asset.currentValue = balance;
    } else if (asset.category === 'fixed_deposit' || asset.category === 'bond') {
      const p = Number(assetData.principal) || Number(assetData.buyPrice) || Number(assetData.investedValue) || 0;
      asset.principal = p;
      asset.investedValue = p;
      asset.buyPrice = p;
      asset.units = 1;

      if (asset.startDate && asset.interestRate) {
        const fdMath = CompoundingEngine.calculateFDAccrual({
          principal: p,
          annualRate: asset.interestRate,
          startDate: asset.startDate,
          maturityDate: asset.maturityDate,
          compounding: asset.compoundingFreq || 'quarterly'
        });
        asset.investedValue = fdMath.principal;
        asset.currentValue = Number(assetData.currentValue) && Number(assetData.currentValue) > fdMath.currentValue
          ? Number(assetData.currentValue)
          : fdMath.currentValue;
        asset.maturityAmount = fdMath.maturityAmount;
        asset.daysToMaturity = fdMath.daysToMaturity;
      } else {
        asset.currentValue = Number(assetData.currentValue) || p;
        asset.currentPrice = asset.currentValue;
        asset.maturityAmount = asset.currentValue;
        if (asset.maturityDate) {
          const mat = new Date(asset.maturityDate);
          const now = new Date();
          now.setHours(0, 0, 0, 0);
          asset.daysToMaturity = Math.max(0, Math.ceil((mat.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
        } else {
          asset.daysToMaturity = 0;
        }
      }
    } else {
      let units = Number(asset.units) || 1;
      let buyPrice = Number(asset.buyPrice) || 0;
      let inv = Number(assetData.investedValue);
      let currVal = assetData.currentValue !== undefined && !isNaN(Number(assetData.currentValue)) && Number(assetData.currentValue) > 0
        ? Number(assetData.currentValue)
        : Math.round(units * Number(asset.currentPrice));

      // Sanity check: If user entered total cost into buyPrice (e.g. 120000) instead of per-unit price
      if (units > 1 && buyPrice > 1000 && currVal > 0 && buyPrice > (currVal / units) * 3) {
        inv = buyPrice;
        buyPrice = Number((inv / units).toFixed(4));
        asset.buyPrice = buyPrice;
      }

      asset.investedValue = inv > 0 ? inv : Math.round(units * buyPrice);
      asset.currentValue = currVal;
      asset.currentPrice = units > 0 ? Number((currVal / units).toFixed(4)) : currVal;
    }

    return await DB.saveAsset(asset);
  },

  /**
   * Delete an asset
   */
  async deleteAsset(id) {
    return await DB.deleteAsset(id);
  },

  /**
   * Auto-heal & deduplicate: removes duplicate holdings and cleans up zero snapshots
   */
  async deduplicateDatabase(force = false) {
    if (!force && this._hasDeduplicated) {
      return { removedAssets: 0, removedSnapshots: 0 };
    }
    this._hasDeduplicated = true;

    const assets = await DB.getAllAssets();
    const seen = new Map();
    let removedAssets = 0;

    // Auto-heal: Split legacy Ujjivan FD + Savings into 3 distinct records
    const ujjivanOld = assets.find(a => a.id === 'ast_fd_ujjivan' || (a.name && a.name.toLowerCase().includes('ujjivan fd + savings')));
    if (ujjivanOld) {
      await DB.deleteAsset(ujjivanOld.id);
      if (!assets.some(a => a.id === 'ast_cash_ujjivan_savings')) {
        await DB.saveAsset({
          id: 'ast_cash_ujjivan_savings',
          name: 'Ujjivan Savings Account',
          category: 'liquid_cash',
          symbolOrCode: 'UJJIVAN-SAVINGS',
          units: 1,
          buyPrice: 271836,
          investedValue: 271836,
          currentPrice: 271836,
          currentValue: 271836,
          lastSyncedAt: '2026-09-04T00:00:00.000Z'
        });
      }
      if (!assets.some(a => a.id === 'ast_fd_ujjivan_1')) {
        await DB.saveAsset({
          id: 'ast_fd_ujjivan_1',
          name: 'Ujjivan SFB FD (Monthly Payout)',
          category: 'fixed_deposit',
          symbolOrCode: 'UJJIVAN-FD-7.8% (24M-Payout)',
          units: 1,
          buyPrice: 100000,
          investedValue: 100000,
          currentPrice: 100000,
          currentValue: 100000,
          interestRate: 7.8,
          startDate: '2026-08-06',
          maturityDate: '2028-08-06',
          compoundingFreq: 'monthly',
          lastSyncedAt: '2026-09-04T00:00:00.000Z'
        });
      }
      if (!assets.some(a => a.id === 'ast_fd_ujjivan_2')) {
        await DB.saveAsset({
          id: 'ast_fd_ujjivan_2',
          name: 'Ujjivan SFB FD',
          category: 'fixed_deposit',
          symbolOrCode: 'UJJIVAN-FD-7.8% (24M)',
          units: 1,
          buyPrice: 100000,
          investedValue: 100000,
          currentPrice: 100000,
          currentValue: 100000,
          interestRate: 7.8,
          startDate: '2026-08-07',
          maturityDate: '2028-08-07',
          compoundingFreq: 'quarterly',
          lastSyncedAt: '2026-09-04T00:00:00.000Z'
        });
      }
    }

    // Auto-heal: Ensure CoinSwitch INR Wallet exists
    if (!assets.some(a => a.id === 'ast_cash_coinswitch_wallet')) {
      await DB.saveAsset({
        id: 'ast_cash_coinswitch_wallet',
        name: 'CoinSwitch (INR Wallet)',
        category: 'liquid_cash',
        symbolOrCode: 'WALLET-BALANCE',
        units: 1,
        buyPrice: 2051.01,
        investedValue: 2051.01,
        currentPrice: 2051.01,
        currentValue: 2051.01,
        lastSyncedAt: '2026-09-04T00:00:00.000Z'
      });
    }

    // Auto-sync verified Mutual Fund screenshot figures
    // Auto-sync verified screenshot figures (MFs, Gold, LIC, Crypto, and INDmoney US Stocks)
    const verifiedHoldingUpdates = {
      'ast_mf_tata_digital': { name: 'Tata Digital India Fund', units: 2508.843, buyPrice: 49.8238, investedValue: 125000, currentPrice: 49.6573, currentValue: 124582, symbolOrCode: '135799' },
      'ast_mf_motilal_midcap': { name: 'Motilal Oswal Midcap Fund', units: 134.109, buyPrice: 111.8493, investedValue: 15000, currentPrice: 120.5869, currentValue: 16172, symbolOrCode: '128033' },
      'ast_mf_motilal_large_mid': { name: 'Motilal Oswal Large & Mid Cap Fund', units: 623.307, buyPrice: 32.0869, investedValue: 20000, currentPrice: 41.2237, currentValue: 25695, symbolOrCode: '147623' },
      'ast_mf_icici_thematic': { name: 'ICICI Prudential Aggressive Hybrid Fund', units: 48.023, buyPrice: 208.2336, investedValue: 10000, currentPrice: 245.9722, currentValue: 11812, symbolOrCode: '120700' },
      'ast_mf_icici_multi_asset': { name: 'ICICI Prudential Multi Asset Allocation Fund', units: 124.908, buyPrice: 880.6482, investedValue: 110000, currentPrice: 899.9882, currentValue: 112416, symbolOrCode: '120334' },
      'ast_mf_ppfas_flexi': { name: 'Parag Parikh Flexi Cap Fund', units: 1325.744, buyPrice: 90.5152, investedValue: 120000, currentPrice: 90.6349, currentValue: 120159, symbolOrCode: '122639' },
      'ast_gold_lalitha': { name: 'Lalitha Gold', category: 'gold', symbolOrCode: 'LALITHAA-FLEXI (6.056g)', units: 6.056, buyPrice: 13870.54, investedValue: 84000, currentPrice: 15379.14, currentValue: 93136, maturityDate: '2027-03-08' },
      'ast_ins_lic': { name: "LIC's Jeevan Umang", category: 'bond', symbolOrCode: 'POL# XXXXXX7831 (SA: ₹18.75L)', units: 1, buyPrice: 883620, investedValue: 883620, currentPrice: 641250, currentValue: 641250, startDate: '2021-03-17', maturityDate: '2089-03-17' },
      'ast_crypto_coindcx': { id: 'ast_crypto_coinswitch', name: 'CoinSwitch (Crypto Portfolio)', category: 'equity_stock', symbolOrCode: 'COINSWITCH (BTC, SHIB, POL, SUNDOG)', units: 1, buyPrice: 88305.80, investedValue: 88305.80, currentPrice: 67599.74, currentValue: 67599.74 },
      'ast_crypto_coinswitch': { name: 'CoinSwitch (Crypto Portfolio)', category: 'equity_stock', symbolOrCode: 'COINSWITCH (BTC, SHIB, POL, SUNDOG)', units: 1, buyPrice: 88305.80, investedValue: 88305.80, currentPrice: 67599.74, currentValue: 67599.74 },
      'ast_cash_coinswitch_wallet': { name: 'CoinSwitch (INR Wallet)', category: 'liquid_cash', symbolOrCode: 'WALLET-BALANCE', units: 1, buyPrice: 2051.01, investedValue: 2051.01, currentPrice: 2051.01, currentValue: 2051.01 },
      'ast_cash_ujjivan_savings': { name: 'Ujjivan Savings Account', category: 'liquid_cash', symbolOrCode: 'UJJIVAN-SAVINGS', units: 1, buyPrice: 271836, investedValue: 271836, currentPrice: 271836, currentValue: 271836 },
      'ast_fd_ujjivan_1': { name: 'Ujjivan SFB FD (Monthly Payout)', category: 'fixed_deposit', symbolOrCode: 'UJJIVAN-FD-7.8% (24M-Payout)', units: 1, buyPrice: 100000, investedValue: 100000, currentPrice: 100000, currentValue: 100000, interestRate: 7.8, startDate: '2026-08-06', maturityDate: '2028-08-06', compoundingFreq: 'monthly' },
      'ast_fd_ujjivan_2': { name: 'Ujjivan SFB FD', category: 'fixed_deposit', symbolOrCode: 'UJJIVAN-FD-7.8% (24M)', units: 1, buyPrice: 100000, investedValue: 100000, currentPrice: 100000, currentValue: 100000, interestRate: 7.8, startDate: '2026-08-07', maturityDate: '2028-08-07', compoundingFreq: 'quarterly' },
      
      // INDmoney US Stocks (Verified from App Screenshot)
      'ast_us_netflix': { name: 'Netflix Inc', category: 'equity_stock', symbolOrCode: 'NFLX', currency: 'USD', units: 17.0772, usdBuyPrice: 68.52, usdPrice: 77.81, usdInvested: 1170.04, usdCurrent: 1328.71, buyPrice: 5855.76, investedValue: 100000, currentPrice: 7350.84, currentValue: 125530 },
      'ast_us_meta': { name: 'Meta Platforms Inc Class A', category: 'equity_stock', symbolOrCode: 'META', currency: 'USD', units: 2.0070, usdBuyPrice: 541.08, usdPrice: 613.89, usdInvested: 1085.95, usdCurrent: 1232.07, buyPrice: 47334.33, investedValue: 95000, currentPrice: 57997.26, currentValue: 116400 },
      'ast_us_tesla': { name: 'Tesla Inc', category: 'equity_stock', symbolOrCode: 'TSLA', currency: 'USD', units: 2.1484, usdBuyPrice: 349.75, usdPrice: 354.07, usdInvested: 751.41, usdCurrent: 760.69, buyPrice: 30255.07, investedValue: 65000, currentPrice: 33451.71, currentValue: 71868 },
      'ast_us_nvidia': { name: 'NVIDIA Corp', category: 'equity_stock', symbolOrCode: 'NVDA', currency: 'USD', units: 2.9975, usdBuyPrice: 210.57, usdPrice: 230.37, usdInvested: 631.18, usdCurrent: 690.53, buyPrice: 18348.62, investedValue: 55000, currentPrice: 21763.26, currentValue: 65235 },
      'ast_us_amazon': { name: 'Amazon.com Inc', category: 'equity_stock', symbolOrCode: 'AMZN', currency: 'USD', units: 2.0238, usdBuyPrice: 255.67, usdPrice: 258.50, usdInvested: 517.43, usdCurrent: 523.16, buyPrice: 22235.40, investedValue: 45000, currentPrice: 24422.73, currentValue: 49427 },
      'ast_us_oracle': { name: 'Oracle Corp', category: 'equity_stock', symbolOrCode: 'ORCL', currency: 'USD', units: 2.4000, usdBuyPrice: 121.51, usdPrice: 128.27, usdInvested: 291.62, usdCurrent: 307.85, buyPrice: 10416.67, investedValue: 25000, currentPrice: 12118.33, currentValue: 29084 },
      'ast_us_tsmc': { name: 'Taiwan Semiconductor Manufacturing Co Ltd', category: 'equity_stock', symbolOrCode: 'TSM', currency: 'USD', units: 1.6000, usdBuyPrice: 159.47, usdPrice: 167.43, usdInvested: 255.15, usdCurrent: 267.89, buyPrice: 13750.00, investedValue: 22000, currentPrice: 15818.94, currentValue: 25310 },
      'ast_us_msft': { name: 'Microsoft Corp', category: 'equity_stock', symbolOrCode: 'MSFT', currency: 'USD', units: 0.0350, usdBuyPrice: 428.57, usdPrice: 508.57, usdInvested: 15.00, usdCurrent: 17.80, buyPrice: 37142.86, investedValue: 1300, currentPrice: 48047.14, currentValue: 1682 },
      'ast_us_amd': { name: 'Advanced Micro Devices Inc', category: 'equity_stock', symbolOrCode: 'AMD', currency: 'USD', units: 0.1500, usdBuyPrice: 123.40, usdPrice: 128.80, usdInvested: 18.51, usdCurrent: 19.32, buyPrice: 10666.67, investedValue: 1600, currentPrice: 12168.38, currentValue: 1825 },
      'ast_us_voo': { name: 'Vanguard S&P 500 ETF', category: 'equity_stock', symbolOrCode: 'VOO', currency: 'USD', units: 0.0050, usdBuyPrice: 370.00, usdPrice: 440.00, usdInvested: 1.85, usdCurrent: 2.20, buyPrice: 38000.00, investedValue: 190, currentPrice: 41569.00, currentValue: 208 },
      'ast_us_googl': { name: 'Alphabet Inc Class A', category: 'equity_stock', symbolOrCode: 'GOOGL', currency: 'USD', units: 0.0200, usdBuyPrice: 135.50, usdPrice: 147.50, usdInvested: 2.71, usdCurrent: 2.95, buyPrice: 12500.00, investedValue: 250, currentPrice: 13935.06, currentValue: 279 },
      'ast_us_uber': { name: 'Uber Technologies Inc', category: 'equity_stock', symbolOrCode: 'UBER', currency: 'USD', units: 0.0200, usdBuyPrice: 65.00, usdPrice: 73.50, usdInvested: 1.30, usdCurrent: 1.47, buyPrice: 6000.00, investedValue: 120, currentPrice: 6943.91, currentValue: 139 },
      'ast_us_sony': { name: 'Sony Group Corporation (ADR)', category: 'equity_stock', symbolOrCode: 'SONY', currency: 'USD', units: 0.0150, usdBuyPrice: 86.67, usdPrice: 96.67, usdInvested: 1.30, usdCurrent: 1.45, buyPrice: 8000.00, investedValue: 120, currentPrice: 9132.92, currentValue: 137 },
      'ast_us_spy': { name: 'State Street SPDR S&P 500 ETF', category: 'equity_stock', symbolOrCode: 'SPY', currency: 'USD', units: 0.0020, usdBuyPrice: 600.00, usdPrice: 690.00, usdInvested: 1.20, usdCurrent: 1.38, buyPrice: 57500.00, investedValue: 115, currentPrice: 65187.75, currentValue: 130 },
      'ast_us_sony_fg': { name: 'SONY FINANCIAL GROUP INC (ADR)', category: 'equity_stock', currency: 'USD', units: 0.0010, usdBuyPrice: 50.00, usdPrice: 60.00, usdInvested: 0.05, usdCurrent: 0.06, buyPrice: 5000.00, investedValue: 5, currentPrice: 5668.50, currentValue: 6 },
      'ast_us_cash': { name: 'Uninvested USD Cash / Buying Power', category: 'liquid_cash', currency: 'USD', units: 1, usdBuyPrice: 2388.22, usdPrice: 2388.22, usdInvested: 2388.22, usdCurrent: 2388.22, buyPrice: 225627.08, investedValue: 225627.08, currentPrice: 225627.08, currentValue: 225627.08 }
    };

    function needsAssetUpdate(existing, update) {
      for (const [k, v] of Object.entries(update)) {
        if (typeof v === 'number') {
          if (Math.abs((Number(existing[k]) || 0) - v) > 0.001) return true;
        } else if (existing[k] !== v) {
          return true;
        }
      }
      return false;
    }

    for (const a of assets) {
      let matched = false;
      if (verifiedHoldingUpdates[a.id]) {
        const u = verifiedHoldingUpdates[a.id];
        if (needsAssetUpdate(a, u)) {
          Object.assign(a, u);
          a.lastSyncedAt = '2026-09-04T00:00:00.000Z';
          await DB.saveAsset(a);
        }
        matched = true;
      }
      if (!matched) {
        const cleanName = (a.name || '').toLowerCase();
        for (const key in verifiedHoldingUpdates) {
          const u = verifiedHoldingUpdates[key];
          if ((cleanName.includes('tata digital') && key === 'ast_mf_tata_digital') ||
              (cleanName.includes('motilal') && cleanName.includes('midcap') && key === 'ast_mf_motilal_midcap') ||
              (cleanName.includes('motilal') && (cleanName.includes('large') || cleanName.includes('mid cap')) && key === 'ast_mf_motilal_large_mid') ||
              ((cleanName.includes('thematic') || cleanName.includes('aggressive hybrid')) && key === 'ast_mf_icici_thematic') ||
              ((cleanName.includes('multi asset') || cleanName.includes('multi-asset') || a.symbolOrCode === '100377') && key === 'ast_mf_icici_multi_asset') ||
              ((cleanName.includes('parag parikh') || cleanName.includes('ppfas')) && key === 'ast_mf_ppfas_flexi') ||
              (cleanName.includes('lalitha') && key === 'ast_gold_lalitha') ||
              (cleanName.includes('lic') && key === 'ast_ins_lic') ||
              ((cleanName.includes('coindcx') || cleanName.includes('coinswitch')) && (key === 'ast_crypto_coindcx' || key === 'ast_crypto_coinswitch')) ||
              (cleanName.includes('netflix') && key === 'ast_us_netflix') ||
              (cleanName.includes('meta') && key === 'ast_us_meta') ||
              (cleanName.includes('tesla') && key === 'ast_us_tesla') ||
              (cleanName.includes('nvidia') && key === 'ast_us_nvidia') ||
              (cleanName.includes('amazon') && key === 'ast_us_amazon') ||
              (cleanName.includes('oracle') && key === 'ast_us_oracle') ||
              ((cleanName.includes('taiwan') || cleanName.includes('tsmc')) && key === 'ast_us_tsmc') ||
              (cleanName.includes('microsoft') && key === 'ast_us_msft') ||
              (cleanName.includes('advanced micro') && key === 'ast_us_amd') ||
              ((cleanName.includes('vanguard') || cleanName.includes('voo')) && key === 'ast_us_voo') ||
              ((cleanName.includes('alphabet') || cleanName.includes('google')) && key === 'ast_us_googl') ||
              (cleanName.includes('uber') && key === 'ast_us_uber') ||
              (cleanName.includes('sony group') && key === 'ast_us_sony') ||
              ((cleanName.includes('spdr') || cleanName.includes('spy')) && key === 'ast_us_spy') ||
              (cleanName.includes('sony financial') && key === 'ast_us_sony_fg') ||
              ((cleanName.includes('uninvested') || cleanName.includes('buying power')) && key === 'ast_us_cash')) {
            if (needsAssetUpdate(a, u)) {
              Object.assign(a, u);
              a.lastSyncedAt = '2026-09-04T00:00:00.000Z';
              await DB.saveAsset(a);
            }
            break;
          }
        }
      }

      const clean = a.name.trim().toLowerCase();
      if (seen.has(clean)) {
        const prev = seen.get(clean);
        // Keep the newer/updated record
        const keepA = (a.lastSyncedAt && (!prev.lastSyncedAt || a.lastSyncedAt >= prev.lastSyncedAt)) ||
                      ((Number(a.currentValue) || 0) > (Number(prev.currentValue) || 0)) ||
                      (a.id > prev.id);
        if (keepA) {
          await DB.deleteAsset(prev.id);
          seen.set(clean, a);
        } else {
          await DB.deleteAsset(a.id);
        }
        removedAssets++;
      } else {
        seen.set(clean, a);
      }
    }

    const snapshots = await DB.getAllSnapshots();
    let removedSnapshots = 0;
    for (const s of snapshots) {
      if (!s.totalNetWorth || Number(s.totalNetWorth) <= 0 || s.month > '2026-12') {
        await DB.deleteSnapshot(s.month);
        removedSnapshots++;
      }
    }

    return { removedAssets, removedSnapshots };
  },

  /**
   * One-click Live Valuation Sync:
   * Refreshes Mutual Funds via MFapi, Stocks & Gold via MarketService batch proxy, and FDs via CompoundingEngine.
   * Completely parallelized with fail-safes and USD-to-INR conversion for US stocks.
   */
  async syncAllValuations() {
    const assets = await this.getHoldings();
    if (!assets || assets.length === 0) return { updatedCount: 0, errors: [] };

    let updatedCount = 0;
    const errors = [];
    const savePromises = [];

    // 1. Identify and prepare stock & gold ETF symbols to batch fetch
    const nonTickerIds = new Set([
      'ast_gold_lalitha',
      'ast_ins_lic',
      'ast_ins_lic_jeevan_umang',
      'ast_crypto_coinswitch',
      'ast_cash_coinswitch_wallet',
      'ast_cmd_sgb'
    ]);

    const tickerAssets = assets.filter(item => {
      if (nonTickerIds.has(item.id)) return false;
      if (item.category !== 'equity_stock' && item.category !== 'gold') return false;
      const sym = item.symbolOrCode;
      if (!sym || sym.startsWith('COINSWITCH') || sym.startsWith('LALITHAA')) return false;
      return true;
    });

    const symbolsToFetch = tickerAssets.map(item => item.symbolOrCode || item.name);
    // Always include USD/INR rate to convert any USD-denominated US holdings
    symbolsToFetch.push('USDINR=X');

    // 2. Concurrently initiate Market quotes batch fetch and Mutual Fund queries
    const batchQuotesPromise = MarketService.batchFetchQuotes(symbolsToFetch).catch(err => {
      errors.push(`Market quotes warning: ${err.message}`);
      return new Map();
    });

    const mfAssets = assets.filter(item => item.category === 'equity_mf');
    const mfPromises = mfAssets.map(async (item) => {
      try {
        let code = item.symbolOrCode;
        // Fix known AMFI scheme codes if mismatched
        if (item.id === 'ast_mf_icici_pharma' || item.name.includes('Pharma Healthcare')) {
          code = '143874';
          item.symbolOrCode = code;
        } else if (item.id === 'ast_mf_motilal_midcap' || item.name.includes('Motilal Oswal Midcap')) {
          code = '127042';
          item.symbolOrCode = code;
        } else if (item.id === 'ast_mf_icici_multi_asset' || item.name.toLowerCase().includes('multi asset') || item.name.toLowerCase().includes('multi-asset') || code === '100377') {
          code = '120334';
          item.symbolOrCode = code;
        }

        if (!code || isNaN(Number(code))) {
          const found = await MFApiService.searchSchemes(item.name);
          if (found && found.length > 0) {
            code = String(found[0].schemeCode);
            item.symbolOrCode = code;
          }
        }

        if (code) {
          const navData = await MFApiService.getLatestNav(code);
          if (navData && navData.nav > 0) {
            item.currentPrice = navData.nav;
            item.currentValue = Math.round((Number(item.units) || 1) * navData.nav);
            item.lastSyncedAt = new Date().toISOString();
            savePromises.push(DB.saveAsset(item));
            updatedCount++;
          }
        }
      } catch (err) {
        errors.push(`Failed to sync MF ${item.name}: ${err.message}`);
      }
    });

    // Await both market quotes and mutual funds concurrently
    const [quotesMap] = await Promise.all([
      batchQuotesPromise,
      Promise.allSettled(mfPromises)
    ]);

    // Determine USD/INR exchange rate (default to 94.46 if not available)
    const usdQuote = quotesMap.get('USDINR=X');
    const usdInrRate = (usdQuote && usdQuote.price > 0) ? usdQuote.price : 94.46;

    // 3. Process Stocks & ETFs from the batch quotes map
    for (const item of tickerAssets) {
      try {
        const sym = (item.symbolOrCode || item.name).trim().toUpperCase();
        let quote = quotesMap.get(sym);
        if (!quote && !sym.includes('.')) {
          quote = quotesMap.get(`${sym}.NS`) || quotesMap.get(`${sym}.BO`);
        }

        if (quote && quote.price > 0) {
          let targetPrice = quote.price;

          // Convert USD to INR if instrument is quoted in USD
          if (quote.currency === 'USD' || (!item.symbolOrCode?.endsWith('.NS') && !item.symbolOrCode?.endsWith('.BO') && item.id.startsWith('ast_us_'))) {
            item.usdPrice = quote.price;
            item.usdRate = usdInrRate;
            item.currency = 'USD';
            item.usdCurrent = Math.round((Number(item.units) || 1) * quote.price * 100) / 100;
            if (item.usdBuyPrice) {
              item.usdInvested = Math.round((Number(item.units) || 1) * item.usdBuyPrice * 100) / 100;
            }
            targetPrice = targetPrice * usdInrRate;

            // Guard against unadjusted stock splits or ADR adjustments in user record units
            const refPrice = item.currentPrice || item.buyPrice;
            if (refPrice && targetPrice < refPrice * 0.25) {
              if (Math.abs(targetPrice * 10 - refPrice) < refPrice * 0.5) {
                targetPrice = targetPrice * 10;
              } else if (Math.abs(targetPrice * 5 - refPrice) < refPrice * 0.5) {
                targetPrice = targetPrice * 5;
              } else if (Math.abs(targetPrice * 2 - refPrice) < refPrice * 0.5) {
                targetPrice = targetPrice * 2;
              }
            }
          }

          item.currentPrice = Math.round(targetPrice * 100) / 100;
          item.currentValue = Math.round((Number(item.units) || 1) * item.currentPrice);
          if (!item.symbolOrCode && quote.symbol) item.symbolOrCode = quote.symbol;
          item.lastSyncedAt = new Date().toISOString();
          savePromises.push(DB.saveAsset(item));
          updatedCount++;
        }
      } catch (err) {
        errors.push(`Failed to sync stock ${item.name}: ${err.message}`);
      }
    }

    // Process Uninvested USD Cash / Buying Power
    const usCashAsset = assets.find(a => a.id === 'ast_us_cash');
    if (usCashAsset && usdInrRate > 0) {
      try {
        const usdBal = usCashAsset.usdCurrent || 2388.22;
        usCashAsset.usdBuyPrice = usdBal;
        usCashAsset.usdPrice = usdBal;
        usCashAsset.usdInvested = usdBal;
        usCashAsset.usdCurrent = usdBal;
        const inrVal = Math.round(usdBal * usdInrRate * 100) / 100;
        usCashAsset.buyPrice = inrVal;
        usCashAsset.investedValue = inrVal;
        usCashAsset.currentPrice = inrVal;
        usCashAsset.currentValue = inrVal;
        usCashAsset.lastSyncedAt = new Date().toISOString();
        savePromises.push(DB.saveAsset(usCashAsset));
        updatedCount++;
      } catch (err) {
        // Continue gracefully
      }
    }

    // 4. Process Lalitha Gold (linked to SGB or gold benchmark)
    const lalithaAsset = assets.find(a => a.id === 'ast_gold_lalitha');
    if (lalithaAsset) {
      try {
        const sgbAsset = assets.find(a => a.id === 'ast_cmd_sgb');
        const goldRatePerGram = sgbAsset?.currentPrice || 15379.14;
        lalithaAsset.currentPrice = goldRatePerGram;
        lalithaAsset.currentValue = Math.round((Number(lalithaAsset.units) || 6.056) * goldRatePerGram);
        lalithaAsset.lastSyncedAt = new Date().toISOString();
        savePromises.push(DB.saveAsset(lalithaAsset));
        updatedCount++;
      } catch (err) {
        errors.push(`Failed to sync Lalitha Gold: ${err.message}`);
      }
    }

    // 5. Process Fixed Deposits and Bonds (excluding LIC)
    const fdAssets = assets.filter(a => (a.category === 'fixed_deposit' || a.category === 'bond') && a.id !== 'ast_ins_lic' && a.id !== 'ast_ins_lic_jeevan_umang');
    for (const item of fdAssets) {
      try {
        const fdMath = CompoundingEngine.calculateFDAccrual({
          principal: item.investedValue || (item.units * item.buyPrice) || item.principal,
          annualRate: item.interestRate || 7.0,
          startDate: item.startDate,
          maturityDate: item.maturityDate,
          compounding: item.compoundingFreq || 'quarterly'
        });
        item.currentValue = fdMath.currentValue;
        item.maturityAmount = fdMath.maturityAmount;
        item.daysToMaturity = fdMath.daysToMaturity;
        item.lastSyncedAt = new Date().toISOString();
        savePromises.push(DB.saveAsset(item));
        updatedCount++;
      } catch (err) {
        errors.push(`Failed to calculate accrual for ${item.name}: ${err.message}`);
      }
    }

    // Await all database asset saves in parallel
    await Promise.allSettled(savePromises);

    return { updatedCount, errors };
  },

  /**
   * Compute comprehensive portfolio metrics
   */
  async getPortfolioSummary() {
    const assets = await this.getHoldings();

    let totalInvested = 0;
    let totalCurrentValue = 0;

    const categoryBreakdown = {};
    Object.keys(ASSET_CATEGORIES).forEach(k => {
      categoryBreakdown[k] = { invested: 0, current: 0, count: 0 };
    });

    assets.forEach(asset => {
      const inv = Number(asset.investedValue) || (Number(asset.units) * Number(asset.buyPrice)) || 0;
      let curr = Number(asset.currentValue);
      if ((!curr || isNaN(curr)) && asset.units && asset.currentPrice) {
        curr = Math.round(Number(asset.units) * Number(asset.currentPrice));
      }
      if (!curr || isNaN(curr)) curr = inv;

      totalInvested += inv;
      totalCurrentValue += curr;

      const catKey = ASSET_CATEGORIES[asset.category] ? asset.category : 'liquid_cash';
      if (!categoryBreakdown[catKey]) {
        categoryBreakdown[catKey] = { invested: 0, current: 0, count: 0 };
      }
      categoryBreakdown[catKey].invested += inv;
      categoryBreakdown[catKey].current += curr;
      categoryBreakdown[catKey].count += 1;
    });

    const totalProfit = totalCurrentValue - totalInvested;
    const returnPercentage = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;

    // Emergency fund liquid total (Savings + Liquid cash)
    const liquidTotal = categoryBreakdown['liquid_cash']?.current || 0;

    return {
      totalInvested,
      totalCurrentValue,
      totalProfit,
      returnPercentage: Number(returnPercentage.toFixed(2)),
      assetCount: assets.length,
      categoryBreakdown,
      liquidTotal
    };
  },

  /**
   * Seed or restore the official 53-instrument portfolio and 28-month historical timeline.
   */
  async seedOfficialPortfolio(force = false) {
    const existingAssets = await DB.getAllAssets();
    if (!force && existingAssets.length > 0) {
      return false;
    }

    await DB.clearAll();

    for (const h of INITIAL_HOLDINGS) {
      await DB.saveAsset(h);
    }

    for (const s of INITIAL_SNAPSHOTS) {
      await DB.saveSnapshot(s);
    }

    return true;
  }
};
