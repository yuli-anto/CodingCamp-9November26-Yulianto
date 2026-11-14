var fs = require('fs');
var OUTPUT = __dirname + '/results.txt';

// Write immediately to prove we started
fs.writeFileSync(OUTPUT, 'STARTED\n', 'utf8');

try {

var DEFAULT_CATEGORIES = ['Food', 'Transport', 'Fun'];

function getSortedTransactions(transactions, criterion) {
  var copy = transactions.slice();
  if (criterion === 'amount-asc')   return copy.sort(function(a,b){ return a.amount - b.amount; });
  if (criterion === 'amount-desc')  return copy.sort(function(a,b){ return b.amount - a.amount; });
  if (criterion === 'category-asc') return copy.sort(function(a,b){ return a.category.localeCompare(b.category); });
  return copy.sort(function(a,b){ return b.createdAt - a.createdAt; });
}

function validateForm(name, amount, category) {
  var errors = [];
  if (!name || name.trim().length === 0) errors.push('Item name is required.');
  else if (name.trim().length > 100) errors.push('Item name must be 100 characters or fewer.');
  var amountStr = String(amount).trim();
  var amountNum = parseFloat(amountStr);
  if (amountStr === '' || isNaN(amountNum)) errors.push('Amount must be a valid number.');
  else if (amountNum < 0.01) errors.push('Amount must be at least 0.01.');
  else if (amountNum > 999999999.99) errors.push('Amount must be no more than 999,999,999.99.');
  else {
    var m = amountStr.match(/\.(\d+)$/);
    if (m && m[1].length > 2) errors.push('Amount must have at most 2 decimal places.');
  }
  if (!category) errors.push('Please select a category.');
  return { valid: errors.length === 0, errors: errors };
}

function getAllCategories(state) {
  return DEFAULT_CATEGORIES.concat(state.customCategories);
}

function validateCategoryName(name, existing) {
  if (!name || name.trim().length === 0) return { valid: false, error: 'Category name cannot be empty.' };
  if (name.trim().length > 50) return { valid: false, error: 'Category name must be 50 characters or fewer.' };
  var lower = name.trim().toLowerCase();
  if (existing.some(function(c){ return c.toLowerCase() === lower; }))
    return { valid: false, error: 'A category with that name already exists.' };
  return { valid: true, error: '' };
}

function calculateTotalBalance(transactions) {
  if (!transactions || transactions.length === 0) return 0;
  return transactions.reduce(function(sum, t){ return sum + t.amount; }, 0);
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(amount);
}

var CHART_COLORS = ['#3b82f6','#ef4444','#10b981','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#f97316','#84cc16','#6366f1'];

function buildChartData(transactions) {
  var totals = {};
  for (var i = 0; i < transactions.length; i++) {
    var t = transactions[i];
    if (t.amount > 0) totals[t.category] = (totals[t.category] || 0) + t.amount;
  }
  var entries = Object.keys(totals).map(function(k){ return [k, totals[k]]; })
    .filter(function(e){ return e[1] > 0; })
    .sort(function(a,b){ return b[1] - a[1]; });
  if (entries.length === 0) return { labels:[], data:[], colors:[] };
  var labels=[], data=[], colors=[];
  if (entries.length <= 10) {
    entries.forEach(function(e, i){ labels.push(e[0]); data.push(e[1]); colors.push(CHART_COLORS[i%10]); });
  } else {
    var other = 0;
    entries.forEach(function(e,i){
      if (i < 9) { labels.push(e[0]); data.push(e[1]); colors.push(CHART_COLORS[i]); }
      else other += e[1];
    });
    labels.push('Other'); data.push(other); colors.push(CHART_COLORS[9]);
  }
  return { labels:labels, data:data, colors:colors };
}

// Harness
var results = [];
function assert(desc, cond)  { results.push({ desc:desc, passed:!!cond }); }
function assertEqual(desc, actual, expected) {
  var passed = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ desc:desc, passed:passed, detail: passed ? null : 'expected '+JSON.stringify(expected)+', got '+JSON.stringify(actual) });
}
function tx(id,name,amount,category,createdAt){ return {id:id,name:name,amount:amount,category:category,createdAt:createdAt}; }

