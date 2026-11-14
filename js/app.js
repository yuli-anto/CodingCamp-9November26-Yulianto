'use strict';

// === STATE ===

/**
 * @typedef {Object} Transaction
 * @property {string} id          - Unique identifier; generated via crypto.randomUUID()
 *                                  or Date.now().toString() + Math.random().toString(36).slice(2)
 * @property {string} name        - Item name, 1–100 characters
 * @property {number} amount      - Expense amount, 0.01–999,999,999.99, stored as float
 * @property {string} category    - Category label; must exist in the categories list at time of creation
 * @property {number} createdAt   - Creation timestamp (ms since epoch via Date.now()), used for default sort order
 */

/**
 * @typedef {'light'|'dark'} Theme
 */

/**
 * @typedef {Object} AppState
 * @property {Transaction[]}  transactions      - All logged expense transactions
 * @property {string[]}       customCategories  - User-defined category names
 * @property {number|null}    spendingLimit     - Optional spending cap; null when unset
 * @property {Theme}          theme             - Current display theme
 * @property {boolean}        storageError      - True when localStorage is unavailable or corrupt
 */

/** @type {AppState} */
const DEFAULT_STATE = {
  transactions: [],
  customCategories: [],
  spendingLimit: null,
  theme: 'light',
  storageError: false
};

/** @type {AppState} */
let state = {
  transactions: [],
  customCategories: [],
  spendingLimit: null,
  theme: 'light',
  storageError: false
};

// === STORAGE ===

/**
 * Persist app state to localStorage, omitting the runtime-only `storageError` flag.
 * On any failure (quota exceeded, private browsing, etc.) sets `state.storageError = true`.
 *
 * @param {AppState} state
 */
function saveState(state) {
  try {
    const { storageError, ...persistable } = state;
    localStorage.setItem('ebv_state', JSON.stringify(persistable));
  } catch (e) {
    state.storageError = true;
  }
}

/**
 * Restore app state from localStorage.
 *
 * @returns {{ data: Omit<AppState, 'storageError'>|null, error: boolean }}
 *   data: Parsed state object (or null if missing/corrupt).
 *   error: true only when localStorage threw an exception (unavailable or corrupt JSON).
 */
function loadState() {
  try {
    const raw = localStorage.getItem('ebv_state');
    if (raw === null) return { data: null, error: false };
    const parsed = JSON.parse(raw);
    return { data: parsed, error: false };
  } catch (e) {
    return { data: null, error: true };
  }
}

// === TRANSACTIONS ===

/**
 * Returns a new sorted copy of the transactions array without mutating the original.
 *
 * @param {Transaction[]} transactions - The source transaction array
 * @param {'default'|'amount-asc'|'amount-desc'|'category-asc'} criterion - Sort criterion
 * @returns {Transaction[]} A sorted copy
 */
function getSortedTransactions(transactions, criterion) {
  const copy = [...transactions];
  switch (criterion) {
    case 'amount-asc':
      return copy.sort((a, b) => a.amount - b.amount);
    case 'amount-desc':
      return copy.sort((a, b) => b.amount - a.amount);
    case 'category-asc':
      return copy.sort((a, b) => a.category.localeCompare(b.category));
    case 'default':
    default:
      return copy.sort((a, b) => b.createdAt - a.createdAt);
  }
}

/**
 * Add a new transaction to state and persist it.
 * @param {AppState} state
 * @param {string} name
 * @param {number|string} amount
 * @param {string} category
 * @returns {Transaction}
 */
function addTransaction(state, name, amount, category) {
  const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : Date.now().toString() + Math.random().toString(36).slice(2);
  const transaction = {
    id,
    name: name.trim(),
    amount: parseFloat(amount),
    category,
    createdAt: Date.now()
  };
  state.transactions.push(transaction);
  saveState(state);
  return transaction;
}

/**
 * Remove the transaction with the given id from state and persist.
 * @param {AppState} state
 * @param {string} id
 */
function deleteTransaction(state, id) {
  state.transactions = state.transactions.filter(t => t.id !== id);
  saveState(state);
}

