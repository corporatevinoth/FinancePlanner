/**
 * views.js - UI Rendering Engine
 * Renders the Dashboard, Asset Registry, Monthly Review, Wealth Predictor, and Excel Import/Settings.
 */

import { UI } from './components.js';
import { ChartManager } from './charts.js';
import { PortfolioService, ASSET_CATEGORIES } from '../modules/portfolio.js';
import { SnapshotService } from '../modules/snapshot.js';
import { AnalyticsService } from '../modules/analytics.js';
import { PredictorService } from '../modules/predictor.js';
import { ImporterService } from '../modules/importer.js';
import { GeminiService } from '../api/gemini.js';
import { DB } from '../db.js';

function formatLastRefreshedTime(isoStr) {
  if (!isoStr) return 'Just now';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return 'Just now';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  return isToday ? `Today at ${timeStr}` : `${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} at ${timeStr}`;
}

function getFinanceVerdictBadge(verdict) {
  const v = (verdict || '').toUpperCase();
  if (v.includes('ACCUMULATE') || v.includes('STRONG BUY')) {
    return {
      bg: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
      icon: 'trending-up',
      label: 'ACCUMULATE'
    };
  }
  if (v.includes('HOLD')) {
    return {
      bg: 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800',
      icon: 'shield',
      label: 'CORE HOLD'
    };
  }
  if (v.includes('TRIM') || v.includes('PROFIT')) {
    return {
      bg: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800',
      icon: 'scissors',
      label: 'TRIM / BOOK PROFIT'
    };
  }
  return {
    bg: 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800',
    icon: 'arrow-right-left',
    label: 'EXIT & SWITCH'
  };
}

function getFinanceSentimentBadge(sentiment) {
  const s = (sentiment || 'Bullish').toLowerCase();
  if (s.includes('bullish')) {
    return {
      bg: 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25',
      icon: 'arrow-up-right',
      text: sentiment || 'Bullish Momentum'
    };
  }
  if (s.includes('neutral') || s.includes('moderate')) {
    return {
      bg: 'bg-amber-600 text-white shadow-md shadow-amber-600/25',
      icon: 'minus',
      text: sentiment || 'Neutral / Rangebound'
    };
  }
  return {
    bg: 'bg-rose-600 text-white shadow-md shadow-rose-600/25',
    icon: 'alert-triangle',
    text: sentiment || 'Cautious / Volatile'
  };
}

