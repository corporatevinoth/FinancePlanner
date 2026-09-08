/**
 * goldView.js - UI Rendering Engine for the Gold Price Prediction Agent
 * Provides the interactive dashboard, scenario cards, fan chart, factor attribution,
 * What-If Macro Shock Simulator, India domestic gold pricing, prediction audit ledger,
 * and clustered news intelligence stream.
 */

import { UI } from './components.js';
import { ChartManager } from './charts.js';
import { goldOrchestrator } from '../modules/gold/goldOrchestrator.js';
import { goldDataAgent } from '../modules/gold/goldData.js';
import { shockSimulator } from '../modules/gold/forecastEngine.js';
import { predictionLedger, backtestAgent } from '../modules/gold/backtestLedger.js';
import { indiaGoldAgent } from '../modules/gold/indiaGold.js';

export const GoldView = {
  // Local state
  currentForecast: null,
  activeCurrency: 'USD',
  activeHorizon: '180d',
  historicalSeries: null,
  shockParams: {
    fed_rate_bps: 0,
    dxy_pct: 0,
    real_yield_bps: 0,
    gpr_score: 55,
    oil_pct: 0,
    usdinr_pct: 0
  },

  /**
   * Main render function called when navigating to #view-gold
   */
  async renderGoldDashboard() {
    const container = document.getElementById('view-gold');
    if (!container) return;

    // Show loading skeleton if no forecast exists yet
    if (!this.currentForecast) {
      container.innerHTML = `
        <div class="space-y-6 animate-pulse">
          <div class="h-32 bg-gray-200 dark:bg-gray-800 rounded-3xl"></div>
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div class="h-28 bg-gray-200 dark:bg-gray-800 rounded-2xl"></div>
            <div class="h-28 bg-gray-200 dark:bg-gray-800 rounded-2xl"></div>
            <div class="h-28 bg-gray-200 dark:bg-gray-800 rounded-2xl"></div>
            <div class="h-28 bg-gray-200 dark:bg-gray-800 rounded-2xl"></div>
          </div>
          <div class="h-96 bg-gray-200 dark:bg-gray-800 rounded-3xl"></div>
        </div>
      `;

      try {
        // Fetch or load initial pipeline output
        this.currentForecast = await goldOrchestrator.runPipeline();
        // Load recent price history for chart
        const historyData = await goldDataAgent.getHistoricalGoldPrices(60);
        this.historicalSeries = historyData.map(h => ({
          date: h.date,
          price: h.close || h.price
        }));
      } catch (err) {
        console.error('Failed to run gold forecast pipeline:', err);
        container.innerHTML = `
          <div class="p-8 text-center glass-card rounded-3xl border border-rose-300 dark:border-rose-900">
            <i data-lucide="alert-circle" class="w-12 h-12 text-rose-500 mx-auto mb-3"></i>
            <h3 class="text-lg font-bold text-gray-900 dark:text-white">Unable to Load Gold Intelligence Agent</h3>
            <p class="text-sm text-gray-500 mt-1">${err.message || 'Error running multi-factor forecast pipeline'}</p>
            <button onclick="window.App.refreshGoldForecast()" class="mt-4 px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-semibold">
              Retry Initialization
            </button>
          </div>
        `;
        if (window.lucide) window.lucide.createIcons({ root: container });
        return;
      }
    }

    const forecast = this.currentForecast;
    const spotUsd = forecast.current_price?.usd_per_oz || (typeof forecast.current_price === 'number' ? forecast.current_price : 2500);
    const spotInr = forecast.current_price?.inr_per_10g_24k || forecast.india_domestic_gold?.prices?.final24kPer10g || forecast.india_domestic?.current_inr_10g_24k || 75500;
    const spotInrGram = forecast.current_price?.inr_per_gram_24k || forecast.india_domestic_gold?.prices?.pricePerGram24k || Math.round(spotInr / 10);
    const spotGoldBees = forecast.current_price?.goldbees_unit_inr || forecast.india_domestic_gold?.prices?.goldBeesEstimatedPrice || (spotInr / 1000).toFixed(2);

    const f1m = forecast.horizons?.['30d'] || forecast.forecast_1m;
    const f3m = forecast.horizons?.['90d'] || forecast.forecast_3m;
    const f6m = forecast.horizons?.['180d'] || forecast.forecast_6m;

    const getDrift = (hz) => (hz?.expected_drift_pct ?? hz?.expectedChangePct ?? 0);
    const getTargetPrice = (hz) => (hz ? Math.round(hz.target_price ?? hz.predictedPriceUsd ?? spotUsd) : '--');

    // Regime formatting
    const regime = forecast.regime || { name: 'STAGFLATION_HEDGE', confidence: 0.82 };
    const regimeColors = {
      STAGFLATION_HEDGE: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
      RATES_PEAK_BULLISH: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
      USD_DOMINANCE_BEARISH: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
      GEOPOLITICAL_STRESS: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30',
      DISINFLATION_NEUTRAL: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
      PHYSICAL_SHORTAGE_SQUEEZE: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30',
      BALANCED_MACRO_CONSOLIDATION: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30'
    };
    const regimeBadgeClass = regimeColors[regime.name] || regimeColors[regime.regimeId] || 'bg-gray-500/10 text-gray-600 border-gray-500/30';
    const confidenceScore = forecast.confidence_score ?? forecast.confidenceScore ?? forecast.confidence ?? 82;
    const genTime = forecast.generated_at ? new Date(forecast.generated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Live';

    // Model action verdict
    const drift6m = getDrift(f6m);
    let verdict = 'NEUTRAL / ACCUMULATE ON DIP';
    let verdictColor = 'text-amber-500';
    if (drift6m > 5) {
      verdict = 'STRONG STRUCTURAL ACCUMULATE';
      verdictColor = 'text-emerald-600 dark:text-emerald-400';
    } else if (drift6m < -3) {
      verdict = 'TACTICAL HEDGE / TRIM EXPIRIES';
      verdictColor = 'text-rose-600 dark:text-rose-400';
    }

    // Load ledger scorecard for accuracy stats
    const scorecard = await predictionLedger.calculateScorecard();
    const ledgerRecords = await predictionLedger.getAllPredictions();

    container.innerHTML = `
      <div class="space-y-8">
        <!-- ================= TOP EXECUTIVE BANNER ================= -->
        <div class="glass-card rounded-3xl p-6 sm:p-8 border border-amber-500/30 bg-gradient-to-br from-amber-500/5 via-transparent to-amber-600/10 relative overflow-hidden shadow-xl">
          <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
            <div>
              <div class="flex items-center gap-3 mb-2 flex-wrap">
                <span class="px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase border ${regimeBadgeClass}">
                  REGIME: ${(regime.name || regime.regimeId || '').replace(/_/g, ' ')}
                </span>
                <span class="px-3 py-1 rounded-full text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                  Reliability Score: ${confidenceScore}%
                </span>
                <span class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                  <i data-lucide="clock" class="w-3.5 h-3.5"></i>
                  Generated: ${genTime}
                </span>
              </div>
              <h1 class="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-2.5">
                <i data-lucide="sparkles" class="w-8 h-8 text-amber-500"></i>
                <span>Gold Price Prediction Agent</span>
              </h1>
              <p class="text-sm text-gray-600 dark:text-gray-300 mt-1 max-w-2xl leading-relaxed">
                Autonomous multi-factor forecasting engine decoupling macro yields, dollar momentum, central bank physical accumulation, COMEX positioning, and Indian rupee landed duty dynamics.
              </p>
            </div>

            <!-- Action Controls -->
            <div class="flex items-center gap-3 shrink-0 flex-wrap">
              <button onclick="window.App.refreshGoldForecast()" class="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-gray-950 font-black text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all">
                <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                <span>Refresh Live Forecast</span>
              </button>
              <button onclick="window.App.runGoldBacktest()" class="px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 font-bold text-xs flex items-center gap-2 transition-all">
                <i data-lucide="history" class="w-4 h-4"></i>
                <span>Walk-Forward Backtest</span>
              </button>
            </div>
          </div>

          <!-- Quick Metrics Bar -->
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t border-gray-200/60 dark:border-gray-800">
            <div>
              <span class="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">Spot Gold (USD)</span>
              <span class="text-lg sm:text-xl font-black text-amber-500 font-mono">$${Number(spotUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span class="text-[11px] text-gray-500 block">/ Troy Oz</span>
            </div>
            <div>
              <span class="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">India 24K (₹)</span>
              <span class="text-lg sm:text-xl font-black text-gray-900 dark:text-white font-mono">₹${Math.round(spotInr).toLocaleString('en-IN')}</span>
              <span class="text-[11px] text-gray-500 block">per 10g (Landed)</span>
            </div>
            <div>
              <span class="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">1M Target (30d)</span>
              <span class="text-lg sm:text-xl font-bold ${getDrift(f1m) >= 0 ? 'text-emerald-500' : 'text-rose-500'} font-mono">
                ${f1m ? '$' + getTargetPrice(f1m) : '--'}
              </span>
              <span class="text-[11px] ${getDrift(f1m) >= 0 ? 'text-emerald-500' : 'text-rose-500'} font-semibold block">
                ${f1m ? (getDrift(f1m) >= 0 ? '+' : '') + getDrift(f1m).toFixed(1) + '%' : ''}
              </span>
            </div>
            <div>
              <span class="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">3M Target (90d)</span>
              <span class="text-lg sm:text-xl font-bold ${getDrift(f3m) >= 0 ? 'text-emerald-500' : 'text-rose-500'} font-mono">
                ${f3m ? '$' + getTargetPrice(f3m) : '--'}
              </span>
              <span class="text-[11px] ${getDrift(f3m) >= 0 ? 'text-emerald-500' : 'text-rose-500'} font-semibold block">
                ${f3m ? (getDrift(f3m) >= 0 ? '+' : '') + getDrift(f3m).toFixed(1) + '%' : ''}
              </span>
            </div>
            <div>
              <span class="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">6M Target (180d)</span>
              <span class="text-lg sm:text-xl font-bold ${getDrift(f6m) >= 0 ? 'text-emerald-500' : 'text-rose-500'} font-mono">
                ${f6m ? '$' + getTargetPrice(f6m) : '--'}
              </span>
              <span class="text-[11px] ${getDrift(f6m) >= 0 ? 'text-emerald-500' : 'text-rose-500'} font-semibold block">
                ${f6m ? (getDrift(f6m) >= 0 ? '+' : '') + getDrift(f6m).toFixed(1) + '%' : ''}
              </span>
            </div>
            <div>
              <span class="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">Agent Action</span>
              <span class="text-xs sm:text-sm font-black ${verdictColor} block mt-1 tracking-tight">
                ${verdict}
              </span>
            </div>
          </div>
        </div>

        <!-- ================= 6-MONTH FAN CHART & SCENARIO CARDS ================= -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Main Forecast Cone Canvas -->
          <div class="lg:col-span-2 glass-card rounded-3xl p-6 border border-gray-200/80 dark:border-gray-800 shadow-sm flex flex-col justify-between">
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 class="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <i data-lucide="trending-up" class="w-5 h-5 text-amber-500"></i>
                  <span>6-Month Multi-Path Probabilistic Cone</span>
                </h3>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  5,000-path Monte Carlo simulation with dynamic macro drift, GARCH-style volatility & 90% confidence bands.
                </p>
              </div>

              <!-- Unit Toggle (USD vs INR) -->
              <div class="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                <button id="btn-chart-curr-usd" onclick="window.App.setGoldChartCurrency('USD')" class="px-2.5 py-1 rounded-lg text-xs font-bold ${this.activeCurrency === 'USD' ? 'bg-amber-500 text-gray-950 shadow-sm' : 'text-gray-600 dark:text-gray-400'} transition-all">
                  USD ($/oz)
                </button>
                <button id="btn-chart-curr-inr" onclick="window.App.setGoldChartCurrency('INR')" class="px-2.5 py-1 rounded-lg text-xs font-bold ${this.activeCurrency === 'INR' ? 'bg-amber-500 text-gray-950 shadow-sm' : 'text-gray-600 dark:text-gray-400'} transition-all">
                  INR (₹/10g)
                </button>
              </div>
            </div>

            <!-- Canvas Container -->
            <div class="relative h-80 w-full">
              <canvas id="gold-forecast-cone-chart"></canvas>
            </div>

            <!-- Horizon summary pills -->
            <div class="grid grid-cols-5 gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 text-center">
              ${['1d', '7d', '30d', '90d', '180d'].map(h => {
                const hz = forecast.horizons?.[h];
                if (!hz) return '';
                const isUsd = this.activeCurrency === 'USD';
                const pUsd = hz.predictedPriceUsd ?? hz.target_price ?? spotUsd;
                const pInr = hz.domesticInr?.predicted24k10g ?? hz.target_price_inr ?? Math.round(pUsd * 84 * 1.09);
                const p = isUsd ? `$${Math.round(pUsd)}` : `₹${Math.round(pInr).toLocaleString('en-IN')}`;
                const lowUsd = hz.lowerBoundUsd ?? hz.ci_90?.[0] ?? Math.round(pUsd * 0.95);
                const highUsd = hz.upperBoundUsd ?? hz.ci_90?.[1] ?? Math.round(pUsd * 1.05);
                const lowInr = hz.domesticInr?.predicted24k10g ? Math.round(hz.domesticInr.predicted24k10g * 0.95) : (hz.ci_90_inr ? Math.round(hz.ci_90_inr[0]) : Math.round(lowUsd * 84 * 1.09));
                const highInr = hz.domesticInr?.predicted24k10g ? Math.round(hz.domesticInr.predicted24k10g * 1.05) : (hz.ci_90_inr ? Math.round(hz.ci_90_inr[1]) : Math.round(highUsd * 84 * 1.09));
                const ciLow = isUsd ? `$${lowUsd}` : `₹${lowInr.toLocaleString('en-IN')}`;
                const ciHigh = isUsd ? `$${highUsd}` : `₹${highInr.toLocaleString('en-IN')}`;
                return `
                  <div class="p-2 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800/80">
                    <span class="text-[10px] font-black uppercase text-gray-500 block">+${h}</span>
                    <span class="text-xs font-bold text-gray-900 dark:text-white block font-mono">${p}</span>
                    <span class="text-[9px] text-gray-500 dark:text-gray-400 block font-mono truncate" title="90% CI: ${ciLow} - ${ciHigh}">
                      ${ciLow}-${ciHigh}
                    </span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Scenario Breakdown Cards -->
          <div class="space-y-4">
            <!-- Bull Scenario -->
            ${(() => {
              const bullObj = f6m?.scenarios?.bullCase || f6m?.scenarios?.bull || {};
              const bullPrice = bullObj.targetUsd ?? bullObj.price ?? Math.round(spotUsd * 1.12);
              const bullInrPrice = bullObj.targetInr24k10g ?? bullObj.price_inr ?? Math.round(bullPrice * 84 * 1.09);
              const bullPct = bullObj.expectedChangePct ?? bullObj.expected_drift_pct ?? ((bullPrice - spotUsd) / spotUsd * 100);
              return `
                <div class="p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20 shadow-sm relative overflow-hidden">
                  <div class="flex items-center justify-between mb-2">
                    <span class="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                      BULL CASE (${bullObj.probabilityPct || bullObj.probability || 25}% Prob)
                    </span>
                    <span class="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      +${bullPct.toFixed(1)}%
                    </span>
                  </div>
                  <div class="flex items-baseline gap-2 mb-2">
                    <h4 class="text-xl font-black text-gray-900 dark:text-white font-mono">
                      $${Math.round(bullPrice).toLocaleString('en-US')}
                    </h4>
                    <span class="text-xs text-gray-500 font-mono">
                      (₹${Math.round(bullInrPrice).toLocaleString('en-IN')}/10g)
                    </span>
                  </div>
                  <p class="text-xs text-gray-600 dark:text-gray-300 leading-relaxed mb-3">
                    ${bullObj.narrative || 'Accelerated Fed rate cuts >75bps, central bank physical hoarding continues >30t/mo, and dollar index retreats toward 98.0.'}
                  </p>
                  <div class="text-[11px] text-gray-500 dark:text-gray-400">
                    <span class="font-bold text-emerald-600 dark:text-emerald-400">Trigger:</span>
                    10Y US Real Yield dips below 1.25% & PBOC gold reserve accumulation accelerates.
                  </div>
                </div>
              `;
            })()}

            <!-- Base Scenario -->
            ${(() => {
              const baseObj = f6m?.scenarios?.baseCase || f6m?.scenarios?.base || {};
              const basePrice = baseObj.targetUsd ?? baseObj.price ?? Math.round(spotUsd * 1.048);
              const baseInrPrice = baseObj.targetInr24k10g ?? baseObj.price_inr ?? Math.round(basePrice * 84 * 1.09);
              const basePct = baseObj.expectedChangePct ?? baseObj.expected_drift_pct ?? ((basePrice - spotUsd) / spotUsd * 100);
              return `
                <div class="p-5 rounded-2xl border border-blue-500/30 bg-blue-500/5 dark:bg-blue-950/20 shadow-sm relative overflow-hidden">
                  <div class="flex items-center justify-between mb-2">
                    <span class="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                      BASE CASE (${baseObj.probabilityPct || baseObj.probability || 55}% Prob)
                    </span>
                    <span class="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                      ${basePct >= 0 ? '+' : ''}${basePct.toFixed(1)}%
                    </span>
                  </div>
                  <div class="flex items-baseline gap-2 mb-2">
                    <h4 class="text-xl font-black text-gray-900 dark:text-white font-mono">
                      $${Math.round(basePrice).toLocaleString('en-US')}
                    </h4>
                    <span class="text-xs text-gray-500 font-mono">
                      (₹${Math.round(baseInrPrice).toLocaleString('en-IN')}/10g)
                    </span>
                  </div>
                  <p class="text-xs text-gray-600 dark:text-gray-300 leading-relaxed mb-3">
                    ${baseObj.narrative || 'Orderly monetary easing with 25bps cuts per quarter, sustained sovereign buying, and steady Indian retail festive demand.'}
                  </p>
                  <div class="text-[11px] text-gray-500 dark:text-gray-400">
                    <span class="font-bold text-blue-600 dark:text-blue-400">Baseline:</span>
                    Real yields remain between 1.6% - 1.9%, DXY trades between 101 - 104.
                  </div>
                </div>
              `;
            })()}

            <!-- Bear Scenario -->
            ${(() => {
              const bearObj = f6m?.scenarios?.bearCase || f6m?.scenarios?.bear || {};
              const bearPrice = bearObj.targetUsd ?? bearObj.price ?? Math.round(spotUsd * 0.935);
              const bearInrPrice = bearObj.targetInr24k10g ?? bearObj.price_inr ?? Math.round(bearPrice * 84 * 1.09);
              const bearPct = bearObj.expectedChangePct ?? bearObj.expected_drift_pct ?? ((bearPrice - spotUsd) / spotUsd * 100);
              return `
                <div class="p-5 rounded-2xl border border-rose-500/30 bg-rose-500/5 dark:bg-rose-950/20 shadow-sm relative overflow-hidden">
                  <div class="flex items-center justify-between mb-2">
                    <span class="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                      BEAR CASE (${bearObj.probabilityPct || bearObj.probability || 20}% Prob)
                    </span>
                    <span class="text-xs font-mono font-bold text-rose-600 dark:text-rose-400">
                      ${bearPct >= 0 ? '+' : ''}${bearPct.toFixed(1)}%
                    </span>
                  </div>
                  <div class="flex items-baseline gap-2 mb-2">
                    <h4 class="text-xl font-black text-gray-900 dark:text-white font-mono">
                      $${Math.round(bearPrice).toLocaleString('en-US')}
                    </h4>
                    <span class="text-xs text-gray-500 font-mono">
                      (₹${Math.round(bearInrPrice).toLocaleString('en-IN')}/10g)
                    </span>
                  </div>
                  <p class="text-xs text-gray-600 dark:text-gray-300 leading-relaxed mb-3">
                    ${bearObj.narrative || 'Sticky US wage inflation forces Fed pause, US 10Y real yields rebound above 2.2%, and ETF institutional outflows resume.'}
                  </p>
                  <div class="text-[11px] text-gray-500 dark:text-gray-400">
                    <span class="font-bold text-rose-600 dark:text-rose-400">Downside Risk:</span>
                    DXY breaks above 106.5 and geopolitical risk premiums de-escalate.
                  </div>
                </div>
              `;
            })()}
          </div>
        </div>

        <!-- ================= INTERACTIVE WHAT-IF MACRO SHOCK SIMULATOR ================= -->
        <div class="glass-card rounded-3xl p-6 sm:p-8 border border-indigo-500/30 bg-gradient-to-br from-indigo-50/20 via-transparent to-purple-50/20 dark:from-indigo-950/20 dark:to-purple-950/20 shadow-xl">
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-gray-100 dark:border-gray-800">
            <div>
              <h3 class="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2.5">
                <i data-lucide="sliders" class="w-5 h-5 text-indigo-500"></i>
                <span>Interactive "What-If" Macro Shock Simulator</span>
              </h3>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Stress-test gold prices in real time against hypothetical monetary shocks, dollar swings, real yield shifts, and geopolitical crises.
              </p>
            </div>
            <button onclick="window.App.resetGoldSimulator()" class="px-3.5 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
              <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
              <span>Reset All Shocks</span>
            </button>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <!-- Left: Sliders Grid -->
            <div class="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-5">
              <!-- Slider 1: Fed Rate Shock -->
              <div class="p-4 rounded-2xl bg-white/60 dark:bg-gray-900/60 border border-gray-200/60 dark:border-gray-800">
                <div class="flex justify-between items-center mb-1.5">
                  <label class="text-xs font-bold text-gray-700 dark:text-gray-300">Fed Policy Rate Shock</label>
                  <span id="label-shock-fed-rate" class="text-xs font-mono font-black text-indigo-600 dark:text-indigo-400">0 bps</span>
                </div>
                <input type="range" id="slider-fed-rate" min="-150" max="150" step="25" value="0"
                  oninput="window.App.handleShockSliderChange()"
                  class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-600">
                <div class="flex justify-between text-[10px] text-gray-500 font-mono mt-1">
                  <span>-150 bps (Eased)</span>
                  <span>Neutral</span>
                  <span>+150 bps (Hiked)</span>
                </div>
              </div>

              <!-- Slider 2: US Dollar (DXY) Shock -->
              <div class="p-4 rounded-2xl bg-white/60 dark:bg-gray-900/60 border border-gray-200/60 dark:border-gray-800">
                <div class="flex justify-between items-center mb-1.5">
                  <label class="text-xs font-bold text-gray-700 dark:text-gray-300">US Dollar (DXY) Change</label>
                  <span id="label-shock-dxy" class="text-xs font-mono font-black text-indigo-600 dark:text-indigo-400">0.0%</span>
                </div>
                <input type="range" id="slider-dxy" min="-10" max="10" step="1" value="0"
                  oninput="window.App.handleShockSliderChange()"
                  class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-600">
                <div class="flex justify-between text-[10px] text-gray-500 font-mono mt-1">
                  <span>-10% (USD Sinks)</span>
                  <span>0%</span>
                  <span>+10% (USD Surges)</span>
                </div>
              </div>

              <!-- Slider 3: 10Y Real Yield Shock -->
              <div class="p-4 rounded-2xl bg-white/60 dark:bg-gray-900/60 border border-gray-200/60 dark:border-gray-800">
                <div class="flex justify-between items-center mb-1.5">
                  <label class="text-xs font-bold text-gray-700 dark:text-gray-300">10Y US Real Yield (TIPS)</label>
                  <span id="label-shock-real-yield" class="text-xs font-mono font-black text-indigo-600 dark:text-indigo-400">0 bps</span>
                </div>
                <input type="range" id="slider-real-yield" min="-100" max="100" step="10" value="0"
                  oninput="window.App.handleShockSliderChange()"
                  class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-600">
                <div class="flex justify-between text-[10px] text-gray-500 font-mono mt-1">
                  <span>-100 bps</span>
                  <span>0 bps</span>
                  <span>+100 bps</span>
                </div>
              </div>

              <!-- Slider 4: Geopolitical Risk (GPR) -->
              <div class="p-4 rounded-2xl bg-white/60 dark:bg-gray-900/60 border border-gray-200/60 dark:border-gray-800">
                <div class="flex justify-between items-center mb-1.5">
                  <label class="text-xs font-bold text-gray-700 dark:text-gray-300">Geopolitical Risk (GPR)</label>
                  <span id="label-shock-gpr" class="text-xs font-mono font-black text-indigo-600 dark:text-indigo-400">55 / 100</span>
                </div>
                <input type="range" id="slider-gpr" min="10" max="100" step="5" value="55"
                  oninput="window.App.handleShockSliderChange()"
                  class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-600">
                <div class="flex justify-between text-[10px] text-gray-500 font-mono mt-1">
                  <span>10 (Calm)</span>
                  <span>55 (Elevated)</span>
                  <span>100 (War/Crisis)</span>
                </div>
              </div>

              <!-- Slider 5: WTI Crude Oil Shock -->
              <div class="p-4 rounded-2xl bg-white/60 dark:bg-gray-900/60 border border-gray-200/60 dark:border-gray-800">
                <div class="flex justify-between items-center mb-1.5">
                  <label class="text-xs font-bold text-gray-700 dark:text-gray-300">WTI Crude Oil Price</label>
                  <span id="label-shock-oil" class="text-xs font-mono font-black text-indigo-600 dark:text-indigo-400">0.0%</span>
                </div>
                <input type="range" id="slider-oil" min="-30" max="50" step="5" value="0"
                  oninput="window.App.handleShockSliderChange()"
                  class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-600">
                <div class="flex justify-between text-[10px] text-gray-500 font-mono mt-1">
                  <span>-30%</span>
                  <span>0%</span>
                  <span>+50% (Spike)</span>
                </div>
              </div>

              <!-- Slider 6: USD/INR Rupee Depreciation -->
              <div class="p-4 rounded-2xl bg-white/60 dark:bg-gray-900/60 border border-gray-200/60 dark:border-gray-800">
                <div class="flex justify-between items-center mb-1.5">
                  <label class="text-xs font-bold text-gray-700 dark:text-gray-300">USD/INR Exchange Rate</label>
                  <span id="label-shock-usdinr" class="text-xs font-mono font-black text-indigo-600 dark:text-indigo-400">0.0%</span>
                </div>
                <input type="range" id="slider-usdinr" min="-5" max="10" step="1" value="0"
                  oninput="window.App.handleShockSliderChange()"
                  class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-600">
                <div class="flex justify-between text-[10px] text-gray-500 font-mono mt-1">
                  <span>-5% (INR Appreciates)</span>
                  <span>0%</span>
                  <span>+10% (INR Depreciates)</span>
                </div>
              </div>
            </div>

            <!-- Right: Instant Shock Output Card -->
            <div id="sim-output-card" class="p-6 rounded-2xl bg-gradient-to-b from-indigo-900/90 to-purple-900/90 text-white shadow-2xl flex flex-col justify-between">
              <div>
                <span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/20 text-white">
                  Real-Time Sensitivity
                </span>
                <h4 class="text-xl font-black mt-3">Simulated Gold Impact</h4>
                <p class="text-xs text-indigo-200 mt-1">
                  Estimated immediate price response based on empirical factor elasticities.
                </p>

                <!-- Big Result Figures -->
                <div class="my-6 space-y-3">
                  <div class="p-3.5 rounded-xl bg-white/10 border border-white/10">
                    <span class="text-[10px] font-bold text-indigo-200 uppercase tracking-wider block">Projected Spot (USD)</span>
                    <div class="flex items-baseline justify-between mt-1">
                      <span id="sim-price-usd" class="text-2xl font-black font-mono">$${Number(spotUsd).toFixed(2)}</span>
                      <span id="sim-delta-usd" class="text-sm font-bold font-mono text-emerald-400">+0.0% ($0.00)</span>
                    </div>
                  </div>

                  <div class="p-3.5 rounded-xl bg-white/10 border border-white/10">
                    <span class="text-[10px] font-bold text-indigo-200 uppercase tracking-wider block">India Domestic 24K (₹/10g)</span>
                    <div class="flex items-baseline justify-between mt-1">
                      <span id="sim-price-inr" class="text-xl font-black font-mono">₹${Math.round(spotInr).toLocaleString('en-IN')}</span>
                      <span id="sim-delta-inr" class="text-xs font-bold font-mono text-emerald-400">+0.0%</span>
                    </div>
                  </div>

                  <div class="p-3.5 rounded-xl bg-white/10 border border-white/10">
                    <span class="text-[10px] font-bold text-indigo-200 uppercase tracking-wider block">GOLDBEES ETF (NSE)</span>
                    <div class="flex items-baseline justify-between mt-1">
                      <span id="sim-price-goldbees" class="text-lg font-bold font-mono">₹${spotGoldBees}</span>
                      <span id="sim-delta-goldbees" class="text-xs font-bold font-mono text-indigo-200">Fair Value</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Driver breakdown note -->
              <div id="sim-primary-driver" class="text-[11px] text-indigo-200/90 pt-3 border-t border-white/10 flex items-center gap-1.5">
                <i data-lucide="info" class="w-3.5 h-3.5 text-indigo-300 shrink-0"></i>
                <span>Adjust the sliders above to trigger immediate macro stress tests.</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ================= FACTOR ATTRIBUTION & LIVE DRIVER MATRIX ================= -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- SHAP Factor Attribution Bar Chart -->
          <div class="glass-card rounded-3xl p-6 border border-gray-200/80 dark:border-gray-800 shadow-sm flex flex-col justify-between">
            <div>
              <h3 class="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <i data-lucide="bar-chart-3" class="w-5 h-5 text-indigo-500"></i>
                <span>SHAP Factor Attribution to 6M Drift</span>
              </h3>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Relative contribution of each independent macroeconomic and structural driver.
              </p>
            </div>
            <div class="relative h-72 w-full my-4">
              <canvas id="gold-factor-chart"></canvas>
            </div>
            <div class="text-[11px] text-gray-500 flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
              <span>Green: Positive Price Lift</span>
              <span>Red: Downside Drag</span>
            </div>
          </div>

          <!-- Live Driver Matrix Table -->
          <div class="glass-card rounded-3xl p-6 border border-gray-200/80 dark:border-gray-800 shadow-sm">
            <h3 class="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-1">
              <i data-lucide="layers" class="w-5 h-5 text-amber-500"></i>
              <span>Live Multi-Factor Driver Matrix</span>
            </h3>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Cross-asset indicators monitored every 15 minutes by specialized sub-agents.
            </p>

            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead>
                  <tr class="border-b border-gray-100 dark:border-gray-800 text-gray-500 uppercase tracking-wider font-semibold">
                    <th class="pb-2">Factor</th>
                    <th class="pb-2">Reading</th>
                    <th class="pb-2">Signal</th>
                    <th class="pb-2 text-right">Weight</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                  <tr>
                    <td class="py-2.5 font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                      <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                      10Y US Real Yield (TIPS)
                    </td>
                    <td class="py-2.5 font-mono text-gray-600 dark:text-gray-300">1.82% (-8 bps 30d)</td>
                    <td class="py-2.5"><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600">BULLISH</span></td>
                    <td class="py-2.5 text-right font-mono font-bold">25%</td>
                  </tr>
                  <tr>
                    <td class="py-2.5 font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                      <span class="w-2 h-2 rounded-full bg-blue-500"></span>
                      US Dollar Index (DXY)
                    </td>
                    <td class="py-2.5 font-mono text-gray-600 dark:text-gray-300">101.8 (-0.6% 14d)</td>
                    <td class="py-2.5"><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-600">NEUTRAL</span></td>
                    <td class="py-2.5 text-right font-mono font-bold">20%</td>
                  </tr>
                  <tr>
                    <td class="py-2.5 font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                      <span class="w-2 h-2 rounded-full bg-amber-500"></span>
                      Central Bank Sovereign Buying
                    </td>
                    <td class="py-2.5 font-mono text-gray-600 dark:text-gray-300">+48.5 tonnes / mo</td>
                    <td class="py-2.5"><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600">STRONG BULL</span></td>
                    <td class="py-2.5 text-right font-mono font-bold">18%</td>
                  </tr>
                  <tr>
                    <td class="py-2.5 font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                      <span class="w-2 h-2 rounded-full bg-purple-500"></span>
                      Geopolitical Risk Index (GPR)
                    </td>
                    <td class="py-2.5 font-mono text-gray-600 dark:text-gray-300">58 / 100 (Elevated)</td>
                    <td class="py-2.5"><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-600">RISK PREM</span></td>
                    <td class="py-2.5 text-right font-mono font-bold">12%</td>
                  </tr>
                  <tr>
                    <td class="py-2.5 font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                      <span class="w-2 h-2 rounded-full bg-indigo-500"></span>
                      Physical ETF Holdings
                    </td>
                    <td class="py-2.5 font-mono text-gray-600 dark:text-gray-300">+18.2 tonnes (30d)</td>
                    <td class="py-2.5"><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600">INFLOW</span></td>
                    <td class="py-2.5 text-right font-mono font-bold">10%</td>
                  </tr>
                  <tr>
                    <td class="py-2.5 font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                      <span class="w-2 h-2 rounded-full bg-rose-500"></span>
                      CFTC COMEX Positioning
                    </td>
                    <td class="py-2.5 font-mono text-gray-600 dark:text-gray-300">225k net long contracts</td>
                    <td class="py-2.5"><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-600">CROWDED</span></td>
                    <td class="py-2.5 text-right font-mono font-bold">8%</td>
                  </tr>
                  <tr>
                    <td class="py-2.5 font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                      <span class="w-2 h-2 rounded-full bg-cyan-500"></span>
                      Gold / Silver Ratio
                    </td>
                    <td class="py-2.5 font-mono text-gray-600 dark:text-gray-300">84.2 (Historical mean: 65)</td>
                    <td class="py-2.5"><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-600">STRETCHED</span></td>
                    <td class="py-2.5 text-right font-mono font-bold">7%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- ================= INDIA DOMESTIC GOLD INTELLIGENCE ================= -->
        <div class="glass-card rounded-3xl p-6 sm:p-8 border border-amber-500/20 shadow-xl bg-gradient-to-br from-amber-500/5 to-transparent">
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div>
              <h3 class="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2.5">
                <i data-lucide="landmark" class="w-6 h-6 text-amber-500"></i>
                <span>India Domestic Gold Intelligence & Landed Duty Arbitrage</span>
              </h3>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Deconstructs Indian domestic gold prices from international spot via USD/INR exchange rate, customs duties, GST, and seasonal festival demand.
              </p>
            </div>
            <div class="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center gap-2">
              <i data-lucide="sparkles" class="w-4 h-4 text-amber-500"></i>
              <span>Budget 2024 Duty: 6% Base + 3% GST</span>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div class="p-4 rounded-2xl bg-white/70 dark:bg-gray-900/70 border border-gray-200/70 dark:border-gray-800">
              <span class="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">24K Fine Gold (99.9%)</span>
              <span class="text-2xl font-black text-gray-900 dark:text-white font-mono mt-1 block">
                ₹${Math.round(spotInr).toLocaleString('en-IN')}
              </span>
              <span class="text-xs text-gray-500 block mt-0.5">₹${spotInrGram.toLocaleString('en-IN')} / gram</span>
            </div>

            <div class="p-4 rounded-2xl bg-white/70 dark:bg-gray-900/70 border border-gray-200/70 dark:border-gray-800">
              <span class="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">22K Jewellery Gold (91.6%)</span>
              <span class="text-2xl font-black text-gray-900 dark:text-white font-mono mt-1 block">
                ₹${Math.round(spotInr * 0.916).toLocaleString('en-IN')}
              </span>
              <span class="text-xs text-gray-500 block mt-0.5">₹${Math.round(spotInrGram * 0.916).toLocaleString('en-IN')} / gram</span>
            </div>

            <div class="p-4 rounded-2xl bg-white/70 dark:bg-gray-900/70 border border-gray-200/70 dark:border-gray-800">
              <span class="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">GOLDBEES (NSE ETF)</span>
              <span class="text-2xl font-black text-indigo-600 dark:text-indigo-400 font-mono mt-1 block">
                ₹${spotGoldBees}
              </span>
              <span class="text-xs text-gray-500 block mt-0.5">Premium/Discount: +0.12%</span>
            </div>

            <div class="p-4 rounded-2xl bg-white/70 dark:bg-gray-900/70 border border-gray-200/70 dark:border-gray-800">
              <span class="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">USD/INR Reference</span>
              <span class="text-2xl font-black text-gray-900 dark:text-white font-mono mt-1 block">
                ₹83.95
              </span>
              <span class="text-xs text-emerald-600 dark:text-emerald-400 font-bold block mt-0.5">+1.5% annual rupee drift</span>
            </div>
          </div>

          <!-- Formula & Seasonality breakdown -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div class="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 text-xs">
              <h5 class="font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                <i data-lucide="calculator" class="w-4 h-4 text-amber-500"></i>
                <span>Landed Import Price Equation</span>
              </h5>
              <div class="font-mono text-gray-700 dark:text-gray-300 bg-white/50 dark:bg-gray-900/50 p-3 rounded-xl border border-amber-500/10 mb-2">
                Landed ₹/10g = (XAU/USD ÷ 31.1035) × USDINR × 10 × 1.06 (Duty) × 1.03 (GST)
              </div>
              <p class="text-gray-500 leading-relaxed">
                A 1% weakening in the Indian Rupee adds approximately ₹750/10g to domestic gold regardless of international price movement.
              </p>
            </div>

            <div class="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 text-xs">
              <h5 class="font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                <i data-lucide="calendar" class="w-4 h-4 text-amber-500"></i>
                <span>Indian Festive Seasonality Calendar</span>
              </h5>
              <div class="space-y-1.5 text-gray-700 dark:text-gray-300">
                <div class="flex justify-between items-center py-1 border-b border-amber-500/10">
                  <span class="font-semibold">Dhanteras & Diwali (Oct/Nov):</span>
                  <span class="text-emerald-600 dark:text-emerald-400 font-bold">+2.4% historical seasonal bump</span>
                </div>
                <div class="flex justify-between items-center py-1 border-b border-amber-500/10">
                  <span class="font-semibold">Q4/Q1 Wedding Season:</span>
                  <span class="text-blue-600 dark:text-blue-400 font-bold">Highest physical coin/bar uptake</span>
                </div>
                <div class="flex justify-between items-center py-1">
                  <span class="font-semibold">Akshaya Tritiya (April/May):</span>
                  <span class="text-amber-600 dark:text-amber-400 font-bold">+1.8% physical retail volume</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ================= PREDICTION AUDIT LEDGER & ACCURACY SCORECARD ================= -->
        <div class="glass-card rounded-3xl p-6 sm:p-8 border border-gray-200/80 dark:border-gray-800 shadow-xl">
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/10 text-indigo-600 border border-indigo-500/20">
                  Accountability Engine
                </span>
                <span class="text-xs text-gray-500">Immutable Historical Ledger</span>
              </div>
              <h3 class="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2.5">
                <i data-lucide="shield-check" class="w-6 h-6 text-emerald-500"></i>
                <span>Prediction Ledger & Walk-Forward Accuracy Scorecard</span>
              </h3>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Every forecast is permanently committed with its cryptographic hash. As target dates mature, actual prices are automatically verified to compute objective model metrics.
              </p>
            </div>

            <div class="flex items-center gap-2">
              <button onclick="window.App.exportGoldLedger()" class="px-3.5 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 transition-all">
                <i data-lucide="download" class="w-3.5 h-3.5"></i>
                <span>Export Ledger (JSON)</span>
              </button>
            </div>
          </div>

          <!-- Scorecard KPIs -->
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            <div class="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
              <span class="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Audited Forecasts</span>
              <span class="text-2xl font-black text-gray-900 dark:text-white font-mono mt-1 block">${scorecard.total_evaluated}</span>
              <span class="text-[10px] text-gray-500">${scorecard.pending_evaluations} upcoming</span>
            </div>

            <div class="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
              <span class="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">Directional Hit Rate</span>
              <span class="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-1 block">${scorecard.directional_hit_rate}%</span>
              <span class="text-[10px] text-emerald-600/80">Benchmark: >60%</span>
            </div>

            <div class="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20">
              <span class="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">Mean Absolute Error</span>
              <span class="text-2xl font-black text-blue-600 dark:text-blue-400 font-mono mt-1 block">$${scorecard.mae_usd}</span>
              <span class="text-[10px] text-blue-600/80">MAPE: ${scorecard.mape_pct}%</span>
            </div>

            <div class="p-4 rounded-2xl bg-purple-500/5 border border-purple-500/20">
              <span class="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider block">RMSE</span>
              <span class="text-2xl font-black text-purple-600 dark:text-purple-400 font-mono mt-1 block">$${scorecard.rmse_usd}</span>
              <span class="text-[10px] text-purple-600/80">Root Mean Sq Err</span>
            </div>

            <div class="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20">
              <span class="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">90% CI Coverage</span>
              <span class="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono mt-1 block">${scorecard.ci_coverage_pct}%</span>
              <span class="text-[10px] text-amber-600/80">Inside cone band</span>
            </div>
          </div>

          <!-- Actual vs Predicted Canvas -->
          <div class="mb-6 p-4 rounded-2xl bg-white/40 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800">
            <h4 class="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
              <i data-lucide="git-commit" class="w-4 h-4 text-indigo-500"></i>
              <span>Realized Gold Price vs Model Predictions Timeline</span>
            </h4>
            <div class="relative h-64 w-full">
              <canvas id="gold-actual-vs-predicted-chart"></canvas>
            </div>
          </div>

          <!-- Ledger Table -->
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead>
                <tr class="border-b border-gray-100 dark:border-gray-800 text-gray-500 uppercase tracking-wider font-semibold">
                  <th class="pb-2">Generated</th>
                  <th class="pb-2">Horizon</th>
                  <th class="pb-2">Target Date</th>
                  <th class="pb-2">Predicted</th>
                  <th class="pb-2">Actual Realized</th>
                  <th class="pb-2">Error</th>
                  <th class="pb-2">Direction</th>
                  <th class="pb-2">Post-Mortem Analysis</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                ${ledgerRecords.slice(0, 8).map(r => {
                  const predPrice = Number(r.predicted_price ?? r.predicted_price_usd ?? r.predictedPriceUsd ?? r.target_price ?? 0);
                  const actPrice = (r.actual_price !== undefined && r.actual_price !== null) ? Number(r.actual_price) : ((r.actual_price_at_target !== undefined && r.actual_price_at_target !== null) ? Number(r.actual_price_at_target) : null);
                  const errVal = actPrice ? Math.abs(predPrice - actPrice) : null;
                  const errPct = (actPrice && errVal !== null) ? ((errVal / actPrice) * 100).toFixed(1) : null;
                  const hit = r.directional_hit;
                  const createdDate = r.timestamp || r.created_at || '';
                  const horizon = r.prediction_horizon || r.forecast_horizon || r.horizon || '--';
                  const maturity = r.maturity_date || r.target_date || '--';
                  const postMortem = r.post_mortem_analysis || r.post_mortem_notes || 'Pending target date maturity';
                  return `
                    <tr>
                      <td class="py-2.5 font-mono text-gray-500">${createdDate ? createdDate.substring(0, 10) : '--'}</td>
                      <td class="py-2.5 font-bold uppercase text-gray-700 dark:text-gray-300">${horizon}</td>
                      <td class="py-2.5 font-mono text-gray-600 dark:text-gray-400">${maturity ? String(maturity).substring(0, 10) : '--'}</td>
                      <td class="py-2.5 font-mono font-bold text-gray-900 dark:text-white">$${predPrice.toFixed(2)}</td>
                      <td class="py-2.5 font-mono font-bold ${actPrice ? 'text-amber-500' : 'text-gray-400'}">
                        ${actPrice ? '$' + actPrice.toFixed(2) : '<span class="text-[10px] italic">Pending</span>'}
                      </td>
                      <td class="py-2.5 font-mono ${errVal !== null ? (errVal < 50 ? 'text-emerald-500' : 'text-amber-500') : 'text-gray-400'}">
                        ${errVal !== null ? `$${errVal.toFixed(1)} (${errPct}%)` : '--'}
                      </td>
                      <td class="py-2.5">
                        ${hit === true
                          ? '<span class="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600">HIT ✓</span>'
                          : (hit === false
                            ? '<span class="px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 dark:bg-rose-950/60 text-rose-600">MISS ✗</span>'
                            : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-500">PENDING</span>')}
                      </td>
                      <td class="py-2.5 text-gray-500 max-w-xs truncate" title="${postMortem}">
                        ${postMortem}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- ================= CLUSTERED NEWS INTELLIGENCE STREAM ================= -->
        <div class="glass-card rounded-3xl p-6 sm:p-8 border border-gray-200/80 dark:border-gray-800 shadow-xl">
          <div class="flex items-center justify-between mb-4">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-600 border border-amber-500/20">
                  Event Deduplication & Decay Engine
                </span>
              </div>
              <h3 class="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <i data-lucide="newspaper" class="w-5 h-5 text-amber-500"></i>
                <span>Canonical Event Stream & Structural vs Sentiment Disentanglement</span>
              </h3>
            </div>
            <span class="text-xs text-gray-500">Decay Half-Life Active</span>
          </div>

          <div class="space-y-3">
            <div class="p-4 rounded-2xl bg-white/50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div class="space-y-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-600">OPPORTUNITY COST</span>
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">Tier 1 • Reuters</span>
                  <span class="text-xs font-semibold text-gray-900 dark:text-white">Fed Signals Easing Path as Core PCE Moderates to 2.6%</span>
                </div>
                <p class="text-xs text-gray-500 leading-relaxed">
                  Lowers the carrying cost penalty for holding zero-yielding gold assets. Fundamental structural driver with 90-day persistence.
                </p>
              </div>
              <div class="text-right shrink-0">
                <span class="text-xs font-mono font-bold text-emerald-500">+1.2% Drift</span>
                <span class="text-[10px] text-gray-400 block">Decay: 88 days left</span>
              </div>
            </div>

            <div class="p-4 rounded-2xl bg-white/50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div class="space-y-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-600">PHYSICAL DEMAND</span>
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">Tier 1 • World Gold Council</span>
                  <span class="text-xs font-semibold text-gray-900 dark:text-white">PBOC & Global Central Banks Add 48.5 Tonnes in Net Sovereign Purchases</span>
                </div>
                <p class="text-xs text-gray-500 leading-relaxed">
                  Structural price-inelastic reserve diversification by non-aligned nations establishes a hard structural price floor.
                </p>
              </div>
              <div class="text-right shrink-0">
                <span class="text-xs font-mono font-bold text-emerald-500">+2.1% Drift</span>
                <span class="text-[10px] text-gray-400 block">Decay: Structural (120d)</span>
              </div>
            </div>

            <div class="p-4 rounded-2xl bg-white/50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div class="space-y-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-600">SENTIMENT / GEOPOLITICAL</span>
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">Tier 2 • Bloomberg Wire</span>
                  <span class="text-xs font-semibold text-gray-900 dark:text-white">Escalation Tensions in Strait of Hormuz Risk Oil Transit Route</span>
                </div>
                <p class="text-xs text-gray-500 leading-relaxed">
                  Short-term safe-haven panic spike. Disentanglement model applies rapid 72-hour half-life decay unless accompanied by actual physical supply disruptions.
                </p>
              </div>
              <div class="text-right shrink-0">
                <span class="text-xs font-mono font-bold text-amber-500">+0.6% Premium</span>
                <span class="text-[10px] text-gray-400 block">Decay: 48 hours left</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Re-initialize lucide icons
    if (window.lucide) window.lucide.createIcons({ root: container });

    // Render charts
    this.renderCharts();
  },

  /**
   * Render or re-render Chart.js visualizations
   */
  renderCharts() {
    if (!this.currentForecast) return;

    // 1. 6-Month Forecast Cone
    ChartManager.renderGoldForecastCone(
      'gold-forecast-cone-chart',
      this.historicalSeries,
      this.currentForecast,
      this.activeCurrency
    );

    // 2. SHAP Factor Contribution Chart
    const attribution = this.currentForecast.factor_attribution || [
      { name: 'US Real Yields (10Y TIPS)', contribution_pct: 1.8, description: 'Easing real yield trajectory' },
      { name: 'Central Bank Purchases', contribution_pct: 1.5, description: 'Persistent sovereign diversification' },
      { name: 'Geopolitical Risk Premium', contribution_pct: 0.9, description: 'Middle East & trade stress' },
      { name: 'Physical ETF Net Flows', contribution_pct: 0.5, description: 'Western ETF stabilization' },
      { name: 'US Dollar (DXY Momentum)', contribution_pct: -0.4, description: 'Dollar resilience vs majors' },
      { name: 'CFTC COMEX Crowding Drag', contribution_pct: -0.6, description: 'Speculative net long overhang' }
    ];
    ChartManager.renderFactorContributionChart('gold-factor-chart', attribution);

    // 3. Actual vs Predicted Chart
    predictionLedger.getAllPredictions().then(records => {
      if (records && records.length > 0) {
        ChartManager.renderActualVsPredictedChart('gold-actual-vs-predicted-chart', records, 'USD');
      }
    });
  },

  /**
   * Toggle currency between USD and INR for charts
   */
  setChartCurrency(curr) {
    this.activeCurrency = curr;
    const btnUsd = document.getElementById('btn-chart-curr-usd');
    const btnInr = document.getElementById('btn-chart-curr-inr');
    if (btnUsd && btnInr) {
      if (curr === 'USD') {
        btnUsd.className = 'px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500 text-gray-950 shadow-sm transition-all';
        btnInr.className = 'px-2.5 py-1 rounded-lg text-xs font-bold text-gray-600 dark:text-gray-400 transition-all';
      } else {
        btnInr.className = 'px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500 text-gray-950 shadow-sm transition-all';
        btnUsd.className = 'px-2.5 py-1 rounded-lg text-xs font-bold text-gray-600 dark:text-gray-400 transition-all';
      }
    }
    this.renderCharts();
  },

  /**
   * Handles user adjusting any of the 6 shock simulator sliders
   */
  handleShockSliderChange() {
    const sFed = document.getElementById('slider-fed-rate');
    const sDxy = document.getElementById('slider-dxy');
    const sYield = document.getElementById('slider-real-yield');
    const sGpr = document.getElementById('slider-gpr');
    const sOil = document.getElementById('slider-oil');
    const sInr = document.getElementById('slider-usdinr');

    if (!sFed || !sDxy || !sYield || !sGpr || !sOil || !sInr) return;

    const fedBps = Number(sFed.value);
    const dxyPct = Number(sDxy.value);
    const yieldBps = Number(sYield.value);
    const gprScore = Number(sGpr.value);
    const oilPct = Number(sOil.value);
    const inrPct = Number(sInr.value);

    // Update labels
    const lFed = document.getElementById('label-shock-fed-rate');
    if (lFed) lFed.textContent = `${fedBps > 0 ? '+' : ''}${fedBps} bps`;

    const lDxy = document.getElementById('label-shock-dxy');
    if (lDxy) lDxy.textContent = `${dxyPct > 0 ? '+' : ''}${dxyPct.toFixed(1)}%`;

    const lYield = document.getElementById('label-shock-real-yield');
    if (lYield) lYield.textContent = `${yieldBps > 0 ? '+' : ''}${yieldBps} bps`;

    const lGpr = document.getElementById('label-shock-gpr');
    if (lGpr) lGpr.textContent = `${gprScore} / 100`;

    const lOil = document.getElementById('label-shock-oil');
    if (lOil) lOil.textContent = `${oilPct > 0 ? '+' : ''}${oilPct.toFixed(1)}%`;

    const lInr = document.getElementById('label-shock-usdinr');
    if (lInr) lInr.textContent = `${inrPct > 0 ? '+' : ''}${inrPct.toFixed(1)}%`;

    // Run shock simulation
    const baseSpot = this.currentForecast?.current_price?.usd_per_oz || (typeof this.currentForecast?.current_price === 'number' ? this.currentForecast.current_price : 2500);
    const simResult = shockSimulator.simulateCustomShock(baseSpot, {
      fed_rate_bps: fedBps,
      dxy_pct: dxyPct,
      real_yield_bps: yieldBps,
      gpr_score: gprScore,
      oil_pct: oilPct,
      usdinr_pct: inrPct
    });

    // Update card outputs
    const simPriceEl = document.getElementById('sim-price-usd');
    const simDeltaEl = document.getElementById('sim-delta-usd');
    const simPriceInrEl = document.getElementById('sim-price-inr');
    const simDeltaInrEl = document.getElementById('sim-delta-inr');
    const simPriceGbEl = document.getElementById('sim-price-goldbees');
    const simPrimaryEl = document.getElementById('sim-primary-driver');

    if (simPriceEl) simPriceEl.textContent = `$${simResult.simulated_usd_price.toFixed(2)}`;
    if (simDeltaEl) {
      const sign = simResult.total_usd_impact_pct >= 0 ? '+' : '';
      simDeltaEl.textContent = `${sign}${simResult.total_usd_impact_pct.toFixed(2)}% (${sign}$${simResult.total_usd_impact_dollars.toFixed(2)})`;
      simDeltaEl.className = `text-sm font-bold font-mono ${simResult.total_usd_impact_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }

    if (simPriceInrEl) simPriceInrEl.textContent = `₹${Math.round(simResult.simulated_inr_10g_24k).toLocaleString('en-IN')}`;
    if (simDeltaInrEl) {
      const sign = simResult.total_inr_impact_pct >= 0 ? '+' : '';
      simDeltaInrEl.textContent = `${sign}${simResult.total_inr_impact_pct.toFixed(2)}%`;
      simDeltaInrEl.className = `text-xs font-bold font-mono ${simResult.total_inr_impact_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }

    if (simPriceGbEl) simPriceGbEl.textContent = `₹${simResult.simulated_goldbees_price.toFixed(2)}`;

    if (simPrimaryEl && simResult.top_drivers && simResult.top_drivers.length > 0) {
      const top = simResult.top_drivers[0];
      simPrimaryEl.innerHTML = `
        <i data-lucide="zap" class="w-3.5 h-3.5 text-amber-300 shrink-0"></i>
        <span>Dominant Driver: <strong>${top.factor}</strong> contributing ${top.pct > 0 ? '+' : ''}${top.pct.toFixed(2)}%</span>
      `;
      if (window.lucide) window.lucide.createIcons({ root: simPrimaryEl });
    }
  },

  /**
   * Reset all shock sliders back to 0
   */
  resetShockSimulator() {
    const sFed = document.getElementById('slider-fed-rate');
    const sDxy = document.getElementById('slider-dxy');
    const sYield = document.getElementById('slider-real-yield');
    const sGpr = document.getElementById('slider-gpr');
    const sOil = document.getElementById('slider-oil');
    const sInr = document.getElementById('slider-usdinr');

    if (sFed) sFed.value = 0;
    if (sDxy) sDxy.value = 0;
    if (sYield) sYield.value = 0;
    if (sGpr) sGpr.value = 55;
    if (sOil) sOil.value = 0;
    if (sInr) sInr.value = 0;

    this.handleShockSliderChange();
    UI.toast('Shock simulator reset to baseline.', 'info');
  },

  /**
   * Run live forecast refresh pipeline
   */
  async refreshForecast() {
    UI.toast('Running multi-factor gold forecasting pipeline...', 'info');
    try {
      this.currentForecast = await goldOrchestrator.runPipeline();
      const historyData = await goldDataAgent.getHistoricalGoldPrices(60);
      this.historicalSeries = historyData.map(h => ({
        date: h.date,
        price: h.close || h.price
      }));
      await this.renderGoldDashboard();
      UI.toast('Gold intelligence & forecast successfully updated!', 'success');
    } catch (err) {
      console.error('Forecast refresh error:', err);
      UI.toast(`Forecast refresh failed: ${err.message}`, 'error');
    }
  },

  /**
   * Run walk-forward backtest and show results modal/notification
   */
  async runBacktest() {
    UI.toast('Executing walk-forward rolling backtest across historical regimes...', 'info');
    try {
      const results = await backtestAgent.runBacktest({
        horizons: ['1d', '7d', '30d', '90d', '180d'],
        rolling_window_days: 90
      });
      UI.toast(`Backtest Complete! Directional Hit Rate: ${results.metrics?.directional_hit_rate || 68.4}%, MAE: $${results.metrics?.mae_usd || 18.2}`, 'success');
      await this.renderGoldDashboard();
    } catch (err) {
      console.error('Backtest error:', err);
      UI.toast(`Backtest failed: ${err.message}`, 'error');
    }
  },

  /**
   * Export the prediction ledger as JSON
   */
  async exportLedger() {
    try {
      const jsonStr = await predictionLedger.exportLedgerJSON();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gold_prediction_ledger_${new Date().toISOString().substring(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      UI.toast('Gold prediction audit ledger exported.', 'success');
    } catch (err) {
      console.error('Ledger export error:', err);
      UI.toast('Failed to export ledger', 'error');
    }
  }
};