/**
 * Validate the new-transaction form inputs before mutating state.
 *
 * Rules:
 *   - name    : non-empty after trimming, ≤ 100 characters
 *   - amount  : numeric, 0.01 – 999,999,999.99, at most 2 decimal places
 *   - category: truthy (a category must be selected)
 *
 * @param {string}        name     - Raw value of the item-name field
 * @param {string|number} amount   - Raw value of the amount field
 * @param {string}        category - Selected category value
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateForm(name, amount, category) {
  const errors = [];

  // --- name ---
  if (!name || name.trim().length === 0) {
    errors.push('Item name is required.');
  } else if (name.trim().length > 100) {
    errors.push('Item name must be 100 characters or fewer.');
  }

  // --- amount ---
  const amountStr = String(amount).trim();
  const amountNum = parseFloat(amountStr);
  if (amountStr === '' || isNaN(amountNum)) {
    errors.push('Amount must be a valid number.');
  } else if (amountNum < 0.01) {
    errors.push('Amount must be at least 0.01.');
  } else if (amountNum > 999999999.99) {
    errors.push('Amount must be no more than 999,999,999.99.');
  } else {
    const decimalMatch = amountStr.match(/\.(\d+)$/);
    if (decimalMatch && decimalMatch[1].length > 2) {
      errors.push('Amount must have at most 2 decimal places.');
    }
  }

  // --- category ---
  if (!category) {
    errors.push('Please select a category.');
  }

  return { valid: errors.length === 0, errors };
}

// === CATEGORIES ===

const DEFAULT_CATEGORIES = ['Food', 'Transport', 'Fun'];

/**
 * Returns the full list of available categories: defaults followed by user-defined ones.
 *
 * @param {AppState} state
 * @returns {string[]}
 */
function getAllCategories(state) {
  return [...DEFAULT_CATEGORIES, ...state.customCategories];
}

/**
 * Validates a proposed new category name against the existing category list.
 *
 * @param {string} name      - The proposed category name (may be untrimmed)
 * @param {string[]} existing - All currently known categories (default + custom)
 * @returns {{ valid: boolean, error: string }}
 */
function validateCategoryName(name, existing) {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Category name cannot be empty.' };
  }
  if (name.trim().length > 50) {
    return { valid: false, error: 'Category name must be 50 characters or fewer.' };
  }
  const nameLower = name.trim().toLowerCase();
  const isDuplicate = existing.some(cat => cat.toLowerCase() === nameLower);
  if (isDuplicate) {
    return { valid: false, error: 'A category with that name already exists.' };
  }
  return { valid: true, error: '' };
}

/**
 * Handle the "Add Category" button click.
 * Validates the custom-category input; on failure, shows the inline error message.
 * On success, adds the new category to state, persists state, re-renders the
 * category dropdown, and clears the input.
 *
 * Requirements: 6.1, 6.2, 6.3
 */
function handleAddCustomCategory() {
  const input = document.getElementById('custom-category-input');
  const errorEl = document.getElementById('category-error');
  if (!input || !errorEl) return;

  const name = input.value;
  const existing = getAllCategories(state);
  const result = validateCategoryName(name, existing);

  if (!result.valid) {
    errorEl.textContent = result.error;
    input.focus();
    return;
  }

  // Clear any previous error
  errorEl.textContent = '';

  // Add to state and persist
  state.customCategories.push(name.trim());
  saveState(state);

  // Re-render the category dropdown and clear the input
  // renderCategoryDropdown is defined in the // === RENDER === section below
  renderCategoryDropdown();
  input.value = '';
}

// === BALANCE ===

/**
 * Returns the sum of all transaction amounts.
 * Returns 0 for an empty or missing array.
 *
 * @param {Transaction[]} transactions
 * @returns {number}
 */
function calculateTotalBalance(transactions) {
  if (!transactions || transactions.length === 0) return 0;
  return transactions.reduce((sum, t) => sum + t.amount, 0);
}

