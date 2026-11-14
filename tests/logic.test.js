/**
 * Logic tests for js/app.js — pure functions only (no DOM required).
 *
 * Feature: expense-budget-visualizer
 *
 * This file is designed to run in TWO environments:
 *   1. Browser: loaded by tests/index.html after app.js has been loaded
 *      (functions are already on globalThis).
 *   2. Node.js: loaded directly with `node tests/logic.test.js` after the
 *      functions are injected via the stub block below.
 *
 * Both environments use the same assert() / runTests() harness at the bottom.
 */

'use strict';

// ─── Node.js compatibility stub ──────────────────────────────────────────────
// When running under Node.js the functions from app.js are not yet defined.
// We re-define them here by inlining the pure functions so this file is
// self-contained and runnable without a browser.
(function injectIfNode() {
  if (typeof window !== 'undefined') return; // browser: functions come from app.js

  // --- getSortedTransactions ---
  globalThis.getSortedTransactions = function getSortedTransactions(transactions, criterion) {
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
  };

  // --- validateForm ---
  globalThis.validateForm = function validateForm(name, amount, category) {
    const errors = [];
    if (!name || name.trim().length === 0) {
      errors.push('Item name is required.');
    } else if (name.trim().length > 100) {
      errors.push('Item name must be 100 characters or fewer.');
    }
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
    if (!category) {
      errors.push('Please select a category.');
    }
    return { valid: errors.length === 0, errors };
  };

  // --- getAllCategories ---
  const DEFAULT_CATEGORIES = ['Food', 'Transport', 'Fun'];
  globalThis.getAllCategories = function getAllCategories(state) {
    return [...DEFAULT_CATEGORIES, ...state.customCategories];
  };

  // --- validateCategoryName ---
  globalThis.validateCategoryName = function validateCategoryName(name, existing) {
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
  };

  // --- calculateTotalBalance ---
  globalThis.calculateTotalBalance = function calculateTotalBalance(transactions) {
    if (!transactions || transactions.length === 0) return 0;
    return transactions.reduce((sum, t) => sum + t.amount, 0);
  };

  // --- formatCurrency ---
  globalThis.formatCurrency = function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  // --- buildChartData ---
  const CHART_COLORS = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
    '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#6366f1'
  ];
  globalThis.buildChartData = function buildChartData(transactions) {
    const totals = {};
    for (const t of transactions) {
      if (t.amount > 0) {
        totals[t.category] = (totals[t.category] || 0) + t.amount;
      }
    }
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
  };
})();

// ─── Minimal test harness ─────────────────────────────────────────────────────

const results = [];

function assert(description, condition) {
  results.push({ description, passed: !!condition });
}

