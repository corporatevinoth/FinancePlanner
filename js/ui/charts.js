/**
 * charts.js - Chart.js Visualization Suite
 * Implements Compounding Journey Area, Asset Donut, Monthly Growth Waterfall, and Wealth Predictor.
 */

import { UI } from './components.js';

// Chart instance cache to destroy previous instances before re-rendering
const chartInstances = {};

export const ChartManager = {
  /**
   * Helper to safely destroy existing chart on a canvas
   */
  destroyIfExists(canvasId) {
    if (chartInstances[canvasId]) {
      chartInstances[canvasId].destroy();
      delete chartInstances[canvasId];
    }
  },

  /**
   * 1. Compounding Journey Area Chart
   * Displays Cumulative Invested Capital vs Total Market Net Worth
   */
  renderJourneyChart(canvasId, snapshots) {
    this.destroyIfExists(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx || !window.Chart) return;

    if (!snapshots || snapshots.length === 0) {
      // Empty state
      return;
    }

    const labels = snapshots.map(s => s.month);
    const investedData = snapshots.map(s => s.totalInvested || Math.round((s.totalNetWorth || 0) * 0.82));
    const netWorthData = snapshots.map(s => s.totalNetWorth || 0);

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#9CA3AF' : '#6B7280';
    const gridColor = isDark ? 'rgba(75, 85, 99, 0.2)' : 'rgba(229, 231, 235, 0.8)';

    chartInstances[canvasId] = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Total Net Worth',
            data: netWorthData,
            borderColor: '#10B981', // Emerald
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            fill: true,
            tension: 0.35,
            borderWidth: 2.5,
            pointRadius: snapshots.length > 24 ? 0 : 3,
            pointHoverRadius: 6,
            pointBackgroundColor: '#10B981'
          },
          {
            label: 'Total Invested Capital',
            data: investedData,
            borderColor: '#6366F1', // Indigo
            backgroundColor: 'transparent',
            borderDash: [5, 5],
            fill: false,
            tension: 0.2,
            borderWidth: 2,
            pointRadius: snapshots.length > 24 ? 0 : 2,
            pointHoverRadius: 5,
            pointBackgroundColor: '#6366F1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: textColor, font: { family: 'Inter', size: 12 } }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.dataset.label || '';
                const val = context.raw || 0;
                return ` ${label}: ${UI.formatCurrency(val)}`;
              },
              afterBody: (tooltipItems) => {
                if (tooltipItems.length >= 2) {
                  const netWorth = tooltipItems[0].raw;
                  const invested = tooltipItems[1].raw;
                  const profit = netWorth - invested;
                  const pct = invested > 0 ? ((profit / invested) * 100).toFixed(1) : 0;
                  return [` Compounding Gain: ${UI.formatCurrency(profit)} (${pct}%)`];
                }
                return [];
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { family: 'Inter' } }
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { family: 'Inter' },
              callback: (value) => UI.formatCompactCurrency(value)
            }
          }
        }
      }
    });
  },

  /**
   * 2. Asset Allocation Donut Chart
   */
  renderAllocationChart(canvasId, categoryBreakdown) {
    this.destroyIfExists(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx || !window.Chart) return;

    const labels = [];
    const dataValues = [];
    const colors = [];

    const colorConfig = {
      equity_stock: { label: 'Direct Stocks', color: '#3B82F6' },
      equity_mf: { label: 'Mutual Funds', color: '#6366F1' },
      fixed_deposit: { label: 'Fixed Deposits', color: '#10B981' },
      bond: { label: 'Bonds & PPF', color: '#14B8A6' },
      gold: { label: 'Gold', color: '#F59E0B' },
      liquid_cash: { label: 'Emergency Cash', color: '#8B5CF6' }
    };

    let totalVal = 0;
    Object.keys(categoryBreakdown).forEach(key => {
      const item = categoryBreakdown[key];
      if (item && item.current > 0) {
        labels.push(colorConfig[key]?.label || key);
        dataValues.push(item.current);
        colors.push(colorConfig[key]?.color || '#9CA3AF');
        totalVal += item.current;
      }
    });

    if (totalVal === 0) return;

    const isDark = document.documentElement.classList.contains('dark');

    chartInstances[canvasId] = new window.Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data: dataValues,
            backgroundColor: colors,
            borderColor: isDark ? '#1F2937' : '#FFFFFF',
            borderWidth: 2,
            hoverOffset: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: isDark ? '#9CA3AF' : '#4B5563',
              boxWidth: 12,
              font: { family: 'Inter', size: 11 }
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const val = context.raw || 0;
                const pct = totalVal > 0 ? ((val / totalVal) * 100).toFixed(1) : 0;
                return ` ${context.label}: ${UI.formatCurrency(val)} (${pct}%)`;
              }
            }
          }
        }
      }
    });
  },

  /**
   * 3. Monthly Growth Waterfall / Bar Chart
   * Green for positive growth months, red for negative
   */
  renderGrowthWaterfallChart(canvasId, snapshots) {
    this.destroyIfExists(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx || !window.Chart) return;

    if (!snapshots || snapshots.length === 0) return;

    // Show last 12 snapshots if available
    const displaySnapshots = snapshots.slice(-12);
    const labels = displaySnapshots.map(s => s.month);
    const growthValues = displaySnapshots.map(s => {
      if (s.netChange !== undefined && s.netChange !== null && s.netChange !== 0) {
        return s.netChange;
      }
      if (s.organicMarketGain !== undefined && s.organicMarketGain !== null && s.organicMarketGain !== 0) {
        return s.organicMarketGain;
      }
      const sIdx = snapshots.indexOf(s);
      if (sIdx > 0 && snapshots[sIdx - 1]?.totalNetWorth) {
        return Math.round((s.totalNetWorth - snapshots[sIdx - 1].totalNetWorth) * 100) / 100;
      }
      return s.netChange || 0;
    });

    const backgroundColors = growthValues.map(v => v >= 0 ? 'rgba(16, 185, 129, 0.85)' : 'rgba(239, 68, 68, 0.85)');
    const borderColors = growthValues.map(v => v >= 0 ? '#10B981' : '#EF4444');

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#9CA3AF' : '#6B7280';
    const gridColor = isDark ? 'rgba(75, 85, 99, 0.2)' : 'rgba(229, 231, 235, 0.8)';

    chartInstances[canvasId] = new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Monthly Net Change',
            data: growthValues,
            backgroundColor: backgroundColors,
            borderColor: borderColors,
            borderWidth: 1,
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => `Month: ${items[0].label}`,
              label: (context) => {
                const s = displaySnapshots[context.dataIndex];
                const delta = context.raw || 0;
                const fresh = s ? s.freshSalaryAdded || 0 : 0;
                const organic = s ? s.organicMarketGain || (delta - fresh) : 0;
                return [
                  ` Net Delta: ${UI.formatCurrency(delta)}`,
                  ` • Fresh Salary Added: ${UI.formatCurrency(fresh)}`,
                  ` • Organic Market Return: ${UI.formatCurrency(organic)}`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: textColor, font: { family: 'Inter' } }
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { family: 'Inter' },
              callback: (value) => UI.formatCompactCurrency(value)
            }
          }
        }
      }
    });
  },

  /**
   * 4. Wealth Prediction Trajectory Chart
   */
  renderPredictionChart(canvasId, projectionData) {
    this.destroyIfExists(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx || !window.Chart || !projectionData) return;

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#9CA3AF' : '#6B7280';
    const gridColor = isDark ? 'rgba(75, 85, 99, 0.2)' : 'rgba(229, 231, 235, 0.8)';

    chartInstances[canvasId] = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels: projectionData.labels,
        datasets: [
          {
            label: 'Aggressive (Bull + Step-Up)',
            data: projectionData.series.aggressive,
            borderColor: '#10B981', // Emerald
            backgroundColor: 'transparent',
            borderWidth: 2.5,
            tension: 0.3,
            pointRadius: 3
          },
          {
            label: 'Moderate (Current Pace)',
            data: projectionData.series.moderate,
            borderColor: '#3B82F6', // Blue
            backgroundColor: 'transparent',
            borderWidth: 2.5,
            tension: 0.3,
            pointRadius: 3
          },
          {
            label: 'Conservative (Worst Case)',
            data: projectionData.series.conservative,
            borderColor: '#F59E0B', // Amber
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [4, 4],
            tension: 0.3,
            pointRadius: 2
          },
          {
            label: 'Invested Baseline',
            data: projectionData.series.invested,
            borderColor: '#9CA3AF', // Gray
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            borderDash: [2, 2],
            tension: 0.1,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: textColor, font: { family: 'Inter', size: 11 } }
          },
          tooltip: {
            callbacks: {
              label: (context) => ` ${context.dataset.label}: ${UI.formatCurrency(context.raw)}`
            }
          }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { family: 'Inter' } }
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { family: 'Inter' },
              callback: (value) => UI.formatCompactCurrency(value)
            }
          }
        }
      }
    });
  },

  /**
   * 5. Gold Price 6-Month Forecast Cone Chart
   * Displays Historical Gold Price + Forecast Median + Shaded 90% Confidence Interval + Bull/Bear Scenarios
   */
  renderGoldForecastCone(canvasId, historicalSeries, forecastData, currency = 'USD') {
    this.destroyIfExists(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx || !window.Chart || !forecastData) return;

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#9CA3AF' : '#6B7280';
    const gridColor = isDark ? 'rgba(75, 85, 99, 0.2)' : 'rgba(229, 231, 235, 0.8)';
    const currPrefix = currency === 'INR' ? '₹' : '$';

    // Format currency helper
    const fmt = (val) => {
      if (val === null || val === undefined || isNaN(val)) return '';
      if (currency === 'INR') {
        return '₹' + Math.round(val).toLocaleString('en-IN');
      }
      return '$' + Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Prepare labels and data points
    // Historical
    const history = historicalSeries || [];
    const histLabels = history.map(h => h.date ? h.date.substring(5) : '');
    const histPrices = history.map(h => h.price);

    const lastHistPrice = histPrices.length > 0 ? histPrices[histPrices.length - 1] : forecastData.current_price;
    const lastHistLabel = histLabels.length > 0 ? histLabels[histLabels.length - 1] : 'Today';

    // Horizons: 1d, 7d, 30d, 90d, 180d
    const horizons = ['1d', '7d', '30d', '90d', '180d'];
    const forecastDates = horizons.map(h => {
      const f = forecastData.horizons?.[h];
      return f && f.target_date ? f.target_date.substring(5) : `+${h}`;
    });

    const combinedLabels = [...histLabels, ...forecastDates];

    // Build arrays aligned to combinedLabels
    // 1. History dataset (null after history)
    const histData = [...histPrices];
    for (let i = 0; i < forecastDates.length; i++) histData.push(null);

    // 2. Base/Median projection: connects from lastHistPrice to forecast points
    const baseData = new Array(histPrices.length - 1).fill(null);
    baseData.push(lastHistPrice);
    horizons.forEach(h => {
      const f = forecastData.horizons?.[h];
      const pUsd = f ? (f.predictedPriceUsd ?? f.target_price ?? null) : null;
      const pInr = f ? (f.domesticInr?.predicted24k10g ?? f.target_price_inr ?? (pUsd ? Math.round(pUsd * 84 * 1.09) : null)) : null;
      const p = currency === 'INR' ? pInr : pUsd;
      baseData.push(p);
    });

    // 3. 90% CI Lower
    const ciLowerData = new Array(histPrices.length - 1).fill(null);
    ciLowerData.push(lastHistPrice);
    horizons.forEach(h => {
      const f = forecastData.horizons?.[h];
      let p = null;
      if (f) {
        const pUsd = f.predictedPriceUsd ?? f.target_price;
        const lowUsd = f.lowerBoundUsd ?? f.ci_90?.[0] ?? (pUsd ? pUsd * 0.95 : null);
        const lowInr = f.domesticInr?.predicted24k10g ? Math.round(f.domesticInr.predicted24k10g * 0.95) : (f.ci_90_inr ? f.ci_90_inr[0] : (lowUsd ? Math.round(lowUsd * 84 * 1.09) : null));
        p = currency === 'INR' ? lowInr : lowUsd;
      }
      ciLowerData.push(p);
    });

    // 4. 90% CI Upper
    const ciUpperData = new Array(histPrices.length - 1).fill(null);
    ciUpperData.push(lastHistPrice);
    horizons.forEach(h => {
      const f = forecastData.horizons?.[h];
      let p = null;
      if (f) {
        const pUsd = f.predictedPriceUsd ?? f.target_price;
        const highUsd = f.upperBoundUsd ?? f.ci_90?.[1] ?? (pUsd ? pUsd * 1.05 : null);
        const highInr = f.domesticInr?.predicted24k10g ? Math.round(f.domesticInr.predicted24k10g * 1.05) : (f.ci_90_inr ? f.ci_90_inr[1] : (highUsd ? Math.round(highUsd * 84 * 1.09) : null));
        p = currency === 'INR' ? highInr : highUsd;
      }
      ciUpperData.push(p);
    });

    // 5. Bull Scenario
    const bullData = new Array(histPrices.length - 1).fill(null);
    bullData.push(lastHistPrice);
    horizons.forEach(h => {
      const f = forecastData.horizons?.[h];
      let p = null;
      if (f) {
        const b = f.scenarios?.bullCase || f.scenarios?.bull;
        if (b) {
          const bUsd = b.targetUsd ?? b.price;
          const bInr = b.targetInr24k10g ?? b.price_inr ?? (bUsd ? Math.round(bUsd * 84 * 1.09) : null);
          p = currency === 'INR' ? bInr : bUsd;
        }
      }
      bullData.push(p);
    });

    // 6. Bear Scenario
    const bearData = new Array(histPrices.length - 1).fill(null);
    bearData.push(lastHistPrice);
    horizons.forEach(h => {
      const f = forecastData.horizons?.[h];
      let p = null;
      if (f) {
        const b = f.scenarios?.bearCase || f.scenarios?.bear;
        if (b) {
          const bUsd = b.targetUsd ?? b.price;
          const bInr = b.targetInr24k10g ?? b.price_inr ?? (bUsd ? Math.round(bUsd * 84 * 1.09) : null);
          p = currency === 'INR' ? bInr : bUsd;
        }
      }
      bearData.push(p);
    });

    chartInstances[canvasId] = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels: combinedLabels,
        datasets: [
          {
            label: 'Historical Actual',
            data: histData,
            borderColor: '#F59E0B', // Amber / Gold
            backgroundColor: 'rgba(245, 158, 11, 0.08)',
            borderWidth: 2.2,
            tension: 0.15,
            pointRadius: (ctx) => (ctx.dataIndex === histPrices.length - 1 ? 5 : 0),
            pointBackgroundColor: '#F59E0B',
            pointBorderColor: '#fff',
            pointBorderWidth: 1.5
          },
          {
            label: 'Lower 90% CI',
            data: ciLowerData,
            borderColor: 'transparent',
            backgroundColor: 'transparent',
            pointRadius: 0,
            tension: 0.25,
            fill: false
          },
          {
            label: '90% Confidence Interval',
            data: ciUpperData,
            borderColor: 'transparent',
            backgroundColor: isDark ? 'rgba(234, 179, 8, 0.12)' : 'rgba(245, 158, 11, 0.18)',
            pointRadius: 0,
            tension: 0.25,
            fill: '-1' // Fills to Lower 90% CI dataset above
          },
          {
            label: 'Base Forecast (Median)',
            data: baseData,
            borderColor: '#3B82F6', // Blue
            backgroundColor: 'transparent',
            borderWidth: 2.5,
            borderDash: [5, 4],
            tension: 0.25,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: '#3B82F6'
          },
          {
            label: 'Bull Scenario (25% Prob)',
            data: bullData,
            borderColor: '#10B981', // Emerald
            backgroundColor: 'transparent',
            borderWidth: 1.8,
            borderDash: [3, 3],
            tension: 0.25,
            pointRadius: 3,
            pointBackgroundColor: '#10B981'
          },
          {
            label: 'Bear Scenario (20% Prob)',
            data: bearData,
            borderColor: '#EF4444', // Red
            backgroundColor: 'transparent',
            borderWidth: 1.8,
            borderDash: [3, 3],
            tension: 0.25,
            pointRadius: 3,
            pointBackgroundColor: '#EF4444'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: textColor,
              font: { family: 'Inter', size: 11 },
              filter: (item) => item.text !== 'Lower 90% CI' // Hide dummy dataset from legend
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                if (context.dataset.label === 'Lower 90% CI') return null;
                if (context.raw === null || context.raw === undefined) return null;
                return ` ${context.dataset.label}: ${fmt(context.raw)}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { family: 'Inter', size: 10 },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 12
            }
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { family: 'Inter', size: 11 },
              callback: (value) => fmt(value)
            }
          }
        }
      }
    });
  },

  /**
   * 6. Actual vs Predicted Tracking Chart
   * Compares historical target dates with actual realized prices and predicted prices
   */
  renderActualVsPredictedChart(canvasId, ledgerRecords, currency = 'USD') {
    this.destroyIfExists(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx || !window.Chart || !ledgerRecords || ledgerRecords.length === 0) return;

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#9CA3AF' : '#6B7280';
    const gridColor = isDark ? 'rgba(75, 85, 99, 0.2)' : 'rgba(229, 231, 235, 0.8)';

    const sorted = [...ledgerRecords].sort((a, b) => new Date(a.target_date) - new Date(b.target_date));
    const labels = sorted.map(r => r.target_date ? r.target_date.substring(5) : r.forecast_horizon);

    const fmt = (val) => {
      if (val === null || val === undefined) return 'N/A';
      return currency === 'INR'
        ? '₹' + Math.round(val).toLocaleString('en-IN')
        : '$' + Number(val).toFixed(2);
    };

    const actuals = sorted.map(r => (r.actual_price !== undefined && r.actual_price !== null ? r.actual_price : r.actual_price_at_target));
    const predicted = sorted.map(r => (r.predicted_price ?? r.predicted_price_usd ?? r.target_price ?? 0));
    const pointColors = sorted.map(r => {
      if (r.directional_hit === true) return '#10B981'; // Green
      if (r.directional_hit === false) return '#EF4444'; // Red
      return '#3B82F6'; // Pending
    });

    chartInstances[canvasId] = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Actual Realized Price',
            data: actuals,
            borderColor: '#F59E0B',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            borderWidth: 2.2,
            tension: 0.2,
            pointRadius: 4,
            pointBackgroundColor: '#F59E0B'
          },
          {
            label: 'Model Predicted Price',
            data: predicted,
            borderColor: '#6366F1',
            borderDash: [4, 4],
            backgroundColor: 'transparent',
            borderWidth: 2,
            tension: 0.2,
            pointRadius: 5,
            pointBackgroundColor: pointColors,
            pointBorderColor: '#fff',
            pointBorderWidth: 1.5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: textColor, font: { family: 'Inter', size: 11 } }
          },
          tooltip: {
            callbacks: {
              afterBody: (items) => {
                const idx = items[0]?.dataIndex;
                const rec = sorted[idx];
                if (!rec) return [];
                const lines = [` Horizon: ${rec.prediction_horizon || rec.forecast_horizon || '--'}`];
                if (rec.directional_hit !== undefined) {
                  lines.push(` Directional Call: ${rec.directional_hit ? 'HIT ✓' : 'MISSED ✗'}`);
                }
                const actPrice = rec.actual_price ?? rec.actual_price_at_target;
                const predPrice = rec.predicted_price ?? rec.predicted_price_usd;
                if (actPrice && predPrice) {
                  const err = actPrice - predPrice;
                  const errPct = ((err / actPrice) * 100).toFixed(2);
                  lines.push(` Error: ${fmt(err)} (${errPct}%)`);
                }
                return lines;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { family: 'Inter', size: 10 } }
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { family: 'Inter', size: 11 },
              callback: (val) => fmt(val)
            }
          }
        }
      }
    });
  },

  /**
   * 7. SHAP-style Factor Attribution Horizontal Bar Chart
   * Displays the % contribution of each macro/structural factor to the price delta
   */
  renderFactorContributionChart(canvasId, factorAttribution) {
    this.destroyIfExists(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx || !window.Chart || !factorAttribution) return;

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#9CA3AF' : '#6B7280';
    const gridColor = isDark ? 'rgba(75, 85, 99, 0.2)' : 'rgba(229, 231, 235, 0.8)';

    // factorAttribution: array of { factor: string, contribution_pct: number, description: string }
    const labels = factorAttribution.map(f => f.name || f.factor);
    const values = factorAttribution.map(f => Number((f.contribution_pct || 0).toFixed(2)));
    const bgColors = values.map(v => (v >= 0 ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)'));
    const borderColors = values.map(v => (v >= 0 ? '#10B981' : '#EF4444'));

    chartInstances[canvasId] = new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Contribution to Price Drift (%)',
            data: values,
            backgroundColor: bgColors,
            borderColor: borderColors,
            borderWidth: 1,
            borderRadius: 4
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => {
                const idx = context.dataIndex;
                const desc = factorAttribution[idx]?.description || '';
                const v = context.raw;
                return [
                  ` Impact: ${v > 0 ? '+' : ''}${v}%`,
                  desc ? ` Detail: ${desc}` : ''
                ].filter(Boolean);
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { family: 'Inter', size: 10 },
              callback: (val) => `${val > 0 ? '+' : ''}${val}%`
            }
          },
          y: {
            grid: { display: false },
            ticks: { color: textColor, font: { family: 'Inter', size: 11 } }
          }
        }
      }
    });
  }
};