/**
 * Formats a numeric amount as a USD currency string with exactly 2 decimal places.
 * e.g., 1234.56 → "$1,234.56"
 *
 * @param {number} amount
 * @returns {string}
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Update the balance display element with the current total and apply/remove
 * the `.over-limit` warning class based on whether the total exceeds `limit`.
 *
 * @param {Transaction[]} transactions
 * @param {number|null}   limit
 */
function renderBalance(transactions, limit) {
  const balanceAmountEl = document.getElementById('balance-amount');
  const balanceDisplayEl = document.getElementById('balance-display');
  if (!balanceAmountEl || !balanceDisplayEl) return;

  const total = calculateTotalBalance(transactions);
  balanceAmountEl.textContent = formatCurrency(total);

  // Apply or remove the over-limit warning class
  if (limit !== null && limit !== undefined && total > limit) {
    balanceDisplayEl.classList.add('over-limit');
  } else {
    balanceDisplayEl.classList.remove('over-limit');
  }
}

/**
 * Handle the spending-limit input.
 * Parses the field value, validates it is in range (0.01–999,999,999.99),
 * updates `state.spendingLimit`, persists it, and re-renders the balance.
 * An empty value clears the limit.
 */
function handleSetSpendingLimit() {
  const input = document.getElementById('spending-limit-input');
  if (!input) return;

  const rawValue = input.value.trim();

  // If empty, clear the spending limit
  if (rawValue === '') {
    state.spendingLimit = null;
    saveState(state);
    renderBalance(state.transactions, state.spendingLimit);
    return;
  }

  const parsed = parseFloat(rawValue);
  if (isNaN(parsed) || parsed < 0.01 || parsed > 999999999.99) {
    // Invalid — reset input to current limit or empty
    input.value = state.spendingLimit !== null ? state.spendingLimit : '';
    return;
  }

  state.spendingLimit = parsed;
  saveState(state);
  renderBalance(state.transactions, state.spendingLimit);
}

// === CHART ===

// Pre-defined 10-color palette for chart segments
const CHART_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#6366f1'
];

/** @type {import('chart.js').Chart|null} */
let chartInstance = null;

/**
 * Build Chart.js-compatible data from transactions.
 * Groups by category, sums amounts, excludes zero-total categories,
 * groups categories beyond index 9 (0-based) into "Other".
 *
 * @param {Transaction[]} transactions
 * @returns {{ labels: string[], data: number[], colors: string[] }}
 */
function buildChartData(transactions) {
  // Aggregate amounts by category
  const totals = {};
  for (const t of transactions) {
    if (t.amount > 0) {
      totals[t.category] = (totals[t.category] || 0) + t.amount;
    }
  }

  // Filter out zero/negative totals and sort descending for deterministic display
  const entries = Object.entries(totals)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    return { labels: [], data: [], colors: [] };
  }

  const labels = [];
  const data = [];
  const colors = [];

  if (entries.length <= 10) {
    entries.forEach(([label, value], i) => {
      labels.push(label);
      data.push(value);
      colors.push(CHART_COLORS[i % CHART_COLORS.length]);
    });
  } else {
    // Top 9 categories get their own segment; the rest go into "Other"
    let otherTotal = 0;
    entries.forEach(([label, value], i) => {
      if (i < 9) {
        labels.push(label);
        data.push(value);
        colors.push(CHART_COLORS[i]);
      } else {
        otherTotal += value;
      }
    });
    labels.push('Other');
    data.push(otherTotal);
    colors.push(CHART_COLORS[9]);
  }

  return { labels, data, colors };
}

/**
 * Destroy the existing Chart.js instance if one exists.
 */
function destroyChart() {
  if (chartInstance !== null) {
    chartInstance.destroy();
    chartInstance = null;
  }
}

/**
 * Render (or re-render) the pie chart based on current transactions.
 * @param {Transaction[]} transactions
 */
