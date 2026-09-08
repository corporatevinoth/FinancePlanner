/**
 * predictor.js - Wealth Projection & Forecasting Engine
 * Models future net worth trajectories over 6, 12, 24, and 36 months
 * across Conservative, Moderate, and Aggressive scenarios.
 */

import { PortfolioService } from './portfolio.js';
import { DB } from '../db.js';

export const PredictorService = {
  /**
   * Run future wealth simulation
   * @param {Object} options
   * @param {number} [options.monthlySavings] - Monthly fresh savings from salary
   * @param {number} [options.months=12] - Projection horizon in months (6, 12, 24, 36)
   * @param {number} [options.salaryStepUpPct=10] - Annual salary/SIP increment percentage
   */
  async generateProjection({ monthlySavings = null, months = 12, salaryStepUpPct = 10 } = {}) {
    const summary = await PortfolioService.getPortfolioSummary();
    const currentNetWorth = summary.totalCurrentValue || 0;

    // Get default monthly savings target from settings if not passed
    const defaultMonthlySavings = await DB.getSetting('monthlySalaryTarget', 35000);
    const savingsRate = monthlySavings !== null ? Number(monthlySavings) : defaultMonthlySavings;

    // Determine portfolio baseline annual return rate
    // If user has existing holdings with returns, use that; else default to 10.5%
    let baselineAnnualReturn = 10.5;
    if (summary.returnPercentage > 0 && summary.returnPercentage < 35) {
      baselineAnnualReturn = Math.max(8.0, summary.returnPercentage);
    }

    // Scenarios annual CAGR:
    // 1. Conservative (Worst Case): Weak equity market, safe debt yield only ~ 5.0%
    const rateConservative = 5.0 / 100;
    // 2. Moderate (Current Pace): Standard historical expected CAGR ~ 11.0%
    const rateModerate = Math.max(10.0, baselineAnnualReturn) / 100;
    // 3. Aggressive (Bull Market): Bull run + 10% annual salary step-up ~ 16.0%
    const rateAggressive = 16.0 / 100;

    // Monthly rates
    const monthlyRateCons = Math.pow(1 + rateConservative, 1 / 12) - 1;
    const monthlyRateMod = Math.pow(1 + rateModerate, 1 / 12) - 1;
    const monthlyRateAgg = Math.pow(1 + rateAggressive, 1 / 12) - 1;

    const labels = ['Now'];
    const investedCurve = [currentNetWorth];
    const conservativeCurve = [currentNetWorth];
    const moderateCurve = [currentNetWorth];
    const aggressiveCurve = [currentNetWorth];

    let runningInvested = currentNetWorth;
    let runningCons = currentNetWorth;
    let runningMod = currentNetWorth;
    let runningAgg = currentNetWorth;

    const startDate = new Date();

    for (let m = 1; m <= months; m++) {
      const futureDate = new Date(startDate.getFullYear(), startDate.getMonth() + m, 1);
      const labelStr = futureDate.toLocaleDateString('default', { month: 'short', year: '2-digit' });
      labels.push(labelStr);

      // Salary Step-Up (every 12 months, savings increase by stepUpPct)
      const yearMultiplier = Math.floor((m - 1) / 12);
      const stepUpFactor = Math.pow(1 + (salaryStepUpPct / 100), yearMultiplier);
      const effectiveSavingsThisMonth = savingsRate * stepUpFactor;

      runningInvested += savingsRate;

      // Compound existing balance + add fresh savings
      runningCons = (runningCons * (1 + monthlyRateCons)) + savingsRate;
      runningMod = (runningMod * (1 + monthlyRateMod)) + savingsRate;
      runningAgg = (runningAgg * (1 + monthlyRateAgg)) + effectiveSavingsThisMonth;

      investedCurve.push(Math.round(runningInvested));
      conservativeCurve.push(Math.round(runningCons));
      moderateCurve.push(Math.round(runningMod));
      aggressiveCurve.push(Math.round(runningAgg));
    }

    // Milestones detection
    const endConservative = conservativeCurve[conservativeCurve.length - 1];
    const endModerate = moderateCurve[moderateCurve.length - 1];
    const endAggressive = aggressiveCurve[aggressiveCurve.length - 1];

    return {
      currentNetWorth,
      monthlySavings: savingsRate,
      months,
      labels,
      series: {
        invested: investedCurve,
        conservative: conservativeCurve,
        moderate: moderateCurve,
        aggressive: aggressiveCurve
      },
      outcomes: {
        conservative: endConservative,
        moderate: endModerate,
        aggressive: endAggressive,
        gainConservative: endConservative - runningInvested,
        gainModerate: endModerate - runningInvested,
        gainAggressive: endAggressive - runningInvested
      }
    };
  }
};