// getSortedTransactions
var t1=tx('1','Coffee',3.50,'Food',1000), t2=tx('2','Bus',12.00,'Transport',2000), t3=tx('3','Concert',50.00,'Fun',3000);
var orig=[t1,t2,t3];
var sd=getSortedTransactions(orig,'default');
assertEqual('sort default: first most recent', sd[0].id, '3');
assertEqual('sort default: last oldest',       sd[2].id, '1');
var sa=getSortedTransactions(orig,'amount-asc');
assertEqual('sort amount-asc: first cheapest',      sa[0].amount, 3.50);
assertEqual('sort amount-asc: last most expensive', sa[2].amount, 50.00);
var sd2=getSortedTransactions(orig,'amount-desc');
assertEqual('sort amount-desc: first most expensive', sd2[0].amount, 50.00);
assertEqual('sort amount-desc: last cheapest',        sd2[2].amount, 3.50);
var sc=getSortedTransactions(orig,'category-asc');
assertEqual('sort cat-asc: Food first',      sc[0].category,'Food');
assertEqual('sort cat-asc: Fun second',      sc[1].category,'Fun');
assertEqual('sort cat-asc: Transport third', sc[2].category,'Transport');
assert('sort does not mutate original', orig[0].id==='1'&&orig[1].id==='2'&&orig[2].id==='3');
var su=getSortedTransactions(orig,'unknown');
assertEqual('sort unknown falls back to default', su[0].id, '3');

// validateForm
var vf=validateForm('Coffee','3.50','Food');
assert('validateForm: valid → valid=true',      vf.valid===true);
assert('validateForm: valid → 0 errors',        vf.errors.length===0);
assert('validateForm: empty name',             !validateForm('','1.00','Food').valid);
assert('validateForm: whitespace name',        !validateForm('   ','1.00','Food').valid);
assert('validateForm: 101-char name',          !validateForm(new Array(102).join('a'),'1.00','Food').valid);
assert('validateForm: 100-char name ok',        validateForm(new Array(101).join('a'),'1.00','Food').valid);
assert('validateForm: amount 0.00',            !validateForm('x','0.00','Food').valid);
assert('validateForm: amount 0.01 ok',          validateForm('x','0.01','Food').valid);
assert('validateForm: amount 999999999.99 ok',  validateForm('x','999999999.99','Food').valid);
assert('validateForm: amount 1000000000',      !validateForm('x','1000000000','Food').valid);
assert('validateForm: non-numeric',            !validateForm('x','abc','Food').valid);
assert('validateForm: empty amount',           !validateForm('x','','Food').valid);
assert('validateForm: 3 decimal places',       !validateForm('x','1.234','Food').valid);
assert('validateForm: 2 decimal places ok',     validateForm('x','1.23','Food').valid);
assert('validateForm: negative amount',        !validateForm('x','-1','Food').valid);
assert('validateForm: no category',            !validateForm('x','1.00','').valid);
assert('validateForm: null category',          !validateForm('x','1.00',null).valid);
var multi=validateForm('','abc','');
assert('validateForm: 3 errors accumulated', multi.errors.length===3);

// getAllCategories
assertEqual('getAllCategories: defaults only', getAllCategories({customCategories:[]}), ['Food','Transport','Fun']);
assertEqual('getAllCategories: defaults+custom', getAllCategories({customCategories:['Gym','Books']}), ['Food','Transport','Fun','Gym','Books']);
var s2={customCategories:['Gym']};
getAllCategories(s2);
assertEqual('getAllCategories: no mutation', s2.customCategories, ['Gym']);

// validateCategoryName
var ex=['Food','Transport','Fun'];
assert('validateCategoryName: new unique ok',    validateCategoryName('Gym',ex).valid);
assert('validateCategoryName: empty',           !validateCategoryName('',ex).valid);
assert('validateCategoryName: whitespace',      !validateCategoryName('   ',ex).valid);
assert('validateCategoryName: 51-char',        !validateCategoryName(new Array(52).join('a'),ex).valid);
assert('validateCategoryName: 50-char ok',      validateCategoryName(new Array(51).join('a'),ex).valid);
assert('validateCategoryName: exact dup',      !validateCategoryName('Food',ex).valid);
assert('validateCategoryName: upper dup',      !validateCategoryName('FOOD',ex).valid);
assert('validateCategoryName: lower dup',      !validateCategoryName('food',ex).valid);
assert('validateCategoryName: mixed dup',      !validateCategoryName('FoOd',ex).valid);
assert('validateCategoryName: padded dup',     !validateCategoryName(' Food ',ex).valid);

