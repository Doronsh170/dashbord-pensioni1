
(function() {
  'use strict';

  // === נתוני תשואות היסטוריים (1995-2024) — זהים למחשבון הקיים ===
  const RAW_YIELDS = {
    low:    [22.66, 6.42, 13.62, 15.60, 0.18, 9.39, 1.67, 5.01, 6.11, 5.12, 3.33, 5.27, 8.12, -0.30, -0.37, 7.07, 10.05, 5.98, 0.61, 9.16, 1.05, 2.83, 6.99, -0.06, 13.25, 10.47, 3.05, -13.89, 8.60, 5.03],
    medium: [30.82, 14.37, 23.60, 22.47, 9.89, 0.71, -4.99, -7.81, 17.20, 8.09, 4.06, 10.29, 6.78, -14.72, 11.58, 11.81, 6.85, 10.61, 15.11, 11.89, 1.21, 7.30, 14.10, -2.55, 22.29, 14.80, 15.54, -16.96, 17.26, 14.61],
    high:   [35.83, 20.56, 30.78, 27.00, 17.98, -6.46, -10.11, -18.26, 25.56, 10.11, 4.63, 14.24, 5.95, -30.89, 22.23, 14.18, 3.49, 14.60, 28.03, 13.24, 1.37, 10.66, 19.73, -3.81, 29.05, 17.35, 25.18, -18.02, 23.84, 22.23]
  };
  const START_YEAR = 1995;
  const RISK_LABELS = { low: 'סיכון נמוך', medium: 'סיכון בינוני', high: 'סיכון גבוה' };

  // === מיפוי DOM ===
  const $ = (id) => document.getElementById(id);
  const section       = $('projectionSection');
  const toggle        = $('projToggle');
  const body          = $('projBody');
  const riskLabel     = $('projRiskLabel');
  const stockPctEl    = $('projStockPct');
  const empty         = $('projEmpty');
  const form          = $('projForm');
  const initialInput  = $('projInitial');
  const monthlyInput  = $('projMonthly');
  const feeInput      = $('projFee');
  const yearsInput   = $('projYears');
  const runBtn        = $('projRunBtn');
  const results       = $('projResults');
  const finalEl       = $('projFinal');
  const contribEl     = $('projContrib');
  const interestEl    = $('projInterest');
  const worstEl       = $('projWorstYear');
  const yearlyBody    = $('projYearlyBody');

  // === Helpers ===
  const fmtILS = (n) => Math.round(n).toLocaleString('he-IL', {
    style: 'currency', currency: 'ILS', maximumFractionDigits: 0
  });
  const parseNum = (txt) => {
    if (!txt) return NaN;
    const cleaned = String(txt).replace(/[^\d.\-]/g, '');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : NaN;
  };

  // מיפוי חשיפה מנייתית → מסלול היסטורי
  function pickRiskTrack(stockPct) {
    if (stockPct <= 10) return 'low';
    if (stockPct <= 70) return 'medium';
    return 'high';
  }

  // קריאת מצב הדשבורד מתוך ה-DOM שכבר רונדר
  function readDashboardState() {
    const totalText = $('totalBalance') ? $('totalBalance').textContent : '';
    const stockText = $('aggStock')     ? $('aggStock').textContent     : '';
    const feeText   = $('feeSavings')   ? $('feeSavings').textContent   : '';
    const total    = parseNum(totalText);
    const stockPct = parseNum(stockText);
    const fee      = parseNum(feeText);
    return {
      total:        Number.isFinite(total) && total > 0 ? total : 0,
      stockPct:     Number.isFinite(stockPct) ? stockPct : 0,
      fee:          Number.isFinite(fee) && fee > 0 ? fee : null,
      hasPortfolio: Number.isFinite(total) && total > 0
    };
  }

  // טעינה מחדש של ברירות מחדל מתוך הדשבורד (בלי לדרוס מה שהמשתמש ערך)
  function refreshPrefill() {
    const state = readDashboardState();
    if (state.hasPortfolio) {
      empty.hidden = true;
      form.hidden = false;
      const track = pickRiskTrack(state.stockPct);
      riskLabel.textContent = RISK_LABELS[track];
      stockPctEl.textContent = state.stockPct.toFixed(1);
      if (!initialInput.dataset.userEdited) {
        initialInput.value = Math.round(state.total);
      }
      if (state.fee !== null && !feeInput.dataset.userEdited) {
        feeInput.value = state.fee.toFixed(2);
      }
    } else {
      empty.hidden = false;
      form.hidden = true;
      results.hidden = true;
      riskLabel.textContent = '—';
      stockPctEl.textContent = '—';
    }
  }

  // סימון שדות שהמשתמש ערך ידנית — כדי לא לדרוס בעדכון חוזר
  [initialInput, feeInput].forEach(el => {
    el.addEventListener('input', () => { el.dataset.userEdited = '1'; });
  });

  // === בחירת אופק זמן (1–30 שנים) ===
  function getSelectedYears() {
    const n = parseInt(yearsInput.value, 10);
    if (!Number.isFinite(n) || n < 1) return 1;
    if (n > 30) return 30;
    return n;
  }
  yearsInput.addEventListener('blur', () => {
    const clamped = getSelectedYears();
    if (String(clamped) !== yearsInput.value) yearsInput.value = String(clamped);
  });

  // === קיפול/פתיחה של הכרטיס ===
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    body.hidden = expanded;
    if (!expanded) refreshPrefill();
  });

  // === מנוע הסימולציה (זהה לוגית למחשבון של דורון) ===
  function simulate({ initial, monthly, years, feePct, yields }) {
    let amount = initial;
    let contrib = initial;
    const yearly = [];
    let worstYield = Infinity;
    let worstHistYear = null;
    const feeMonthly = (feePct / 100) / 12;

    for (let y = 0; y < years; y++) {
      const idx = y % yields.length;
      const annualYield = yields[idx] / 100;
      const monthlyYield = annualYield / 12;

      for (let m = 0; m < 12; m++) {
        amount += monthly;
        contrib += monthly;
        amount += amount * monthlyYield;
        amount -= amount * feeMonthly;
      }

      const histYear = START_YEAR + idx;
      yearly.push({ n: y + 1, histYear, yieldPct: yields[idx], balance: amount });

      if (yields[idx] < worstYield) {
        worstYield = yields[idx];
        worstHistYear = histYear;
      }
    }
    return {
      finalAmount: amount,
      totalContrib: contrib,
      totalInterest: amount - contrib,
      yearly, worstYield, worstHistYear
    };
  }

  // === רינדור התוצאות ===
  function renderResults(sim) {
    finalEl.textContent    = fmtILS(sim.finalAmount);
    contribEl.textContent  = fmtILS(sim.totalContrib);
    interestEl.textContent = fmtILS(sim.totalInterest);
    interestEl.className   = 'proj-metric-value ' + (sim.totalInterest >= 0 ? 'proj-pos' : 'proj-neg');
    worstEl.textContent    = `${sim.worstYield.toFixed(2)}% (${sim.worstHistYear})`;

    yearlyBody.innerHTML = '';
    sim.yearly.forEach(row => {
      const tr = document.createElement('tr');
      if (row.yieldPct < -5) tr.className = 'bad-year';
      const yieldClass = row.yieldPct >= 0 ? 'proj-pos' : 'proj-neg';
      tr.innerHTML = `
        <td>שנה ${row.n} <span style="color:var(--ink-faint);font-size:11px">(${row.histYear})</span></td>
        <td class="num ${yieldClass}">${row.yieldPct.toFixed(2)}%</td>
        <td class="num">${fmtILS(row.balance)}</td>
      `;
      yearlyBody.appendChild(tr);
    });
    results.hidden = false;
  }

  // === כפתור ההרצה ===
  runBtn.addEventListener('click', () => {
    const state = readDashboardState();
    if (!state.hasPortfolio) { refreshPrefill(); return; }

    const initial = parseFloat(initialInput.value) || 0;
    const monthly = parseFloat(monthlyInput.value) || 0;
    const feePct  = parseFloat(feeInput.value) || 0;
    const years   = getSelectedYears();
    const track   = pickRiskTrack(state.stockPct);

    const sim = simulate({ initial, monthly, years, feePct, yields: RAW_YIELDS[track] });
    renderResults(sim);
    results.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  // פתיחה מהירה של אזור הסימולציה מתוך כפתור הדשבורד
  window.openProjection = function() {
    const state = readDashboardState();
    if (!state.hasPortfolio) return;
    section.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    body.hidden = false;
    refreshPrefill();
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // === הצגה / הסתרה לפי מצב התיק ===
  function syncSectionVisibility() {
    const state = readDashboardState();
    section.hidden = !state.hasPortfolio;
    if (state.hasPortfolio && toggle.getAttribute('aria-expanded') === 'true') {
      refreshPrefill();
    }
  }
  syncSectionVisibility();

  // === מעקב אחרי שינויים בדשבורד ===
  const observer = new MutationObserver(syncSectionVisibility);
  ['totalBalance', 'aggStock', 'feeSavings'].forEach(id => {
    const el = document.getElementById(id);
    if (el) observer.observe(el, { childList: true, characterData: true, subtree: true });
  });
})();


let DATA = [];
let META = {};
let DATASET_MAX_PERIOD = null;
let activeFilter = 'all';
let userFunds = [];
let CURRENT_EDIT_FUND = null;
let LAST_FOCUSED_UID = null;
let QUICK_RETURN_VISIBLE = false;
const balanceInputTimers = {};
const feeInputTimers = {};
const STORAGE_KEY = 'pension_dashboard_funds_v3';

const SOURCE_LABEL = {
  gemelnet: 'גמל',
  pensia: 'פנסיה',
  bituach: 'ביטוח מנהלים',
};
const SOURCE_DOT_COLOR = {
  gemelnet: '#60a5fa',
  pensia: '#c084fc',
  bituach: '#4ade80',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
function fmtPeriod(yyyymm) {
  if (!yyyymm) return '-';
  const s = String(yyyymm);
  return s.slice(4, 6) + '/' + s.slice(0, 4);
}
function monthDiff(periodA, periodB) {
  if (!periodA || !periodB) return 0;
  const a = String(periodA), b = String(periodB);
  const yA = parseInt(a.slice(0, 4), 10), mA = parseInt(a.slice(4, 6), 10);
  const yB = parseInt(b.slice(0, 4), 10), mB = parseInt(b.slice(4, 6), 10);
  return (yB - yA) * 12 + (mB - mA);
}
function fmtPct(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) + '%' : '-';
}
function fmtNum(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : '-';
}
function fmtCurrency(value) {
  return '₪' + Math.round(value).toLocaleString('he-IL');
}
function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[״"'`׳]/g, '')
    .replace(/[&]/g, ' and ')
    .replace(/[.,()\/\_]/g, ' ')
    .replace(/[-\u2013\u2014]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function compactText(value) {
  return normalizeText(value).replace(/[^a-z0-9א-ת]/g, '');
}
let LAST_SEARCH_TOTAL = 0;
function withRuntimeFlags(rec) {
  const monthsBehind = monthDiff(rec.report_period, DATASET_MAX_PERIOD);
  return {
    ...rec,
    months_behind: monthsBehind,
    is_stale: monthsBehind > 3,
    is_micro_fund: (Number(rec.total_assets) || 0) < 10,
  };
}
function metricClass(value) {
  if (!Number.isFinite(value)) return '';
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return '';
}

function searchFunds(query, limit = Infinity, filterOverride = activeFilter, allowEmptyAll = false) {
  const q = normalizeText(query);
  const qCompact = compactText(query);
  LAST_SEARCH_TOTAL = 0;
  const filter = filterOverride || 'all';
  if (!q && filter === 'all' && !allowEmptyAll) return [];
  const scored = [];
  for (const rec of DATA) {
    if (filter !== 'all' && rec.source !== filter) continue;

    // בגרסת הדשבורד מציגים רק מוצרים פעילים עם נכסים, כדי שלא ייכנסו חישובי חשיפה ריקים.
    if (!rec.is_active || (Number(rec.total_assets) || 0) <= 0) continue;

    const name = normalizeText(rec.fund_name);
    const mgr = normalizeText(rec.managing_corp + ' ' + rec.parent_company_name + ' ' + rec.controlling_corp);
    const cls = normalizeText(rec.classification + ' ' + rec.specialization + ' ' + rec.sub_specialization);
    const idText = normalizeText(rec.fund_id);
    const fullText = `${name} ${mgr} ${cls} ${idText}`;
    const fullCompact = compactText(fullText);

    let score = 0;
    if (!q) {
      score = 1;
    } else {
      if (name === q) score += 30;
      else if (name.startsWith(q)) score += 18;
      else if (name.includes(q)) score += 12;

      if (mgr === q) score += 35;
      else if (mgr.startsWith(q)) score += 22;
      else if (mgr.includes(q)) score += 16;
      if (cls.includes(q)) score += 4;
      if (idText === q) score += 25;

      // מאפשר חיפוש גם כאשר המשתמש מקליד S&P500 / SP500 / אס אנד פי בצורה לא זהה לשם במאגר.
      if (qCompact && fullCompact.includes(qCompact)) score += 10;

      const parts = q.split(' ').filter(Boolean);
      if (parts.length > 1 && parts.every(p => fullText.includes(p) || fullCompact.includes(compactText(p)))) score += 8;

      if (score === 0) continue;
    }
    scored.push({ rec, score, total: Number(rec.total_assets) || 0 });
  }

  const sourceRank = { gemelnet: 1, pensia: 2, bituach: 3 };
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const sr = (sourceRank[a.rec.source] || 9) - (sourceRank[b.rec.source] || 9);
    if (sr !== 0) return sr;
    const ma = normalizeText(a.rec.managing_corp || a.rec.parent_company_name || a.rec.controlling_corp || '');
    const mb = normalizeText(b.rec.managing_corp || b.rec.parent_company_name || b.rec.controlling_corp || '');
    if (ma !== mb) return ma.localeCompare(mb, 'he');
    const ca = normalizeText(a.rec.classification || a.rec.specialization || '');
    const cb = normalizeText(b.rec.classification || b.rec.specialization || '');
    if (ca !== cb) return ca.localeCompare(cb, 'he');
    return normalizeText(a.rec.fund_name).localeCompare(normalizeText(b.rec.fund_name), 'he');
  });
  LAST_SEARCH_TOTAL = scored.length;
  return scored.slice(0, Number.isFinite(limit) ? limit : scored.length).map(x => withRuntimeFlags(x.rec));
}

function normalizeUserFee(value) {
  if (value === '' || value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : null;
}
function fmtUserFee(value) {
  return Number.isFinite(value) ? value.toFixed(2) + '%' : 'לא הוזן';
}
function saveState() {
  const minimal = userFunds.map(item => ({
    uid: item.fund.uid,
    balance: item.balance || 0,
    management_fee: Number.isFinite(item.managementFee) ? item.managementFee : null,
    updated_at: item.updated_at || new Date().toISOString()
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(minimal));
}
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    userFunds = [];
    for (const item of saved) {
      const rec = DATA.find(r => r.uid === item.uid);
      if (rec) userFunds.push({
        fund: withRuntimeFlags(rec),
        balance: Number(item.balance) || 0,
        managementFee: normalizeUserFee(item.management_fee),
        updated_at: item.updated_at
      });
    }
  } catch (e) {
    userFunds = [];
  }
}

function renderDatasetMeta() {
  const el = document.getElementById('dataUpdateMeta');
  if (el) {
    el.textContent = `תאריך עדכון נתוני המאגר: ${fmtPeriod(DATASET_MAX_PERIOD)}`;
  }
}

function renderFunds() {
  const section = document.getElementById('portfolioSection');
  const wrap = document.getElementById('fundsList');
  if (section) section.style.display = 'none';
  if (wrap) wrap.innerHTML = '';
  QUICK_RETURN_VISIBLE = false;
  updateFloatingSearchButton();
  renderDashboard();
}

function weightedMetric(key, totalBalance) {
  let covered = 0;
  let sum = 0;
  for (const item of userFunds) {
    const balance = Number(item.balance) || 0;
    const value = Number(item.fund[key]);
    if (balance > 0 && Number.isFinite(value)) {
      covered += balance;
      sum += balance * value;
    }
  }
  return covered > 0 ? sum / covered : null;
}
function weightedUserManagementFee(totalBalance) {
  let sum = 0;
  let covered = 0;
  for (const item of userFunds) {
    const balance = Number(item.balance) || 0;
    if (balance <= 0) continue;
    if (!Number.isFinite(item.managementFee)) return null;
    covered += balance;
    sum += balance * item.managementFee;
  }
  return covered > 0 ? sum / covered : null;
}
function setFeeMetric(value) {
  const el = document.getElementById('feeSavings');
  const pct = document.getElementById('feeSavingsPct');
  if (Number.isFinite(value)) {
    el.textContent = value.toFixed(2);
    if (pct) pct.style.display = '';
  } else {
    el.textContent = 'לא הוזן';
    if (pct) pct.style.display = 'none';
  }
  el.className = '';
}
function setMetric(id, value, digits = 1) {
  const el = document.getElementById(id);
  el.textContent = Number.isFinite(value) ? value.toFixed(digits) : '-';
  el.className = metricClass(value);
}

function renderDashboard() {
  const activeItems = userFunds.filter(item => (Number(item.balance) || 0) > 0);
  const totalBalance = activeItems.reduce((sum, item) => sum + (Number(item.balance) || 0), 0);
  if (totalBalance <= 0) {
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('detailsSection').style.display = 'none';
    return;
  }

  const aggStock = weightedMetric('stock_pct', totalBalance);
  const aggForeign = weightedMetric('foreign_pct', totalBalance);
  const aggFx = weightedMetric('fx_pct', totalBalance);
  const aggLiquid = weightedMetric('liquid_pct', totalBalance);
  const perfMonth = weightedMetric('monthly_yield', totalBalance);
  const perfYtd = weightedMetric('ytd_yield', totalBalance);
  const perf3y = weightedMetric('yield_trailing_3yrs', totalBalance);
  const feeSavings = weightedUserManagementFee(totalBalance);

  document.getElementById('totalBalance').textContent = fmtCurrency(totalBalance);
  setMetric('aggStock', aggStock, 1);
  setMetric('aggForeign', aggForeign, 1);
  setMetric('aggFx', aggFx, 1);
  setMetric('aggLiquid', aggLiquid, 1);
  setMetric('perfMonth', perfMonth, 2);
  setMetric('perfYtd', perfYtd, 2);
  setMetric('perf3y', perf3y, 2);
  setFeeMetric(feeSavings);

  const barPairs = [
    ['aggStockBar', aggStock],
    ['aggForeignBar', aggForeign],
    ['aggFxBar', aggFx],
    ['aggLiquidBar', aggLiquid],
  ];
  for (const [id, value] of barPairs) {
    document.getElementById(id).style.width = Math.max(0, Math.min(100, Number(value) || 0)) + '%';
  }

  const sourceTotals = {};
  for (const item of activeItems) {
    const src = item.fund.source;
    sourceTotals[src] = (sourceTotals[src] || 0) + (Number(item.balance) || 0);
  }
  document.getElementById('sourceMix').innerHTML = Object.entries(sourceTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([src, val]) => `<div class="source-mix-item"><span class="dot" style="background:${SOURCE_DOT_COLOR[src]}"></span>${SOURCE_LABEL[src]}: ${(val / totalBalance * 100).toFixed(0)}%</div>`)
    .join('');

  const rows = activeItems
    .slice()
    .sort((a, b) => (Number(b.balance) || 0) - (Number(a.balance) || 0))
    .map(item => {
      const f = item.fund;
      const balance = Number(item.balance) || 0;
      const weight = balance / totalBalance * 100;
      return `
        <tr>
          <td><span class="source-tag ${escapeHtml(f.source)}">${SOURCE_LABEL[f.source]}</span> ${escapeHtml(f.fund_name)}</td>
          <td class="num">${weight.toFixed(1)}%</td>
          <td class="num">${fmtPct(f.stock_pct, 1)}</td>
          <td class="num">${fmtPct(f.foreign_pct, 1)}</td>
          <td class="num">${fmtPct(f.fx_pct, 1)}</td>
          <td class="num">${fmtPct(f.liquid_pct, 1)}</td>
          <td class="num ${metricClass(f.monthly_yield)}">${fmtPct(f.monthly_yield, 2)}</td>
          <td class="num ${metricClass(f.ytd_yield)}">${fmtPct(f.ytd_yield, 2)}</td>
          <td class="num ${metricClass(f.yield_trailing_3yrs)}">${fmtPct(f.yield_trailing_3yrs, 2)}</td>
          <td class="num">${fmtUserFee(item.managementFee)}</td>
        </tr>
      `;
    }).join('');
  document.getElementById('detailsRows').innerHTML = rows;
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('detailsSection').style.display = 'block';
}



function getTotalBalance() {
  return userFunds.reduce((sum, item) => sum + (Number(item.balance) || 0), 0);
}
function hasReportData() {
  return userFunds.length > 0 && getTotalBalance() > 0;
}
function buildShareText() {
  const totalBalance = getTotalBalance();
  const aggStock = weightedMetric('stock_pct', totalBalance);
  const aggForeign = weightedMetric('foreign_pct', totalBalance);
  const aggFx = weightedMetric('fx_pct', totalBalance);
  const aggLiquid = weightedMetric('liquid_pct', totalBalance);
  const perfYtd = weightedMetric('ytd_yield', totalBalance);
  const feeSavings = weightedUserManagementFee(totalBalance);
  const lines = [
    'דשבורד חשיפות חיסכון',
    `יתרה כוללת שהוזנה: ${fmtCurrency(totalBalance)}`,
    `חשיפה למניות: ${fmtPct(aggStock, 1)}`,
    `חשיפה לחו״ל: ${fmtPct(aggForeign, 1)}`,
    `חשיפה למט״ח: ${fmtPct(aggFx, 1)}`,
    `נכסים סחירים: ${fmtPct(aggLiquid, 1)}`,
    `תשואה מתחילת שנה לפי מסלולים, משוקללת: ${fmtPct(perfYtd, 2)}`,
    `תשואה 3 שנים מצטברת לפי מסלולים, משוקללת: ${fmtPct(weightedMetric('yield_trailing_3yrs', totalBalance), 2)}`,
    `דמי ניהול אישיים משוקללים: ${Number.isFinite(feeSavings) ? fmtPct(feeSavings, 2) : 'לא הוזן'}`,
    '',
    'פירוט מוצרים:'
  ];
  const sorted = userFunds.slice().sort((a, b) => (Number(b.balance) || 0) - (Number(a.balance) || 0));
  for (const item of sorted) {
    const balance = Number(item.balance) || 0;
    if (balance <= 0) continue;
    const f = item.fund;
    const weight = totalBalance > 0 ? balance / totalBalance * 100 : 0;
    lines.push(`- ${SOURCE_LABEL[f.source]} | ${f.fund_name} | ${fmtCurrency(balance)} | משקל ${weight.toFixed(1)}% | מניות ${fmtPct(f.stock_pct, 1)} | חו״ל ${fmtPct(f.foreign_pct, 1)} | מט״ח ${fmtPct(f.fx_pct, 1)} | דמי ניהול ${fmtUserFee(item.managementFee)}`);
  }
  lines.push('');
  lines.push('הבהרה: הנתונים מבוססים על נתונים ציבוריים ויתרות שהוזנו ידנית. זה אינו ייעוץ או המלצה.');
  if (window.location && window.location.href) lines.push(`קישור לדשבורד: ${window.location.href}`);
  return lines.join('\n');
}
function saveAsPDF() {
  if (!hasReportData()) {
    alert('כדי לשמור PDF צריך להוסיף לפחות מוצר אחד ולהזין יתרה.');
    return;
  }
  renderDashboard();

  // Mobile Safari and some in-app browsers generate the PDF from the currently
  // rendered page before fully applying @media print. Force a visible light
  // report mode first, then open the print dialog.
  document.body.classList.add('pdf-mode');
  const dashboard = document.getElementById('dashboard');
  if (dashboard) dashboard.scrollIntoView({ behavior: 'auto', block: 'start' });

  window.setTimeout(() => {
    window.print();
    // Fallback: if afterprint does not fire on mobile, restore the screen later.
    window.setTimeout(() => document.body.classList.remove('pdf-mode'), 3500);
  }, 650);
}
window.addEventListener('afterprint', () => {
  window.setTimeout(() => document.body.classList.remove('pdf-mode'), 250);
});
async function shareWhatsApp() {
  if (!hasReportData()) {
    alert('כדי לשלוח לווטסאפ צריך להוסיף לפחות מוצר אחד ולהזין יתרה.');
    return;
  }
  const text = buildShareText();
  if (navigator.share) {
    try {
      await navigator.share({ title: 'דשבורד חשיפות חיסכון', text });
      return;
    } catch (error) {
      if (error && error.name === 'AbortError') return;
    }
  }
  const url = 'https://wa.me/?text=' + encodeURIComponent(text);
  window.open(url, '_blank', 'noopener,noreferrer');
}
function goToDashboard() {
  if (!hasReportData()) {
    alert('כדי לעבור לדשבורד צריך להוסיף לפחות מוצר אחד ולהזין יתרה.');
    return;
  }
  renderDashboard();
  const dashboard = document.getElementById('dashboard');
  if (dashboard) dashboard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function resetAllData() {
  const hasData = userFunds.length > 0 || localStorage.getItem(STORAGE_KEY);
  if (!hasData) {
    prepareAnotherFund();
    return;
  }
  const ok = window.confirm('לאפס את כל הקופות, היתרות ודמי הניהול שהוזנו?');
  if (!ok) return;
  userFunds = [];
  CURRENT_EDIT_FUND = null;
  LAST_FOCUSED_UID = null;
  QUICK_RETURN_VISIBLE = false;
  localStorage.removeItem(STORAGE_KEY);
  const editor = document.getElementById('quickEditor');
  if (editor) {
    editor.classList.remove('active');
    editor.innerHTML = '';
  }
  const results = document.getElementById('searchResults');
  if (results) {
    results.classList.remove('active');
    results.innerHTML = '';
  }
  const input = document.getElementById('searchInput');
  if (input) input.value = '';
  renderDashboard();
  const section = document.getElementById('searchSection');
  if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.setTimeout(() => { if (input) input.focus({ preventScroll: true }); }, 350);
}
window.saveAsPDF = saveAsPDF;
window.shareWhatsApp = shareWhatsApp;
window.goToDashboard = goToDashboard;
window.resetAllData = resetAllData;

function findUserFundIndex(uid) {
  return userFunds.findIndex(item => item.fund && item.fund.uid === uid);
}
function openQuickEditor(fund) {
  CURRENT_EDIT_FUND = withRuntimeFlags(fund);
  const existingIndex = findUserFundIndex(CURRENT_EDIT_FUND.uid);
  const existing = existingIndex >= 0 ? userFunds[existingIndex] : null;
  const balanceValue = existing && Number(existing.balance) > 0 ? Number(existing.balance) : '';
  const feeValue = existing && Number.isFinite(existing.managementFee) ? existing.managementFee : '';
  const sub = [CURRENT_EDIT_FUND.managing_corp, CURRENT_EDIT_FUND.classification, CURRENT_EDIT_FUND.specialization, CURRENT_EDIT_FUND.sub_specialization].filter(Boolean).join(' • ');
  const editor = document.getElementById('quickEditor');
  if (!editor) return;
  editor.innerHTML = `
    <div class="quick-editor-card">
      <div class="quick-editor-title"><span class="source-tag ${escapeHtml(CURRENT_EDIT_FUND.source)}">${SOURCE_LABEL[CURRENT_EDIT_FUND.source]}</span>${escapeHtml(CURRENT_EDIT_FUND.fund_name)}</div>
      <div class="quick-editor-meta">${escapeHtml(sub || '-')} • מספר קופה: ${escapeHtml(CURRENT_EDIT_FUND.fund_id || '')}</div>
      <div class="quick-editor-form">
        <label class="field-group">
          <span class="field-label">יתרה</span>
          <span class="inline-input">
            <input type="number" class="balance-input" id="quickBalanceInput" value="${escapeHtml(balanceValue)}" placeholder="0" min="0" inputmode="numeric" />
            <span class="currency">₪</span>
          </span>
        </label>
        <label class="field-group">
          <span class="field-label">דמי ניהול מצבירה</span>
          <span class="inline-input">
            <input type="number" class="fee-input" id="quickFeeInput" value="${escapeHtml(feeValue)}" placeholder="לא הוזן" min="0" step="0.01" inputmode="decimal" />
            <span class="currency">%</span>
          </span>
        </label>
        <button type="button" class="update-dashboard-btn" onclick="commitQuickUpdate()">עדכן בדשבורד</button>
        ${existing ? '<button type="button" class="quick-remove-btn" onclick="removeCurrentQuickFund()">הסר מהדשבורד</button>' : ''}
      </div>
      <div class="quick-editor-message" id="quickEditorMessage"></div>
    </div>
  `;
  editor.classList.add('active');
  editor.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.setTimeout(() => {
    const input = document.getElementById('quickBalanceInput');
    if (input) { input.focus({ preventScroll: true }); input.select(); }
  }, 120);
}
function commitQuickUpdate() {
  if (!CURRENT_EDIT_FUND) return;
  const balanceInput = document.getElementById('quickBalanceInput');
  const feeInput = document.getElementById('quickFeeInput');
  const balance = Math.max(0, Number(balanceInput ? balanceInput.value : 0) || 0);
  const fee = normalizeUserFee(feeInput ? feeInput.value : null);
  if (balance <= 0) {
    alert('יש להזין יתרה גבוהה מאפס כדי לעדכן את הדשבורד.');
    if (balanceInput) balanceInput.focus();
    return;
  }
  const idx = findUserFundIndex(CURRENT_EDIT_FUND.uid);
  const payload = {
    fund: CURRENT_EDIT_FUND,
    balance,
    managementFee: fee,
    updated_at: new Date().toISOString()
  };
  if (idx >= 0) userFunds[idx] = payload;
  else userFunds.push(payload);
  saveState();
  renderDashboard();
  const msg = document.getElementById('quickEditorMessage');
  if (msg) {
    msg.innerHTML = `
      <div>עודכן בדשבורד.</div>
      <div class="quick-action-row">
        <button type="button" class="add-another-btn" onclick="prepareAnotherFund()">הוסף קופה נוספת</button>
        <button type="button" class="go-dashboard-btn" onclick="goToDashboard()">עבור לדשבורד</button>
        <button type="button" class="reset-all-btn" onclick="resetAllData()">איפוס הכל</button>
      </div>
    `;
  }
  showResults(document.getElementById('searchInput').value || '');
  const wrap = document.getElementById('searchResults');
  if (wrap) wrap.classList.add('active');
  const input = document.getElementById('searchInput');
  if (input) input.focus({ preventScroll: true });
}
function removeCurrentQuickFund() {
  if (!CURRENT_EDIT_FUND) return;
  const idx = findUserFundIndex(CURRENT_EDIT_FUND.uid);
  if (idx >= 0) {
    userFunds.splice(idx, 1);
    saveState();
    renderDashboard();
    const msg = document.getElementById('quickEditorMessage');
    if (msg) msg.textContent = 'הוסר מהדשבורד.';
    showResults(document.getElementById('searchInput').value || '');
  }
}
function prepareAnotherFund() {
  CURRENT_EDIT_FUND = null;
  selectedCompanyQuery = '';

  const editor = document.getElementById('quickEditor');
  if (editor) {
    editor.classList.remove('active');
    editor.innerHTML = '';
  }

  const results = document.getElementById('searchResults');
  if (results) {
    results.classList.remove('active');
    results.innerHTML = '';
  }

  const productPanel = document.getElementById('productTypePanel');
  if (productPanel) productPanel.classList.add('active');

  const companyLabel = document.getElementById('companyGridLabel');
  const companyGrid = document.getElementById('companyGrid');
  if (companyLabel) companyLabel.style.display = 'none';
  if (companyGrid) companyGrid.style.display = 'none';

  document.querySelectorAll('.company-btn').forEach(btn => btn.classList.remove('is-selected'));
  document.querySelectorAll('.product-type-btn').forEach(btn => btn.classList.remove('active'));
  setActiveProductFilter('all');

  const input = document.getElementById('searchInput');
  if (input) input.value = '';

  const hero = document.querySelector('.hero');
  const productPanelTarget = document.getElementById('productTypePanel');
  const target = hero || productPanelTarget || document.getElementById('searchSection');

  if (target && target.scrollIntoView) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
window.prepareAnotherFund = prepareAnotherFund;
window.openQuickEditor = openQuickEditor;
window.commitQuickUpdate = commitQuickUpdate;
window.removeCurrentQuickFund = removeCurrentQuickFund;

function updateFloatingSearchButton() {
  // אין יותר כפתור צף קבוע. החזרה לחיפוש מופיעה רק בתוך שורת הקופה לאחר הזנת סכום.
}

function returnToSearch() {
  QUICK_RETURN_VISIBLE = false;
  updateFloatingSearchButton();
  const section = document.getElementById('searchSection');
  const input = document.getElementById('searchInput');
  const query = input ? input.value : '';
  if (query.trim()) showResults(query);
  if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.setTimeout(() => {
    if (input) {
      input.focus({ preventScroll: true });
      if (!input.value.trim()) input.select();
    }
  }, 350);
}
window.returnToSearch = returnToSearch;

function focusFundInput(uid) {
  LAST_FOCUSED_UID = uid;
  renderFunds();
  window.setTimeout(() => {
    const card = document.querySelector(`.fund-card[data-uid="${CSS.escape(uid)}"]`);
    const input = document.querySelector(`.balance-input[data-uid="${CSS.escape(uid)}"]`);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (input) {
      input.focus({ preventScroll: true });
      input.select();
    }
  }, 50);
}

function addFund(fund) {
  openQuickEditor(fund);
}
function removeFund(idx) {
  if (balanceInputTimers[idx]) clearTimeout(balanceInputTimers[idx]);
  if (feeInputTimers[idx]) clearTimeout(feeInputTimers[idx]);
  if (userFunds[idx] && userFunds[idx].fund.uid === LAST_FOCUSED_UID) LAST_FOCUSED_UID = null;
  userFunds.splice(idx, 1);
  saveState();
  renderFunds();
}
function handleBalanceInput(idx, value, immediate = false) {
  if (balanceInputTimers[idx]) clearTimeout(balanceInputTimers[idx]);
  const run = () => updateBalance(idx, value);
  if (immediate) run();
  else balanceInputTimers[idx] = setTimeout(run, 650);
}
function updateBalance(idx, value) {
  if (!userFunds[idx]) return;
  const balance = Math.max(0, Number(value) || 0);
  userFunds[idx].balance = balance;
  userFunds[idx].updated_at = new Date().toISOString();
  saveState();
  const returnBtn = document.querySelector(`.return-search-btn[data-return-idx="${idx}"]`);
  if (returnBtn) returnBtn.style.display = balance > 0 ? 'inline-block' : 'none';
  QUICK_RETURN_VISIBLE = balance > 0;
  updateFloatingSearchButton();
  renderDashboard();
}
function handleFeeInput(idx, value, immediate = false) {
  if (feeInputTimers[idx]) clearTimeout(feeInputTimers[idx]);
  const run = () => updateManagementFee(idx, value);
  if (immediate) run();
  else feeInputTimers[idx] = setTimeout(run, 500);
}
function updateManagementFee(idx, value) {
  if (!userFunds[idx]) return;
  userFunds[idx].managementFee = normalizeUserFee(value);
  userFunds[idx].updated_at = new Date().toISOString();
  saveState();
  renderDashboard();
}
window.removeFund = removeFund;
window.updateBalance = updateBalance;
window.updateManagementFee = updateManagementFee;
window.handleBalanceInput = handleBalanceInput;
window.handleFeeInput = handleFeeInput;

function buildResultSummary(query, results) {
  const q = (query || '').trim();
  const counts = results.reduce((acc, r) => {
    acc.total += 1;
    acc[r.source] = (acc[r.source] || 0) + 1;
    return acc;
  }, { total: 0 });
  const countPills = ['gemelnet', 'pensia', 'bituach']
    .filter(src => counts[src])
    .map(src => `<span class="result-count-pill">${SOURCE_LABEL[src]}: ${counts[src]}</span>`)
    .join('');
  const title = q
    ? `נמצאו ${counts.total} מוצרים עבור החיפוש: "${escapeHtml(q)}"`
    : `מציג ${counts.total} מוצרים`;
  return `
    <div class="result-item result-summary">
      <div class="result-name">${title}</div>
      <div class="result-meta">
        <span>לחיצה על “עדכן” פותחת אזור מהיר להזנת יתרה ודמי ניהול</span>
        <span>כל התוצאות מוצגות בעמוד</span>
      </div>
      <div class="result-counts">${countPills}</div>
    </div>
  `;
}

function updateFilterCounts(query) {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    const label = btn.dataset.label || btn.textContent.trim();
    btn.innerHTML = escapeHtml(label);
  });
}

function showResults(query) {
  updateFilterCounts(query);
  const results = searchFunds(query);
  const wrap = document.getElementById('searchResults');
  if (!results.length) {
    wrap.innerHTML = query.trim()
      ? '<div class="result-item result-summary"><div class="result-name">לא נמצאו תוצאות</div><div class="result-meta"><span>נסה לחפש רק את שם החברה, לדוגמה: מיטב / מנורה / הראל, או מספר קופה.</span></div></div>'
      : '';
    wrap.classList.toggle('active', Boolean(query.trim()));
    return;
  }
  const summary = buildResultSummary(query, results);
  wrap.innerHTML = summary + results.map(r => {
    const stale = r.is_stale ? `<span class="stale-badge">${r.months_behind} ח׳ ישן</span>` : '';
    const micro = r.is_micro_fund ? `<span class="micro-badge">קטנה</span>` : '';
    const exposure = `מניות ${fmtPct(r.stock_pct, 0)} • חו״ל ${fmtPct(r.foreign_pct, 0)} • מט״ח ${fmtPct(r.fx_pct, 0)}`;
    const manager = r.managing_corp || r.parent_company_name || '-';
    const alreadySelected = userFunds.some(item => item.fund.uid === r.uid);
    const selectedBadge = alreadySelected ? '<span class="selected-badge">כבר נוסף</span>' : '';
    return `
      <div class="result-item ${alreadySelected ? 'selected' : ''}" data-uid="${escapeHtml(r.uid)}">
        <div class="result-main-row">
          <div>
            <div class="result-name"><span class="source-tag ${escapeHtml(r.source)}">${SOURCE_LABEL[r.source]}</span>${escapeHtml(r.fund_name)} ${selectedBadge} ${stale} ${micro}</div>
            <div class="result-meta">
              <span>${escapeHtml(manager)}</span>
              <span>${escapeHtml(r.classification || '')}</span>
              <span>${exposure}</span>
              <span>נכסים: ₪${Math.round(Number(r.total_assets) || 0).toLocaleString('he-IL')} מיליון</span>
              <span>מספר: ${escapeHtml(r.fund_id || '')}</span>
            </div>
          </div>
          <button type="button" class="select-btn" data-uid="${escapeHtml(r.uid)}">עדכן</button>
        </div>
      </div>
    `;
  }).join('');
  wrap.classList.add('active');
  wrap.querySelectorAll('.select-btn[data-uid]').forEach(btn => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      const found = results.find(x => x.uid === btn.dataset.uid);
      if (found) addFund(found);
    });
  });
}