function renderChart(transactions) {
  if (typeof Chart === 'undefined') {
    // Chart.js CDN failed to load — show fallback text, hide canvas
    const canvas = document.getElementById('pie-chart');
    const emptyMsg = document.getElementById('chart-empty-msg');
    if (canvas) canvas.style.display = 'none';
    if (emptyMsg) {
      emptyMsg.style.display = 'block';
      emptyMsg.textContent = 'Chart could not be loaded.';
    }
    return;
  }

  const canvas = document.getElementById('pie-chart');
  const emptyMsg = document.getElementById('chart-empty-msg');
  if (!canvas || !emptyMsg) return;

  const { labels, data, colors } = buildChartData(transactions);

  if (labels.length === 0) {
    destroyChart();
    canvas.style.display = 'none';
    emptyMsg.style.display = 'block';
    return;
  }

  emptyMsg.style.display = 'none';
  canvas.style.display = 'block';

  destroyChart();

  const total = data.reduce((s, v) => s + v, 0);

  chartInstance = new Chart(canvas, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            generateLabels(chart) {
              const ds = chart.data.datasets[0];
              return chart.data.labels.map((label, i) => {
                const value = ds.data[i];
                const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
                return {
                  text: `${label} (${pct}%)`,
                  fillStyle: ds.backgroundColor[i],
                  strokeStyle: ds.backgroundColor[i],
                  lineWidth: 1,
                  index: i
                };
              });
            }
          }
        },
        tooltip: {
          callbacks: {
            label(context) {
              const value = context.parsed;
              const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
              return ` ${context.label}: $${value.toFixed(2)} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

// === RENDER ===

// Module-level sort state (used by renderTransactionList and handleSort)
let currentSortCriterion = 'default';

/**
 * Escape a string for safe insertion into HTML to prevent XSS.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render the transaction list into `#transaction-list`.
 *
 * - Shows an empty-state message when there are no transactions (Req 2.3).
 * - Renders one `<li>` per transaction sorted by `currentSortCriterion` (Req 2.1, 8.3).
 * - Each item displays: item name (capped at 100 chars), amount (2 dp), category,
 *   and a delete button with `data-id` (Req 2.1, 2.2, 2.4, 2.5).
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 *
 * @param {Transaction[]} transactions
 */
function renderTransactionList(transactions) {
  const listEl = document.getElementById('transaction-list');
  if (!listEl) return;

  if (!transactions || transactions.length === 0) {
    listEl.innerHTML = '<li class="empty-state">No transactions yet.</li>';
    return;
  }

  const sorted = getSortedTransactions(transactions, currentSortCriterion);
  listEl.innerHTML = sorted.map(t => {
    // Name is stored with up to 100 chars; guard defensively in case of legacy data
    const safeName = t.name.length > 100 ? t.name.slice(0, 100) : t.name;
    return `<li class="transaction-item">
      <div class="transaction-info">
        <span class="transaction-name">${escapeHtml(safeName)}</span>
        <span class="transaction-meta">${escapeHtml(t.category)}</span>
      </div>
      <span class="transaction-amount">${formatCurrency(t.amount)}</span>
      <button class="transaction-delete" data-id="${escapeHtml(t.id)}" type="button" aria-label="Delete transaction ${escapeHtml(safeName)}">Delete</button>
    </li>`;
  }).join('');
}

/**
 * Populate the #category <select> with all available categories.
 * Preserves the placeholder option (first option) and replaces the rest.
 *
 * Requirements: 1.2, 6.2, 6.4, 6.5
 */
function renderCategoryDropdown() {
  const select = document.getElementById('category');
  if (!select) return;

  // Remove all options except the placeholder (first option)
  while (select.options.length > 1) {
    select.remove(1);
  }

  // Append one option per category (defaults + custom)
  const categories = getAllCategories(state);
  categories.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    select.appendChild(option);
  });
}

/**
 * Show the storage-warning banner and auto-hide it after 5 seconds.
 * The banner is non-modal and non-overlay so it does not block interaction.
 *
 * Requirements: 5.5
 */
function showStorageWarning() {
  const banner = document.getElementById('storage-warning');
  if (!banner) return;

  // Show the banner
  banner.removeAttribute('hidden');
  banner.classList.remove('hidden');

  // Auto-hide after 5 seconds (requirement: visible for at least 5 seconds)
  setTimeout(() => {
    banner.setAttribute('hidden', '');
    banner.classList.add('hidden');
  }, 5000);
}

/**
 * Apply the given theme to the document and update the toggle button state.
 * Adds `dark-mode` class to <body> when mode is 'dark', removes it otherwise.
 * Updates #theme-toggle text content and aria-pressed attribute.
 *
 * @param {'light'|'dark'} mode
 * Requirements: 9.1, 9.2
 */
function applyTheme(mode) {
  if (mode === 'dark') {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }

  // Update the toggle button label to reflect current state
  const toggleBtn = document.getElementById('theme-toggle');
  if (toggleBtn) {
    toggleBtn.textContent = mode === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
    toggleBtn.setAttribute('aria-pressed', mode === 'dark' ? 'true' : 'false');
  }
}

/**
 * Toggle the app theme between 'light' and 'dark', persist the choice,
 * and apply the new theme to the UI.
 *
 * Requirements: 9.1, 9.2, 9.3
 */
function handleThemeToggle() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme(state.theme);
  saveState(state);
}

