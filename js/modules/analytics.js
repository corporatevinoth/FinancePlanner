/**
 * analytics.js - Investment Intelligence & Reallocation Advisor
 * Detects underperforming "dead capital", checks asset allocation drift,
 * and calculates emergency runway.
 */

import { PortfolioService, ASSET_CATEGORIES } from './portfolio.js';
import { DB } from '../db.js';

export const AnalyticsService = {
  /**
   * Evaluate all individual holdings to identify top performers and laggards
   * @param {number} [benchmarkRate=7.0] - Risk-free benchmark annual rate (e.g. 7% FD rate)
   */
  async evaluateHoldings(benchmarkRate = 7.0) {
    const assets = await PortfolioService.getHoldings();
    if (!assets || assets.length === 0) return { topPerformers: [], laggards: [], all: [] };

    const evaluated = assets.map(asset => {
      const invested = Number(asset.investedValue) || (asset.units * asset.buyPrice) || 1;
      const current = Number(asset.currentValue) || invested;
      const profit = current - invested;
      const returnPct = invested > 0 ? (profit / invested) * 100 : 0;

      // Classify status
      let status = 'normal'; // 'stellar', 'healthy', 'warning', 'critical'
      let recommendation = '';

      if (asset.category === 'liquid_cash') {
        status = 'liquid';
        recommendation = 'Liquid capital for emergency runway and planned expenses.';
      } else if (returnPct >= 12.0) {
        status = 'stellar';
        recommendation = 'Strong compounding driver. Continue disciplined holding.';
      } else if (returnPct >= benchmarkRate) {
        status = 'healthy';
        recommendation = 'Performing above safe risk-free benchmark.';
      } else if (returnPct >= 0) {
        status = 'warning';
        recommendation = `Trailing risk-free FD benchmark (${benchmarkRate}%). Consider reviewing fund strategy.`;
      } else {
        status = 'critical';
        recommendation = `Negative returns (${returnPct.toFixed(1)}%). Review asset fundamentals or tax-loss harvesting.`;
      }

      return {
        ...asset,
        profit,
        returnPct: Number(returnPct.toFixed(2)),
        status,
        recommendation
      };
    });

    // Sort by return percentage descending
    const sorted = [...evaluated].sort((a, b) => b.returnPct - a.returnPct);
    const topPerformers = sorted.filter(a => a.status === 'stellar' || a.status === 'healthy').slice(0, 5);
    const laggards = sorted.filter(a => a.status === 'warning' || a.status === 'critical');

    return {
      topPerformers,
      laggards,
      all: sorted
    };
  },

  /**
   * Check asset allocation drift against target risk profile
   */
  async checkAllocationDrift() {
    const summary = await PortfolioService.getPortfolioSummary();
    const total = summary.totalCurrentValue;

    if (total <= 0) return { target: {}, current: {}, drift: {}, tips: [] };

    // Get target allocation from settings (default 50% Equity, 25% Debt, 15% Gold, 10% Cash)
    const target = await DB.getSetting('targetAllocation', {
      equity: 50,
      debt: 25,
      gold: 15,
      cash: 10
    });

    // Compute actual percentages
    const cats = summary.categoryBreakdown;
    const equityVal = cats.equity_stock.current + cats.equity_mf.current;
    const debtVal = cats.fixed_deposit.current + cats.bond.current;
    const goldVal = cats.gold.current;
    const cashVal = cats.liquid_cash.current;

    const current = {
      equity: Number(((equityVal / total) * 100).toFixed(1)),
      debt: Number(((debtVal / total) * 100).toFixed(1)),
      gold: Number(((goldVal / total) * 100).toFixed(1)),
      cash: Number(((cashVal / total) * 100).toFixed(1))
    };

    const drift = {
      equity: Number((current.equity - target.equity).toFixed(1)),
      debt: Number((current.debt - target.debt).toFixed(1)),
      gold: Number((current.gold - target.gold).toFixed(1)),
      cash: Number((current.cash - target.cash).toFixed(1))
    };

    // Generate smart rebalancing suggestions
    const tips = [];
    if (drift.equity > 8) {
      tips.push({
        type: 'rebalance',
        badge: 'Equity Overweight',
        message: `Equities are ${current.equity}% of your portfolio (Target: ${target.equity}%). Consider directing fresh salary savings to Debt or Gold to lock in gains.`
      });
    } else if (drift.equity < -8) {
      tips.push({
        type: 'opportunity',
        badge: 'Equity Underweight',
        message: `Equities are only ${current.equity}% (Target: ${target.equity}%). Good opportunity to step up monthly mutual fund SIPs.`
      });
    }

    if (drift.cash < -5) {
      tips.push({
        type: 'warning',
        badge: 'Low Cash Buffer',
        message: `Cash reserves are at ${current.cash}% (Target: ${target.cash}%). Replenish your liquid emergency fund.`
      });
    }

    return { target, current, drift, tips };
  },

  /**
   * Emergency Runway calculation
   */
  async getEmergencyRunway() {
    const summary = await PortfolioService.getPortfolioSummary();
    const monthlyExpense = await DB.getSetting('emergencyMonthlyExpense', 40000);

    const liquidCash = summary.liquidTotal;
    const runwayMonths = monthlyExpense > 0 ? (liquidCash / monthlyExpense).toFixed(1) : '0';

    let health = 'safe'; // 'safe', 'moderate', 'alert'
    if (runwayMonths < 3) health = 'alert';
    else if (runwayMonths < 6) health = 'moderate';

    return {
      monthlyExpense,
      liquidCash,
      runwayMonths: Number(runwayMonths),
      health
    };
  }
};