function assertEqual(description, actual, expected) {
  const passed = JSON.stringify(actual) === JSON.stringify(expected);
  if (!passed) {
    results.push({
      description,
      passed: false,
      detail: `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    });
  } else {
    results.push({ description, passed: true });
  }
}

// ─── Helper factories ─────────────────────────────────────────────────────────

function makeTx(id, name, amount, category, createdAt) {
  return { id, name, amount, category, createdAt };
}

// ─── getSortedTransactions ────────────────────────────────────────────────────

(function testGetSortedTransactions() {
  const t1 = makeTx('1', 'Coffee',   3.50,  'Food',      1000);
  const t2 = makeTx('2', 'Bus',     12.00,  'Transport', 2000);
  const t3 = makeTx('3', 'Concert', 50.00,  'Fun',       3000);
  const original = [t1, t2, t3];

  // default: most recent first (descending createdAt)
  const sortedDefault = getSortedTransactions(original, 'default');
  assertEqual('sort default: first item is most recent', sortedDefault[0].id, '3');
  assertEqual('sort default: last item is oldest',       sortedDefault[2].id, '1');

  // amount-asc
  const sortedAsc = getSortedTransactions(original, 'amount-asc');
  assertEqual('sort amount-asc: first is cheapest',  sortedAsc[0].amount,  3.50);
  assertEqual('sort amount-asc: last is most expensive', sortedAsc[2].amount, 50.00);

  // amount-desc
  const sortedDesc = getSortedTransactions(original, 'amount-desc');
  assertEqual('sort amount-desc: first is most expensive', sortedDesc[0].amount, 50.00);
  assertEqual('sort amount-desc: last is cheapest',        sortedDesc[2].amount,  3.50);

  // category-asc (alphabetical): Food < Fun < Transport
  const sortedCat = getSortedTransactions(original, 'category-asc');
  assertEqual('sort category-asc: first is Food',      sortedCat[0].category, 'Food');
  assertEqual('sort category-asc: second is Fun',      sortedCat[1].category, 'Fun');
  assertEqual('sort category-asc: third is Transport', sortedCat[2].category, 'Transport');

  // non-mutating: original array unchanged
  assert('sort does not mutate original array', original[0].id === '1' && original[1].id === '2' && original[2].id === '3');

  // unknown criterion falls back to default (descending createdAt)
  const sortedUnknown = getSortedTransactions(original, 'foobar');
  assertEqual('sort unknown criterion: falls back to default', sortedUnknown[0].id, '3');
})();

// ─── validateForm ─────────────────────────────────────────────────────────────

(function testValidateForm() {
  // Valid submission
  const v = validateForm('Coffee', '3.50', 'Food');
  assert('validateForm: valid input returns valid=true', v.valid === true);
  assert('validateForm: valid input returns empty errors', v.errors.length === 0);

  // Empty name
  assert('validateForm: empty name is invalid', !validateForm('', '1.00', 'Food').valid);
  assert('validateForm: whitespace-only name is invalid', !validateForm('   ', '1.00', 'Food').valid);

  // Name too long (101 chars)
  assert('validateForm: 101-char name is invalid', !validateForm('a'.repeat(101), '1.00', 'Food').valid);
  // Name exactly 100 chars is valid
  assert('validateForm: 100-char name is valid', validateForm('a'.repeat(100), '1.00', 'Food').valid);

  // Amount edge cases
  assert('validateForm: amount 0.00 is invalid',     !validateForm('x', '0.00',  'Food').valid);
  assert('validateForm: amount 0.01 is valid',        validateForm('x', '0.01',  'Food').valid);
  assert('validateForm: amount 999999999.99 is valid', validateForm('x', '999999999.99', 'Food').valid);
  assert('validateForm: amount 1000000000 is invalid', !validateForm('x', '1000000000', 'Food').valid);
  assert('validateForm: non-numeric amount is invalid', !validateForm('x', 'abc', 'Food').valid);
  assert('validateForm: empty amount is invalid',      !validateForm('x', '',    'Food').valid);
  assert('validateForm: 3-decimal amount is invalid',  !validateForm('x', '1.234', 'Food').valid);
  assert('validateForm: 2-decimal amount is valid',     validateForm('x', '1.23', 'Food').valid);
  assert('validateForm: negative amount is invalid',   !validateForm('x', '-1',   'Food').valid);

  // No category
  assert('validateForm: no category is invalid', !validateForm('x', '1.00', '').valid);
  assert('validateForm: null category is invalid', !validateForm('x', '1.00', null).valid);

  // Multiple errors accumulated
  const multi = validateForm('', 'abc', '');
  assert('validateForm: multiple errors accumulated (3)',  multi.errors.length === 3);
})();

// ─── getAllCategories ─────────────────────────────────────────────────────────

(function testGetAllCategories() {
  const state = { customCategories: [] };
  assertEqual('getAllCategories: defaults only', getAllCategories(state), ['Food', 'Transport', 'Fun']);

  const state2 = { customCategories: ['Gym', 'Books'] };
  assertEqual('getAllCategories: defaults + custom', getAllCategories(state2), ['Food', 'Transport', 'Fun', 'Gym', 'Books']);

  // Does not mutate state.customCategories
  const original = state2.customCategories.slice();
  getAllCategories(state2);
  assertEqual('getAllCategories: does not mutate state', state2.customCategories, original);
})();

// ─── validateCategoryName ────────────────────────────────────────────────────

(function testValidateCategoryName() {
  const existing = ['Food', 'Transport', 'Fun'];

  // Valid new category
  const v = validateCategoryName('Gym', existing);
  assert('validateCategoryName: new unique name is valid', v.valid === true);
  assert('validateCategoryName: valid result has empty error string', v.error === '');

  // Empty name
  assert('validateCategoryName: empty name is invalid', !validateCategoryName('', existing).valid);
  assert('validateCategoryName: whitespace-only name is invalid', !validateCategoryName('   ', existing).valid);

  // Too long (51 chars)
  assert('validateCategoryName: 51-char name is invalid', !validateCategoryName('a'.repeat(51), existing).valid);
  // Exactly 50 chars is valid
  assert('validateCategoryName: 50-char name is valid', validateCategoryName('a'.repeat(50), existing).valid);

  // Case-insensitive duplicate detection
  assert('validateCategoryName: exact-case duplicate rejected',      !validateCategoryName('Food',      existing).valid);
  assert('validateCategoryName: uppercase duplicate rejected',       !validateCategoryName('FOOD',      existing).valid);
  assert('validateCategoryName: lowercase duplicate rejected',       !validateCategoryName('food',      existing).valid);
  assert('validateCategoryName: mixed-case duplicate rejected',      !validateCategoryName('FoOd',      existing).valid);
  assert('validateCategoryName: leading/trailing space duplicate rejected', !validateCategoryName(' Food ', existing).valid);
})();

// ─── calculateTotalBalance ───────────────────────────────────────────────────

(function testCalculateTotalBalance() {
  assertEqual('calculateTotalBalance: empty array returns 0', calculateTotalBalance([]), 0);
  assertEqual('calculateTotalBalance: null returns 0',        calculateTotalBalance(null), 0);
  assertEqual('calculateTotalBalance: undefined returns 0',   calculateTotalBalance(undefined), 0);

  const txns = [
    makeTx('1', 'a', 10.00, 'Food', 1000),
    makeTx('2', 'b', 20.50, 'Fun',  2000),
    makeTx('3', 'c',  5.25, 'Transport', 3000)
  ];
  // Floating-point: round to 2 dp for comparison
  const total = calculateTotalBalance(txns);
  assert('calculateTotalBalance: sums correctly', Math.abs(total - 35.75) < 0.001);

  // Single transaction
  assertEqual('calculateTotalBalance: single transaction', calculateTotalBalance([makeTx('1','x',99.99,'Food',1)]), 99.99);
})();

// ─── formatCurrency ──────────────────────────────────────────────────────────

(function testFormatCurrency() {
  assertEqual('formatCurrency: zero',              formatCurrency(0),        '$0.00');
  assertEqual('formatCurrency: whole number',      formatCurrency(1234),     '$1,234.00');
  assertEqual('formatCurrency: two decimals',      formatCurrency(1234.56),  '$1,234.56');
  assertEqual('formatCurrency: one decimal',       formatCurrency(1234.5),   '$1,234.50');
  assertEqual('formatCurrency: large number',      formatCurrency(999999999.99), '$999,999,999.99');
  assert('formatCurrency: starts with $', formatCurrency(1).startsWith('$'));
})();

// ─── buildChartData ──────────────────────────────────────────────────────────

(function testBuildChartData() {
  // Empty transaction list
  const empty = buildChartData([]);
  assertEqual('buildChartData: empty input returns empty labels', empty.labels, []);
  assertEqual('buildChartData: empty input returns empty data',   empty.data,   []);

  // Single category
  const single = buildChartData([
    makeTx('1', 'a', 10, 'Food', 1),
    makeTx('2', 'b', 20, 'Food', 2)
  ]);
  assertEqual('buildChartData: single category label',  single.labels, ['Food']);
  assertEqual('buildChartData: single category data',   single.data,   [30]);
  assert('buildChartData: single category has 1 color', single.colors.length === 1);

  // Multiple categories — verify totals and sort order (descending)
  const multi = buildChartData([
    makeTx('1', 'a', 10, 'Food',      1),
    makeTx('2', 'b', 50, 'Transport', 2),
    makeTx('3', 'c', 30, 'Fun',       3)
  ]);
  // Sorted descending: Transport(50) > Fun(30) > Food(10)
  assertEqual('buildChartData: sorted desc — first label',  multi.labels[0], 'Transport');
  assertEqual('buildChartData: sorted desc — second label', multi.labels[1], 'Fun');
  assertEqual('buildChartData: sorted desc — third label',  multi.labels[2], 'Food');

  // Zero-amount transactions excluded
  const withZero = buildChartData([
    makeTx('1', 'a', 0,  'Food', 1),
    makeTx('2', 'b', 10, 'Fun',  2)
  ]);
  assert('buildChartData: zero-amount category excluded', !withZero.labels.includes('Food'));
  assertEqual('buildChartData: non-zero category present', withZero.labels, ['Fun']);

  // Negative amounts excluded (treated as non-positive)
  const withNeg = buildChartData([
    makeTx('1', 'a', -5, 'Food', 1),
    makeTx('2', 'b', 10, 'Fun',  2)
  ]);
  assert('buildChartData: negative-amount category excluded', !withNeg.labels.includes('Food'));

  // 10-category boundary — all get own segment, no "Other"
  const tenTxns = Array.from({ length: 10 }, (_, i) =>
    makeTx(String(i), `item${i}`, 10, `Cat${i}`, i)
  );
  const ten = buildChartData(tenTxns);
  assert('buildChartData: 10 categories — no Other segment', !ten.labels.includes('Other'));
  assert('buildChartData: 10 categories — 10 segments',       ten.labels.length === 10);

  // 11-category overflow — top 9 + "Other"
  const elevenTxns = Array.from({ length: 11 }, (_, i) =>
    makeTx(String(i), `item${i}`, 10, `Cat${i}`, i)
  );
  const eleven = buildChartData(elevenTxns);
  assert('buildChartData: 11 categories — Other segment present', eleven.labels.includes('Other'));
  assert('buildChartData: 11 categories — 10 total segments',     eleven.labels.length === 10);

  // "Other" value = sum of remaining categories
  // Sorted desc: all same amount(10), so 11 items; top 9 keep own label; 2 go to Other
  const otherIdx = eleven.labels.indexOf('Other');
  assert('buildChartData: Other value equals sum of overflow categories',
    Math.abs(eleven.data[otherIdx] - 20) < 0.001
  );

  // Colors array length matches labels array length
  const colorCheck = buildChartData([
    makeTx('1', 'a', 5, 'Food', 1),
    makeTx('2', 'b', 5, 'Fun',  2)
  ]);
  assert('buildChartData: colors length matches labels length', colorCheck.colors.length === colorCheck.labels.length);
})();

// ─── Run & Report ─────────────────────────────────────────────────────────────

function runTests() {
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed);
  const total  = results.length;

  if (typeof window === 'undefined') {
    // Node.js output
    console.log(`\n=== Logic Test Results: ${passed}/${total} passed ===\n`);
    if (failed.length > 0) {
      console.log('FAILURES:');
      failed.forEach(r => {
        console.log(`  ✗ ${r.description}`);
        if (r.detail) console.log(`    ${r.detail}`);
      });
    } else {
      console.log('All tests passed! ✓');
    }
    if (failed.length > 0) process.exit(1);
  } else {
    // Browser output — write to #test-output element if present
    const out = document.getElementById('test-output');
    if (out) {
      out.innerHTML = `<strong>${passed}/${total} tests passed</strong>` +
        (failed.length > 0
          ? '<ul style="color:red">' + failed.map(r =>
              `<li>✗ ${r.description}${r.detail ? '<br><small>' + r.detail + '</small>' : ''}</li>`
            ).join('') + '</ul>'
          : '<p style="color:green">All tests passed ✓</p>');
    }
    // Also log to console
    console.group(`Logic Tests: ${passed}/${total} passed`);
    results.forEach(r => {
      if (r.passed) {
        console.log(`%c✓ ${r.description}`, 'color: green');
      } else {
        console.error(`✗ ${r.description}${r.detail ? ' — ' + r.detail : ''}`);
      }
    });
    console.groupEnd();
  }
}

runTests();