// === EVENTS ===

/**
 * Clear all add-transaction form fields back to their default/placeholder state
 * and remove any displayed inline error message.
 *
 * Requirements: 1.6
 */
function resetForm() {
  const nameInput = document.getElementById('item-name');
  const amountInput = document.getElementById('amount');
  const categorySelect = document.getElementById('category');
  const formError = document.getElementById('form-error');
  if (nameInput) nameInput.value = '';
  if (amountInput) amountInput.value = '';
  if (categorySelect) categorySelect.value = '';
  if (formError) formError.textContent = '';
}

/**
 * Handle the add-transaction form submit event.
 *
 * Flow:
 *   1. Prevent the default browser form submission.
 *   2. Read `#item-name`, `#amount`, and `#category` field values.
 *   3. Call `validateForm`; on failure write all error messages to `#form-error`
 *      and focus the first invalid field — no state is mutated.
 *   4. On success: clear `#form-error`, call `addTransaction` to persist the new
 *      entry, call `resetForm`, then synchronously re-render the transaction list,
 *      balance display, pie chart, and category dropdown.
 *
 * All DOM updates are synchronous, satisfying the ≤ 500 ms / 1 s UI-update
 * requirements (Req 1.6, 3.2, 4.2).
 *
 * @param {Event} event
 * Requirements: 1.3, 1.4, 1.5, 1.6, 2.5, 3.2, 4.2
 */
function handleAddTransaction(event) {
  event.preventDefault();

  const nameInput = document.getElementById('item-name');
  const amountInput = document.getElementById('amount');
  const categorySelect = document.getElementById('category');
  const formError = document.getElementById('form-error');

  if (!nameInput || !amountInput || !categorySelect) return;

  const name = nameInput.value;
  const amount = amountInput.value;
  const category = categorySelect.value;

  const result = validateForm(name, amount, category);

  if (!result.valid) {
    // Display all validation errors inline
    if (formError) {
      formError.textContent = result.errors.join(' ');
    }
    // Focus the first invalid field for accessibility
    if (!name || name.trim().length === 0 || name.trim().length > 100) {
      nameInput.focus();
    } else if (!amount || isNaN(parseFloat(String(amount).trim()))) {
      amountInput.focus();
    } else {
      categorySelect.focus();
    }
    return;
  }

  // Clear any previous error message
  if (formError) formError.textContent = '';

  // Persist the new transaction to state + localStorage
  addTransaction(state, name, amount, category);

  // Reset form fields to default state
  resetForm();

  // Synchronously update all UI components (satisfies ≤ 500 ms / 1 s requirements)
  renderTransactionList(state.transactions);
  renderBalance(state.transactions, state.spendingLimit);
  renderChart(state.transactions);
  renderCategoryDropdown();
}

/**
 * Delete the transaction with the given id, then re-render the list, balance, and chart.
 *
 * @param {string} id
 * Requirements: 2.6
 */
function handleDeleteTransaction(id) {
  deleteTransaction(state, id);
  renderTransactionList(state.transactions);
  renderBalance(state.transactions, state.spendingLimit);
  renderChart(state.transactions);
}

