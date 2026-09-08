/**
 * app.js - Main Application Orchestrator
 * Coordinates Navigation, Security Vault, State Management, and Event Handlers.
 */

import { AuthService } from './auth.js';
import { DB } from './db.js';
import { PortfolioService, ASSET_CATEGORIES } from './modules/portfolio.js';
import { SnapshotService } from './modules/snapshot.js';
import { PredictorService } from './modules/predictor.js';
import { ImporterService } from './modules/importer.js';
import { MFApiService } from './api/mfapi.js';
import { GeminiService } from './api/gemini.js';
import { UI } from './ui/components.js';
import { Views } from './ui/views.js';
import { ChartManager } from './ui/charts.js';
import { GoldView } from './ui/goldView.js';

class Application {
  constructor() {
    this.activeView = 'dashboard';
    this.projectionMonths = 12;
    this.tempImportData = null;
    this.mfSearchDebounce = null;
    this.holdingsSort = { column: 'current', dir: 'desc' };
    this.holdingsCategory = 'all';
    this.holdingsSearch = '';
  }

  /**
   * Initialize App on DOMContentLoaded
   */
  async init() {
    // 1. Theme setup
    const isDark = localStorage.getItem('fp_theme') === 'dark' ||
      (!('fp_theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // 1.5 Ensure initial last_refreshed_at setting
    if (!await DB.getSetting('last_refreshed_at')) {
      await DB.setSetting('last_refreshed_at', new Date().toISOString());
    }

    // 2. Load currency preference
    const savedCurrency = await DB.getSetting('currency', 'INR');
    UI.setCurrency(savedCurrency);
    const currBtn = document.getElementById('btn-currency-toggle');
    if (currBtn) currBtn.textContent = savedCurrency === 'INR' ? '₹ INR' : '$ USD';

    // 3. Vault PIN Check
    if (AuthService.isPinConfigured()) {
      if (!AuthService.isUnlocked()) {
        this.showVaultLockModal('unlock');
        return;
      }
    } else {
      // First-time user setup: seed demo portfolio if database is completely blank
      const existingAssets = await PortfolioService.getHoldings();
      if (existingAssets.length === 0) {
        await PortfolioService.seedOfficialPortfolio(false);
      } else {
        await PortfolioService.deduplicateDatabase();
      }
    }

    // 4. Initial view render
    await this.navigateTo(this.activeView);
  }

  /**
   * Navigation Controller
   */
  async navigateTo(viewName) {
    this.activeView = viewName;

    // Update nav tab styling
    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.classList.remove('text-indigo-600', 'dark:text-indigo-400', 'bg-indigo-50', 'dark:bg-indigo-950/60');
      btn.classList.add('text-gray-600', 'dark:text-gray-400');
    });

    const activeBtn = document.getElementById(`nav-btn-${viewName}`);
    if (activeBtn) {
      activeBtn.classList.remove('text-gray-600', 'dark:text-gray-400');
      activeBtn.classList.add('text-indigo-600', 'dark:text-indigo-400', 'bg-indigo-50', 'dark:bg-indigo-950/60');
    }

    // Switch panels
    document.querySelectorAll('.view-panel').forEach(panel => {
      panel.classList.add('hidden');
      panel.classList.remove('block');
    });

    const targetPanel = document.getElementById(`view-${viewName}`);
    if (targetPanel) {
      targetPanel.classList.remove('hidden');
      targetPanel.classList.add('block');
    }

    // Render corresponding view
    switch (viewName) {
      case 'dashboard':
        await Views.renderDashboard();
        break;
      case 'assets':
        await Views.renderAssets();
        break;
      case 'review':
        await Views.renderReview();
        break;
      case 'predictor':
        await Views.renderPredictor();
        break;
      case 'gold':
        await GoldView.renderGoldDashboard();
        break;
      case 'settings':
        await Views.renderSettings();
        break;
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ==================== GOLD AGENT HANDLERS ====================
  async refreshGoldForecast() {
    await GoldView.refreshForecast();
  }

  handleShockSliderChange() {
    GoldView.handleShockSliderChange();
  }

  resetGoldSimulator() {
    GoldView.resetShockSimulator();
  }

  setGoldChartCurrency(curr) {
    GoldView.setChartCurrency(curr);
  }

  async runGoldBacktest() {
    await GoldView.runBacktest();
  }

  async exportGoldLedger() {
    await GoldView.exportLedger();
  }

  toggleMobileMenu() {
    const menu = document.getElementById('mobile-menu');
    if (menu) menu.classList.toggle('hidden');
  }

  toggleDarkMode() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('fp_theme', isDark ? 'dark' : 'light');
    // Re-render current view to update chart colors
    this.navigateTo(this.activeView);
  }

  async toggleCurrency() {
    const nextCurr = UI.activeCurrency === 'INR' ? 'USD' : 'INR';
    await this.updateCurrency(nextCurr);
  }

  async updateCurrency(curr) {
    UI.setCurrency(curr);
    await DB.setSetting('currency', curr);
    const currBtn = document.getElementById('btn-currency-toggle');
    if (currBtn) currBtn.textContent = curr === 'INR' ? '₹ INR' : '$ USD';
    UI.toast(`Switched currency display to ${curr}`, 'info');
    await this.navigateTo(this.activeView);
  }

  // ==================== VAULT SECURITY ====================
  showVaultLockModal(mode = 'unlock') {
    const modal = document.getElementById('modal-vault-lock');
    const title = document.getElementById('vault-modal-title');
    const desc = document.getElementById('vault-modal-desc');
    const btnText = document.getElementById('vault-submit-btn-text');
    const input = document.getElementById('vault-input-pin');

    if (input) input.value = '';

    if (mode === 'setup') {
      title.textContent = 'Create Master Vault PIN';
      desc.textContent = 'Choose a 4-12 digit PIN to encrypt and protect your portfolio data locally.';
      btnText.textContent = 'Set PIN and Protect Vault';
    } else {
      title.textContent = 'Unlock Financial Vault';
      desc.textContent = 'Enter your Master PIN to decrypt and access your personal portfolio.';
      btnText.textContent = 'Unlock Vault';
    }

    UI.openModal('modal-vault-lock');
    if (input) setTimeout(() => input.focus(), 150);
  }

  async handleVaultSubmit(e) {
    e.preventDefault();
    const pin = document.getElementById('vault-input-pin').value.trim();
    if (!pin) return;

    if (!AuthService.isPinConfigured()) {
      // Setup PIN
      await AuthService.setupMasterPin(pin);
      UI.closeModal('modal-vault-lock');
      UI.toast('Master PIN configured! Vault is protected with AES-256-GCM.', 'success');
      await this.navigateTo('dashboard');
    } else {
      // Verify PIN
      const valid = await AuthService.verifyPin(pin);
      if (valid) {
        UI.closeModal('modal-vault-lock');
        UI.toast('Vault unlocked successfully!', 'success');
        await this.navigateTo(this.activeView || 'dashboard');
      } else {
        UI.toast('Incorrect PIN. Please try again.', 'error');
        const input = document.getElementById('vault-input-pin');
        if (input) {
          input.value = '';
          input.focus();
        }
      }
    }
  }

  lockVaultNow() {
    AuthService.lock();
    UI.toast('Vault locked.', 'info');
    this.showVaultLockModal('unlock');
  }

  async handleForgotPin() {
    const confirmed = confirm(
      "Forgot your Master PIN?\n\nResetting your PIN will unlock the app so you can access your portfolio or set a new PIN. Your investment data will NOT be deleted.\n\nDo you want to reset your Master PIN now?"
    );
    if (!confirmed) return;

    AuthService.removePin();
    UI.closeModal('modal-vault-lock');
    UI.toast('Master PIN reset successfully! You can set a new PIN anytime in Settings.', 'success');
    await this.navigateTo('dashboard');
  }

  openPinChangeModal() {
    UI.openModal('modal-change-pin');
  }

  async handleChangePinSubmit(e) {
    e.preventDefault();
    const newPin = document.getElementById('new-pin-input').value.trim();
    if (!newPin || newPin.length < 4) {
      UI.toast('PIN must be at least 4 digits.', 'warning');
      return;
    }

    await AuthService.setupMasterPin(newPin);
    UI.closeModal('modal-change-pin');
    UI.toast('Master PIN updated successfully!', 'success');
  }

  // ==================== ASSET CRUD ====================
  // ==================== HOLDINGS SORTING, FILTERING & EXPORT ====================
  toggleHoldingsSort(col) {
    if (!this.holdingsSort) this.holdingsSort = { column: 'current', dir: 'desc' };
    if (this.holdingsSort.column === col) {
      this.holdingsSort.dir = this.holdingsSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      this.holdingsSort.column = col;
      this.holdingsSort.dir = (col === 'name' || col === 'category') ? 'asc' : 'desc';
    }
    Views.renderAssets();
  }

  setHoldingsCategory(cat) {
    this.holdingsCategory = cat;
    Views.renderAssets();
  }

  setHoldingsSearch(val) {
    this.holdingsSearch = val || '';
    const query = this.holdingsSearch.toLowerCase().trim();
    const rows = document.querySelectorAll('#holdings-table-body tr[data-asset-row="true"]');
    let visible = 0;
    let visInvested = 0;
    let visCurrent = 0;

    rows.forEach(tr => {
      const text = (tr.getAttribute('data-search') || '').toLowerCase();
      const matches = !query || text.includes(query);
      if (matches) {
        tr.style.display = '';
        visible++;
        visInvested += parseFloat(tr.getAttribute('data-invested') || 0);
        visCurrent += parseFloat(tr.getAttribute('data-current') || 0);
      } else {
        tr.style.display = 'none';
      }
    });

    const countBadge = document.getElementById('holdings-count-badge');
    if (countBadge) countBadge.textContent = `${visible} of ${rows.length} Instruments`;

    const noResult = document.getElementById('holdings-no-search-results');
    if (noResult) {
      noResult.classList.toggle('hidden', visible > 0);
    }

    const footInv = document.getElementById('holdings-foot-invested');
    const footCur = document.getElementById('holdings-foot-current');
    const footGain = document.getElementById('holdings-foot-gain');
    if (footInv && footCur && footGain) {
      const gain = visCurrent - visInvested;
      const pct = visInvested > 0 ? ((gain / visInvested) * 100).toFixed(1) : '0.0';
      footInv.textContent = UI.formatCurrency(visInvested);
      footCur.textContent = UI.formatCurrency(visCurrent);
      footGain.innerHTML = `
        <div class="font-bold ${gain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
          ${gain >= 0 ? '+' : ''}${UI.formatCurrency(gain)}
        </div>
        <div class="text-[11px] text-gray-400 font-normal">
          ${gain >= 0 ? '+' : ''}${pct}%
        </div>
      `;
    }
  }

  async exportHoldings(format = 'xlsx') {
    await PortfolioService.deduplicateDatabase();
    const allAssets = await PortfolioService.getHoldings();
    if (!allAssets || allAssets.length === 0) {
      UI.toast('No investment holdings to export.', 'warning');
      return;
    }

    // Apply current category filter if active
    const catFilter = this.holdingsCategory || 'all';
    const targetAssets = catFilter === 'all' ? allAssets : allAssets.filter(a => a.category === catFilter);

    // Apply current sort order
    const sortCol = this.holdingsSort?.column || 'current';
    const sortDir = this.holdingsSort?.dir || 'desc';

    const sortedAssets = [...targetAssets].sort((a, b) => {
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let totalInvested = 0;
    let totalCurrent = 0;

    const rows = sortedAssets.map((asset, idx) => {
      const cat = ASSET_CATEGORIES[asset.category] || ASSET_CATEGORIES.liquid_cash;
      const invested = Number(asset.investedValue) || 0;
      const current = Number(asset.currentValue) || invested;
      const profit = current - invested;
      const pct = invested > 0 ? Number(((profit / invested) * 100).toFixed(2)) : 0;
      const units = Number(asset.units) || (asset.category === 'fixed_deposit' || asset.category === 'bond' ? invested : 1);
      const buyPrice = Number(asset.buyPrice) || (units > 0 ? Number((invested / units).toFixed(2)) : 0);
      const currentPrice = Number(asset.currentPrice) || (units > 0 ? Number((current / units).toFixed(2)) : current);

      totalInvested += invested;
      totalCurrent += current;

      let daysToMaturity = '';
      if (asset.maturityDate) {
        const matDate = new Date(asset.maturityDate);
        if (!isNaN(matDate.getTime())) {
          const diffDays = Math.ceil((matDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          daysToMaturity = diffDays > 0 ? `${diffDays} days` : (diffDays === 0 ? 'Matures Today' : 'Matured');
        }
      }

      return {
        'S.No': idx + 1,
        'Instrument Name': asset.name,
        'Category': cat.name,
        'Symbol / Code': asset.symbolOrCode || '-',
        'Units / Principal': units,
        'Cost / Rate': asset.interestRate ? `${asset.interestRate}% p.a.` : buyPrice,
        'Invested (INR)': invested,
        'Current Price (INR)': currentPrice,
        'Current Value (INR)': current,
        'Gain / Loss (INR)': profit,
        'Return (%)': pct,
        'Maturity Date': asset.maturityDate || '-',
        'Days Remaining': daysToMaturity || '-'
      };
    });

    // Summary Row
    const totalGain = totalCurrent - totalInvested;
    const totalPct = totalInvested > 0 ? Number(((totalGain / totalInvested) * 100).toFixed(2)) : 0;

    rows.push({
      'S.No': '',
      'Instrument Name': 'TOTAL PORTFOLIO VALUATION',
      'Category': `${sortedAssets.length} Instruments`,
      'Symbol / Code': '',
      'Units / Principal': '',
      'Cost / Rate': '',
      'Invested (INR)': totalInvested,
      'Current Price (INR)': '',
      'Current Value (INR)': totalCurrent,
      'Gain / Loss (INR)': totalGain,
      'Return (%)': totalPct,
      'Maturity Date': '',
      'Days Remaining': ''
    });

    const dateStr = new Date().toISOString().slice(0, 10);

    if (format === 'xlsx' && window.XLSX) {
      try {
        const ws = window.XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [
          { wch: 6 },
          { wch: 45 },
          { wch: 20 },
          { wch: 14 },
          { wch: 15 },
          { wch: 16 },
          { wch: 18 },
          { wch: 18 },
          { wch: 18 },
          { wch: 18 },
          { wch: 12 },
          { wch: 15 },
          { wch: 16 }
        ];
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, "Holdings");
        window.XLSX.writeFile(wb, `FinancePlanner_Holdings_${dateStr}.xlsx`);
        UI.toast(`Exported ${sortedAssets.length} holdings to Excel (.xlsx)!`, 'success');
        return;
      } catch (err) {
        console.warn('XLSX export error, using CSV fallback:', err);
      }
    }

    this.downloadCsv(rows, `FinancePlanner_Holdings_${dateStr}.csv`);
    UI.toast(`Exported ${sortedAssets.length} holdings to CSV!`, 'success');
  }

  downloadCsv(rows, filename) {
    if (!rows || rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const lines = [
      headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(',')
    ];
    rows.forEach(r => {
      lines.push(headers.map(h => {
        const val = r[h] !== undefined && r[h] !== null ? String(r[h]) : '';
        return `"${val.replace(/"/g, '""')}"`;
      }).join(','));
    });

    const csvText = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  openAddAssetModal() {
    document.getElementById('form-asset').reset();
    document.getElementById('asset-id').value = '';
    const pnlPreview = document.getElementById('asset-pnl-preview');
    if (pnlPreview) pnlPreview.classList.add('hidden');
    document.getElementById('asset-modal-title').textContent = 'Add Investment Asset';
    this.handleCategoryChange('equity_mf');
    UI.openModal('modal-asset-form');
  }

  calcInvestmentFields(changedField) {
    const unitsInput = document.getElementById('asset-units');
    const investedInput = document.getElementById('asset-invested-total');
    const buyPriceInput = document.getElementById('asset-buy-price');
    const currPriceInput = document.getElementById('asset-current-price');
    const currTotalInput = document.getElementById('asset-current-value-override');
    const previewDiv = document.getElementById('asset-pnl-preview');
    const previewText = document.getElementById('asset-pnl-preview-text');

    const units = parseFloat(unitsInput?.value) || 0;
    const invested = parseFloat(investedInput?.value) || 0;
    const buyPrice = parseFloat(buyPriceInput?.value) || 0;
    let currPrice = parseFloat(currPriceInput?.value) || 0;
    let currTotal = parseFloat(currTotalInput?.value) || 0;

    if (changedField === 'invested') {
      if (units > 0 && invested > 0 && buyPriceInput) {
        buyPriceInput.value = (invested / units).toFixed(4);
      }
    } else if (changedField === 'price') {
      if (units > 0 && buyPrice > 0 && investedInput) {
        investedInput.value = Math.round(units * buyPrice);
      }
    } else if (changedField === 'units') {
      if (units > 0) {
        if (invested > 0 && buyPriceInput) {
          buyPriceInput.value = (invested / units).toFixed(4);
        } else if (buyPrice > 0 && investedInput) {
          investedInput.value = Math.round(units * buyPrice);
        }
        if (currPrice > 0 && currTotalInput) {
          currTotalInput.value = Math.round(units * currPrice);
          currTotal = Math.round(units * currPrice);
        }
      }
    } else if (changedField === 'currentPrice') {
      if (units > 0 && currPrice > 0 && currTotalInput) {
        currTotalInput.value = Math.round(units * currPrice);
        currTotal = Math.round(units * currPrice);
      }
    } else if (changedField === 'currentTotal') {
      if (units > 0 && currTotal > 0 && currPriceInput) {
        currPriceInput.value = (currTotal / units).toFixed(4);
        currPrice = parseFloat(currPriceInput.value);
      }
    }

    const totalInvested = parseFloat(investedInput?.value) || (units > 0 && buyPrice > 0 ? units * buyPrice : 0);
    let effectiveCurrent = currTotal > 0 ? currTotal : (units > 0 && currPrice > 0 ? units * currPrice : 0);

    // Auto-detect if user typed per-unit price into total current valuation field
    if (units > 1 && effectiveCurrent > 0 && totalInvested > 0) {
      if (effectiveCurrent < totalInvested / 2 && (effectiveCurrent * units) >= totalInvested * 0.4) {
        effectiveCurrent = Math.round(effectiveCurrent * units);
      }
    }

    if (previewDiv && previewText) {
      if (totalInvested > 0 && effectiveCurrent > 0) {
        const gain = effectiveCurrent - totalInvested;
        const pct = ((gain / totalInvested) * 100).toFixed(1);
        previewText.textContent = `${gain >= 0 ? '+' : ''}${UI.formatCurrency(gain)} (${gain >= 0 ? '+' : ''}${pct}%)`;
        previewText.className = `font-bold ${gain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`;
        previewDiv.classList.remove('hidden');
      } else {
        previewDiv.classList.add('hidden');
      }
    }
  }

  handleCategoryChange(category) {
    const fdGroup = document.getElementById('group-fd-inputs');
    const marketGroup = document.getElementById('group-market-inputs');
    const cashGroup = document.getElementById('group-cash-inputs');
    const overrideGroup = document.getElementById('group-override-inputs');
    const symbolWrap = document.getElementById('field-symbol-wrap');
    const symbolLabel = document.getElementById('symbol-label-text');

    if (category === 'fixed_deposit' || category === 'bond') {
      fdGroup.classList.remove('hidden');
      marketGroup.classList.add('hidden');
      if (cashGroup) cashGroup.classList.add('hidden');
      if (overrideGroup) overrideGroup.classList.add('hidden');
      symbolWrap.classList.add('hidden');
    } else if (category === 'liquid_cash') {
      fdGroup.classList.add('hidden');
      marketGroup.classList.add('hidden');
      if (cashGroup) cashGroup.classList.remove('hidden');
      if (overrideGroup) overrideGroup.classList.add('hidden');
      symbolWrap.classList.add('hidden');
    } else {
      fdGroup.classList.add('hidden');
      marketGroup.classList.remove('hidden');
      if (cashGroup) cashGroup.classList.add('hidden');
      if (overrideGroup) overrideGroup.classList.remove('hidden');
      symbolWrap.classList.remove('hidden');

      if (category === 'equity_mf') {
        symbolLabel.textContent = 'AMFI Scheme Code (e.g. 122639)';
      } else if (category === 'equity_stock') {
        symbolLabel.textContent = 'Stock Ticker (e.g. TCS.NS or AAPL)';
      } else if (category === 'gold') {
        symbolLabel.textContent = 'Ticker or Gram Identifier (e.g. GOLDBEES.NS)';
      }
    }
  }

  handleAssetNameSearch(query) {
    const category = document.getElementById('asset-category').value;
    const dropdown = document.getElementById('mf-autocomplete-results');

    // Autocomplete is optimized for Indian Mutual Funds via MFapi
    if (category !== 'equity_mf' || !query || query.length < 3) {
      if (dropdown) dropdown.classList.add('hidden');
      return;
    }

    clearTimeout(this.mfSearchDebounce);
    this.mfSearchDebounce = setTimeout(async () => {
      const results = await MFApiService.searchSchemes(query);
      if (!results || results.length === 0) {
        dropdown.classList.add('hidden');
        return;
      }

      dropdown.innerHTML = results.map(r => `
        <div class="px-3 py-2 hover:bg-indigo-50 dark:hover:bg-gray-700 cursor-pointer transition-colors" onclick="window.App.selectMfScheme('${r.schemeCode}', '${r.schemeName.replace(/'/g, "\\'")}')">
          <div class="font-medium text-gray-900 dark:text-gray-100">${r.schemeName}</div>
          <div class="text-[10px] text-gray-400 font-mono">Code: ${r.schemeCode}</div>
        </div>
      `).join('');
      dropdown.classList.remove('hidden');
    }, 350);
  }

  async selectMfScheme(schemeCode, schemeName) {
    document.getElementById('asset-name').value = schemeName;
    document.getElementById('asset-symbol').value = schemeCode;
    const dropdown = document.getElementById('mf-autocomplete-results');
    if (dropdown) dropdown.classList.add('hidden');

    try {
      const navData = await MFApiService.getLatestNav(schemeCode);
      if (navData && navData.nav > 0) {
        const currPriceInput = document.getElementById('asset-current-price');
        if (currPriceInput) {
          currPriceInput.value = navData.nav;
          this.calcInvestmentFields('current');
        }
      }
    } catch (err) {
      // ignore
    }
  }

  async handleAssetSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('asset-id').value;
    const category = document.getElementById('asset-category').value;
    const name = document.getElementById('asset-name').value.trim();
    const symbolOrCode = document.getElementById('asset-symbol').value.trim();

    let assetData;

    if (category === 'liquid_cash') {
      const cashInput = document.getElementById('asset-cash-balance');
      const cashVal = parseFloat(cashInput?.value) || parseFloat(document.getElementById('asset-buy-price').value) || 0;
      assetData = {
        id: id || undefined,
        name,
        category,
        units: 1,
        buyPrice: cashVal,
        currentPrice: cashVal,
        investedValue: cashVal,
        currentValue: cashVal
      };
    } else if (category === 'fixed_deposit' || category === 'bond') {
      const principal = parseFloat(document.getElementById('asset-principal').value) ||
                        parseFloat(document.getElementById('asset-buy-price').value) || 0;
      const interestRate = parseFloat(document.getElementById('asset-interest-rate').value) || 0;
      const startDate = document.getElementById('asset-start-date').value;
      const maturityDate = document.getElementById('asset-maturity-date').value;
      const compoundingFreq = document.getElementById('asset-compounding').value;
      const customValue = parseFloat(document.getElementById('asset-current-value-override')?.value);
      assetData = {
        id: id || undefined,
        name,
        category,
        principal,
        interestRate,
        startDate,
        maturityDate,
        compoundingFreq,
        units: 1,
        buyPrice: principal,
        currentPrice: principal,
        investedValue: principal,
        currentValue: !isNaN(customValue) && customValue > 0 ? customValue : principal
      };
    } else {
      const units = parseFloat(document.getElementById('asset-units').value) || 1;
      let buyPrice = parseFloat(document.getElementById('asset-buy-price').value) || 0;
      let investedTotal = parseFloat(document.getElementById('asset-invested-total')?.value);
      const currPriceVal = parseFloat(document.getElementById('asset-current-price')?.value);
      let customValue = parseFloat(document.getElementById('asset-current-value-override')?.value);

      // Smart Sanity Guard: If user typed total cost into buyPrice (e.g. 120000) instead of per-unit price
      if (units > 1 && buyPrice > 1000 && (!investedTotal || isNaN(investedTotal))) {
        if (!isNaN(customValue) && customValue > 0 && buyPrice > (customValue / units) * 3) {
          investedTotal = buyPrice;
          buyPrice = Number((investedTotal / units).toFixed(4));
        }
      }

      if (!isNaN(investedTotal) && investedTotal > 0) {
        buyPrice = units > 0 ? Number((investedTotal / units).toFixed(4)) : investedTotal;
      } else {
        investedTotal = Math.round(units * buyPrice);
      }

      // Check if customValue was empty but currPriceVal was filled
      if ((isNaN(customValue) || customValue <= 0) && !isNaN(currPriceVal) && currPriceVal > 0) {
        customValue = Math.round(units * currPriceVal);
      }

      // Check if user entered per-unit price into customValue
      if (units > 1 && !isNaN(customValue) && customValue > 0 && investedTotal > 0) {
        if (customValue < investedTotal / 2 && (customValue * units) >= investedTotal * 0.4) {
          customValue = Math.round(customValue * units);
        }
      }

      assetData = {
        id: id || undefined,
        name,
        category,
        symbolOrCode,
        units,
        buyPrice,
        currentPrice: buyPrice,
        investedValue: investedTotal
      };
      if (!isNaN(customValue) && customValue > 0) {
        assetData.currentValue = customValue;
        assetData.currentPrice = units > 0 ? Number((customValue / units).toFixed(4)) : customValue;
      } else {
        assetData.currentValue = Math.round(units * assetData.currentPrice);
      }
    }

    await PortfolioService.saveAsset(assetData);
    UI.closeModal('modal-asset-form');
    await SnapshotService.syncLiveSnapshot();
    UI.toast(`Asset "${name}" saved!`, 'success');
    await Views.renderAssets();
  }

  async editAsset(id) {
    const asset = await DB.getAssetById(id);
    if (!asset) return;

    document.getElementById('asset-id').value = asset.id;
    document.getElementById('asset-category').value = asset.category;
    document.getElementById('asset-name').value = asset.name;
    document.getElementById('asset-symbol').value = asset.symbolOrCode || '';
    document.getElementById('asset-units').value = asset.units || 1;

    // Detect if buyPrice was accidentally saved as total invested
    let invCost = Number(asset.investedValue) || 0;
    let bPrice = Number(asset.buyPrice) || 0;
    if (asset.units > 1 && bPrice > 1000 && asset.currentValue > 0 && bPrice > (asset.currentValue / asset.units) * 3) {
      invCost = bPrice;
      bPrice = Number((invCost / asset.units).toFixed(4));
    } else if (!invCost && asset.units && bPrice) {
      invCost = Math.round(asset.units * bPrice);
    }

    const investedInput = document.getElementById('asset-invested-total');
    if (investedInput) investedInput.value = invCost || '';
    document.getElementById('asset-buy-price').value = bPrice || '';
    document.getElementById('asset-current-value-override').value = asset.currentValue || '';
    const currPriceInput = document.getElementById('asset-current-price');
    if (currPriceInput) {
      currPriceInput.value = asset.currentPrice || (asset.units > 0 && asset.currentValue ? (asset.currentValue / asset.units).toFixed(4) : '');
    }

    const cashInput = document.getElementById('asset-cash-balance');
    if (cashInput) cashInput.value = asset.currentValue || asset.buyPrice || asset.investedValue || '';

    const pVal = asset.principal || asset.investedValue || asset.buyPrice || asset.currentValue || '';
    document.getElementById('asset-principal').value = pVal;
    document.getElementById('asset-interest-rate').value = asset.interestRate ? asset.interestRate : '';
    document.getElementById('asset-start-date').value = asset.startDate || '';
    document.getElementById('asset-maturity-date').value = asset.maturityDate || '';
    document.getElementById('asset-compounding').value = asset.compoundingFreq || 'quarterly';

    this.calcInvestmentFields('current');
    this.handleCategoryChange(asset.category);
    document.getElementById('asset-modal-title').textContent = 'Edit Investment Asset';
    UI.openModal('modal-asset-form');
  }

  async deleteAsset(id) {
    if (confirm('Are you sure you want to remove this asset?')) {
      await PortfolioService.deleteAsset(id);
      await SnapshotService.syncLiveSnapshot();
      UI.toast('Asset removed from portfolio.', 'info');
      await Views.renderAssets();
    }
  }

  async syncPrices(triggerBtn = null) {
    return await this.syncLivePrices(triggerBtn);
  }

  async syncLivePrices(triggerBtn = null) {
    const btn = triggerBtn || document.getElementById('btn-sync-prices') || document.getElementById('btn-dashboard-sync');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span>Syncing Live Prices...</span>`;
      if (window.lucide) window.lucide.createIcons({ root: btn });
    }

    try {
      await PortfolioService.deduplicateDatabase();
      const res = await PortfolioService.syncAllValuations();
      await DB.setSetting('last_refreshed_at', new Date().toISOString());
      await SnapshotService.syncLiveSnapshot();
      UI.toast(`Live Sync Complete! Updated ${res.updatedCount} instruments and refreshed timeline graph.`, 'success');
      await this.navigateTo(this.activeView);
    } catch (err) {
      console.warn('Sync error:', err);
      UI.toast('Synced available prices. Check ticker symbols if some failed.', 'info');
      await this.navigateTo(this.activeView);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i><span>Sync Live Prices</span>`;
        if (window.lucide) window.lucide.createIcons({ root: btn });
      }
    }
  }

  // ==================== MONTHLY REVIEW ====================
  async submitMonthlyReview(e) {
    e.preventDefault();
    const month = document.getElementById('review-month').value;
    const freshSavings = parseFloat(document.getElementById('review-fresh-savings').value) || 0;
    const notes = document.getElementById('review-notes').value.trim();

    try {
      await SnapshotService.recordSnapshot({
        month,
        freshSalaryAdded: freshSavings,
        notes
      });
      UI.toast(`Monthly Snapshot for ${month} recorded successfully!`, 'success');
      await this.navigateTo('dashboard');
    } catch (err) {
      UI.toast(err.message || 'Failed to record snapshot.', 'error');
    }
  }

  async deleteSnapshot(month) {
    if (confirm(`Delete snapshot for month ${month}?`)) {
      await SnapshotService.deleteSnapshot(month);
      UI.toast(`Snapshot ${month} deleted.`, 'info');
      await Views.renderReview();
    }
  }

  // ==================== WEALTH PREDICTOR ====================
  async changeProjectionHorizon(months) {
    this.projectionMonths = months;
    [6, 12, 24, 36].forEach(m => {
      const btn = document.getElementById(`horizon-btn-${m}`);
      if (btn) {
        if (m === months) {
          btn.className = 'px-3 py-1.5 rounded-lg transition-all bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-400 font-bold';
        } else {
          btn.className = 'px-3 py-1.5 rounded-lg transition-all text-gray-500 font-semibold';
        }
      }
    });

    const slider = document.getElementById('slider-monthly-savings');
    const savings = slider ? Number(slider.value) : 35000;
    await this.updateSimulation(savings, months);
  }

  async updateProjectionSlider(val) {
    const savings = Number(val);
    const label = document.getElementById('slider-savings-label');
    if (label) label.textContent = `${UI.formatCurrency(savings)} / month`;
    await this.updateSimulation(savings, this.projectionMonths);
  }

  async updateSimulation(savings, months) {
    const proj = await PredictorService.generateProjection({ monthlySavings: savings, months });
    
    // Update outcome cards
    const cardCons = document.getElementById('proj-card-conservative');
    const cardMod = document.getElementById('proj-card-moderate');
    const cardAgg = document.getElementById('proj-card-aggressive');

    if (cardCons) cardCons.textContent = UI.formatCurrency(proj.outcomes.conservative);
    if (cardMod) cardMod.textContent = UI.formatCurrency(proj.outcomes.moderate);
    if (cardAgg) cardAgg.textContent = UI.formatCurrency(proj.outcomes.aggressive);

    ChartManager.renderPredictionChart('chart-prediction', proj);
  }

  // ==================== AI AGENT PARSING ====================
  async saveGeminiKey() {
    const input = document.getElementById('input-gemini-key');
    const key = input ? input.value.trim() : '';
    if (!key) {
      UI.toast('Please enter a valid Gemini API key.', 'warning');
      return;
    }
    await GeminiService.setApiKey(key);
    UI.toast('Gemini API Key saved securely!', 'success');
  }

  async handleAiFileSelect(e) {
    const file = e.target.files?.[0];
    if (file) {
      this.tempAiFile = file;
      const status = document.getElementById('ai-parse-status');
      if (status) status.textContent = `Selected: ${file.name} (${Math.round(file.size / 1024)} KB)`;
      await this.parseWithAi();
    }
  }

  async handleAiFileDrop(e) {
    e.preventDefault();
    document.getElementById('dropzone-ai-file')?.classList.remove('border-indigo-500');
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      this.tempAiFile = file;
      const status = document.getElementById('ai-parse-status');
      if (status) status.textContent = `Dropped: ${file.name}`;
      await this.parseWithAi();
    }
  }

  async parseWithAi() {
    const btn = document.getElementById('btn-parse-ai');
    const status = document.getElementById('ai-parse-status');
    const rawText = document.getElementById('ai-raw-text-input')?.value?.trim();
    const userInstructions = document.getElementById('ai-user-instructions')?.value?.trim() || '';

    if (!this.tempAiFile && !rawText) {
      UI.toast('Please upload a document or paste some financial notes to parse.', 'warning');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span>Agent Thinking & Parsing...</span>`;
    }
    if (status) status.textContent = 'Agent is reading document, detecting holdings, and applying instructions...';

    try {
      const currentHoldings = await PortfolioService.getHoldings();
      let result;
      if (this.tempAiFile) {
        result = await GeminiService.parseDocumentFile(this.tempAiFile, userInstructions, currentHoldings);
      } else {
        result = await GeminiService.parseRawText(rawText, userInstructions, currentHoldings);
      }

      this.tempAiResult = result;
      this.renderAiReviewModal(result);
      if (status) status.textContent = 'Parsing complete! Review modal opened.';
    } catch (err) {
      UI.toast(err.message || 'AI parsing failed.', 'error');
      if (status) status.textContent = 'Error during parsing. Check your Gemini API key.';
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="sparkles" class="w-4 h-4"></i><span>Analyze & Extract with AI Agent</span>`;
        if (window.lucide) window.lucide.createIcons({ root: btn });
      }
    }
  }

  renderAiReviewModal(data) {
    const subtitle = document.getElementById('ai-review-subtitle');
    if (subtitle) {
      subtitle.textContent = data.summary?.detectedFormat || 'Extracted financial assets and monthly snapshots.';
    }

    const banner = document.getElementById('ai-review-replace-banner');
    if (banner) {
      if (data.replaceHoldingNames && data.replaceHoldingNames.length > 0) {
        banner.className = "mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2";
        banner.innerHTML = `<i data-lucide="refresh-cw" class="w-4 h-4 text-amber-600 shrink-0"></i><span><strong>Decomposing & Replacing:</strong> Consolidated holding <strong>"${data.replaceHoldingNames.join(', ')}"</strong> will be removed and replaced with the <strong>${data.assets?.length || 0}</strong> individual instruments listed below.</span>`;
        banner.classList.remove('hidden');
      } else {
        banner.className = "hidden";
        banner.innerHTML = "";
      }
    }

    const chips = document.getElementById('ai-review-chips');
    if (chips) {
      chips.innerHTML = `
        <div class="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-900 font-semibold text-indigo-700 dark:text-indigo-300">
          <div class="text-base">${data.assets?.length || 0}</div>
          <div class="text-[10px] text-gray-500 font-normal">Assets Extracted</div>
        </div>
        <div class="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 font-semibold text-emerald-700 dark:text-emerald-300">
          <div class="text-base">${data.snapshots?.length || 0}</div>
          <div class="text-[10px] text-gray-500 font-normal">Monthly Snapshots</div>
        </div>
        <div class="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 font-semibold text-amber-700 dark:text-amber-300">
          <div class="text-base">${data.goldInventory?.length || 0}</div>
          <div class="text-[10px] text-gray-500 font-normal">Gold Items</div>
        </div>
      `;
    }

    const tableAssets = document.getElementById('ai-table-assets');
    if (tableAssets && data.assets) {
      tableAssets.innerHTML = `
        <thead>
          <tr class="bg-gray-50 dark:bg-gray-800/60 text-gray-500 border-b">
            <th class="py-2 px-3">Asset Name</th>
            <th class="py-2 px-3">Category</th>
            <th class="py-2 px-3 text-right">Units</th>
            <th class="py-2 px-3 text-right">Value</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 font-mono-numeric">
          ${data.assets.map(a => `
            <tr>
              <td class="py-1.5 px-3 font-medium text-gray-900 dark:text-white">${a.name}</td>
              <td class="py-1.5 px-3 text-gray-500">${a.category}</td>
              <td class="py-1.5 px-3 text-right text-gray-400 font-mono">${a.units || 1}</td>
              <td class="py-1.5 px-3 text-right font-bold text-emerald-600">${UI.formatCurrency(a.currentValue)}</td>
            </tr>
          `).join('')}
        </tbody>
      `;
    }

    const tableSnapshots = document.getElementById('ai-table-snapshots');
    if (tableSnapshots && data.snapshots) {
      tableSnapshots.innerHTML = `
        <thead>
          <tr class="bg-gray-50 dark:bg-gray-800/60 text-gray-500 border-b">
            <th class="py-2 px-3">Month</th>
            <th class="py-2 px-3 text-right">Total Net Worth</th>
            <th class="py-2 px-3 text-right">Fresh Savings</th>
            <th class="py-2 px-3">Notes</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 font-mono-numeric">
          ${data.snapshots.map(s => `
            <tr>
              <td class="py-1.5 px-3 font-semibold text-gray-900 dark:text-white">${s.month}</td>
              <td class="py-1.5 px-3 text-right font-bold text-emerald-600">${UI.formatCurrency(s.totalNetWorth)}</td>
              <td class="py-1.5 px-3 text-right text-indigo-600">+${UI.formatCurrency(s.freshSalaryAdded || 0)}</td>
              <td class="py-1.5 px-3 text-gray-400 text-[10px] truncate max-w-xs">${s.notes || ''}</td>
            </tr>
          `).join('')}
        </tbody>
      `;
    }

    UI.openModal('modal-ai-review');
    if (window.lucide) window.lucide.createIcons();
  }

  async confirmAiImport() {
    if (!this.tempAiResult) return;
    try {
      const res = await ImporterService.commitAiImport(this.tempAiResult);
      UI.closeModal('modal-ai-review');
      await SnapshotService.syncLiveSnapshot();
      const msg = res.replacedCount > 0
        ? `Replaced ${res.replacedCount} consolidated holding with ${res.assetsCount} individual stocks, bonds, & SGBs!`
        : `Agent imported ${res.assetsCount} holdings and ${res.snapshotsCount} monthly snapshots!`;
      UI.toast(msg, 'success');
      this.tempAiResult = null;
      this.tempAiFile = null;
      await this.navigateTo('dashboard');
    } catch (err) {
      UI.toast('Failed to commit AI data.', 'error');
    }
  }

  // ==================== AI FINANCE GROWTH AGENT (DASHBOARD) ====================
  async saveGeminiKeyFromDashboard() {
    const input = document.getElementById('input-dashboard-gemini-key');
    const key = input ? input.value.trim() : '';
    if (!key) {
      UI.toast('Please enter a valid Gemini API key.', 'warning');
      return;
    }
    await GeminiService.setApiKey(key);
    UI.toast('Gemini API Key activated for Finance Agent!', 'success');
    await Views.renderDashboard();
  }

  async handleFinanceGoalChange(goal) {
    await DB.setSetting('finance_agent_goal', goal);
  }

  async runFinanceAgentAnalysis() {
    const btn = document.getElementById('btn-run-finance-agent');
    const status = document.getElementById('finance-agent-status');
    const goalSelect = document.getElementById('select-finance-goal');
    const growthGoal = goalSelect ? goalSelect.value : (await DB.getSetting('finance_agent_goal', 'max_growth'));
    const customPrompt = document.getElementById('input-finance-custom-prompt')?.value?.trim() || '';

    // Check API Key
    const apiKey = await GeminiService.getApiKey();
    if (!apiKey) {
      const dashboardKeyInput = document.getElementById('input-dashboard-gemini-key');
      const inlineKey = dashboardKeyInput ? dashboardKeyInput.value.trim() : '';
      if (inlineKey) {
        await GeminiService.setApiKey(inlineKey);
      } else {
        UI.toast('Please enter your free Google Gemini API Key to activate the Finance Agent.', 'warning');
        dashboardKeyInput?.focus();
        return;
      }
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="inline-block animate-spin mr-1">⏳</span><span>Agent Auditing & Researching...</span>`;
    }
    if (status) status.textContent = 'Reading portfolio holdings & calculating asset allocation weights...';

    try {
      const holdings = await PortfolioService.getHoldings();
      if (!holdings || holdings.length === 0) {
        UI.toast('No assets found. Add holdings first before running the growth analysis.', 'warning');
        return;
      }

      if (status) status.textContent = 'Analyzing market trends, sector rotations & institutional analyst predictions...';

      const summary = await PortfolioService.getPortfolioSummary();
      const analytics = await SnapshotService.getGrowthAnalytics();
      const holdingAnalysis = await AnalyticsService.evaluateHoldings();
      const drift = await AnalyticsService.checkAllocationDrift();
      const currency = await DB.getSetting('currency', 'INR');

      const portfolioContext = {
        holdings,
        summary,
        analytics,
        laggards: holdingAnalysis.laggards || [],
        topPerformers: holdingAnalysis.topPerformers || [],
        drift
      };

      if (status) status.textContent = 'Calibrating asset action verdicts & max-growth redeployment blueprint...';

      const report = await GeminiService.analyzePortfolioGrowth(portfolioContext, {
        growthGoal,
        customPrompt,
        currency
      });

      await DB.setSetting('finance_agent_report', report);
      await DB.setSetting('finance_agent_report_time', new Date().toISOString());
      await DB.setSetting('finance_agent_goal', growthGoal);

      UI.toast('Portfolio growth analysis complete! Market intelligence updated.', 'success');
      await Views.renderDashboard();

      // Smooth scroll to finance agent panel
      const panel = document.getElementById('finance-agent-panel');
      if (panel) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } catch (err) {
      console.error('Finance Agent analysis error:', err);
      UI.toast(err.message || 'Finance Agent analysis failed. Check API key or connection.', 'error');
      if (status) status.textContent = 'Analysis interrupted. Check API key and retry.';
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="sparkles" class="w-4 h-4"></i><span>Analyze Portfolio for Max Growth</span>`;
        if (window.lucide) window.lucide.createIcons({ root: btn });
      }
    }
  }

