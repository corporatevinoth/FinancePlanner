/**
 * snapshot.js - Monthly Review Day & Snapshot Engine
 * Decouples Fresh Salary Investments (Discipline) from Organic Market Returns (Compounding).
 */

import { DB } from '../db.js';
import { PortfolioService } from './portfolio.js';

export const SnapshotService = {
  /**
   * Check if user has already taken a snapshot for current calendar month
   */
  async isCurrentMonthReviewed() {
    const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
    const snapshot = await DB.getSnapshotByMonth(currentMonth);
    return !!snapshot;
  },

  /**
   * Get all historical snapshots sorted chronologically
   */
  async getHistory() {
    const all = await DB.getAllSnapshots();
    return all
      .filter(s => s.totalNetWorth && Number(s.totalNetWorth) > 0 && s.month <= '2026-12')
      .sort((a, b) => a.month.localeCompare(b.month));
  },

  /**
   * Automatically synchronize the current month's snapshot with live holdings.
   * Ensures the Dashboard total net worth and Compounding Journey chart match 100%.
   */
  async syncLiveSnapshot() {
    const assets = await PortfolioService.getHoldings();
    if (!assets || assets.length === 0) return null;

    const summary = await PortfolioService.getPortfolioSummary();
    const currentMonth = new Date().toISOString().substring(0, 7);
    const allSnapshots = await DB.getAllSnapshots();

    let currentSnap = allSnapshots.find(s => s.month === currentMonth);

    const prevSnapshots = allSnapshots
      .filter(s => s.month < currentMonth)
      .sort((a, b) => a.month.localeCompare(b.month));
    const prevSnap = prevSnapshots.length > 0 ? prevSnapshots[prevSnapshots.length - 1] : null;

    const prevNetWorth = prevSnap ? prevSnap.totalNetWorth : summary.totalInvested;
    const netChange = summary.totalCurrentValue - prevNetWorth;
    const freshSalary = currentSnap ? (Number(currentSnap.freshSalaryAdded) || 0) : 0;
    const organic = netChange - freshSalary;

    if (currentSnap &&
        Math.abs(Number(currentSnap.totalNetWorth) - summary.totalCurrentValue) < 1 &&
        Math.abs(Number(currentSnap.totalInvested) - summary.totalInvested) < 1 &&
        Number(currentSnap.freshSalaryAdded || 0) === freshSalary) {
      return currentSnap;
    }

    const updatedSnapshot = {
      month: currentMonth,
      date: new Date().toISOString(),
      totalNetWorth: summary.totalCurrentValue,
      totalInvested: summary.totalInvested,
      freshSalaryAdded: freshSalary,
      organicMarketGain: Math.round(organic),
      netChange: Math.round(netChange),
      notes: currentSnap?.notes || 'Live Portfolio Valuation',
      categoryBreakdown: summary.categoryBreakdown,
      holdings: assets.map(a => ({
        id: a.id,
        name: a.name,
        category: a.category,
        units: a.units || 1,
        price: a.currentPrice || a.buyPrice || 0,
        invested: a.investedValue || 0,
        current: a.currentValue || Math.round((a.units || 1) * (a.currentPrice || 0)) || a.investedValue || 0
      }))
    };

    await DB.saveSnapshot(updatedSnapshot);
    return updatedSnapshot;
  },

  /**
   * Record a new monthly snapshot
   * @param {Object} params
   * @param {string} params.month - "YYYY-MM"
   * @param {number} params.freshSalaryAdded - New money invested from salary this month
   * @param {string} [params.notes=""]
   */
  async recordSnapshot({ month, freshSalaryAdded = 0, notes = '' }) {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      throw new Error('Invalid month format. Please use YYYY-MM.');
    }

    const summary = await PortfolioService.getPortfolioSummary();
    const assets = await PortfolioService.getHoldings();

    // Get previous snapshot to compute true MoM organic return
    const allSnapshots = await DB.getAllSnapshots();
    const previousSnapshots = allSnapshots
      .filter(s => s.month < month)
      .sort((a, b) => a.month.localeCompare(b.month));

    const prevSnapshot = previousSnapshots.length > 0 ? previousSnapshots[previousSnapshots.length - 1] : null;

    const currentTotalValue = summary.totalCurrentValue;
    const prevTotalValue = prevSnapshot ? prevSnapshot.totalNetWorth : summary.totalInvested;

    // Organic Gain = End Value - (Start Value + Fresh Money Injected)
    const organicMarketGain = prevSnapshot
      ? currentTotalValue - (prevTotalValue + Number(freshSalaryAdded))
      : summary.totalProfit;

    const netChange = currentTotalValue - prevTotalValue;

    const snapshot = {
      month,
      date: new Date().toISOString(),
      totalNetWorth: currentTotalValue,
      totalInvested: summary.totalInvested,
      freshSalaryAdded: Number(freshSalaryAdded) || 0,
      organicMarketGain: Math.round(organicMarketGain),
      netChange: Math.round(netChange),
      notes: notes || '',
      categoryBreakdown: summary.categoryBreakdown,
      holdings: assets.map(a => ({
        id: a.id,
        name: a.name,
        category: a.category,
        units: a.units,
        price: a.currentPrice,
        invested: a.investedValue,
        current: a.currentValue
      }))
    };

    await DB.saveSnapshot(snapshot);
    return snapshot;
  },

  /**
   * Delete a snapshot
   */
  async deleteSnapshot(month) {
    return await DB.deleteSnapshot(month);
  },

  /**
   * Calculate Year-on-Year and Month-on-Month metrics for dashboard
   */
  async getGrowthAnalytics() {
    const snapshots = await this.getHistory();
    if (snapshots.length === 0) return null;

    const latest = snapshots[snapshots.length - 1];
    const prevMonth = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;

    // YoY comparison: Find snapshot from 12 months ago
    const currentYear = parseInt(latest.month.substring(0, 4), 10);
    const currentMonthNum = latest.month.substring(5, 7);
    const targetYoYMonth = `${currentYear - 1}-${currentMonthNum}`;
    const yoySnapshot = snapshots.find(s => s.month === targetYoYMonth) || snapshots[0];

    const momDelta = prevMonth ? latest.totalNetWorth - prevMonth.totalNetWorth : (latest.netChange || 0);
    const momPercent = prevMonth && prevMonth.totalNetWorth > 0
      ? ((momDelta / prevMonth.totalNetWorth) * 100).toFixed(2)
      : '0.0';

    const yoyDelta = yoySnapshot && yoySnapshot !== latest ? latest.totalNetWorth - yoySnapshot.totalNetWorth : 0;
    const yoyPercent = yoySnapshot && yoySnapshot.totalNetWorth > 0 && yoySnapshot !== latest
      ? ((yoyDelta / yoySnapshot.totalNetWorth) * 100).toFixed(2)
      : '0.0';

    return {
      latest,
      prevMonth,
      yoySnapshot,
      momDelta: Math.round(momDelta * 100) / 100,
      momPercent: Number(momPercent),
      yoyDelta: Math.round(yoyDelta * 100) / 100,
      yoyPercent: Number(yoyPercent)
    };
  }
};