document.getElementById('searchInput').addEventListener('input', e => showResults(e.target.value));
document.getElementById('searchInput').addEventListener('focus', e => {
  if (activeFilter !== 'all' || e.target.value.trim()) showResults(e.target.value);
});
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    showResults(document.getElementById('searchInput').value);
  });
});


const manualSearchToggle = document.getElementById('manualSearchToggle');
const manualSearchControls = document.getElementById('manualSearchControls');
if (manualSearchToggle && manualSearchControls) {
  manualSearchToggle.addEventListener('click', () => {
    const willOpen = manualSearchControls.hasAttribute('hidden');
    if (willOpen) {
      manualSearchControls.removeAttribute('hidden');
      manualSearchToggle.setAttribute('aria-expanded', 'true');
      manualSearchToggle.textContent = 'סגור חיפוש ידני';
      const input = document.getElementById('searchInput');
      if (input) {
        setTimeout(() => input.focus(), 80);
      }
    } else {
      manualSearchControls.setAttribute('hidden', '');
      manualSearchToggle.setAttribute('aria-expanded', 'false');
      manualSearchToggle.textContent = 'לא מצאת את הקופה? חיפוש ידני';
    }
  });
}

// v3.48: זרימה פשוטה יותר — בחירת סוג מוצר, אחר כך יצרן, ואז קופה
let selectedCompanyQuery = '';
let selectedProductFilter = 'all';