// calculateTotalBalance
assertEqual('calculateTotalBalance: empty',     calculateTotalBalance([]), 0);
assertEqual('calculateTotalBalance: null',      calculateTotalBalance(null), 0);
assertEqual('calculateTotalBalance: undefined', calculateTotalBalance(undefined), 0);
var txns=[tx('1','a',10.00,'Food',1),tx('2','b',20.50,'Fun',2),tx('3','c',5.25,'Transport',3)];
assert('calculateTotalBalance: sum 35.75', Math.abs(calculateTotalBalance(txns)-35.75)<0.001);
assertEqual('calculateTotalBalance: single', calculateTotalBalance([tx('1','x',99.99,'Food',1)]), 99.99);

// formatCurrency
assertEqual('formatCurrency: zero',         formatCurrency(0),           '$0.00');
assertEqual('formatCurrency: whole',        formatCurrency(1234),        '$1,234.00');
assertEqual('formatCurrency: two dec',      formatCurrency(1234.56),     '$1,234.56');
assertEqual('formatCurrency: one dec',      formatCurrency(1234.5),      '$1,234.50');
assertEqual('formatCurrency: large',        formatCurrency(999999999.99),'$999,999,999.99');
assert('formatCurrency: starts $', formatCurrency(1).charAt(0)==='$');

// buildChartData
var be=buildChartData([]);
assertEqual('buildChartData: empty labels', be.labels, []);
assertEqual('buildChartData: empty data',   be.data, []);
var bs=buildChartData([tx('1','a',10,'Food',1),tx('2','b',20,'Food',2)]);
assertEqual('buildChartData: single label', bs.labels, ['Food']);
assertEqual('buildChartData: single data',  bs.data, [30]);
assert('buildChartData: single color', bs.colors.length===1);
var bm=buildChartData([tx('1','a',10,'Food',1),tx('2','b',50,'Transport',2),tx('3','c',30,'Fun',3)]);
assertEqual('buildChartData: desc 1st', bm.labels[0],'Transport');
assertEqual('buildChartData: desc 2nd', bm.labels[1],'Fun');
assertEqual('buildChartData: desc 3rd', bm.labels[2],'Food');
var bz=buildChartData([tx('1','a',0,'Food',1),tx('2','b',10,'Fun',2)]);
assert('buildChartData: zero excluded', bz.labels.indexOf('Food')===-1);
var bn=buildChartData([tx('1','a',-5,'Food',1),tx('2','b',10,'Fun',2)]);
assert('buildChartData: negative excluded', bn.labels.indexOf('Food')===-1);
var ten10=[]; for(var i=0;i<10;i++) ten10.push(tx(String(i),'i'+i,10,'Cat'+i,i));
var r10=buildChartData(ten10);
assert('buildChartData: 10 cats no Other',    r10.labels.indexOf('Other')===-1);
assert('buildChartData: 10 cats 10 segs',     r10.labels.length===10);
var el11=[]; for(var i=0;i<11;i++) el11.push(tx(String(i),'i'+i,10,'Cat'+i,i));
var r11=buildChartData(el11);
assert('buildChartData: 11 cats Other present',  r11.labels.indexOf('Other')!==-1);
assert('buildChartData: 11 cats 10 segs',         r11.labels.length===10);
var oi=r11.labels.indexOf('Other');
assert('buildChartData: Other value=20', Math.abs(r11.data[oi]-20)<0.001);
var cc2=buildChartData([tx('1','a',5,'Food',1),tx('2','b',5,'Fun',2)]);
assert('buildChartData: colors length=labels length', cc2.colors.length===cc2.labels.length);

// Report
var passed=results.filter(function(r){return r.passed;}).length;
var failed=results.filter(function(r){return !r.passed;});
var total=results.length;
var out='\n=== Logic Test Results: '+passed+'/'+total+' passed ===\n\n';
if (failed.length===0) {
  out+='All tests passed! \u2713\n';
} else {
  out+='FAILURES:\n';
  failed.forEach(function(r){ out+='  \u2717 '+r.desc+'\n'; if(r.detail) out+='    '+r.detail+'\n'; });
}
fs.writeFileSync(OUTPUT, out, 'utf8');

} catch(e) {
  fs.writeFileSync(OUTPUT, 'ERROR: '+e.stack+'\n', 'utf8');
}