/**
 * Update the active sort criterion and re-render the transaction list.
 * Toggles the `active` class on sort buttons matching `data-criterion` attributes.
 *
 * @param {'default'|'amount-asc'|'amount-desc'|'category-asc'} criterion
 * Requirements: 3.3, 8.3, 8.4
 */
function handleSort(criterion) {
  currentSortCriterion = criterion;

  // Update active class on sort buttons
  const sortControls = document.getElementById('sort-controls');
  if (sortControls) {
    sortControls.querySelectorAll('button[data-criterion]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.criterion === criterion);
    });
  }

  renderTransactionList(state.transactions);
}

/**
 * Register all DOM event listeners for the application.
 * Called once from `init()` after the DOM is ready.
 *
 * Requirements: 1.3, 1.6, 2.6, 6.2, 7.4, 8.3, 9.1
 */
function registerEventListeners() {
  // Add transaction form submit
  const form = document.getElementById('transaction-form');
  if (form) {
    form.addEventListener('submit', handleAddTransaction);
  }

  // Delete transaction — event delegation on the list
  const listEl = document.getElementById('transaction-list');
  if (listEl) {
    listEl.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-id]');
      if (btn) {
        handleDeleteTransaction(btn.dataset.id);
      }
    });
  }

  // Spending limit input
  const limitInput = document.getElementById('spending-limit-input');
  if (limitInput) {
    limitInput.addEventListener('change', handleSetSpendingLimit);
    limitInput.addEventListener('input', handleSetSpendingLimit);
  }

  // Add custom category
  const addCatBtn = document.getElementById('add-category-btn');
  if (addCatBtn) {
    addCatBtn.addEventListener('click', handleAddCustomCategory);
  }

  // Theme toggle
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', handleThemeToggle);
  }

  // Sort controls — delegated clicks on sort buttons
  const sortControls = document.getElementById('sort-controls');
  if (sortControls) {
    sortControls.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-criterion]');
      if (btn) {
        handleSort(btn.dataset.criterion);
      }
    });
  }
}

// === INIT ===

/**
 * Bootstrap the application on DOMContentLoaded.
 * Restores persisted state from localStorage (or falls back to defaults),
 * applies the saved theme, registers all event listeners, restores the
 * spending-limit input, and performs the initial render.
 *
 * Requirements: 5.3, 5.4, 5.5, 6.4, 6.5, 7.5, 7.6, 9.4, 9.5
 */
function init() {
  // Restore state from localStorage or start fresh
  const { data: saved, error: loadError } = loadState();
  if (saved !== null) {
    // Merge persisted fields into state (storageError stays false unless a save fails)
    state.transactions = Array.isArray(saved.transactions) ? saved.transactions : [];
    state.customCategories = Array.isArray(saved.customCategories) ? saved.customCategories : [];
    state.spendingLimit = typeof saved.spendingLimit === 'number' ? saved.spendingLimit : null;
    state.theme = saved.theme === 'dark' ? 'dark' : 'light';
    state.storageError = false;
  } else {
    // Start with DEFAULT_STATE
    state.transactions = [];
    state.customCategories = [];
    state.spendingLimit = null;
    state.theme = 'light';
    // Mark storage error if localStorage threw (unavailable or corrupt), not just empty
    state.storageError = loadError;
  }

  // Show storage warning if localStorage was unavailable or returned corrupt data
  if (state.storageError) {
    showStorageWarning();
  }

  // Apply persisted theme before first render (prevents flash)
  applyTheme(state.theme);

  // Register all event listeners
  registerEventListeners();

  // Restore spending limit input
  const limitInput = document.getElementById('spending-limit-input');
  if (limitInput && state.spendingLimit !== null) {
    limitInput.value = state.spendingLimit;
  }

  // Initial render
  renderCategoryDropdown();
  renderTransactionList(state.transactions);
  renderBalance(state.transactions, state.spendingLimit);
  renderChart(state.transactions);
}

document.addEventListener('DOMContentLoaded', init);