function setActiveProductFilter(filter) {
  activeFilter = filter || 'all';
  selectedProductFilter = activeFilter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  const matchingFilterBtn = document.querySelector(`.filter-btn[data-filter="${activeFilter}"]`);
  if (matchingFilterBtn) matchingFilterBtn.classList.add('active');
  document.querySelectorAll('.product-type-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === activeFilter));
}

function resetSearchResultsOnly() {
  const resultsWrap = document.getElementById('searchResults');
  if (resultsWrap) {
    resultsWrap.innerHTML = '';
    resultsWrap.classList.remove('active');
  }
  const editor = document.getElementById('quickEditor');
  if (editor) {
    editor.classList.remove('active');
    editor.innerHTML = '';
  }
}

document.querySelectorAll('.product-type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const filter = btn.dataset.filter || 'all';
    selectedCompanyQuery = '';
    setActiveProductFilter(filter);
    document.querySelectorAll('.company-btn').forEach(b => b.classList.remove('is-selected'));

    const input = document.getElementById('searchInput');
    if (input) input.value = '';
    resetSearchResultsOnly();

    const companyLabel = document.getElementById('companyGridLabel');
    const companyGrid = document.getElementById('companyGrid');
    if (companyLabel) companyLabel.style.display = '';
    if (companyGrid) companyGrid.style.display = 'grid';

    if (companyGrid && companyGrid.scrollIntoView) {
      companyGrid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
});

document.querySelectorAll('.company-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const query = btn.dataset.query || '';
    selectedCompanyQuery = query;
    document.querySelectorAll('.company-btn').forEach(b => b.classList.remove('is-selected'));
    btn.classList.add('is-selected');

    const input = document.getElementById('searchInput');
    if (input) input.value = query;

    showResults(query);
    const resultsWrap = document.getElementById('searchResults');
    if (resultsWrap && resultsWrap.scrollIntoView) {
      resultsWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// חיפוש ידני מוסתר כברירת מחדל ונפתח רק בלחיצה, כדי לא להעמיס על המשתמש.


(async function init() {
  try {
    const res = await fetch('./funds_unified.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const payload = await res.json();
    DATA = Array.isArray(payload.funds) ? payload.funds : [];
    META = payload.meta || {};
    DATASET_MAX_PERIOD = META.dataset_max_period || Math.max(...DATA.map(x => Number(x.report_period) || 0));
    document.getElementById('loadingState').style.display = 'none';
    renderDatasetMeta();
    loadState();
    updateFilterCounts('');
    renderFunds();
  } catch (error) {
    document.getElementById('loadingState').textContent = 'שגיאה בטעינת הנתונים: ' + error.message;
    console.error(error);
  }
})();


/* v3.29: info cube tooltips - works on hover (desktop) and tap (mobile) */
(function() {
  const cubes = document.querySelectorAll('.info-cube');
  const tooltip = document.getElementById('cubeTooltip');
  if (!cubes.length || !tooltip) return;

  const tips = {
    exposure: '<strong>חשיפה למניות ולמט״ח</strong>חשיפה למניות = החלק מההשקעה שלך המושקע במניות (חשוף לתנודות שוק, פוטנציאל תשואה וסיכון גבוהים יותר). חשיפה למט״ח = החלק מההשקעה הצמוד למטבעות זרים (בעיקר דולר). שני המדדים האלה מאפשרים לך להבין במבט אחד את רמת הסיכון בחיסכון שלך.',
    privacy: '<strong>הנתונים שלך נשארים אצלך</strong>היתרות ודמי הניהול שהזנת נשמרים בדפדפן שלך. הם אינם נשמרים בשרת, ואינם משויכים לפרטים אישיים.',
    workflow: '<strong>איך עובדים עם הכלי</strong>1. חפש את שם החברה שמנהלת את הקופה שלך (אפשר למצוא בדוח השנתי שמגיע בדואר/מייל). 2. לחץ "עדכן" על הקופה הרצויה. 3. הזן יתרה ודמי ניהול בפועל. 4. לחץ "עדכן בדשבורד" כדי לראות את החשיפה הכוללת של כל החסכונות יחד.',
    source: '<strong>מקור הנתונים</strong>הנתונים מבוססים על קובצי המידע הציבוריים של רשות שוק ההון, הביטוח והחיסכון, מתוך מאגרי גמל נט, פנסיה נט וביטוח נט, כפי שפורסמו ב-data.gov.il. הדשבורד אינו מושך נתונים אישיים ממסלקה פנסיונית, אלא משתמש ביתרות ודמי ניהול שהמשתמש מזין ידנית.'
  };

  let activeCube = null;

  function closeTooltip() {
    cubes.forEach(c => c.setAttribute('aria-expanded', 'false'));
    tooltip.hidden = true;
    activeCube = null;
  }

  function openTooltip(cube) {
    const id = cube.dataset.tip;
    if (!tips[id]) return;
    cubes.forEach(c => c.setAttribute('aria-expanded', 'false'));
    cube.setAttribute('aria-expanded', 'true');
    tooltip.innerHTML = tips[id];
    tooltip.hidden = false;
    activeCube = cube;
  }

  cubes.forEach(cube => {
    cube.addEventListener('click', (e) => {
      e.stopPropagation();
      if (activeCube === cube) {
        closeTooltip();
      } else {
        openTooltip(cube);
      }
    });
  });

  // click outside closes tooltip
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.info-cube') && !e.target.closest('.info-cube-tooltip')) {
      if (activeCube) closeTooltip();
    }
  });

  // ESC key closes tooltip
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeCube) closeTooltip();
  });
})();