  filterFinanceVerdicts(group) {
    const rows = document.querySelectorAll('#finance-verdicts-tbody tr.verdict-row');
    rows.forEach(row => {
      const rowGroup = row.getAttribute('data-verdict-group');
      if (group === 'ALL' || rowGroup === group) {
        row.classList.remove('hidden');
      } else {
        row.classList.add('hidden');
      }
    });

    // Update filter button styling
    ['ALL', 'ACCUMULATE', 'HOLD', 'TRIM_EXIT'].forEach(g => {
      const btn = document.getElementById(`filter-verdict-${g}`);
      if (btn) {
        if (g === group) {
          btn.className = 'px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-semibold shadow-sm';
        } else {
          btn.className = 'px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-200';
        }
      }
    });
  }

  async clearFinanceAgentReport() {
    await DB.setSetting('finance_agent_report', null);
    await DB.setSetting('finance_agent_report_time', null);
    UI.toast('Finance Agent report cleared.', 'info');
    await Views.renderDashboard();
  }

  async copyFinanceReport() {
    const report = await DB.getSetting('finance_agent_report', null);
    if (!report) {
      UI.toast('No analysis report to copy.', 'warning');
      return;
    }

    let text = `# Finance Planner: AI Portfolio Growth & Market Intelligence Report\n\n`;
    text += `## Market Outlook: ${report.marketOutlook?.sentiment || 'Bullish'} (${report.marketOutlook?.marketPhase || ''})\n`;
    if (report.marketOutlook?.analystConsensusSummary) {
      text += `> Analyst Consensus: ${report.marketOutlook.analystConsensusSummary}\n\n`;
    }
    text += `## Portfolio Growth Audit\n`;
    text += `- Growth Potential Score: ${report.growthAudit?.growthScore || 'N/A'} / 100\n`;
    text += `- Capital Efficiency: ${report.growthAudit?.efficiencyScore || 'N/A'} / 100\n`;
    text += `- Dead Capital Identified: ₹${report.growthAudit?.deadCapitalAmount || 0}\n`;
    text += `- Core Verdict: ${report.growthAudit?.coreVerdict || ''}\n\n`;

    text += `## Holding-by-Holding Action Verdicts\n`;
    (report.holdingVerdicts || []).forEach(h => {
      text += `- **${h.name}** (${h.category}): **${h.verdict}**\n`;
      text += `  * Consensus: ${h.analystConsensus || 'N/A'}\n`;
      text += `  * Rationale: ${h.actionRationale}\n`;
      if (h.targetWeightPct) text += `  * Target Weight: ${h.targetWeightPct}%\n`;
    });
    text += `\n`;

    if (report.capitalRedeploymentPlan?.length > 0) {
      text += `## Max-Growth Capital Redeployment Blueprint\n`;
      report.capitalRedeploymentPlan.forEach((s, idx) => {
        text += `${idx + 1}. **${s.title}**: ${s.description}\n`;
      });
      text += `\n`;
    }

    if (report.compoundingProjection) {
      text += `## Projected Compounding Impact\n`;
      text += `- Current Estimated CAGR: ${report.compoundingProjection.currentEstimatedCAGR}\n`;
      text += `- Optimized Growth CAGR: ${report.compoundingProjection.optimizedCAGR}\n`;
      text += `- Projected Lift: ${report.compoundingProjection.projected3YearAlphaLift}\n`;
      text += `- 36-Month Delta: ${report.compoundingProjection.projected3YearWealthDelta}\n\n`;
    }

    if (report.executiveCommentary) {
      text += `## Strategist Commentary\n${report.executiveCommentary}\n`;
    }

    try {
      await navigator.clipboard.writeText(text);
      UI.toast('Growth report copied to clipboard!', 'success');
    } catch (e) {
      UI.toast('Could not copy to clipboard.', 'error');
    }
  }

