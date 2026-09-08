/**
 * components.js - UI Components, Formatting, and Toast Notifications
 * Supports both Indian numbering system (Lakhs/Crores) and International formatting.
 */

export const UI = {
  activeCurrency: 'INR',

  setCurrency(curr) {
    this.activeCurrency = curr;
  },

  /**
   * Format numbers into clean currency strings
   * @param {number} amount
   * @param {string} [currency=this.activeCurrency]
   */
  formatCurrency(amount, currency = this.activeCurrency) {
    const val = Number(amount) || 0;
    const sign = val < 0 ? '-' : '';
    const absVal = Math.abs(val);

    if (currency === 'INR') {
      // Indian Numbering (₹ 1,50,000)
      const formatted = new Intl.NumberFormat('en-IN', {
        maximumFractionDigits: 0
      }).format(absVal);
      return `${sign}₹${formatted}`;
    } else {
      // International ($ 150,000)
      const formatted = new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 0
      }).format(absVal);
      return `${sign}$${formatted}`;
    }
  },

  /**
   * Format Compact Currency (e.g. ₹42.5 L or $52.4 K)
   */
  formatCompactCurrency(amount, currency = this.activeCurrency) {
    const val = Number(amount) || 0;
    const sign = val < 0 ? '-' : '';
    const abs = Math.abs(val);

    if (currency === 'INR') {
      if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(2)} Cr`;
      if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(2)} L`;
      if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)} K`;
      return `${sign}₹${abs}`;
    } else {
      if (abs >= 1000000) return `${sign}$${(abs / 1000000).toFixed(2)} M`;
      if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)} K`;
      return `${sign}$${abs}`;
    }
  },

  /**
   * Format Percentage (+14.2% / -3.1%)
   */
  formatPercent(pct) {
    const val = Number(pct) || 0;
    const sign = val > 0 ? '+' : '';
    return `${sign}${val.toFixed(1)}%`;
  },

  /**
   * Show Toast Notification
   * @param {string} message
   * @param {'success'|'error'|'info'|'warning'} [type='info']
   */
  toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toastEl = document.createElement('div');
    const colorClasses = {
      success: 'bg-emerald-600 text-white shadow-emerald-500/20',
      error: 'bg-rose-600 text-white shadow-rose-500/20',
      warning: 'bg-amber-600 text-white shadow-amber-500/20',
      info: 'bg-indigo-600 text-white shadow-indigo-500/20'
    };

    const icons = {
      success: '<i data-lucide="check-circle" class="w-5 h-5 flex-shrink-0"></i>',
      error: '<i data-lucide="alert-circle" class="w-5 h-5 flex-shrink-0"></i>',
      warning: '<i data-lucide="alert-triangle" class="w-5 h-5 flex-shrink-0"></i>',
      info: '<i data-lucide="info" class="w-5 h-5 flex-shrink-0"></i>'
    };

    toastEl.className = `flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all duration-300 transform translate-y-2 opacity-0 ${colorClasses[type] || colorClasses.info}`;
    toastEl.innerHTML = `
      ${icons[type] || icons.info}
      <span class="flex-1">${message}</span>
      <button class="opacity-75 hover:opacity-100 transition-opacity ml-2" onclick="this.parentElement.remove()">
        <i data-lucide="x" class="w-4 h-4"></i>
      </button>
    `;

    container.appendChild(toastEl);
    if (window.lucide) window.lucide.createIcons({ root: toastEl });

    // Animate in
    requestAnimationFrame(() => {
      toastEl.classList.remove('translate-y-2', 'opacity-0');
      toastEl.classList.add('translate-y-0', 'opacity-100');
    });

    // Auto dismiss after 4 seconds
    setTimeout(() => {
      toastEl.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toastEl.remove(), 300);
    }, 4000);
  },

  /**
   * Modal Dialog Controller
   */
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }
};