function renderFinanceAgentSection(report, apiKey, goal = 'max_growth', reportTime = null, currency = 'INR') {
  const goalLabels = {
    max_growth: '🚀 Maximum Growth & Aggressive Alpha',
    balanced_growth: '⚖️ Balanced Growth & Downside Protection',
    momentum_alpha: '⚡ High-Momentum Equity & Sectoral Alpha',
    defensive_compounding: '🛡️ Defensive Compounding & Capital Preservation'
  };

  const sentimentInfo = report ? getFinanceSentimentBadge(report.marketOutlook?.sentiment) : null;

  return `
    <div id="finance-agent-panel" class="mb-8 rounded-3xl p-5 sm:p-7 glass-card border border-indigo-500/30 dark:border-indigo-500/20 shadow-xl bg-gradient-to-br from-indigo-50/50 via-white to-purple-50/30 dark:from-indigo-950/25 dark:via-gray-900 dark:to-purple-950/20 relative overflow-hidden transition-all">
      <!-- Agent Top Header -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-5 border-b border-gray-100 dark:border-gray-800">
        <div class="flex items-center gap-3.5">
          <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-emerald-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/25 shrink-0">
            <i data-lucide="bot" class="w-6 h-6"></i>
          </div>
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <h3 class="text-base sm:text-lg font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
                <span>AI Finance Growth & Market Intelligence Agent</span>
              </h3>
              <span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                Gemini 2.5 Flash • Market Grounded
              </span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Live portfolio audit, macro trends & institutional analyst consensus calibrated for maximum wealth compounding.
            </p>
          </div>
        </div>

        ${report ? `
          <div class="flex items-center gap-2 flex-wrap self-end sm:self-center">
            <span class="text-[11px] text-gray-400 font-mono flex items-center gap-1">
              <i data-lucide="clock" class="w-3.5 h-3.5 text-indigo-500"></i>
              <span>${formatLastRefreshedTime(reportTime)}</span>
            </span>
            <button onclick="window.App.copyFinanceReport()" title="Copy Strategic Growth Plan" class="p-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-semibold flex items-center gap-1.5 transition-all">
              <i data-lucide="copy" class="w-3.5 h-3.5"></i>
              <span>Copy</span>
            </button>
            <button onclick="window.App.clearFinanceAgentReport()" title="Clear Report" class="p-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-1.5 transition-all">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        ` : ''}
      </div>

      <!-- Missing API Key Notice (if key is empty) -->
      ${!apiKey ? `
        <div class="mt-4 p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-indigo-500/10 to-transparent border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <i data-lucide="key" class="w-4 h-4"></i>
            </div>
            <div>
              <h4 class="text-xs font-bold text-gray-900 dark:text-white">Activate Gemini Market Intelligence</h4>
              <p class="text-[11px] text-gray-500 dark:text-gray-400">Enter your 100% free Google AI Studio key once to unlock the Finance Agent.</p>
            </div>
          </div>
          <div class="flex items-center gap-2 w-full sm:w-auto">
            <input type="password" id="input-dashboard-gemini-key" placeholder="Paste key: AIzaSy..." class="px-3 py-1.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-1 sm:w-48" />
            <button onclick="window.App.saveGeminiKeyFromDashboard()" class="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-md shrink-0">
              Save Key
            </button>
            <a href="https://aistudio.google.com/app/apikey" target="_blank" class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline shrink-0 hidden sm:inline" title="Get free key from Google AI Studio">
              Get Key &rarr;
            </a>
          </div>
        </div>
      ` : ''}

      <!-- Agent Controls & Command Bar -->
      <div class="mt-5 space-y-3">
        <div class="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <!-- Strategy Goal Selector -->
          <div class="sm:col-span-4">
            <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-300 mb-1 flex items-center gap-1">
              <i data-lucide="target" class="w-3.5 h-3.5 text-indigo-500"></i>
              <span>Growth Strategy Goal</span>
            </label>
            <select id="select-finance-goal" onchange="window.App.handleFinanceGoalChange(this.value)" class="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none">
              <option value="max_growth" ${goal === 'max_growth' ? 'selected' : ''}>🚀 Maximum Growth & Aggressive Alpha</option>
              <option value="balanced_growth" ${goal === 'balanced_growth' ? 'selected' : ''}>⚖️ Balanced Growth & Downside Protection</option>
              <option value="momentum_alpha" ${goal === 'momentum_alpha' ? 'selected' : ''}>⚡ High-Momentum Equity & Sectoral Alpha</option>
              <option value="defensive_compounding" ${goal === 'defensive_compounding' ? 'selected' : ''}>🛡️ Defensive Compounding & Capital Preservation</option>
            </select>
          </div>

          <!-- Custom Query / Question -->
          <div class="sm:col-span-8">
            <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-300 mb-1 flex items-center justify-between">
              <span class="flex items-center gap-1">
                <i data-lucide="message-circle" class="w-3.5 h-3.5 text-purple-500"></i>
                <span>Custom Question or Directives (Optional)</span>
              </span>
              <span class="text-[10px] text-gray-400 font-normal">e.g. "Where should my ₹50k fresh salary go?"</span>
            </label>
            <input type="text" id="input-finance-custom-prompt" placeholder="Ask specific questions (e.g. 'Should I exit lagging funds and where to deploy ₹50k monthly?')" class="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
          </div>
        </div>

        <!-- Quick Prompt Chips & Run Button -->
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-[10px] font-semibold text-gray-400 mr-0.5">Quick Focus:</span>
            <button type="button" onclick="document.getElementById('input-finance-custom-prompt').value='Maximize 3-year CAGR and recommend high-growth replacements for dead capital'; window.App.runFinanceAgentAnalysis();" class="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-[11px] font-medium border border-indigo-200 dark:border-indigo-800 transition-colors">
              ✨ Maximize 3-Year CAGR
            </button>
            <button type="button" onclick="document.getElementById('input-finance-custom-prompt').value='Identify underperforming assets trailing 7% FD rate and suggest optimal switches'; window.App.runFinanceAgentAnalysis();" class="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-[11px] font-medium border border-gray-200 dark:border-gray-700 transition-colors">
              🔄 Exit Dead Capital
            </button>
            <button type="button" onclick="document.getElementById('input-finance-custom-prompt').value='Recommend exact SIP split for upcoming monthly salary savings for max compounding'; window.App.runFinanceAgentAnalysis();" class="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-[11px] font-medium border border-gray-200 dark:border-gray-700 transition-colors">
              💡 Optimal Monthly SIP Split
            </button>
          </div>

          <div class="flex items-center gap-3 w-full sm:w-auto justify-end">
            <span id="finance-agent-status" class="text-xs text-indigo-600 dark:text-indigo-400 font-medium"></span>
            <button id="btn-run-finance-agent" onclick="window.App.runFinanceAgentAnalysis()" class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-emerald-600 hover:from-indigo-700 hover:to-emerald-700 text-white text-xs font-bold shadow-lg shadow-indigo-500/25 flex items-center gap-2 transition-all shrink-0">
              <i data-lucide="sparkles" class="w-4 h-4"></i>
              <span>${report ? 'Re-Analyze for Max Growth' : 'Analyze Portfolio for Max Growth'}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- ==================== REPORT SECTION (If generated) ==================== -->
      ${report ? `
        <div class="mt-6 pt-6 border-t border-gray-200/80 dark:border-gray-800 space-y-6">
          
          <!-- 1. Market Climate & Analyst Consensus Banner -->
          <div class="p-5 rounded-2xl bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
              <div class="flex items-center gap-2.5">
                <span class="px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${sentimentInfo.bg}">
                  <i data-lucide="${sentimentInfo.icon}" class="w-3.5 h-3.5"></i>
                  <span>${sentimentInfo.text}</span>
                </span>
                <span class="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  ${report.marketOutlook?.marketPhase || 'Market Expansion'}
                </span>
              </div>
              <div class="text-[11px] text-gray-500 dark:text-gray-400">
                Institutional & Brokerage Consensus Grounded
              </div>
            </div>

            <!-- Macro Drivers -->
            ${report.marketOutlook?.keyDrivers?.length > 0 ? `
              <div class="flex flex-wrap gap-2 mb-3">
                ${report.marketOutlook.keyDrivers.map(d => `
                  <span class="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-[11px] font-medium border border-indigo-100 dark:border-indigo-900 flex items-center gap-1">
                    <i data-lucide="check" class="w-3 h-3 text-indigo-500"></i>
                    <span>${d}</span>
                  </span>
                `).join('')}
              </div>
            ` : ''}

            <!-- Analyst Consensus Summary -->
            <p class="text-xs text-gray-600 dark:text-gray-300 leading-relaxed bg-gray-50 dark:bg-gray-900/40 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
              <strong>Analyst Consensus:</strong> ${report.marketOutlook?.analystConsensusSummary || 'Positive medium-term outlook with selective opportunities in secular compounding assets.'}
            </p>
          </div>

          <!-- 2. Growth Scorecard & Audit Metrics -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <!-- Growth Potential Score -->
            <div class="glass-card p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/80">
              <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                <span>Growth Potential</span>
                <i data-lucide="zap" class="w-4 h-4 text-emerald-500"></i>
              </div>
              <div class="flex items-baseline gap-1.5">
                <span class="text-2xl font-black font-mono-numeric text-emerald-600 dark:text-emerald-400">${report.growthAudit?.growthScore || 80}</span>
                <span class="text-xs text-gray-400">/ 100</span>
              </div>
              <div class="w-full bg-gray-200 dark:bg-gray-700 h-1.5 rounded-full mt-2 overflow-hidden">
                <div class="bg-emerald-500 h-full rounded-full" style="width: ${Math.min(100, report.growthAudit?.growthScore || 80)}%"></div>
              </div>
            </div>

            <!-- Capital Efficiency Score -->
            <div class="glass-card p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/80">
              <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                <span>Capital Efficiency</span>
                <i data-lucide="gauge" class="w-4 h-4 text-indigo-500"></i>
              </div>
              <div class="flex items-baseline gap-1.5">
                <span class="text-2xl font-black font-mono-numeric text-indigo-600 dark:text-indigo-400">${report.growthAudit?.efficiencyScore || 75}</span>
                <span class="text-xs text-gray-400">/ 100</span>
              </div>
              <div class="w-full bg-gray-200 dark:bg-gray-700 h-1.5 rounded-full mt-2 overflow-hidden">
                <div class="bg-indigo-500 h-full rounded-full" style="width: ${Math.min(100, report.growthAudit?.efficiencyScore || 75)}%"></div>
              </div>
            </div>

            <!-- Dead Capital Identified -->
            <div class="glass-card p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/80">
              <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                <span>Dead Capital Drag</span>
                <i data-lucide="alert-triangle" class="w-4 h-4 ${report.growthAudit?.deadCapitalAmount > 0 ? 'text-amber-500' : 'text-emerald-500'}"></i>
              </div>
              <div class="text-2xl font-black font-mono-numeric ${report.growthAudit?.deadCapitalAmount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}">
                ${UI.formatCurrency(report.growthAudit?.deadCapitalAmount || 0)}
              </div>
              <p class="text-[11px] text-gray-400 mt-1.5 truncate">
                ${report.growthAudit?.deadCapitalAmount > 0 ? 'Reallocation recommended for higher CAGR' : 'No dead capital detected'}
              </p>
            </div>
          </div>

          <!-- Core Verdict Alert -->
          ${report.growthAudit?.coreVerdict ? `
            <div class="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 text-xs text-indigo-900 dark:text-indigo-200 flex items-start gap-2.5">
              <i data-lucide="compass" class="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0"></i>
              <div>
                <strong>Strategist Audit:</strong> ${report.growthAudit.coreVerdict}
              </div>
            </div>
          ` : ''}

          <!-- 3. Asset-by-Asset Action Table -->
          <div>
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <h4 class="text-xs font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider flex items-center gap-1.5">
                <i data-lucide="coins" class="w-4 h-4 text-indigo-500"></i>
                <span>Holding Action Verdicts & Analyst Consensus</span>
              </h4>
              <div class="flex items-center gap-1 text-[11px]">
                <button type="button" onclick="window.App.filterFinanceVerdicts('ALL')" id="filter-verdict-ALL" class="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-semibold shadow-sm">All (${report.holdingVerdicts?.length || 0})</button>
                <button type="button" onclick="window.App.filterFinanceVerdicts('ACCUMULATE')" id="filter-verdict-ACCUMULATE" class="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-200">Accumulate</button>
                <button type="button" onclick="window.App.filterFinanceVerdicts('HOLD')" id="filter-verdict-HOLD" class="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-200">Hold</button>
                <button type="button" onclick="window.App.filterFinanceVerdicts('TRIM_EXIT')" id="filter-verdict-TRIM_EXIT" class="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-200">Trim / Exit</button>
              </div>
            </div>

            <div class="border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden bg-white dark:bg-gray-800/90 shadow-sm">
              <div class="overflow-x-auto max-h-96">
                <table class="w-full text-left text-xs table-compact">
                  <thead class="bg-gray-50 dark:bg-gray-900/60 text-gray-500 dark:text-gray-400 font-semibold border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th class="px-4 py-2.5">Holding & Category</th>
                      <th class="px-4 py-2.5 text-right">Valuation</th>
                      <th class="px-4 py-2.5 text-center">Action Verdict</th>
                      <th class="px-4 py-2.5">Analyst Consensus & Rationale</th>
                      <th class="px-4 py-2.5 text-right">Target Wt.</th>
                    </tr>
                  </thead>
                  <tbody id="finance-verdicts-tbody" class="divide-y divide-gray-100 dark:divide-gray-800">
                    ${(report.holdingVerdicts || []).map(item => {
                      const badge = getFinanceVerdictBadge(item.verdict);
                      let filterGroup = 'HOLD';
                      if (item.verdict?.includes('ACCUMULATE') || item.verdict?.includes('BUY')) filterGroup = 'ACCUMULATE';
                      else if (item.verdict?.includes('TRIM') || item.verdict?.includes('EXIT') || item.verdict?.includes('SWITCH')) filterGroup = 'TRIM_EXIT';

                      return `
                        <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors verdict-row" data-verdict-group="${filterGroup}">
                          <td class="px-4 py-3">
                            <div class="font-semibold text-gray-900 dark:text-gray-100">${item.name}</div>
                            <div class="text-[11px] text-gray-400">${ASSET_CATEGORIES[item.category]?.name || item.category}</div>
                          </td>
                          <td class="px-4 py-3 text-right">
                            <div class="font-bold font-mono-numeric text-gray-900 dark:text-gray-100">${UI.formatCurrency(item.currentValue || 0)}</div>
                            <div class="text-[10px] text-gray-400">${(item.allocationPct || 0).toFixed(1)}% of total</div>
                          </td>
                          <td class="px-4 py-3 text-center">
                            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${badge.bg}">
                              <i data-lucide="${badge.icon}" class="w-3 h-3"></i>
                              <span>${badge.label}</span>
                            </span>
                          </td>
                          <td class="px-4 py-3">
                            ${item.analystConsensus ? `<div class="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 mb-0.5">${item.analystConsensus}</div>` : ''}
                            <div class="text-[11px] text-gray-600 dark:text-gray-300 leading-relaxed">${item.actionRationale}</div>
                          </td>
                          <td class="px-4 py-3 text-right font-mono-numeric font-bold text-gray-700 dark:text-gray-300">
                            ${item.targetWeightPct ? `${item.targetWeightPct}%` : '-'}
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- 4. Max-Growth Capital Redeployment Blueprint (3 Steps) -->
          ${report.capitalRedeploymentPlan?.length > 0 ? `
            <div>
              <h4 class="text-xs font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <i data-lucide="layers" class="w-4 h-4 text-emerald-500"></i>
                <span>Actionable Capital Redeployment Blueprint</span>
              </h4>

              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                ${report.capitalRedeploymentPlan.map((step, idx) => `
                  <div class="p-4 rounded-2xl bg-white/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 shadow-sm relative overflow-hidden flex flex-col justify-between">
                    <div>
                      <div class="flex items-center justify-between mb-2">
                        <span class="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-xs font-black flex items-center justify-center">
                          ${step.stepNumber || (idx + 1)}
                        </span>
                        <span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${step.actionType === 'TRIM_OR_EXIT' ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300' : step.actionType === 'REDEPLOY_GROWTH' ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'}">
                          ${step.actionType || 'Action Step'}
                        </span>
                      </div>
                      <h5 class="font-bold text-gray-900 dark:text-white text-xs mb-1">${step.title}</h5>
                      <p class="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">${step.description}</p>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <!-- 5. Compounding Projection Lift & Monthly Salary SIP Strategy -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <!-- Compounding Boost Card -->
            <div class="p-5 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/30">
              <div class="flex items-center justify-between mb-3">
                <h5 class="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                  <i data-lucide="trending-up" class="w-4 h-4 text-emerald-500"></i>
                  <span>Projected Compounding Boost</span>
                </h5>
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                  ${report.compoundingProjection?.projected3YearAlphaLift || '+3.0% CAGR'}
                </span>
              </div>
              <div class="grid grid-cols-2 gap-3 mb-3 text-center">
                <div class="p-3 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-gray-100 dark:border-gray-800">
                  <div class="text-[10px] text-gray-400 uppercase font-semibold">Current Estimated CAGR</div>
                  <div class="text-lg font-bold font-mono-numeric text-gray-700 dark:text-gray-300">
                    ${report.compoundingProjection?.currentEstimatedCAGR || '12.0%'}
                  </div>
                </div>
                <div class="p-3 rounded-xl bg-emerald-100/50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                  <div class="text-[10px] text-emerald-700 dark:text-emerald-300 uppercase font-semibold">Optimized Growth CAGR</div>
                  <div class="text-lg font-black font-mono-numeric text-emerald-700 dark:text-emerald-300">
                    ${report.compoundingProjection?.optimizedCAGR || '15.4%'}
                  </div>
                </div>
              </div>
              <p class="text-[11px] text-gray-600 dark:text-gray-300 leading-relaxed font-medium">
                ${report.compoundingProjection?.projected3YearWealthDelta || 'Substantial additional compounding gains over 36 months when dead capital is shifted into high-alpha assets.'}
              </p>
            </div>

            <!-- Fresh Monthly Salary SIP Guidance -->
            <div class="p-5 rounded-2xl bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent border border-indigo-500/30">
              <div class="flex items-center justify-between mb-3">
                <h5 class="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                  <i data-lucide="wallet" class="w-4 h-4 text-indigo-500"></i>
                  <span>Fresh Salary / Monthly SIP Strategy</span>
                </h5>
                <span class="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                  Recommended Split
                </span>
              </div>

              ${report.sipStrategy ? `
                <div class="grid grid-cols-4 gap-2 mb-3 text-center text-xs">
                  <div class="p-2 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-gray-100 dark:border-gray-800">
                    <div class="text-[10px] text-blue-500 font-bold">Equity</div>
                    <div class="font-black font-mono-numeric text-gray-900 dark:text-white">${report.sipStrategy.recommendedEquityPct || 70}%</div>
                  </div>
                  <div class="p-2 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-gray-100 dark:border-gray-800">
                    <div class="text-[10px] text-emerald-500 font-bold">Debt/FD</div>
                    <div class="font-black font-mono-numeric text-gray-900 dark:text-white">${report.sipStrategy.recommendedDebtPct || 15}%</div>
                  </div>
                  <div class="p-2 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-gray-100 dark:border-gray-800">
                    <div class="text-[10px] text-amber-500 font-bold">Gold</div>
                    <div class="font-black font-mono-numeric text-gray-900 dark:text-white">${report.sipStrategy.recommendedGoldPct || 10}%</div>
                  </div>
                  <div class="p-2 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-gray-100 dark:border-gray-800">
                    <div class="text-[10px] text-purple-500 font-bold">Cash</div>
                    <div class="font-black font-mono-numeric text-gray-900 dark:text-white">${report.sipStrategy.recommendedCashPct || 5}%</div>
                  </div>
                </div>
                <p class="text-[11px] text-gray-600 dark:text-gray-300 leading-relaxed">
                  <strong>Monthly Directive:</strong> ${report.sipStrategy.monthlyFocusRecommendation || 'Channel major fresh savings into consistent compounders.'}
                </p>
              ` : ''}
            </div>
          </div>

          <!-- 6. Executive Commentary -->
          ${report.executiveCommentary ? `
            <div class="p-5 rounded-2xl bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 shadow-sm">
              <h5 class="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <i data-lucide="file-text" class="w-4 h-4 text-purple-500"></i>
                <span>Executive Strategic Commentary</span>
              </h5>
              <div class="text-xs text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line">
                ${report.executiveCommentary}
              </div>
            </div>
          ` : ''}

          <!-- 7. Interactive Follow-up Question Box -->
          <div class="p-4 rounded-2xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-900/60">
            <label class="block text-xs font-bold text-gray-800 dark:text-gray-200 mb-2 flex items-center gap-1.5">
              <i data-lucide="message-square" class="w-3.5 h-3.5 text-indigo-500"></i>
              <span>Ask Follow-up Question to Finance Agent</span>
            </label>
            <div class="flex gap-2">
              <input type="text" id="input-finance-followup" placeholder="e.g. 'What if interest rates drop next quarter?' or 'Which mid-cap fund has lowest overlap with Parag Parikh?'" class="flex-1 px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" onkeydown="if (event.key === 'Enter') window.App.askFinanceAgentFollowup()" />
              <button id="btn-finance-followup" onclick="window.App.askFinanceAgentFollowup()" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-md flex items-center gap-1.5 shrink-0">
                <i data-lucide="send" class="w-3.5 h-3.5"></i>
                <span>Ask</span>
              </button>
            </div>
            <div id="finance-followup-response" class="hidden mt-3 p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-300 leading-relaxed shadow-sm"></div>
          </div>

        </div>
      ` : ''}
    </div>
  `;
}

export const Views = {
  /**
   * 1. Render Dashboard
   */
  async renderDashboard() {
    const container = document.getElementById('view-dashboard');
    if (!container) return;

    // Automatically deduplicate holdings and purge invalid zero snapshots
    await PortfolioService.deduplicateDatabase();

    // Automatically synchronize the latest monthly snapshot with live holdings
    await SnapshotService.syncLiveSnapshot();

    const summary = await PortfolioService.getPortfolioSummary();
    const snapshots = await SnapshotService.getHistory();
    const analytics = await SnapshotService.getGrowthAnalytics();
    const holdingAnalysis = await AnalyticsService.evaluateHoldings();
    const driftAnalysis = await AnalyticsService.checkAllocationDrift();
    const runway = await AnalyticsService.getEmergencyRunway();
    const isReviewed = await SnapshotService.isCurrentMonthReviewed();

    let lastRefreshedIso = await DB.getSetting('last_refreshed_at');
    if (!lastRefreshedIso) {
      lastRefreshedIso = new Date().toISOString();
      await DB.setSetting('last_refreshed_at', lastRefreshedIso);
    }
    const lastRefreshedFormatted = formatLastRefreshedTime(lastRefreshedIso);

    const currMonthStr = new Date().toISOString().substring(0, 7);

    // Fetch AI Finance Agent state
    const geminiKey = await DB.getSetting('geminiApiKey', '') || localStorage.getItem('fp_gemini_key') || '';
    const cachedFinanceReport = await DB.getSetting('finance_agent_report', null);
    const selectedFinanceGoal = await DB.getSetting('finance_agent_goal', 'max_growth');
    const financeReportTimestamp = await DB.getSetting('finance_agent_report_time', null);
    const currency = await DB.getSetting('currency', 'INR');

    // Render Review Reminder Banner if current month not yet logged
    let reviewBannerHtml = '';
    if (!isReviewed) {
      reviewBannerHtml = `
        <div class="mb-6 p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center font-bold text-lg pulse-badge">
              <i data-lucide="calendar" class="w-5 h-5"></i>
            </div>
            <div>
              <h4 class="font-semibold text-gray-900 dark:text-gray-100 text-sm">Monthly Review Due (${currMonthStr})</h4>
              <p class="text-xs text-gray-500 dark:text-gray-400">Lock in your latest snapshot to track your monthly growth and fresh salary additions.</p>
            </div>
          </div>
          <button onclick="window.App.navigateTo('review')" class="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-xl shadow-md transition-all">
            Take Review Snapshot
          </button>
        </div>
      `;
    }

    container.innerHTML = `
      <!-- Dashboard Top Header with Live Price Sync -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <div class="flex items-center gap-2.5 flex-wrap">
            <h2 class="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-2.5">
              <span>Wealth Compounding Engine</span>
            </h2>
            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Valuation
            </span>
            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 shadow-sm" title="Last live valuation update">
              <i data-lucide="clock" class="w-3 h-3 text-indigo-500"></i>
              <span>Refreshed: ${lastRefreshedFormatted}</span>
            </span>
          </div>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Real-time portfolio tracking across AMFI Mutual Funds, NSE/BSE Stocks, SGB Gold, and FDs.
          </p>
        </div>
        <div class="flex items-center gap-2.5 flex-wrap">
          <button id="btn-dashboard-reset" onclick="window.App.resetToOfficialPortfolio()" class="px-3.5 py-2.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800 text-xs font-semibold rounded-xl flex items-center gap-2 transition-all shrink-0">
            <i data-lucide="rotate-ccw" class="w-4 h-4"></i>
            <span>Reset to Official Portfolio</span>
          </button>
          <button id="btn-dashboard-sync" onclick="window.App.syncLivePrices(this)" class="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-md shadow-indigo-600/20 flex items-center gap-2 transition-all shrink-0">
            <i data-lucide="refresh-cw" class="w-4 h-4"></i>
            <span>Sync Live Prices</span>
          </button>
        </div>
      </div>

      ${reviewBannerHtml}

      <!-- Top KPI Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <!-- Net Worth Card -->
        <div class="glass-card p-5 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow">
          <div class="flex items-center justify-between text-gray-500 dark:text-gray-400 mb-2 text-xs font-medium uppercase tracking-wider">
            <span>Total Net Worth</span>
            <i data-lucide="trending-up" class="w-4 h-4 text-emerald-500"></i>
          </div>
          <div class="text-2xl font-bold font-mono-numeric text-gray-900 dark:text-white">
            ${UI.formatCurrency(summary.totalCurrentValue)}
          </div>
          <div class="mt-2 flex items-center gap-2 text-xs">
            <span class="px-2 py-0.5 rounded-full font-semibold ${summary.totalProfit >= 0 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-400'}">
              ${UI.formatPercent(summary.returnPercentage)}
            </span>
            <span class="text-gray-500 dark:text-gray-400">Compounding Gain</span>
          </div>
        </div>

        <!-- Monthly Delta Card -->
        <div class="glass-card p-5 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow">
          <div class="flex items-center justify-between text-gray-500 dark:text-gray-400 mb-2 text-xs font-medium uppercase tracking-wider">
            <span>MoM Net Change</span>
            <i data-lucide="activity" class="w-4 h-4 text-indigo-500"></i>
          </div>
          <div class="text-2xl font-bold font-mono-numeric ${analytics && analytics.momDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white'}">
            ${analytics ? UI.formatCurrency(analytics.momDelta) : UI.formatCurrency(summary.totalProfit)}
          </div>
          <div class="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
            ${analytics ? `<span>${analytics.momPercent >= 0 ? '+' : ''}${analytics.momPercent}% vs last month</span>` : '<span>Initial baseline recorded</span>'}
          </div>
        </div>

        <!-- Total Invested Card -->
        <div class="glass-card p-5 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow">
          <div class="flex items-center justify-between text-gray-500 dark:text-gray-400 mb-2 text-xs font-medium uppercase tracking-wider">
            <span>Capital Invested</span>
            <i data-lucide="wallet" class="w-4 h-4 text-blue-500"></i>
          </div>
          <div class="text-2xl font-bold font-mono-numeric text-gray-900 dark:text-white">
            ${UI.formatCurrency(summary.totalInvested)}
          </div>
          <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Across ${summary.assetCount} holdings
          </div>
        </div>

        <!-- Emergency Runway Card -->
        <div class="glass-card p-5 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow">
          <div class="flex items-center justify-between text-gray-500 dark:text-gray-400 mb-2 text-xs font-medium uppercase tracking-wider">
            <span>Emergency Runway</span>
            <i data-lucide="shield-check" class="w-4 h-4 ${runway.health === 'safe' ? 'text-emerald-500' : 'text-amber-500'}"></i>
          </div>
          <div class="text-2xl font-bold font-mono-numeric text-gray-900 dark:text-white flex items-baseline gap-1.5">
            <span>${runway.runwayMonths}</span>
            <span class="text-sm font-normal text-gray-500">Months</span>
          </div>
          <div class="mt-2 text-xs ${runway.health === 'safe' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'} font-medium">
            ${UI.formatCurrency(runway.liquidCash)} liquid buffer
          </div>
        </div>
      </div>

      <!-- AI Finance Growth & Market Intelligence Agent -->
      ${renderFinanceAgentSection(cachedFinanceReport, geminiKey, selectedFinanceGoal, financeReportTimestamp, currency)}

      <!-- Charts Row 1: Compounding Journey & Asset Donut -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <!-- Journey Chart (2 cols) -->
        <div class="lg:col-span-2 glass-card p-5 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="font-semibold text-gray-900 dark:text-white text-base">Wealth Compounding Journey</h3>
              <p class="text-xs text-gray-500 dark:text-gray-400">Cumulative Invested Capital vs Total Market Net Worth</p>
            </div>
            <div class="text-xs text-gray-400">Historical Timeline</div>
          </div>
          <div class="chart-container" style="height: 320px;">
            <canvas id="chart-journey"></canvas>
          </div>
        </div>

        <!-- Asset Allocation Donut (1 col) -->
        <div class="glass-card p-5 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-sm flex flex-col">
          <div class="flex items-center justify-between mb-2">
            <div>
              <h3 class="font-semibold text-gray-900 dark:text-white text-base">Asset Allocation</h3>
              <p class="text-xs text-gray-500 dark:text-gray-400">Current portfolio diversification</p>
            </div>
          </div>
          <div class="chart-container flex-1" style="height: 280px;">
            <canvas id="chart-allocation"></canvas>
          </div>
        </div>
      </div>

      <!-- Charts Row 2: Monthly Waterfall & Intelligence Reallocation -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <!-- Monthly Growth Waterfall (2 cols) -->
        <div class="lg:col-span-2 glass-card p-5 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="font-semibold text-gray-900 dark:text-white text-base">Monthly Net Change Breakdown</h3>
              <p class="text-xs text-gray-500 dark:text-gray-400">Track monthly gains/dips with salary vs market return details</p>
            </div>
          </div>
          <div class="chart-container" style="height: 280px;">
            <canvas id="chart-waterfall"></canvas>
          </div>
        </div>

        <!-- Rebalancing & Drift Advisor (1 col) -->
        <div class="glass-card p-5 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-sm">
          <h3 class="font-semibold text-gray-900 dark:text-white text-base mb-1">Rebalancing Advisor</h3>
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-4">Actual weights vs target profile</p>

          <div class="space-y-3 mb-4">
            <!-- Equity bar -->
            <div>
              <div class="flex justify-between text-xs font-medium mb-1">
                <span>Equity (${driftAnalysis.current.equity || 0}%)</span>
                <span class="text-gray-500">Target ${driftAnalysis.target.equity || 50}%</span>
              </div>
              <div class="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
                <div class="bg-blue-500 h-full rounded-full" style="width: ${Math.min(100, driftAnalysis.current.equity || 0)}%"></div>
              </div>
            </div>

            <!-- Debt bar -->
            <div>
              <div class="flex justify-between text-xs font-medium mb-1">
                <span>Debt/FD (${driftAnalysis.current.debt || 0}%)</span>
                <span class="text-gray-500">Target ${driftAnalysis.target.debt || 25}%</span>
              </div>
              <div class="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
                <div class="bg-emerald-500 h-full rounded-full" style="width: ${Math.min(100, driftAnalysis.current.debt || 0)}%"></div>
              </div>
            </div>

            <!-- Gold bar -->
            <div>
              <div class="flex justify-between text-xs font-medium mb-1">
                <span>Gold (${driftAnalysis.current.gold || 0}%)</span>
                <span class="text-gray-500">Target ${driftAnalysis.target.gold || 15}%</span>
              </div>
              <div class="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
                <div class="bg-amber-500 h-full rounded-full" style="width: ${Math.min(100, driftAnalysis.current.gold || 0)}%"></div>
              </div>
            </div>

            <!-- Cash bar -->
            <div>
              <div class="flex justify-between text-xs font-medium mb-1">
                <span>Cash (${driftAnalysis.current.cash || 0}%)</span>
                <span class="text-gray-500">Target ${driftAnalysis.target.cash || 10}%</span>
              </div>
              <div class="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
                <div class="bg-purple-500 h-full rounded-full" style="width: ${Math.min(100, driftAnalysis.current.cash || 0)}%"></div>
              </div>
            </div>
          </div>

          <!-- Rebalancing Tips -->
          <div class="space-y-2">
            ${driftAnalysis.tips.length > 0 ? driftAnalysis.tips.map(tip => `
              <div class="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900 text-xs">
                <div class="font-semibold text-indigo-700 dark:text-indigo-400 mb-0.5">${tip.badge}</div>
                <p class="text-gray-600 dark:text-gray-300 leading-relaxed">${tip.message}</p>
              </div>
            `).join('') : `
              <div class="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                <i data-lucide="check" class="w-4 h-4"></i>
                <span>Your asset allocation matches your target profile perfectly.</span>
              </div>
            `}
          </div>
        </div>
      </div>

      <!-- Performance Intelligence: Top Performers vs Laggards -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Top Performers -->
        <div class="glass-card p-5 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-sm">
          <div class="flex items-center gap-2 mb-3">
            <i data-lucide="zap" class="w-4 h-4 text-emerald-500"></i>
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm">Top Wealth Drivers</h3>
          </div>
          <div class="space-y-2">
            ${holdingAnalysis.topPerformers.length > 0 ? holdingAnalysis.topPerformers.map(item => `
              <div class="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 text-xs">
                <div>
                  <div class="font-semibold text-gray-900 dark:text-gray-100">${item.name}</div>
                  <div class="text-gray-400 text-[11px]">${ASSET_CATEGORIES[item.category]?.name || item.category}</div>
                </div>
                <div class="text-right">
                  <div class="font-bold font-mono-numeric text-emerald-600 dark:text-emerald-400">+${item.returnPct}%</div>
                  <div class="text-gray-400 text-[11px]">${UI.formatCurrency(item.currentValue)}</div>
                </div>
              </div>
            `).join('') : '<p class="text-xs text-gray-400 py-2">Add assets to see top drivers.</p>'}
          </div>
        </div>

        <!-- Dead Capital / Laggards -->
        <div class="glass-card p-5 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-sm">
          <div class="flex items-center gap-2 mb-3">
            <i data-lucide="alert-triangle" class="w-4 h-4 text-amber-500"></i>
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm">Underperformer / Laggard Detector</h3>
          </div>
          <div class="space-y-2">
            ${holdingAnalysis.laggards.length > 0 ? holdingAnalysis.laggards.map(item => `
              <div class="p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 text-xs">
                <div class="flex items-center justify-between mb-1">
                  <span class="font-semibold text-gray-900 dark:text-gray-100">${item.name}</span>
                  <span class="font-bold font-mono-numeric ${item.returnPct < 0 ? 'text-rose-600' : 'text-amber-600'}">${item.returnPct}%</span>
                </div>
                <p class="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">${item.recommendation}</p>
              </div>
            `).join('') : `
              <div class="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                <i data-lucide="check-circle" class="w-4 h-4"></i>
                <span>No dead capital detected. All active holdings are performing well!</span>
              </div>
            `}
          </div>
        </div>
      </div>
    `;

    // Initialize Lucide icons inside container
    if (window.lucide) window.lucide.createIcons({ root: container });

    // Render Charts
    ChartManager.renderJourneyChart('chart-journey', snapshots);
    ChartManager.renderAllocationChart('chart-allocation', summary.categoryBreakdown);
    ChartManager.renderGrowthWaterfallChart('chart-waterfall', snapshots);
  },

    /**
   * 2. Render Asset Registry
   */
  async renderAssets() {
    const container = document.getElementById('view-assets');
    if (!container) return;

    await PortfolioService.deduplicateDatabase();
    const allAssets = await PortfolioService.getHoldings();
    const summary = await PortfolioService.getPortfolioSummary();

    let lastRefreshedIso = await DB.getSetting('last_refreshed_at');
    if (!lastRefreshedIso) {
      lastRefreshedIso = new Date().toISOString();
      await DB.setSetting('last_refreshed_at', lastRefreshedIso);
    }
    const lastRefreshedFormatted = formatLastRefreshedTime(lastRefreshedIso);

    // Sorting & Filtering State
    if (!window.App.holdingsSort) window.App.holdingsSort = { column: 'current', dir: 'desc' };
    const sortCol = window.App.holdingsSort.column;
    const sortDir = window.App.holdingsSort.dir;
    const filterCategory = window.App.holdingsCategory || 'all';
    const searchQuery = (window.App.holdingsSearch || '').toLowerCase().trim();

    // Category Counts across all assets
    const counts = {
      all: allAssets.length,
      equity_stock: 0,
      equity_mf: 0,
      fixed_deposit: 0,
      bond: 0,
      gold: 0,
      liquid_cash: 0
    };
    allAssets.forEach(a => {
      if (counts[a.category] !== undefined) {
        counts[a.category]++;
      }
    });

    // Filter by Category
    let filtered = allAssets.filter(a => {
      if (filterCategory !== 'all' && a.category !== filterCategory) return false;
      return true;
    });

    // Sort Assets
    filtered.sort((a, b) => {
      let valA, valB;
      if (sortCol === 'name') {
        return (a.name || '').localeCompare(b.name || '') * (sortDir === 'asc' ? 1 : -1);
      } else if (sortCol === 'category') {
        const catA = ASSET_CATEGORIES[a.category]?.name || a.category || '';
        const catB = ASSET_CATEGORIES[b.category]?.name || b.category || '';
        return catA.localeCompare(catB) * (sortDir === 'asc' ? 1 : -1);
      } else if (sortCol === 'units') {
        valA = Number(a.units) || (a.category === 'fixed_deposit' || a.category === 'bond' ? Number(a.investedValue) : 1);
        valB = Number(b.units) || (b.category === 'fixed_deposit' || b.category === 'bond' ? Number(b.investedValue) : 1);
      } else if (sortCol === 'invested') {
        valA = Number(a.investedValue) || 0;
        valB = Number(b.investedValue) || 0;
      } else if (sortCol === 'gain') {
        valA = (Number(a.currentValue) || Number(a.investedValue) || 0) - (Number(a.investedValue) || 0);
        valB = (Number(b.currentValue) || Number(b.investedValue) || 0) - (Number(b.investedValue) || 0);
      } else { // default 'current'
        valA = Number(a.currentValue) || Number(a.investedValue) || 0;
        valB = Number(b.currentValue) || Number(b.investedValue) || 0;
      }
      return (valA - valB) * (sortDir === 'asc' ? 1 : -1);
    });

    // Totals for filtered list
    let filteredInvested = 0;
    let filteredCurrent = 0;
    filtered.forEach(a => {
      const inv = Number(a.investedValue) || 0;
      const cur = Number(a.currentValue) || inv;
      filteredInvested += inv;
      filteredCurrent += cur;
    });
    const filteredGain = filteredCurrent - filteredInvested;
    const filteredPct = filteredInvested > 0 ? ((filteredGain / filteredInvested) * 100).toFixed(1) : '0.0';

    // Helper for Sort Header
    const renderSortTh = (colKey, title, align = 'left') => {
      const isCurrent = sortCol === colKey;
      const alignClass = align === 'right' ? 'text-right justify-end' : 'text-left justify-start';
      const activeColor = isCurrent ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-gray-500 dark:text-gray-400';
      const arrowIcon = isCurrent
        ? (sortDir === 'asc'
          ? '<span class="inline-block text-xs font-black ml-1">↑</span>'
          : '<span class="inline-block text-xs font-black ml-1">↓</span>')
        : '<span class="inline-block text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 text-[10px] ml-1 transition-opacity">↕</span>';

      return `
        <th onclick="window.App.toggleHoldingsSort('${colKey}')" class="py-3 px-4 cursor-pointer select-none hover:bg-gray-100/70 dark:hover:bg-gray-700/50 transition-colors group ${align === 'right' ? 'text-right' : ''}" title="Sort by ${title}">
          <div class="flex items-center gap-1 ${alignClass} ${activeColor}">
            <span>${title}</span>
            ${arrowIcon}
          </div>
        </th>
      `;
    };

    const categoryTabs = [
      { id: 'all', label: 'All', count: counts.all },
      { id: 'equity_stock', label: 'Stocks', count: counts.equity_stock },
      { id: 'equity_mf', label: 'Mutual Funds', count: counts.equity_mf },
      { id: 'fixed_deposit', label: 'FDs', count: counts.fixed_deposit },
      { id: 'bond', label: 'Bonds & Debentures', count: counts.bond },
      { id: 'gold', label: 'Gold & SGB', count: counts.gold },
      { id: 'liquid_cash', label: 'Cash Buffer', count: counts.liquid_cash }
    ];

    container.innerHTML = `
      <!-- View Header & Action Toolbar -->
      <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-5">
        <div>
          <div class="flex items-center gap-2 flex-wrap">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white">Investment Holdings</h2>
            <span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/50" id="holdings-count-badge">
              ${filtered.length} Active Instruments
            </span>
            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 shadow-sm" title="Last live valuation update">
              <i data-lucide="clock" class="w-3 h-3 text-indigo-500"></i>
              <span>Last Refreshed: ${lastRefreshedFormatted}</span>
            </span>
          </div>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Track, sort, filter, and export individual stocks, mutual funds, FDs, gold, and bonds</p>
        </div>

        <div class="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <!-- Export Excel (.xlsx) -->
          <button id="btn-export-excel" onclick="window.App.exportHoldings('xlsx')" class="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300/70 dark:border-emerald-700/60 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm" title="Download Excel Spreadsheet (.xlsx) with all 53 instruments and totals">
            <i data-lucide="file-spreadsheet" class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400"></i>
            <span>Export Excel</span>
          </button>

          <!-- Export CSV (.csv) -->
          <button id="btn-export-csv" onclick="window.App.exportHoldings('csv')" class="px-3.5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm" title="Download CSV (.csv) file">
            <i data-lucide="download" class="w-3.5 h-3.5"></i>
            <span>CSV</span>
          </button>

          <!-- Sync Prices -->
          <button id="btn-sync-prices" onclick="window.App.syncPrices()" class="px-3.5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold flex items-center gap-1.5 transition-all">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
            <span>Sync Prices</span>
          </button>

          <!-- Add Asset -->
          <button onclick="window.App.openAddAssetModal()" class="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm shadow-indigo-500/20 transition-all">
            <i data-lucide="plus" class="w-4 h-4"></i>
            <span>Add Asset</span>
          </button>
        </div>
      </div>

      <!-- Filters & Search Bar -->
      <div class="glass-card p-3 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-sm mb-4">
        <div class="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <!-- Category Filter Pills -->
          <div class="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 text-xs no-scrollbar">
            ${categoryTabs.map(t => `
              <button onclick="window.App.setHoldingsCategory('${t.id}')" class="px-3 py-1.5 rounded-xl whitespace-nowrap transition-all flex items-center gap-1.5 text-xs ${filterCategory === t.id ? 'bg-indigo-600 text-white font-semibold shadow-sm shadow-indigo-500/20' : 'bg-gray-100/80 dark:bg-gray-800/80 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'}">
                <span>${t.label}</span>
                <span class="px-1.5 py-0.2 rounded-full text-[10px] ${filterCategory === t.id ? 'bg-indigo-700 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}">${t.count}</span>
              </button>
            `).join('')}
          </div>

          <!-- Live Search Input -->
          <div class="relative w-full md:w-64 flex-shrink-0">
            <i data-lucide="search" class="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"></i>
            <input type="text" id="holdings-search-input" value="${window.App.holdingsSearch || ''}" oninput="window.App.setHoldingsSearch(this.value)" placeholder="Search by name, symbol..." class="w-full pl-8 pr-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all" />
          </div>
        </div>
      </div>

      <!-- Holdings Table -->
      <div class="glass-card rounded-2xl border border-gray-200/80 dark:border-gray-800 overflow-hidden shadow-sm">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse table-compact">
            <thead>
              <tr class="border-b border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/40 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                ${renderSortTh('name', 'Asset / Instrument', 'left')}
                ${renderSortTh('category', 'Category', 'left')}
                ${renderSortTh('units', 'Units / Principal', 'right')}
                ${renderSortTh('invested', 'Cost / Rate', 'right')}
                ${renderSortTh('current', 'Current Value', 'right')}
                ${renderSortTh('gain', 'Gain / Status', 'right')}
                <th class="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody id="holdings-table-body" class="divide-y divide-gray-100 dark:divide-gray-800/60 text-xs">
              ${filtered.length > 0 ? filtered.map(asset => {
                const cat = ASSET_CATEGORIES[asset.category] || ASSET_CATEGORIES.liquid_cash;
                const invested = Number(asset.investedValue) || 0;
                const current = Number(asset.currentValue) || invested;
                const profit = current - invested;
                const pct = invested > 0 ? ((profit / invested) * 100).toFixed(1) : '0.0';
                const isFD = asset.category === 'fixed_deposit' || asset.category === 'bond';
                const isGold = asset.category === 'gold';
                const isCash = asset.category === 'liquid_cash';
                const isUs = asset.currency === 'USD' || (asset.id && asset.id.startsWith('ast_us_'));

                let maturityHtml = '';
                if ((isFD || isGold) && asset.maturityDate) {
                  const matDate = new Date(asset.maturityDate);
                  if (!isNaN(matDate.getTime())) {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const diffMs = matDate.getTime() - today.getTime();
                    const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                    if (daysLeft > 0) {
                      maturityHtml = `<div class="text-[10px] text-indigo-500 font-medium">${daysLeft.toLocaleString('en-IN')} days to maturity (${asset.maturityDate})</div>`;
                    } else if (daysLeft === 0) {
                      maturityHtml = `<div class="text-[10px] text-amber-500 font-medium">Matures today (${asset.maturityDate})</div>`;
                    } else {
                      maturityHtml = `<div class="text-[10px] text-gray-400 font-medium">Matured on ${asset.maturityDate}</div>`;
                    }
                  }
                }

                const searchMeta = `${asset.name} ${asset.symbolOrCode || ''} ${cat.name}`.toLowerCase();

                return `
                  <tr data-asset-row="true" data-asset-id="${asset.id}" data-search="${searchMeta}" data-invested="${invested}" data-current="${current}" data-gain="${profit}" class="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors">
                    <td class="py-3 px-4">
                      <div class="font-semibold text-gray-900 dark:text-gray-100">${asset.name}</div>
                      <div class="flex items-center gap-1.5 flex-wrap mt-0.5">
                        ${asset.symbolOrCode ? `<span class="text-[11px] text-gray-400 font-mono">${asset.symbolOrCode}</span>` : ''}
                        ${isUs ? `<span class="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-500/10 text-blue-500 border border-blue-500/20 font-mono">INDmoney • USD</span>` : ''}
                      </div>
                      ${maturityHtml}
                      ${isCash ? `<div class="text-[10px] text-purple-500 font-medium">100% Liquid Emergency Reserve</div>` : ''}
                    </td>
                    <td class="py-3 px-4">
                      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium" style="background-color: ${cat.color}15; color: ${cat.color};">
                        <span class="w-1.5 h-1.5 rounded-full" style="background-color: ${cat.color};"></span>
                        ${cat.name}
                      </span>
                    </td>
                    <td class="py-3 px-4 text-right font-mono-numeric text-gray-600 dark:text-gray-300">
                      ${isCash ? '<span class="text-gray-400 font-normal">Cash Buffer</span>' : (isFD ? UI.formatCurrency(invested) : (Number(asset.units) ? Number(asset.units).toLocaleString('en-IN', { maximumFractionDigits: 4 }) : 1))}
                    </td>
                    <td class="py-3 px-4 text-right font-mono-numeric text-gray-600 dark:text-gray-300">
                      ${isCash ? '<span class="text-gray-400 font-normal">1:1 Par</span>' : (isFD ? (asset.interestRate ? `${asset.interestRate}% p.a.` : '<span class="text-gray-400 font-normal">Fixed Rate</span>') : `
                        <div class="font-medium">${UI.formatCurrency(invested)}${isUs && asset.usdInvested ? ` <span class="text-[10px] text-blue-500/80 font-normal font-mono">($${Number(asset.usdInvested).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>` : ''}</div>
                        ${asset.units > 0 && asset.units !== 1 ? `<div class="text-[10px] text-gray-400 font-mono">Avg ${UI.formatCurrency(asset.buyPrice)}${isUs && asset.usdBuyPrice ? ` <span class="text-blue-500/80">($${Number(asset.usdBuyPrice).toFixed(2)})</span>` : ''}</div>` : ''}
                      `)}
                    </td>
                    <td class="py-3 px-4 text-right font-semibold font-mono-numeric text-gray-900 dark:text-white">
                      <div>${UI.formatCurrency(current)}${isUs && asset.usdCurrent ? ` <span class="text-[10px] text-blue-500/80 font-normal font-mono">($${Number(asset.usdCurrent).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>` : ''}</div>
                      ${!isCash && !isFD && asset.units > 0 && asset.units !== 1 ? `<div class="text-[10px] text-gray-400 font-mono font-normal">${asset.category === 'gold' ? 'Rate ' : (asset.category === 'equity_stock' ? 'Price ' : 'NAV ')}${UI.formatCurrency(current / asset.units)}${isUs && (asset.usdPrice || (asset.usdCurrent && asset.units)) ? ` <span class="text-blue-500/80">($${Number(asset.usdPrice || (asset.usdCurrent / asset.units)).toFixed(2)})</span>` : ''}</div>` : ''}
                    </td>
                    <td class="py-3 px-4 text-right font-mono-numeric">
                      ${isCash ? `
                        <div class="text-xs text-purple-600 dark:text-purple-400 font-semibold">Liquid Buffer</div>
                        <div class="text-[11px] text-gray-400">Zero Risk</div>
                      ` : `
                        <div class="font-bold ${profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
                          ${profit >= 0 ? '+' : ''}${UI.formatCurrency(profit)}
                        </div>
                        <div class="text-[11px] text-gray-400">
                          ${profit >= 0 ? '+' : ''}${pct}%
                        </div>
                      `}
                    </td>
                    <td class="py-3 px-4 text-center">
                      <div class="flex items-center justify-center gap-1.5">
                        <button onclick="window.App.editAsset('${asset.id}')" class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:text-gray-400" title="Edit Asset">
                          <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                        </button>
                        <button onclick="window.App.deleteAsset('${asset.id}')" class="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-gray-400 hover:text-rose-600" title="Delete Asset">
                          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('') : `
                <tr>
                  <td colspan="7" class="text-center py-10 text-gray-400">
                    <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
                    <p class="text-xs">No investment holdings match the current filter.</p>
                    <p class="text-[11px] text-gray-400 mt-1">Try selecting "All" or resetting your search.</p>
                  </td>
                </tr>
              `}
              <!-- Hidden Row for Live Search 'No Results' -->
              <tr id="holdings-no-search-results" class="hidden">
                <td colspan="7" class="text-center py-8 text-gray-400">
                  <i data-lucide="search-x" class="w-7 h-7 mx-auto mb-1.5 opacity-50"></i>
                  <p class="text-xs">No matching holdings found for your search.</p>
                </td>
              </tr>
            </tbody>
            <!-- Table Footer: Live Totals for Filtered View -->
            <tfoot>
              <tr class="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/60 font-semibold text-xs">
                <td class="py-3.5 px-4 text-gray-900 dark:text-white" colspan="2">
                  <div class="flex items-center gap-2">
                    <span class="font-bold">Total (${filtered.length} Instruments)</span>
                  </div>
                </td>
                <td class="py-3.5 px-4 text-right text-gray-500 dark:text-gray-400">
                  ${filtered.length} Active
                </td>
                <td class="py-3.5 px-4 text-right font-mono-numeric text-gray-900 dark:text-white" id="holdings-foot-invested">
                  ${UI.formatCurrency(filteredInvested)}
                </td>
                <td class="py-3.5 px-4 text-right font-semibold font-mono-numeric text-gray-900 dark:text-white" id="holdings-foot-current">
                  ${UI.formatCurrency(filteredCurrent)}
                </td>
                <td class="py-3.5 px-4 text-right font-mono-numeric" id="holdings-foot-gain">
                  <div class="font-bold ${filteredGain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
                    ${filteredGain >= 0 ? '+' : ''}${UI.formatCurrency(filteredGain)}
                  </div>
                  <div class="text-[11px] text-gray-400 font-normal">
                    ${filteredGain >= 0 ? '+' : ''}${filteredPct}%
                  </div>
                </td>
                <td class="py-3.5 px-4 text-center"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons({ root: container });

    // Apply live search filtering if query exists
    if (searchQuery) {
      window.App?.setHoldingsSearch?.(searchQuery);
    }
  },

  /**
   * 3. Render Monthly Review Ritual
   */
  async renderReview() {
    const container = document.getElementById('view-review');
    if (!container) return;

    const summary = await PortfolioService.getPortfolioSummary();
    const snapshots = await SnapshotService.getHistory();
    const currMonth = new Date().toISOString().substring(0, 7);

    container.innerHTML = `
      <div class="max-w-3xl mx-auto mb-8">
        <div class="text-center mb-6">
          <span class="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 mb-2 inline-block">
            The Monthly Payday Ritual
          </span>
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Record Monthly Review</h2>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Capture your snapshot to isolate how much your wealth grew from market performance vs your salary savings.
          </p>
        </div>

        <!-- Review Form Card -->
        <div class="glass-card p-6 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-md">
          <form id="form-monthly-review" onsubmit="window.App.submitMonthlyReview(event)" class="space-y-5">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Review Month (YYYY-MM)</label>
                <input type="month" id="review-month" required value="${currMonth}" class="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Fresh Savings Injected from Salary (${UI.activeCurrency === 'INR' ? '₹' : '$'})</label>
                <input type="number" id="review-fresh-savings" min="0" step="100" placeholder="e.g. 35000" class="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                <p class="text-[11px] text-gray-400 mt-1">Money you saved/added to SIPs/FDs from this month's salary.</p>
              </div>
            </div>

            <div class="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200/60 dark:border-gray-700/60 text-xs">
              <div class="flex justify-between items-center mb-1">
                <span class="text-gray-500">Current Portfolio Market Value:</span>
                <span class="font-bold font-mono-numeric text-gray-900 dark:text-white text-sm">${UI.formatCurrency(summary.totalCurrentValue)}</span>
              </div>
              <div class="flex justify-between items-center text-gray-400 text-[11px]">
                <span>Total Capital Invested to date:</span>
                <span class="font-mono-numeric">${UI.formatCurrency(summary.totalInvested)}</span>
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Monthly Reflection / Notes (Optional)</label>
              <textarea id="review-notes" rows="2" placeholder="e.g. Received performance bonus; increased index fund SIP by 10%." class="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"></textarea>
            </div>

            <button type="submit" class="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2">
              <i data-lucide="check-circle" class="w-4 h-4"></i>
              <span>Confirm and Save Monthly Snapshot</span>
            </button>
          </form>
        </div>

        <!-- Historical Snapshots Table -->
        <div class="mt-8">
          <h3 class="font-bold text-gray-900 dark:text-white text-base mb-3">Snapshot History</h3>
          <div class="glass-card rounded-2xl border border-gray-200/80 dark:border-gray-800 overflow-hidden shadow-sm">
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse table-compact text-xs">
                <thead>
                  <tr class="border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40 text-[11px] font-semibold uppercase text-gray-500">
                    <th class="py-3 px-4">Month</th>
                    <th class="py-3 px-4 text-right">Net Worth</th>
                    <th class="py-3 px-4 text-right">Fresh Savings</th>
                    <th class="py-3 px-4 text-right">Organic Return</th>
                    <th class="py-3 px-4 text-right">Net Change</th>
                    <th class="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-800/60 font-mono-numeric">
                  ${snapshots.length > 0 ? [...snapshots].reverse().map(s => `
                    <tr class="hover:bg-gray-50/80 dark:hover:bg-gray-800/40">
                      <td class="py-2.5 px-4 font-semibold text-gray-900 dark:text-white">${s.month}</td>
                      <td class="py-2.5 px-4 text-right font-bold text-gray-900 dark:text-white">${UI.formatCurrency(s.totalNetWorth)}</td>
                      <td class="py-2.5 px-4 text-right text-indigo-600 dark:text-indigo-400">+${UI.formatCurrency(s.freshSalaryAdded || 0)}</td>
                      <td class="py-2.5 px-4 text-right ${s.organicMarketGain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}">
                        ${s.organicMarketGain >= 0 ? '+' : ''}${UI.formatCurrency(s.organicMarketGain || 0)}
                      </td>
                      <td class="py-2.5 px-4 text-right font-semibold ${s.netChange >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}">
                        ${s.netChange >= 0 ? '+' : ''}${UI.formatCurrency(s.netChange || 0)}
                      </td>
                      <td class="py-2.5 px-4 text-center">
                        <button onclick="window.App.deleteSnapshot('${s.month}')" class="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 text-gray-400 hover:text-rose-600">
                          <i data-lucide="trash" class="w-3.5 h-3.5"></i>
                        </button>
                      </td>
                    </tr>
                  `).join('') : `
                    <tr>
                      <td colspan="6" class="text-center py-6 text-gray-400">No snapshots recorded yet.</td>
                    </tr>
                  `}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons({ root: container });
  },

  /**
   * 4. Render Wealth Predictor
   */
  async renderPredictor() {
    const container = document.getElementById('view-predictor');
    if (!container) return;

    const defaultSavings = await DB.getSetting('monthlySalaryTarget', 35000);
    const projection = await PredictorService.generateProjection({ monthlySavings: defaultSavings, months: 12 });

    container.innerHTML = `
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 class="text-xl font-bold text-gray-900 dark:text-white">Future Wealth Predictor</h2>
          <p class="text-xs text-gray-500 dark:text-gray-400">Simulate wealth trajectory over 6 to 36 months under varying scenarios and savings rates</p>
        </div>
        <div class="flex items-center gap-1 p-1 rounded-xl bg-gray-100 dark:bg-gray-800 text-xs font-semibold">
          <button onclick="window.App.changeProjectionHorizon(6)" id="horizon-btn-6" class="px-3 py-1.5 rounded-lg transition-all text-gray-500">6M</button>
          <button onclick="window.App.changeProjectionHorizon(12)" id="horizon-btn-12" class="px-3 py-1.5 rounded-lg transition-all bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-400">12M</button>
          <button onclick="window.App.changeProjectionHorizon(24)" id="horizon-btn-24" class="px-3 py-1.5 rounded-lg transition-all text-gray-500">24M</button>
          <button onclick="window.App.changeProjectionHorizon(36)" id="horizon-btn-36" class="px-3 py-1.5 rounded-lg transition-all text-gray-500">36M</button>
        </div>
      </div>

      <!-- Outcome Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <!-- Conservative Card -->
        <div class="glass-card p-5 rounded-2xl border border-amber-500/20 shadow-sm">
          <div class="flex items-center justify-between text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">
            <span>Worst-Case (Correction/Stagnant)</span>
            <i data-lucide="shield-alert" class="w-4 h-4"></i>
          </div>
          <div class="text-2xl font-bold font-mono-numeric text-gray-900 dark:text-white" id="proj-card-conservative">
            ${UI.formatCurrency(projection.outcomes.conservative)}
          </div>
          <p class="text-[11px] text-gray-400 mt-1">Flat equity, 5% safe debt return only.</p>
        </div>

        <!-- Moderate Card -->
        <div class="glass-card p-5 rounded-2xl border border-blue-500/30 shadow-sm ring-1 ring-blue-500/10">
          <div class="flex items-center justify-between text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">
            <span>Moderate (Current Pace)</span>
            <i data-lucide="trending-up" class="w-4 h-4"></i>
          </div>
          <div class="text-2xl font-bold font-mono-numeric text-gray-900 dark:text-white" id="proj-card-moderate">
            ${UI.formatCurrency(projection.outcomes.moderate)}
          </div>
          <p class="text-[11px] text-gray-400 mt-1">Historical weighted compounding + discipline.</p>
        </div>

        <!-- Aggressive Card -->
        <div class="glass-card p-5 rounded-2xl border border-emerald-500/30 shadow-sm">
          <div class="flex items-center justify-between text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1">
            <span>Aggressive (Bull + Step-Up)</span>
            <i data-lucide="rocket" class="w-4 h-4"></i>
          </div>
          <div class="text-2xl font-bold font-mono-numeric text-gray-900 dark:text-white" id="proj-card-aggressive">
            ${UI.formatCurrency(projection.outcomes.aggressive)}
          </div>
          <p class="text-[11px] text-gray-400 mt-1">16% market run + 10% annual salary step-up.</p>
        </div>
      </div>

      <!-- Simulation Slider & Chart -->
      <div class="glass-card p-6 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-sm mb-6">
        <div class="mb-5 pb-5 border-b border-gray-100 dark:border-gray-800">
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-2">
            <label class="text-xs font-semibold text-gray-700 dark:text-gray-300">
              Interactive "What-If" Monthly Savings Slider:
            </label>
            <span class="font-bold font-mono-numeric text-indigo-600 dark:text-indigo-400 text-base" id="slider-savings-label">
              ${UI.formatCurrency(defaultSavings)} / month
            </span>
          </div>
          <input type="range" id="slider-monthly-savings" min="5000" max="250000" step="2500" value="${defaultSavings}" oninput="window.App.updateProjectionSlider(this.value)" class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
          <div class="flex justify-between text-[10px] text-gray-400 mt-1">
            <span>${UI.formatCurrency(5000)}</span>
            <span>${UI.formatCurrency(100000)}</span>
            <span>${UI.formatCurrency(250000)}</span>
          </div>
        </div>

        <div class="chart-container" style="height: 340px;">
          <canvas id="chart-prediction"></canvas>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons({ root: container });
    ChartManager.renderPredictionChart('chart-prediction', projection);
  },

  /**
   * 5. Render Excel Import & Settings View
   */
  async renderSettings() {
    const container = document.getElementById('view-settings');
    if (!container) return;

    const currency = await DB.getSetting('currency', 'INR');
    const monthlyTarget = await DB.getSetting('monthlySalaryTarget', 35000);
    const emergencyExp = await DB.getSetting('emergencyMonthlyExpense', 40000);
    const targetAlloc = await DB.getSetting('targetAllocation', { equity: 50, debt: 25, gold: 15, cash: 10 });
    const geminiKey = await DB.getSetting('geminiApiKey', '') || localStorage.getItem('fp_gemini_key') || '';

    container.innerHTML = `
      <div class="max-w-4xl mx-auto space-y-8">
        <!-- 🤖 AI Document & Statement Agent -->
        <div class="glass-card p-6 rounded-2xl border border-indigo-500/30 dark:border-indigo-500/20 shadow-md bg-gradient-to-br from-indigo-50/40 via-white to-emerald-50/20 dark:from-indigo-950/20 dark:via-gray-900 dark:to-emerald-950/10">
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
                <i data-lucide="bot" class="w-5 h-5"></i>
              </div>
              <div>
                <h3 class="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <span>AI Document & Statement Agent</span>
                  <span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">Gemini 2.5 Flash</span>
                </h3>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  Upload ANY Word doc, PDF, Notepad note, WhatsApp text, or screenshot. The Agent reads and extracts it automatically.
                </p>
              </div>
            </div>
          </div>

          <!-- API Key Input -->
          <div class="mb-4 p-3.5 rounded-xl bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700">
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-1.5">
              <label class="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <i data-lucide="key" class="w-3.5 h-3.5 text-indigo-500"></i>
                <span>Google Gemini API Key</span>
              </label>
              <a href="https://aistudio.google.com/app/apikey" target="_blank" class="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
                <span>Get a 100% Free API Key (Google AI Studio)</span>
                <i data-lucide="external-link" class="w-3 h-3"></i>
              </a>
            </div>
            <div class="flex items-center gap-2">
              <input type="password" id="input-gemini-key" value="${geminiKey}" placeholder="Paste free key: AIzaSy..." class="flex-1 px-3.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs font-mono text-gray-900 dark:text-white" />
              <button onclick="window.App.saveGeminiKey()" class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold">
                Save Key
              </button>
            </div>
          </div>

          <!-- Dual Input: File Dropzone OR Raw Text Paste -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <!-- Dropzone -->
            <div id="dropzone-ai-file" ondragover="event.preventDefault(); this.classList.add('border-indigo-500')" ondragleave="this.classList.remove('border-indigo-500')" ondrop="window.App.handleAiFileDrop(event)" class="border-2 border-dashed border-indigo-200 dark:border-indigo-900/60 rounded-xl p-5 text-center cursor-pointer hover:border-indigo-500 transition-colors bg-indigo-50/30 dark:bg-indigo-950/10 flex flex-col items-center justify-center">
              <input type="file" id="file-input-ai" accept=".pdf, .docx, .doc, .txt, .xlsx, .csv, .png, .jpg, .jpeg" onchange="window.App.handleAiFileSelect(event)" class="hidden" />
              <div onclick="document.getElementById('file-input-ai').click()">
                <i data-lucide="file-up" class="w-8 h-8 mx-auto mb-1.5 text-indigo-500"></i>
                <p class="text-xs font-semibold text-gray-800 dark:text-gray-200">Upload Any File</p>
                <p class="text-[10px] text-gray-400 mt-0.5">PDF, Word, TXT, Excel, PNG/JPG</p>
              </div>
            </div>

            <!-- Raw Text Area -->
            <div>
              <textarea id="ai-raw-text-input" rows="3" placeholder="Or paste raw text / WhatsApp memo / Notepad entries here (e.g. 'Aug 24: PPF 1.5L, TCS 25 shares, Gold 32k...')" class="w-full h-full min-h-[100px] p-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"></textarea>
            </div>
          </div>

          <!-- Custom Instructions / Directives for AI Agent -->
          <div class="mb-4 p-3.5 rounded-xl bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700">
            <label class="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center justify-between">
              <span class="flex items-center gap-1.5">
                <i data-lucide="message-square" class="w-3.5 h-3.5 text-indigo-500"></i>
                <span>Custom Instructions for AI Agent (Optional)</span>
              </span>
              <span class="text-[11px] text-gray-400">Tell the agent how to handle this file</span>
            </label>
            <input type="text" id="ai-user-instructions" placeholder="e.g. 'Replace Nuvama holding with the individual stocks, bonds, SGBs, and InvITs in this statement'" class="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
            
            <!-- Quick prompt chips -->
            <div class="flex flex-wrap items-center gap-1.5 mt-2">
              <span class="text-[10px] text-gray-400 font-semibold mr-1">Quick prompts:</span>
              <button type="button" onclick="document.getElementById('ai-user-instructions').value='Replace Nuvama holding with the individual stocks, bonds, SGBs, and InvITs in this statement'" class="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-[11px] font-medium border border-indigo-200 dark:border-indigo-800 transition-colors">
                ✨ Replace 'nuvama' with this breakdown
              </button>
              <button type="button" onclick="document.getElementById('ai-user-instructions').value='Add these new holdings without modifying existing ones'" class="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-700 dark:text-gray-300 text-[11px] font-medium transition-colors">
                ➕ Add as new holdings
              </button>
              <button type="button" onclick="document.getElementById('ai-user-instructions').value='Update current market values only'" class="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-700 dark:text-gray-300 text-[11px] font-medium transition-colors">
                🔄 Update current market values only
              </button>
            </div>
          </div>

          <div class="flex items-center justify-between">
            <span id="ai-parse-status" class="text-xs text-gray-500"></span>
            <button id="btn-parse-ai" onclick="window.App.parseWithAi()" class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-700 hover:to-emerald-700 text-white text-xs font-semibold shadow-md flex items-center gap-2 ml-auto">
              <i data-lucide="sparkles" class="w-4 h-4"></i>
              <span>Analyze & Extract with AI Agent</span>
            </button>
          </div>
        </div>

        <!-- Excel / CSV Historical Data Importer -->
        <div class="glass-card p-6 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <i data-lucide="file-spreadsheet" class="w-5 h-5 text-emerald-600"></i>
                <span>Import Historical Data from Excel / CSV</span>
              </h3>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Load 2–3 years of past monthly investments to immediately backfill your wealth compounding history.
              </p>
            </div>
            <button onclick="window.App.downloadSampleExcel()" class="px-3 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 transition-all">
              <i data-lucide="download" class="w-3.5 h-3.5"></i>
              <span>Download Template</span>
            </button>
          </div>

          <!-- Drag and Drop Dropzone -->
          <div id="dropzone-excel" ondragover="event.preventDefault(); this.classList.add('border-indigo-500')" ondragleave="this.classList.remove('border-indigo-500')" ondrop="window.App.handleFileDrop(event)" class="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl p-8 text-center hover:border-indigo-500 transition-colors cursor-pointer bg-gray-50/50 dark:bg-gray-800/30">
            <input type="file" id="file-input-excel" accept=".xlsx, .xls, .csv" onchange="window.App.handleFileSelect(event)" class="hidden" />
            <div onclick="document.getElementById('file-input-excel').click()">
              <i data-lucide="upload-cloud" class="w-10 h-10 mx-auto mb-2 text-indigo-500 opacity-80"></i>
              <p class="text-xs font-semibold text-gray-800 dark:text-gray-200">
                Click to browse or drag & drop your <span class="text-indigo-600">.xlsx</span> or <span class="text-indigo-600">.csv</span> file
              </p>
              <p class="text-[11px] text-gray-400 mt-1">Processed 100% locally in your browser — your file is never uploaded to any cloud server.</p>
            </div>
          </div>
        </div>

        <!-- Preferences & Budget Settings -->
        <div class="glass-card p-6 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-sm">
          <h3 class="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <i data-lucide="sliders" class="w-5 h-5 text-indigo-600"></i>
            <span>Preferences & Risk Targets</span>
          </h3>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
            <div>
              <label class="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Default Currency</label>
              <select id="setting-currency" onchange="window.App.updateCurrency(this.value)" class="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs">
                <option value="INR" ${currency === 'INR' ? 'selected' : ''}>INR - ₹ Indian Rupee</option>
                <option value="USD" ${currency === 'USD' ? 'selected' : ''}>USD - $ US Dollar</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Target Monthly Savings</label>
              <input type="number" id="setting-monthly-savings" value="${monthlyTarget}" class="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs font-mono" />
            </div>

            <div>
              <label class="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Monthly Living Expenses (for Emergency Runway)</label>
              <input type="number" id="setting-emergency-exp" value="${emergencyExp}" class="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs font-mono" />
            </div>
          </div>

          <button onclick="window.App.savePreferences()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-all">
            Save Preferences
          </button>
        </div>

        <!-- Security & Data Vault -->
        <div class="glass-card p-6 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-sm">
          <h3 class="text-base font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
            <i data-lucide="lock" class="w-5 h-5 text-emerald-600"></i>
            <span>Master PIN & Encrypted Backup</span>
          </h3>
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Protect your numbers on this device and export encrypted backups for migration or safety.
          </p>

          <div class="flex flex-wrap items-center gap-3">
            <button onclick="window.App.openPinChangeModal()" class="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <i data-lucide="key" class="w-3.5 h-3.5"></i>
              <span>Change Master PIN</span>
            </button>
            <button onclick="window.App.exportBackup()" class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-2 shadow-sm">
              <i data-lucide="download" class="w-3.5 h-3.5"></i>
              <span>Export Encrypted Backup (.json)</span>
            </button>
            <button onclick="window.App.openRestoreBackup()" class="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-700 dark:text-gray-300 text-xs font-semibold flex items-center gap-2">
              <i data-lucide="upload" class="w-3.5 h-3.5"></i>
              <span>Restore from Backup</span>
            </button>
            <button onclick="window.App.lockVaultNow()" class="px-4 py-2 rounded-xl border border-rose-300 dark:border-rose-900 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold flex items-center gap-2 ml-auto">
              <i data-lucide="lock" class="w-3.5 h-3.5"></i>
              <span>Lock Vault Now</span>
            </button>
          </div>
        </div>

        <!-- Official Portfolio Restoration (Sep 2026) -->
        <div class="glass-card p-6 rounded-2xl border border-indigo-200/80 dark:border-indigo-900/50 shadow-sm bg-indigo-50/20 dark:bg-indigo-950/20">
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 class="text-base font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                <i data-lucide="rotate-ccw" class="w-5 h-5 text-indigo-600 dark:text-indigo-400"></i>
                <span>Reset to Official Portfolio (Sep 2026)</span>
              </h3>
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">
                Restore all 53 active instruments from Nuvama and INDmoney (₹54.29 Lakhs Net Worth) plus the verified 28-month historical tracking timeline (June 2024 to September 2026).
              </p>
            </div>
            <button onclick="window.App.resetToOfficialPortfolio()" class="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition-all shrink-0">
              <i data-lucide="database" class="w-4 h-4"></i>
              <span>Restore Official Data</span>
            </button>
          </div>
        </div>

        <!-- Danger Zone: Clean Up All Data & Start Fresh -->
        <div class="glass-card p-6 rounded-2xl border border-rose-200 dark:border-rose-900/40 shadow-sm bg-rose-50/30 dark:bg-rose-950/20">
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 class="text-base font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <i data-lucide="trash-2" class="w-5 h-5 text-rose-600 dark:text-rose-400"></i>
                <span>Clean Up All Data & Start Fresh</span>
              </h3>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Permanently delete all investment holdings, historical monthly snapshots, and custom calculations to start with a completely empty portfolio.
              </p>
            </div>
            <button onclick="window.App.resetAllData()" class="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-lg shadow-rose-600/20 flex items-center gap-2 transition-all shrink-0">
              <i data-lucide="alert-triangle" class="w-4 h-4"></i>
              <span>Clean Up All Data</span>
            </button>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons({ root: container });
  }
};