  async askFinanceAgentFollowup() {
    const input = document.getElementById('input-finance-followup');
    const btn = document.getElementById('btn-finance-followup');
    const resBox = document.getElementById('finance-followup-response');
    const question = input ? input.value.trim() : '';

    if (!question) {
      UI.toast('Please enter a follow-up question.', 'warning');
      return;
    }

    const report = await DB.getSetting('finance_agent_report', null);
    if (!report) {
      UI.toast('Please generate an initial analysis before asking follow-up questions.', 'warning');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="inline-block animate-spin mr-1">⏳</span><span>Thinking...</span>`;
    }
    if (resBox) {
      resBox.classList.remove('hidden');
      resBox.innerHTML = `<div class="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-medium">
        <span class="animate-pulse">Finance Agent is reviewing your question against current market trends...</span>
      </div>`;
    }

    try {
      const summary = await PortfolioService.getPortfolioSummary();
      const answer = await GeminiService.askFinanceAgentFollowup(question, report, summary);
      if (resBox) {
        resBox.innerHTML = `
          <div class="flex items-start gap-2.5">
            <div class="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs shrink-0 mt-0.5">
              <i data-lucide="bot" class="w-3.5 h-3.5"></i>
            </div>
            <div class="flex-1">
              <div class="font-bold text-gray-900 dark:text-white mb-1">Growth Strategist Response:</div>
              <div class="text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">${answer}</div>
            </div>
          </div>
        `;
        if (window.lucide) window.lucide.createIcons({ root: resBox });
      }
    } catch (err) {
      if (resBox) {
        resBox.innerHTML = `<span class="text-rose-600 dark:text-rose-400 font-medium">Error: ${err.message || 'Failed to get response.'}</span>`;
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="send" class="w-3.5 h-3.5"></i><span>Ask</span>`;
        if (window.lucide) window.lucide.createIcons({ root: btn });
      }
    }
  }

  // ==================== EXCEL IMPORT & EXPORT ====================
  downloadSampleExcel() {
    ImporterService.generateSampleCSV();
  }

  async handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (file) await this.processUploadedFile(file);
  }

  async handleFileDrop(e) {
    e.preventDefault();
    document.getElementById('dropzone-excel')?.classList.remove('border-indigo-500');
    const file = e.dataTransfer?.files?.[0];
    if (file) await this.processUploadedFile(file);
  }

  async processUploadedFile(file) {
    try {
      const parsed = await ImporterService.parseFile(file);
      this.tempImportData = parsed;
      this.renderExcelMappingModal();
    } catch (err) {
      UI.toast(err.message || 'Failed to read file.', 'error');
    }
  }

  renderExcelMappingModal() {
    if (!this.tempImportData) return;

    const info = document.getElementById('excel-file-info');
    if (info) info.textContent = `Loaded "${this.tempImportData.fileName}" (${this.tempImportData.totalRows} data rows).`;

    const container = document.getElementById('excel-mapping-selectors');
    if (!container) return;

    const headers = this.tempImportData.rawHeaders;
    const mapping = this.tempImportData.detectedMapping;

    container.innerHTML = ImporterService.targetFields.map(field => `
      <div>
        <label class="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
          ${field.label} ${field.required ? '<span class="text-rose-500">*</span>' : ''}
        </label>
        <select onchange="window.App.updateColumnMap('${field.key}', this.value)" class="w-full px-3 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs">
          <option value="">-- Select Column --</option>
          ${headers.map(h => `
            <option value="${h}" ${mapping[field.key] === h ? 'selected' : ''}>${h}</option>
          `).join('')}
        </select>
      </div>
    `).join('');

    this.renderExcelPreviewTable();
    UI.openModal('modal-excel-mapper');
    if (window.lucide) window.lucide.createIcons();
  }

  updateColumnMap(fieldKey, excelHeader) {
    if (this.tempImportData) {
      this.tempImportData.detectedMapping[fieldKey] = excelHeader;
      this.renderExcelPreviewTable();
    }
  }

  renderExcelPreviewTable() {
    const table = document.getElementById('excel-preview-table');
    if (!table || !this.tempImportData) return;

    const rows = this.tempImportData.rawRows.slice(0, 5);
    const headers = this.tempImportData.rawHeaders;

    table.innerHTML = `
      <thead>
        <tr class="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700 font-semibold text-gray-500">
          ${headers.map(h => `<th class="py-2 px-3 whitespace-nowrap">${h}</th>`).join('')}
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-100 dark:divide-gray-800 font-mono-numeric">
        ${rows.map(row => `
          <tr class="hover:bg-gray-50/50">
            ${headers.map(h => `<td class="py-1.5 px-3 whitespace-nowrap">${row[h] !== undefined ? row[h] : ''}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    `;
  }

  async confirmExcelImport() {
    if (!this.tempImportData) return;

    const mapping = this.tempImportData.detectedMapping;
    if (!mapping.month || !mapping.assetName || !mapping.currentValue) {
      UI.toast('Please map the required columns: Month, Asset Name, and Current Value.', 'warning');
      return;
    }

    try {
      const res = await ImporterService.commitImport(this.tempImportData.rawRows, mapping);
      UI.closeModal('modal-excel-mapper');
      UI.toast(`Imported ${res.importedMonthsCount} months of history across ${res.importedAssetsCount} assets!`, 'success');
      this.tempImportData = null;
      await this.navigateTo('dashboard');
    } catch (err) {
      UI.toast(err.message || 'Import failed.', 'error');
    }
  }

  // ==================== BACKUP & RESTORE ====================
  async exportBackup() {
    try {
      const data = await DB.exportFullData();
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `finance_planner_vault_backup_${new Date().toISOString().substring(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      UI.toast('Encrypted backup exported!', 'success');
    } catch (e) {
      UI.toast('Backup failed.', 'error');
    }
  }

  openRestoreBackup() {
    document.getElementById('file-input-backup')?.click();
  }

  async handleBackupRestoreFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (confirm('Restore portfolio backup? This will merge/replace existing data.')) {
        await DB.importFullData(parsed, true);
        UI.toast('Portfolio restored successfully from backup!', 'success');
        await this.navigateTo('dashboard');
      }
    } catch (err) {
      UI.toast('Invalid backup file.', 'error');
    }
  }

  async savePreferences() {
    const monthlyTarget = parseFloat(document.getElementById('setting-monthly-savings').value) || 35000;
    const emergencyExp = parseFloat(document.getElementById('setting-emergency-exp').value) || 40000;

    await DB.setSetting('monthlySalaryTarget', monthlyTarget);
    await DB.setSetting('emergencyMonthlyExpense', emergencyExp);

    UI.toast('Preferences saved!', 'success');
  }

  // ==================== CLEAN UP ALL DATA & START FRESH ====================
  async resetAllData() {
    const confirmed = confirm("Are you sure you want to clean up ALL data and start fresh?\n\nThis will permanently delete all holdings, monthly snapshots, and import history from this browser.");
    if (!confirmed) return;

    const doubleCheck = prompt("Type 'RESET' to confirm permanent deletion of all financial records:");
    if (doubleCheck !== "RESET") {
      UI.toast("Reset cancelled. Data was not modified.", "info");
      return;
    }

    try {
      const savedGeminiKey = await DB.getSetting('geminiApiKey', '') || localStorage.getItem('fp_gemini_key');
      await DB.clearAll();

      if (savedGeminiKey) {
        await DB.setSetting('geminiApiKey', savedGeminiKey);
        localStorage.setItem('fp_gemini_key', savedGeminiKey);
      }

      UI.toast("All data has been completely erased. Starting fresh!", "success");
      await this.navigateTo('dashboard');
    } catch (err) {
      UI.toast("Failed to reset database: " + err.message, "error");
    }
  }

  // ==================== RESTORE OFFICIAL DATA & SEEDING ====================
  async resetToOfficialPortfolio() {
    const confirmed = confirm(
      "Reset and restore your official portfolio?\n\nThis will load all 53 active instruments from your Nuvama report and INDmoney holdings (₹54.29 Lakhs) along with the verified 28-month historical tracking timeline (June 2024 to September 2026)."
    );
    if (!confirmed) return;

    try {
      UI.toast("Restoring official portfolio and 28-month timeline...", "info");
      await PortfolioService.seedOfficialPortfolio(true);
      await SnapshotService.syncLiveSnapshot();
      UI.toast("Official portfolio restored successfully! Net Worth: ₹54.29 Lakhs", "success");
      await this.navigateTo('dashboard');
    } catch (err) {
      UI.toast("Failed to restore portfolio: " + err.message, "error");
    }
  }

  async seedDemoPortfolio() {
    return await PortfolioService.seedOfficialPortfolio(true);
  }
}

// Instantiate and attach globally
window.App = new Application();
document.addEventListener('DOMContentLoaded', () => {
  window.App.init();
});
