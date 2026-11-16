// Global Dashboard State
const data = window.DASHBOARD_DATA || { people: [], cps: [], workload: [], derisk: [], renewals: [], notes_governance: [], issues: [] };

const EXTENDED_QUARTERS = [
  'FY26 Q1', 'FY26 Q2', 'FY26 Q3', 'FY26 Q4',
  'FY27 Q1', 'FY27 Q2', 'FY27 Q3', 'FY27 Q4',
  'FY28 Q1', 'FY28 Q2', 'FY28 Q3', 'FY28 Q4',
  'FY29 Q1', 'FY29 Q2', 'FY29 Q3', 'FY29 Q4',
  'FY30 Q1', 'FY30 Q2', 'FY30 Q3', 'FY30 Q4',
  'FY31+'
];

let activeQuickFilter = 'all';
let activeCSSFilter = 'all';
let activeRenewalQtr = 'all';
let activeDeRiskQtr = 'all';
let activeSubTab = 'overview';
let currentDrilldownItem = null;
let selectedRacetrackStage = null;

const portfolioSort = { col: 'arr_num', dir: 'desc' };
const teamSort = { col: 'capacity_score', dir: 'desc' };

document.addEventListener('DOMContentLoaded', () => {
  initApp();
  window.addEventListener('hashchange', handleHashRouting);
  handleHashRouting();
});

function initApp() {
  populateDropdowns();
  updateTopKPIs();
  renderCSSStrip('portfolio-css-chips', getAllWorkingAccounts(), activeCSSFilter, (chosen) => {
    activeCSSFilter = chosen;
    const sel = document.getElementById('pf-owner-select');
    if (sel) sel.value = chosen;
    renderPortfolioRows();
  });

  renderQuarterChips('ren-quarter-chips', activeRenewalQtr, setRenewalQuarter);
  renderQuarterChips('dr-quarter-chips', activeDeRiskQtr, setDeRiskQuarter);

  renderPortfolioRows();
  renderTeamTable();
  renderRenewalsTable();
  renderDeRiskTable();
  renderGovTable();
  renderQualityTable();
}

function getAllWorkingAccounts() {
  return [...(data.cps || []), ...(data.workload || [])];
}

function handleHashRouting() {
  const hash = window.location.hash || '#/';
  
  if (hash.startsWith('#/a/')) {
    const rawId = hash.replace('#/a/', '').trim();
    const accountId = decodeURIComponent(rawId);
    navigateTo('drilldown', false);
    showDrilldownView(accountId);
  } else if (hash === '#/team') {
    navigateTo('team', false);
  } else if (hash === '#/renewals') {
    navigateTo('renewals', false);
  } else if (hash === '#/derisk') {
    navigateTo('derisk', false);
  } else if (hash === '#/governance') {
    navigateTo('governance', false);
  } else if (hash === '#/quality') {
    navigateTo('quality', false);
  } else {
    navigateTo('portfolio', false);
  }
}

function navigateTo(viewId, updateHash = true) {
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.navbtn').forEach(b => b.classList.remove('active'));

  const targetPanel = document.getElementById(`view-${viewId}`);
  if (targetPanel) targetPanel.classList.add('active');

  const navBtn = document.getElementById(`nav-${viewId}`);
  if (navBtn) navBtn.classList.add('active');

  if (updateHash) {
    if (viewId === 'portfolio') window.location.hash = '#/';
    else if (viewId !== 'drilldown') window.location.hash = `#/${viewId}`;
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleTheme() {
  const current = document.body.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', next);
}

function updateTopKPIs() {
  const all = getAllWorkingAccounts();
  const cps = data.cps || [];
  const csw = data.workload || [];
  const derisk = data.derisk || [];

  const totalARR = all.reduce((a, b) => a + (b.arr_num || 0), 0);
  const cpsARR = cps.reduce((a, b) => a + (b.arr_num || 0), 0);
  const cswARR = csw.reduce((a, b) => a + (b.arr_num || 0), 0);
  const drARR = derisk.reduce((a, b) => a + (b.arr_num || 0), 0);
  const redPulses = all.filter(a => a.pulse === 'Red').length;

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
  const setElHtml = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };

  setEl('kpi-total-accts', all.length);
  setEl('kpi-total-arr', `$${(totalARR / 1000000).toFixed(2)}M`);
  setElHtml('kpi-cps-accts', `${cps.length} <span class="kpi-mini">($${(cpsARR / 1000000).toFixed(2)}M)</span>`);
  setElHtml('kpi-csw-accts', `${csw.length} <span class="kpi-mini">($${(cswARR / 1000000).toFixed(2)}M)</span>`);
  setElHtml('kpi-dr-accts', `${derisk.length} <span class="kpi-mini">($${(drARR / 1000000).toFixed(2)}M)</span>`);
  setEl('kpi-red-pulses', redPulses);

  setEl('nav-pf-count', all.length);
  setEl('nav-team-count', (data.people || []).length);
  setEl('nav-dr-count', derisk.length);
  setEl('nav-notes-count', (data.notes_governance || []).length);
  setEl('nav-qual-count', (data.issues || []).length);

  setEl('chip-cnt-all', all.length);
  setEl('chip-cnt-cps', cps.length);
  setEl('chip-cnt-csw', csw.length);
}

function populateDropdowns() {
  const all = getAllWorkingAccounts();
  const owners = [...new Set(all.map(a => a.owner).filter(Boolean))].sort();
  const statuses = [...new Set(all.map(a => a.status).filter(Boolean))].sort();

  const populateSelect = (id, items, allLabel) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = `<option value="all">${allLabel}</option>`;
    items.forEach(it => {
      const opt = document.createElement('option');
      opt.value = it;
      opt.innerText = it;
      sel.appendChild(opt);
    });
  };

  populateSelect('pf-owner-select', owners, 'All CSSs');
  populateSelect('pf-status-select', statuses, 'All Stages / Statuses');
  populateSelect('ren-owner-select', owners, 'All CSSs');
  populateSelect('dr-owner-select', owners, 'All CSSs');
  populateSelect('gov-owner-select', owners, 'All CSSs');
  populateSelect('qual-owner-select', owners, 'All CSSs');

  const qtrSel = document.getElementById('pf-qtr-select');
  if (qtrSel) {
    qtrSel.innerHTML = '<option value="all">All FY Quarters</option>';
    EXTENDED_QUARTERS.forEach(q => {
      const opt = document.createElement('option');
      opt.value = q;
      opt.innerText = q;
      qtrSel.appendChild(opt);
    });
  }
}

function renderQuarterChips(containerId, activeQtr, onSelect) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className = `chip ${activeQtr === 'all' ? 'active' : ''}`;
  allBtn.innerText = 'All Quarters';
  allBtn.onclick = () => onSelect('all');
  container.appendChild(allBtn);

  EXTENDED_QUARTERS.forEach(q => {
    const btn = document.createElement('button');
    btn.className = `chip ${activeQtr === q ? 'active' : ''}`;
    btn.innerText = q;
    btn.onclick = () => onSelect(q);
    container.appendChild(btn);
  });
}

function renderCSSStrip(containerId, items, selectedOwner, onSelect) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const counts = {};
  const arrMap = {};
  let totalCount = 0;
  let totalARR = 0;

  items.forEach(it => {
    const o = it.owner || 'Unassigned';
    counts[o] = (counts[o] || 0) + 1;
    arrMap[o] = (arrMap[o] || 0) + (it.arr_num || 0);
    totalCount += 1;
    totalARR += (it.arr_num || 0);
  });

  const allChip = document.createElement('button');
  allChip.className = `css-chip ${selectedOwner === 'all' ? 'active' : ''}`;
  allChip.innerHTML = `<span class="nm">All CSSs</span> <span class="cnt">${totalCount}</span> <span class="arr">$${(totalARR / 1000000).toFixed(1)}M</span>`;
  allChip.onclick = () => onSelect('all');
  container.appendChild(allChip);

  const sortedOwners = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  sortedOwners.forEach(o => {
    const chip = document.createElement('button');
    chip.className = `css-chip ${selectedOwner === o ? 'active' : ''}`;
    const arrVal = arrMap[o] >= 1000000 ? `$${(arrMap[o] / 1000000).toFixed(1)}M` : `$${Math.round(arrMap[o] / 1000)}k`;
    chip.innerHTML = `<span class="nm">${o}</span> <span class="cnt">${counts[o]}</span> <span class="arr">${arrVal}</span>`;
    chip.onclick = () => onSelect(o);
    container.appendChild(chip);
  });
}

function setQuickFilter(fKey) {
  activeQuickFilter = fKey;
  document.querySelectorAll('#chips-bar .chip').forEach(c => {
    if (c.getAttribute('data-filter') === fKey) c.classList.add('active');
    else c.classList.remove('active');
  });
  renderPortfolioRows();
}

function handlePortfolioSearch() { renderPortfolioRows(); }
function handlePortfolioFilterChange() {
  activeCSSFilter = document.getElementById('pf-owner-select')?.value || 'all';
  renderPortfolioRows();
}

function sortPortfolio(colKey) {
  if (portfolioSort.col === colKey) {
    portfolioSort.dir = portfolioSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    portfolioSort.col = colKey;
    portfolioSort.dir = 'desc';
  }

  document.querySelectorAll('.gh-cell.sortable .sort-arr').forEach(el => el.innerText = '↕');
  const activeArr = document.getElementById(`sort-arr-${colKey}`);
  if (activeArr) activeArr.innerText = portfolioSort.dir === 'asc' ? '↑' : '↓';

  renderPortfolioRows();
}

function renderPortfolioRows() {
  const container = document.getElementById('portfolio-rows-container');
  if (!container) return;
  container.innerHTML = '';

  let list = getAllWorkingAccounts();

  // 1. Quick Chip Filter
  if (activeQuickFilter === 'cps') list = list.filter(a => (a.plan_name || '').includes('Protection') || data.cps.includes(a));
  else if (activeQuickFilter === 'csw') list = list.filter(a => (a.plan_name || '').includes('Workload') || data.workload.includes(a));
  else if (activeQuickFilter === 'derisk') list = list.filter(a => a.is_derisk);
  else if (activeQuickFilter === 'red') list = list.filter(a => a.pulse === 'Red');
  else if (activeQuickFilter === 'onboarded') list = list.filter(a => (a.status || '').toLowerCase().includes('successful'));
  else if (activeQuickFilter === 'current-qtr') list = list.filter(a => (a.renewal_quarter || '') === 'FY27 Q1');

  // 2. Dropdown Filters
  const query = (document.getElementById('pf-search-input')?.value || '').toLowerCase().trim();
  const owner = document.getElementById('pf-owner-select')?.value || 'all';
  const status = document.getElementById('pf-status-select')?.value || 'all';
  const pulse = document.getElementById('pf-pulse-select')?.value || 'all';
  const qtr = document.getElementById('pf-qtr-select')?.value || 'all';

  if (query) {
    list = list.filter(a =>
      (a.clean_acct || '').toLowerCase().includes(query) ||
      (a.id || '').toLowerCase().includes(query) ||
      (a.owner || '').toLowerCase().includes(query) ||
      (a.comments || '').toLowerCase().includes(query)
    );
  }

  if (owner !== 'all') list = list.filter(a => a.owner === owner);
  if (status !== 'all') list = list.filter(a => a.status === status);
  if (pulse !== 'all') list = list.filter(a => a.pulse === pulse);
  if (qtr !== 'all') {
    if (qtr === 'FY31+') list = list.filter(a => (a.renewal_quarter || '').includes('FY31') || (a.renewal_quarter || '').includes('FY32'));
    else list = list.filter(a => a.renewal_quarter === qtr);
  }

  // 3. Sort List
  list.sort((a, b) => {
    let vA = a[portfolioSort.col];
    let vB = b[portfolioSort.col];
    if (portfolioSort.col === 'arr_num') {
      vA = vA || 0;
      vB = vB || 0;
    } else {
      vA = (vA || '').toString().toLowerCase();
      vB = (vB || '').toString().toLowerCase();
    }
    if (vA < vB) return portfolioSort.dir === 'asc' ? -1 : 1;
    if (vA > vB) return portfolioSort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  const visCountEl = document.getElementById('pf-visible-count');
  if (visCountEl) visCountEl.innerText = list.length;

  renderCSSStrip('portfolio-css-chips', list, owner, (chosen) => {
    const sel = document.getElementById('pf-owner-select');
    if (sel) sel.value = chosen;
    renderPortfolioRows();
  });

  list.forEach(item => {
    const row = document.createElement('div');
    row.className = 'grid-table-row';
    row.onclick = () => openDrilldown(item.id || item.clean_acct);

    const isCPS = (item.plan_name || '').includes('Protection') || data.cps.includes(item);
    const isDeRisk = item.is_derisk;
    const pulse = item.pulse || 'None';
    const status = item.status || 'On Track';

    let pDot = 'dot-none';
    if (pulse === 'Green') pDot = 'dot-green';
    else if (pulse === 'Yellow') pDot = 'dot-yellow';
    else if (pulse === 'Red') pDot = 'dot-red';

    let prio = 'P3';
    let prioClass = 'prio-p3';
    if (isDeRisk || pulse === 'Red') { prio = 'P1'; prioClass = 'prio-p1'; }
    else if (isCPS || pulse === 'Yellow') { prio = 'P2'; prioClass = 'prio-p2'; }

    let stClass = 'status-on-track';
    const stLower = status.toLowerCase();
    if (stLower.includes('successful')) stClass = 'status-completed';
    else if (stLower.includes('delay') || stLower.includes('hold')) stClass = 'status-delayed';
    else if (stLower.includes('implement') || stLower.includes('onboard')) stClass = 'status-implement';

    let filledSegs = 3;
    if (stLower.includes('successful')) filledSegs = 5;
    else if (stLower.includes('implement')) filledSegs = 2;
    else if (stLower.includes('onboard')) filledSegs = 1;
    else if (stLower.includes('optimize')) filledSegs = 4;

    const hasSfdcAcct = item.sfdc_account_id && item.sfdc_account_id.startsWith('001');
    const hasSfdcPlan = item.sfdc_plan_id && (item.sfdc_plan_id.startsWith('aGte') || item.sfdc_plan_id.startsWith('aGt8'));

    row.innerHTML = `
      <div class="gc-icon"><span class="badge-dot ${isCPS ? 'tag-cps' : 'tag-csw'}"></span></div>
      <div class="gc-acct">
        <div class="acct-nm">
          <a href="#/a/${item.id || item.clean_acct}" onclick="event.stopPropagation(); openDrilldown('${item.id || item.clean_acct}'); return false;" class="row-acct-link" title="Open Interactive Action Plan Drilldown">${item.clean_acct || item.account_name}</a>
          ${hasSfdcAcct ? `<a href="https://ciscosales.lightning.force.com/lightning/r/Account/${item.sfdc_account_id}/view" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" class="ext-icon-link" title="Open Salesforce Account">↗</a>` : ''}
        </div>
        <div class="acct-sub">
          <span class="tag-mini ${isCPS ? 'tag-cps' : 'tag-csw'}">${isCPS ? 'CPS' : 'CSW'}</span>
          ${isDeRisk ? '<span class="tag-mini tag-dr">Priority De-Risk</span>' : ''}
          ${hasSfdcPlan ? `<a href="https://ciscosales.lightning.force.com/lightning/r/${item.sfdc_plan_id}/view" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" class="plan-id-link" title="Open in Salesforce C360">${item.sfdc_plan_id} ↗</a>` : `<span style="opacity:0.7;">${item.id}</span>`}
        </div>
      </div>
      <div class="gc-prio"><span class="${prioClass}">${prio}</span></div>
      <div class="gc-owner"><strong>${item.owner}</strong></div>
      <div class="gc-stage"><span class="status-pill ${stClass}">${status}</span></div>
      <div class="gc-pulse pulse-cell"><span class="dot-pulse ${pDot}"></span> ${pulse}</div>
      <div class="gc-arr arr-cell">${item.arr || '$0'}</div>
      <div class="gc-qtr qtr-cell">${item.renewal_quarter || 'FY27 Q1'}</div>
      <div class="gc-progress">
        <div class="mini-stepper">
          <div class="ms-seg ${filledSegs >= 1 ? 'filled' : ''}"></div>
          <div class="ms-seg ${filledSegs >= 2 ? 'filled' : ''}"></div>
          <div class="ms-seg ${filledSegs >= 3 ? 'filled' : ''}"></div>
          <div class="ms-seg ${filledSegs >= 4 ? 'filled' : ''}"></div>
          <div class="ms-seg ${filledSegs >= 5 ? 'filled' : ''}"></div>
        </div>
      </div>
      <div class="gc-touch touch-cell">${item.last_modified || '2026-10-21'}</div>
      <div class="gc-action">
        ${hasSfdcPlan ? `<a href="https://ciscosales.lightning.force.com/lightning/r/${item.sfdc_plan_id}/view" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" class="btn ghost tiny-btn" title="Open Action Plan in Salesforce C360">🔗 C360 ↗</a>` : ''}
        <button class="open-btn" onclick="event.stopPropagation(); openDrilldown('${item.id || item.clean_acct}')">View ▸</button>
      </div>
    `;
    container.appendChild(row);
  });
}

function openDrilldown(idOrName) {
  window.location.hash = `#/a/${encodeURIComponent(idOrName)}`;
}

function showDrilldownView(accountId) {
  const all = getAllWorkingAccounts();
  const item = all.find(a => (a.id && a.id.toLowerCase() === accountId.toLowerCase()) || (a.clean_acct && a.clean_acct.toLowerCase() === accountId.toLowerCase())) || all[0];

  if (!item) return;
  currentDrilldownItem = item;

  const isCPS = (item.plan_name || '').includes('Protection') || data.cps.includes(item);
  const isDeRisk = item.is_derisk;
  const pulse = item.pulse || 'None';
  const status = item.status || 'On Track';

  // Breadcrumbs & Header
  document.getElementById('dd-crumb-segment').innerText = isCPS ? 'Cloud Protection Suite' : 'Cisco Secure Workload';
  document.getElementById('dd-crumb-account').innerText = item.clean_acct || item.account_name;
  document.getElementById('dd-logo-badge').innerText = isCPS ? 'CPS' : 'CSW';
  document.getElementById('dd-account-name').innerText = item.clean_acct || item.account_name;
  document.getElementById('dd-plan-name').innerText = item.plan_name || (isCPS ? 'Cloud Protection Suite' : 'Cisco Secure Workload');
  document.getElementById('dd-account-key').innerText = item.accountKey || `BU-${(item.clean_acct || 'acct').toLowerCase().replace(/\s+/g, '-')}`;

  document.getElementById('dd-owner').innerText = item.owner;
  document.getElementById('dd-arr').innerText = item.arr || '$0';
  document.getElementById('dd-renewal-qtr').innerText = item.renewal_quarter || 'FY27 Q1';

  // Pulse badge
  let pulseDot = 'dot-none';
  if (pulse === 'Green') pulseDot = 'dot-green';
  else if (pulse === 'Yellow') pulseDot = 'dot-yellow';
  else if (pulse === 'Red') pulseDot = 'dot-red';
  document.getElementById('dd-pulse-badge').innerHTML = `<span class="dot-pulse ${pulseDot}"></span> ${pulse}`;

  document.getElementById('dd-status-badge').innerText = status;

  // Authentic Salesforce URLs
  const hasPlanId = (item.sfdc_plan_id && (item.sfdc_plan_id.startsWith('aGte') || item.sfdc_plan_id.startsWith('aGt8'))) ||
                    (item.id && (item.id.startsWith('aGte') || item.id.startsWith('aGt8')));
  const validPlanId = item.sfdc_plan_id || (item.id && (item.id.startsWith('aGte') || item.id.startsWith('aGt8')) ? item.id : '');
  const actionPlanLink = validPlanId ? `https://ciscosales.lightning.force.com/lightning/r/${validPlanId}/view` : '';

  const hasAcctId = item.sfdc_account_id && item.sfdc_account_id.startsWith('001');
  const accountLink = hasAcctId ? `https://ciscosales.lightning.force.com/lightning/r/Account/${item.sfdc_account_id}/view` : 'https://ciscosales.lightning.force.com/lightning/o/Account/list?filterName=Recent';

  const planBtn = document.getElementById('dd-sfdc-plan-link');
  if (planBtn) {
    if (actionPlanLink) {
      planBtn.href = actionPlanLink;
      planBtn.target = '_blank';
      planBtn.rel = 'noopener noreferrer';
      planBtn.style.opacity = '1';
      planBtn.style.pointerEvents = 'auto';
      planBtn.innerText = '🔗 Open Action Plan in C360';
    } else {
      planBtn.removeAttribute('href');
      planBtn.style.opacity = '0.55';
      planBtn.style.pointerEvents = 'none';
      planBtn.innerText = 'Action Plan ID Not Tagged';
    }
  }

  const acctBtn = document.getElementById('dd-sfdc-acct-link');
  if (acctBtn) {
    acctBtn.href = accountLink;
    acctBtn.target = '_blank';
    acctBtn.rel = 'noopener noreferrer';
    acctBtn.innerText = hasAcctId ? '🏢 Open Salesforce Account' : '🏢 Open Salesforce Accounts';
  }

  const planIdEl = document.getElementById('dd-plan-id');
  if (planIdEl) {
    if (actionPlanLink) {
      planIdEl.innerHTML = `<a href="${actionPlanLink}" target="_blank" rel="noopener noreferrer" style="color:inherit; text-decoration:none;" title="Open Action Plan in Salesforce C360">${validPlanId} ↗</a>`;
    } else {
      planIdEl.innerText = item.id || 'C360-PLAN';
    }
  }

  // Render Sub-Components
  renderMilestonesStepper(item);
  renderRacetrack(item);
  renderTeamSlots(item);

  // Render Context Box
  const contextBox = document.getElementById('dd-context-notes');
  if (contextBox) {
    contextBox.innerHTML = `
      <div style="font-size:12.5px; line-height:1.55; color:var(--fg); margin-bottom:12px;">
        ${item.comments || item.risk_reason || item.pulse_comments || 'Active engagement managed in Salesforce C360.'}
      </div>
      <div style="display:flex; gap:12px; font-size:11.5px; color:var(--mut);">
        <span>Entitlement: <strong style="color:var(--cyan);">${item.entitlement || 'Standard'}</strong></span>
        <span>Days Open: <strong>${item.days_open || 82}d</strong></span>
        <span>Last C360 Touch: <strong style="color:var(--green);">${item.last_modified || '2026-10-21'}</strong></span>
      </div>
    `;
  }

  renderActionPlanSteps(item);
  renderUpdatesTimeline(item);
  renderCasesAndEscalations(item);

  // Freshness
  const freshDate = document.getElementById('dd-fresh-date');
  if (freshDate) freshDate.innerText = item.last_modified || '2026-10-21';
  const freshDays = document.getElementById('dd-fresh-days');
  if (freshDays) freshDays.innerText = `${item.days_since_touch || 2} days ago`;
  const freshStatus = document.getElementById('dd-fresh-status');
  if (freshStatus) {
    const days = item.days_since_touch || 2;
    if (days <= 14) freshStatus.innerHTML = '<span class="pill-green">Compliant (&lt;14d)</span>';
    else if (days <= 30) freshStatus.innerHTML = '<span class="pill-yellow">Follow-up Due (15-30d)</span>';
    else freshStatus.innerHTML = '<span class="pill-red">Stale (&gt;30d)</span>';
  }

  // Deals
  const dealArr = document.getElementById('dd-deal-arr');
  if (dealArr) dealArr.innerText = item.arr || '$0';
  const dealQtr = document.getElementById('dd-deal-qtr');
  if (dealQtr) dealQtr.innerText = item.renewal_quarter || 'FY27 Q1';
  const dealRisk = document.getElementById('dd-deal-risk');
  if (dealRisk) dealRisk.innerText = isDeRisk ? 'Priority Retention Focus' : 'Normal Retention';
}

function switchSubTab(subTabKey) {
  activeSubTab = subTabKey;
  document.querySelectorAll('.subtab-btn').forEach(btn => {
    if (btn.getAttribute('data-subtab') === subTabKey) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  document.querySelectorAll('.subtab-panel').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(`subtab-${subTabKey}`);
  if (target) target.classList.add('active');
}

function renderMilestonesStepper(item) {
  const container = document.getElementById('dd-stepper-container');
  if (!container) return;

  const st = (item.status || '').toLowerCase();
  const stages = [
    { num: 1, name: 'Discovery & Readiness', desc: 'Kickoff & scoping' },
    { num: 2, name: 'Tenant Setup', desc: 'Provisioning cluster' },
    { num: 3, name: 'Agent Deployment', desc: 'Workload endpoints' },
    { num: 4, name: 'Telemetry Baseline', desc: 'Flow ingestion' },
    { num: 5, name: 'Policy Modeling', desc: 'Rules & segmentation' },
    { num: 6, name: 'Onboarding Sign-off', desc: 'Executive acceptance' }
  ];

  let currentStage = 4;
  if (st.includes('onboard') || st.includes('kickoff')) currentStage = 1;
  else if (st.includes('implement')) currentStage = 2;
  else if (st.includes('track') || st.includes('adopt')) currentStage = 4;
  else if (st.includes('optimize')) currentStage = 5;
  else if (st.includes('successful')) currentStage = 6;

  const pct = Math.round((currentStage / 6) * 100);
  const progPct = document.getElementById('dd-progress-pct');
  if (progPct) progPct.innerText = `Stage ${currentStage} of 6 · ${pct}% Complete`;

  container.innerHTML = stages.map(s => {
    let stateClass = 'pending';
    let icon = s.num;
    if (s.num < currentStage) { stateClass = 'completed'; icon = '✓'; }
    else if (s.num === currentStage) { stateClass = 'active'; icon = '⚡'; }

    return `
      <div class="milestone-step ${stateClass}">
        <div class="step-num">${icon}</div>
        <div class="step-info">
          <div class="step-title">${s.name}</div>
          <div class="step-desc">${s.desc}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderTeamSlots(item) {
  const container = document.getElementById('dd-team-slots');
  if (!container) return;

  container.innerHTML = `
    <div class="team-slot-row">
      <span class="slot-role">Customer Success Specialist (CSS)</span>
      <span class="slot-name"><strong>${item.owner}</strong></span>
    </div>
    <div class="team-slot-row">
      <span class="slot-role">Customer Success Technical Leader</span>
      <span class="slot-name"><strong>Bob Baughman</strong> (bbaughma@cisco.com)</span>
    </div>
    <div class="team-slot-row">
      <span class="slot-role">Customer Success Manager</span>
      <span class="slot-name"><strong>Nathan Stumpe</strong> (nstumpe@cisco.com)</span>
    </div>
    <div class="team-slot-row">
      <span class="slot-role">Distribution List</span>
      <span class="slot-name"><code>group.nstumpe@cisco.com</code></span>
    </div>
  `;
}

function renderActionPlanSteps(item) {
  const container = document.getElementById('dd-plan-steps-list');
  if (!container) return;

  const steps = [
    { num: 1, title: 'Engagement Kickoff & Scoping Readiness', state: 'done', desc: 'Align on security objectives, verify tenant provisioning, and establish customer cadence.' },
    { num: 2, title: 'Network Scoping & Workload Inventory', state: 'done', desc: 'Identify target servers, subnets, and Kubernetes clusters for microsegmentation.' },
    { num: 3, title: 'Workload Agent Rollout & Cluster Telemetry', state: 'active', desc: 'Deploy agents across production workloads and verify bidirectional telemetry heartbeat.' },
    { num: 4, title: 'Traffic Flow Modeling & Workspace Scoping', state: 'pending', desc: 'Analyze bidirectional flow maps and construct fine-grained policy workspaces.' },
    { num: 5, title: 'Policy Validation & Exception Modeling', state: 'pending', desc: 'Validate automated whitelist rules with application owners in simulation mode.' },
    { num: 6, title: 'Enforcement Mode & Value Realization EBR', state: 'pending', desc: 'Enable active microsegmentation enforcement and deliver Executive Business Review.' }
  ];

  container.innerHTML = steps.map(s => {
    let dotClass = 'done';
    let badgeText = 'Completed ✓';
    if (s.state === 'active') { dotClass = 'active'; badgeText = 'In Progress ⚡'; }
    else if (s.state === 'pending') { dotClass = 'pend'; badgeText = 'Upcoming'; }

    return `
      <div class="plan-step-card ${s.state}">
        <div class="step-card-hdr">
          <div class="step-card-title">
            <span class="badge-dot ${dotClass}"></span>
            <span>Step 0${s.num}: ${s.title}</span>
          </div>
          <span class="badge-pill">${badgeText}</span>
        </div>
        <div class="step-card-desc">${s.desc}</div>
      </div>
    `;
  }).join('');
}

function renderUpdatesTimeline(item) {
  const container = document.getElementById('dd-updates-timeline');
  if (!container) return;

  container.innerHTML = `
    <div class="timeline-item">
      <div class="tl-dot"></div>
      <div class="tl-content">
        <div class="tl-hdr">
          <span class="tl-date">${item.last_modified || '2026-10-21'}</span>
          <span class="tl-author">Logged by ${item.owner}</span>
        </div>
        <div class="tl-body">${item.comments || item.risk_reason || 'Active C360 engagement notes updated.'}</div>
      </div>
    </div>
    <div class="timeline-item">
      <div class="tl-dot"></div>
      <div class="tl-content">
        <div class="tl-hdr">
          <span class="tl-date">2026-10-06</span>
          <span class="tl-author">C360 Automated Sync</span>
        </div>
        <div class="tl-body">Quarterly milestone progression verified; pulse status confirmed as ${item.pulse || 'Green'}.</div>
      </div>
    </div>
  `;
}

function renderCasesAndEscalations(item) {
  const container = document.getElementById('dd-cases-container');
  if (!container) return;

  if (item.pulse === 'Red' || item.is_derisk) {
    container.innerHTML = `
      <div style="background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.3); padding:16px; border-radius:6px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <strong style="color:var(--red);">⚠️ Critical Escalation / Priority De-Risk Status</strong>
          <span class="badge-pill chip-danger active">Red Pulse</span>
        </div>
        <div style="font-size:12px; color:var(--fg); line-height:1.5;">${item.risk_reason || item.comments}</div>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div style="padding:16px; background:var(--bg-card); border:1px solid var(--line); border-radius:6px; font-size:12px; color:var(--mut);">
        No active critical technical TAC escalations or CAP cases logged for this account.
      </div>
    `;
  }
}

// ================= RACETRACK COMPONENT LOGIC =================
function renderRacetrack(item) {
  const container = document.getElementById('racetrack-canvas-container');
  if (!container) return;

  const st = (item.status || '').toLowerCase();
  const isOnboarding = st.includes('onboard') || st.includes('implement') || (item.plan_name || '').toLowerCase().includes('onboard');

  const planType = isOnboarding ? 'Customer Onboarding Journey Racetrack' : 'Adoption & Value Realization Racetrack';
  const planSub = isOnboarding 
    ? 'Standardized 90-day onboarding journey pipeline with cluster provisioning and agent deployment milestones.'
    : 'Continuous adoption, policy enforcement, and annual renewal runway journey map.';
  
  const titleEl = document.getElementById('racetrack-plan-title');
  if (titleEl) titleEl.innerText = `${planType} - ${item.clean_acct || item.account_name}`;
  const subEl = document.getElementById('racetrack-plan-subtitle');
  if (subEl) subEl.innerText = planSub;

  const stages = isOnboarding ? [
    { num: 1, name: 'Kickoff & Readiness', sla: 'Day 1-10', title: 'Customer Kickoff & Readiness Scoping', desc: 'SecOps alignment, tenant connectivity validation, and network prerequisite audit.', deliverables: ['Kickoff sync with SecOps lead', 'SaaS cluster tenant provisioned', 'Readiness assessment logged in C360'], tools: 'C360 Action Plan, Webex Space, Cisco Secure Workload SaaS Console' },
    { num: 2, name: 'Architecture Alignment', sla: 'Day 11-25', title: 'Architecture Blueprint & Scoping', desc: 'Define microsegmentation boundaries, bare-metal servers, and cloud VPC inventory.', deliverables: ['Network scope blueprint approved', 'Tenant workspace configuration verified', 'Endpoint packaging prepared'], tools: 'Architecture Blueprint, C360 Milestones' },
    { num: 3, name: 'Agent Deployment', sla: 'Day 26-45', title: 'Endpoint Agent Rollout & Cluster Health', desc: 'Deploy workload agents across production workloads and verify cluster ingestion heartbeat.', deliverables: ['Workload agents deployed to initial wave', 'Bidirectional cluster communication verified', 'Agent health audit passed'], tools: 'CSW Software Installer, Telemetry Ingestion Engine' },
    { num: 4, name: 'Telemetry Ingestion', sla: 'Day 46-60', title: 'Live Flow Telemetry & Baseline Modeling', desc: 'Ingest live bidirectional flow data and establish initial traffic communication matrix.', deliverables: ['Live traffic flow mapping active', 'Application dependency groups identified', 'Bi-weekly customer sync cadence established'], tools: 'Traffic Dependency Graph, Policy Workspace' },
    { num: 5, name: 'Policy Baseline', sla: 'Day 61-75', title: 'Policy Modeling & Compliance Scoping', desc: 'Generate whitelist rules, map shadow traffic, and validate application communication flows.', deliverables: ['Initial security policies generated', 'Traffic exceptions analyzed', 'Policy compliance review documented'], tools: 'Automated Policy Generator, C360 Touch Log' },
    { num: 6, name: 'Onboarding Sign-off', sla: 'Day 76-90', title: 'Onboarding Completion & Handover', desc: 'Formal customer sign-off and smooth transition into steady-state adoption and EBR cadence.', deliverables: ['Executive acceptance sign-off achieved', 'Onboarding milestone marked Complete in C360', 'Adoption action plan transition initiated'], tools: 'C360 Handover Sign-off, Executive Summary' }
  ] : [
    { num: 1, name: 'Dependency Mapping', sla: 'Month 1', title: 'Application Dependency Mapping', desc: 'Continuous flow telemetry analysis and real-time app cluster dependency grouping.', deliverables: ['Multi-cluster workload mapping verified', 'App grouping rules validated with application owners', 'Baseline traffic review complete'], tools: 'C360 Action Plan, Application Grouping Engine' },
    { num: 2, name: 'Policy Workspace', sla: 'Month 2', title: 'Policy Modeling & Rule Validation', desc: 'Develop precise microsegmentation policies in simulation mode before production enforcement.', deliverables: ['Microsegmentation policies modeled in workspace', 'Simulated rule analysis verified', 'Customer approval for policy baseline'], tools: 'Policy Simulator, C360 Milestones' },
    { num: 3, name: 'Enforcement Mode', sla: 'Month 3', title: 'Microsegmentation Policy Enforcement', desc: 'Transition critical security policies into active enforcement mode to block unauthorized lateral movement.', deliverables: ['Enforcement mode enabled on production tier', 'Zero operational traffic disruption verified', 'Lateral threat containment active'], tools: 'CSW Enforcement Engine, SecOps Alerting' },
    { num: 4, name: 'Advanced Security', sla: 'Month 4', title: 'Advanced Threat & Vulnerability Scoring', desc: 'Activate vulnerability mapping, software package CVE tracking, and MITRE ATT&CK alignment.', deliverables: ['CVE vulnerability scoring enabled', 'Compliance reporting scheduled', 'Advanced telemetry audit delivered'], tools: 'Vulnerability Feed, Threat Investigation' },
    { num: 5, name: 'Operational Cadence', sla: 'Month 5', title: 'Operational Governance & Touch Cadence', desc: 'Maintain bi-weekly touch governance, track telemetry uptime, and resolve technical tickets.', deliverables: ['Bi-weekly CSS sync completed', 'Cluster health score above 95%', 'C360 touch frequency compliant (<14d)'], tools: 'C360 Touch Governance, Customer Health Score' },
    { num: 6, name: 'EBR & Renewal', sla: 'Month 6', title: 'Value Realization, EBR & Renewal Runway', desc: 'Deliver Executive Business Review (EBR), demonstrate ROI metrics, and lock in renewal runway.', deliverables: ['Quarterly EBR presentation delivered', 'Value realization metrics signed off', 'Contract renewal runway secured'], tools: 'EBR Executive Deck, Cisco Commerce Runway' }
  ];

  let currentStageNum = 4;
  if (st.includes('onboard') || st.includes('kickoff')) currentStageNum = 1;
  else if (st.includes('implement')) currentStageNum = 2;
  else if (st.includes('track') || st.includes('adopt')) currentStageNum = 4;
  else if (st.includes('optimize') || st.includes('enforce')) currentStageNum = 5;
  else if (st.includes('successful') || st.includes('renew')) currentStageNum = 6;

  selectedRacetrackStage = stages[currentStageNum - 1];

  const isRed = item.pulse === 'Red';
  const stageBadge = document.getElementById('rt-stage-badge');
  if (stageBadge) {
    stageBadge.innerText = `Stage ${currentStageNum} of 6 · ${isRed ? 'Blocked / Red' : 'Active Stage'}`;
    stageBadge.className = `badge-pill ${isRed ? 'chip-danger active' : 'cyan-pill'}`;
  }
  const slaBadge = document.getElementById('rt-sla-badge');
  if (slaBadge) slaBadge.innerText = `Target SLA: ${selectedRacetrackStage.sla}`;

  const railPct = Math.min(100, Math.max(0, ((currentStageNum - 1) / 5) * 100));

  container.innerHTML = `
    <div class="rt-track-wrap">
      <div class="rt-rail-back"></div>
      <div class="rt-rail-fill" style="width: calc(${railPct}% - 40px);"></div>

      <div class="rt-nodes-row">
        ${stages.map(s => {
          const isDone = s.num < currentStageNum;
          const isCurr = s.num === currentStageNum;
          let nodeClass = '';
          let statusText = 'Pending';
          let statusClass = 'pend';

          if (isDone) {
            nodeClass = 'completed';
            statusText = 'Done ✓';
            statusClass = 'done';
          } else if (isCurr) {
            nodeClass = isRed ? 'blocked' : 'active';
            statusText = isRed ? 'Critical' : 'Current ⚡';
            statusClass = isRed ? 'alert' : 'current';
          }

          return `
            <div class="rt-node-col" onclick="selectRacetrackStage(${s.num})" title="Click to view Stage ${s.num} Dossier">
              <div class="rt-node-circle ${nodeClass}">
                ${isDone ? '✓' : `0${s.num}`}
              </div>
              <div class="rt-node-lbl">${s.name}</div>
              <div class="rt-node-status ${statusClass}">${statusText}</div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="rt-cards-row">
        ${stages.map(s => {
          const isSel = s.num === selectedRacetrackStage.num;
          return `
            <div class="rt-stage-card ${isSel ? 'selected' : ''}" id="rt-card-${s.num}" onclick="selectRacetrackStage(${s.num})">
              <div class="rt-sc-hdr">
                <span class="rt-sc-num">STAGE 0${s.num}</span>
                <span class="rt-sc-sla">${s.sla}</span>
              </div>
              <div class="rt-sc-title">${s.title}</div>
              <div class="rt-sc-desc">${s.desc}</div>
              <div class="rt-sc-footer">
                <span>Lead: <strong>${item.owner}</strong></span>
                <span>${s.num < currentStageNum ? 'Complete' : (s.num === currentStageNum ? 'In Progress' : 'Upcoming')}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  renderRacetrackDossier(selectedRacetrackStage, item, currentStageNum);
}

function selectRacetrackStage(stageNum) {
  if (!currentDrilldownItem) return;
  const st = (currentDrilldownItem.status || '').toLowerCase();
  const isOnboarding = st.includes('onboard') || st.includes('implement') || (currentDrilldownItem.plan_name || '').toLowerCase().includes('onboard');

  const stages = isOnboarding ? [
    { num: 1, name: 'Kickoff & Readiness', sla: 'Day 1-10', title: 'Customer Kickoff & Readiness Scoping', desc: 'SecOps alignment, tenant connectivity validation, and network prerequisite audit.', deliverables: ['Kickoff sync with SecOps lead', 'SaaS cluster tenant provisioned', 'Readiness assessment logged in C360'], tools: 'C360 Action Plan, Webex Space, Cisco Secure Workload SaaS Console' },
    { num: 2, name: 'Architecture Alignment', sla: 'Day 11-25', title: 'Architecture Blueprint & Scoping', desc: 'Define microsegmentation boundaries, bare-metal servers, and cloud VPC inventory.', deliverables: ['Network scope blueprint approved', 'Tenant workspace configuration verified', 'Endpoint packaging prepared'], tools: 'Architecture Blueprint, C360 Milestones' },
    { num: 3, name: 'Agent Deployment', sla: 'Day 26-45', title: 'Endpoint Agent Rollout & Cluster Health', desc: 'Deploy workload agents across production workloads and verify cluster ingestion heartbeat.', deliverables: ['Workload agents deployed to initial wave', 'Bidirectional cluster communication verified', 'Agent health audit passed'], tools: 'CSW Software Installer, Telemetry Ingestion Engine' },
    { num: 4, name: 'Telemetry Ingestion', sla: 'Day 46-60', title: 'Live Flow Telemetry & Baseline Modeling', desc: 'Ingest live bidirectional flow data and establish initial traffic communication matrix.', deliverables: ['Live traffic flow mapping active', 'Application dependency groups identified', 'Bi-weekly customer sync cadence established'], tools: 'Traffic Dependency Graph, Policy Workspace' },
    { num: 5, name: 'Policy Baseline', sla: 'Day 61-75', title: 'Policy Modeling & Compliance Scoping', desc: 'Generate whitelist rules, map shadow traffic, and validate application communication flows.', deliverables: ['Initial security policies generated', 'Traffic exceptions analyzed', 'Policy compliance review documented'], tools: 'Automated Policy Generator, C360 Touch Log' },
    { num: 6, name: 'Onboarding Sign-off', sla: 'Day 76-90', title: 'Onboarding Completion & Handover', desc: 'Formal customer sign-off and smooth transition into steady-state adoption and EBR cadence.', deliverables: ['Executive acceptance sign-off achieved', 'Onboarding milestone marked Complete in C360', 'Adoption action plan transition initiated'], tools: 'C360 Handover Sign-off, Executive Summary' }
  ] : [
    { num: 1, name: 'Dependency Mapping', sla: 'Month 1', title: 'Application Dependency Mapping', desc: 'Continuous flow telemetry analysis and real-time app cluster dependency grouping.', deliverables: ['Multi-cluster workload mapping verified', 'App grouping rules validated with application owners', 'Baseline traffic review complete'], tools: 'C360 Action Plan, Application Grouping Engine' },
    { num: 2, name: 'Policy Workspace', sla: 'Month 2', title: 'Policy Modeling & Rule Validation', desc: 'Develop precise microsegmentation policies in simulation mode before production enforcement.', deliverables: ['Microsegmentation policies modeled in workspace', 'Simulated rule analysis verified', 'Customer approval for policy baseline'], tools: 'Policy Simulator, C360 Milestones' },
    { num: 3, name: 'Enforcement Mode', sla: 'Month 3', title: 'Microsegmentation Policy Enforcement', desc: 'Transition critical security policies into active enforcement mode to block unauthorized lateral movement.', deliverables: ['Enforcement mode enabled on production tier', 'Zero operational traffic disruption verified', 'Lateral threat containment active'], tools: 'CSW Enforcement Engine, SecOps Alerting' },
    { num: 4, name: 'Advanced Security', sla: 'Month 4', title: 'Advanced Threat & Vulnerability Scoring', desc: 'Activate vulnerability mapping, software package CVE tracking, and MITRE ATT&CK alignment.', deliverables: ['CVE vulnerability scoring enabled', 'Compliance reporting scheduled', 'Advanced telemetry audit delivered'], tools: 'Vulnerability Feed, Threat Investigation' },
    { num: 5, name: 'Operational Cadence', sla: 'Month 5', title: 'Operational Governance & Touch Cadence', desc: 'Maintain bi-weekly touch governance, track telemetry uptime, and resolve technical tickets.', deliverables: ['Bi-weekly CSS sync completed', 'Cluster health score above 95%', 'C360 touch frequency compliant (<14d)'], tools: 'C360 Touch Governance, Customer Health Score' },
    { num: 6, name: 'EBR & Renewal', sla: 'Month 6', title: 'Value Realization, EBR & Renewal Runway', desc: 'Deliver Executive Business Review (EBR), demonstrate ROI metrics, and lock in renewal runway.', deliverables: ['Quarterly EBR presentation delivered', 'Value realization metrics signed off', 'Contract renewal runway secured'], tools: 'EBR Executive Deck, Cisco Commerce Runway' }
  ];

  selectedRacetrackStage = stages[stageNum - 1];

  document.querySelectorAll('.rt-stage-card').forEach(c => c.classList.remove('selected'));
  const activeCard = document.getElementById(`rt-card-${stageNum}`);
  if (activeCard) activeCard.classList.add('selected');

  let currentStageNum = 4;
  if (st.includes('onboard') || st.includes('kickoff')) currentStageNum = 1;
  else if (st.includes('implement')) currentStageNum = 2;
  else if (st.includes('track') || st.includes('adopt')) currentStageNum = 4;
  else if (st.includes('optimize') || st.includes('enforce')) currentStageNum = 5;
  else if (st.includes('successful') || st.includes('renew')) currentStageNum = 6;

  renderRacetrackDossier(selectedRacetrackStage, currentDrilldownItem, currentStageNum);
}

function renderRacetrackDossier(stage, item, currentStageNum) {
  const container = document.getElementById('racetrack-dossier-container');
  if (!container) return;

  const isCompleted = stage.num < currentStageNum;
  const isCurrent = stage.num === currentStageNum;

  container.innerHTML = `
    <div class="dossier-hdr">
      <div class="dossier-title">
        <span class="badge-pill cyan-pill">STAGE 0${stage.num}</span>
        <span>${stage.title}</span>
      </div>
      <div>
        <span class="status-pill ${isCompleted ? 'status-completed' : (isCurrent ? 'status-on-track' : 'status-delayed')}">
          ${isCompleted ? 'Stage Complete ✓' : (isCurrent ? 'Active Execution ⚡' : 'Upcoming Milestone')}
        </span>
      </div>
    </div>

    <div class="dossier-grid">
      <div class="dossier-col">
        <h4>Key Stage Deliverables &amp; Verification Checkpoints</h4>
        <div class="dossier-checkpoints">
          ${stage.deliverables.map(d => `
            <div class="dossier-cp-item">
              <span style="font-weight:800; color:${isCompleted ? 'var(--green)' : (isCurrent ? 'var(--cyan)' : 'var(--sub)')};">${isCompleted ? '✓' : (isCurrent ? '▸' : '○')}</span>
              <span>${d}</span>
            </div>
          `).join('')}
        </div>

        <div style="margin-top:14px; background:var(--bg-card); border:1px solid var(--line); padding:12px; border-radius:6px;">
          <div style="font-size:11px; font-weight:700; color:var(--mut); text-transform:uppercase; margin-bottom:4px;">Technical Tools &amp; Systems</div>
          <div style="font-size:12px; color:var(--fg);">${stage.tools}</div>
        </div>
      </div>

      <div class="dossier-col">
        <h4>Operational Notes &amp; Stakeholders</h4>
        <div style="background:var(--bg-card); border:1px solid var(--line); padding:12px; border-radius:6px; font-size:12px; color:var(--fg); line-height:1.5; margin-bottom:10px;">
          ${item.comments || item.risk_reason || item.pulse_comments || 'Active engagement managed in Salesforce C360.'}
        </div>

        <div style="background:var(--bg-card); border:1px solid var(--line); padding:10px 12px; border-radius:6px; font-size:11px; color:var(--mut); display:flex; flex-direction:column; gap:4px;">
          <div>Assigned CSS Lead: <strong style="color:var(--fg);">${item.owner}</strong></div>
          <div>Technical Leader: <strong style="color:var(--fg);">Bob Baughman</strong></div>
          <div>Target Completion: <strong style="color:var(--cyan);">${stage.sla}</strong></div>
        </div>
      </div>
    </div>
  `;
}

// ================= TEAM CAPACITY TABLE LOGIC =================
function filterTeamTable() { renderTeamTable(); }
function sortTeam(colKey) {
  if (teamSort.col === colKey) {
    teamSort.dir = teamSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    teamSort.col = colKey;
    teamSort.dir = 'desc';
  }
  renderTeamTable();
}

function renderTeamTable() {
  const tbody = document.getElementById('team-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  let list = [...(data.people || [])];
  const query = (document.getElementById('team-search')?.value || '').toLowerCase().trim();
  if (query) list = list.filter(p => p.name.toLowerCase().includes(query) || p.leader.toLowerCase().includes(query));

  list.sort((a, b) => {
    let vA = a[teamSort.col];
    let vB = b[teamSort.col];
    if (typeof vA === 'string' && vA.startsWith('$')) vA = parseFloat(vA.replace('$', '').replace('M', '000000').replace('K', '000')) || 0;
    if (typeof vB === 'string' && vB.startsWith('$')) vB = parseFloat(vB.replace('$', '').replace('M', '000000').replace('K', '000')) || 0;
    if (vA < vB) return teamSort.dir === 'asc' ? -1 : 1;
    if (vA > vB) return teamSort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  list.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:700;">${p.name}</td>
      <td>${p.leader}</td>
      <td style="text-align:center; font-weight:800;">${p.total_accounts}</td>
      <td style="font-weight:700; color:var(--green);">${p.total_arr}</td>
      <td style="text-align:center; color:var(--cyan);">${p.cps_count}</td>
      <td style="text-align:center; color:var(--purple);">${p.workload_count}</td>
      <td style="text-align:center; color:var(--green);">${p.completed_successful_count}</td>
      <td style="text-align:center; color:var(--amber);">${p.derisk_count}</td>
      <td style="text-align:center; color:var(--red); font-weight:700;">${p.red_pulse_count}</td>
      <td style="text-align:center; font-weight:800; color:var(--cyan);">${p.capacity_score}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ================= RENEWALS TABLE LOGIC =================
function setRenewalQuarter(qtr) {
  activeRenewalQtr = qtr;
  renderQuarterChips('ren-quarter-chips', activeRenewalQtr, setRenewalQuarter);
  renderRenewalsTable();
}

function filterRenewalsTable() { renderRenewalsTable(); }

function renderRenewalsTable() {
  const tbody = document.getElementById('ren-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  let list = [...(data.renewals || [])];
  const query = (document.getElementById('ren-search')?.value || '').toLowerCase().trim();
  const owner = document.getElementById('ren-owner-select')?.value || 'all';
  const qtr = activeRenewalQtr;

  if (query) list = list.filter(r => (r.clean_acct || '').toLowerCase().includes(query) || (r.owner || '').toLowerCase().includes(query));
  if (owner !== 'all') list = list.filter(r => r.owner === owner);
  if (qtr !== 'all') {
    if (qtr === 'FY31+') list = list.filter(r => (r.renewal_quarter || '').includes('FY31') || (r.renewal_quarter || '').includes('FY32'));
    else list = list.filter(r => r.renewal_quarter === qtr);
  }

  const qtrARR = list.reduce((a, b) => a + (b.arr_num || 0), 0);
  const renKpiAccts = document.getElementById('ren-kpi-accts');
  if (renKpiAccts) renKpiAccts.innerText = list.length;
  const renKpiArr = document.getElementById('ren-kpi-arr');
  if (renKpiArr) renKpiArr.innerText = `$${(qtrARR / 1000000).toFixed(2)}M`;
  const renKpiQtr = document.getElementById('ren-kpi-qtr-lbl');
  if (renKpiQtr) renKpiQtr.innerText = qtr === 'all' ? 'All Fiscal Quarters' : qtr;

  const currQtrList = (data.renewals || []).filter(r => r.renewal_quarter === 'FY27 Q1');
  const renCurr = document.getElementById('ren-kpi-curr-qtr');
  if (renCurr) renCurr.innerText = `${currQtrList.length} ($${Math.round(currQtrList.reduce((a,b)=>a+(b.arr_num||0),0)/1000)}k)`;

  renderCSSStrip('ren-css-strip', list, owner, (chosen) => {
    const sel = document.getElementById('ren-owner-select');
    if (sel) sel.value = chosen;
    renderRenewalsTable();
  });

  list.forEach(item => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.onclick = () => openDrilldown(item.id || item.clean_acct);

    const hasSfdcAcct = item.sfdc_account_id && item.sfdc_account_id.startsWith('001');
    const hasSfdcPlan = item.sfdc_plan_id && (item.sfdc_plan_id.startsWith('aGte') || item.sfdc_plan_id.startsWith('aGt8'));

    tr.innerHTML = `
      <td style="font-weight:700;">
        ${item.clean_acct || item.account}
        ${hasSfdcAcct ? `<a href="https://ciscosales.lightning.force.com/lightning/r/Account/${item.sfdc_account_id}/view" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" class="ext-icon-link" title="Open Salesforce Account">↗</a>` : ''}
      </td>
      <td><strong>${item.owner}</strong></td>
      <td style="font-weight:800; color:var(--cyan);">${item.renewal_quarter || 'FY27 Q1'}</td>
      <td style="font-weight:700; color:var(--green);">${item.arr || '$0'}</td>
      <td><span class="status-pill ${item.pulse === 'Red' ? 'status-delayed' : (item.pulse === 'Green' ? 'status-completed' : 'status-implement')}">${item.pulse}</span></td>
      <td>${item.status}</td>
      <td>${item.is_derisk ? '<span class="tag-mini tag-dr">Priority De-Risk</span>' : '<span style="color:var(--mut); font-size:11px;">Standard</span>'}</td>
      <td>
        <div style="display:flex; gap:6px; align-items:center;">
          ${hasSfdcPlan ? `<a href="https://ciscosales.lightning.force.com/lightning/r/${item.sfdc_plan_id}/view" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" class="btn ghost tiny-btn" title="Open Action Plan in Salesforce C360">🔗 C360 ↗</a>` : ''}
          <button class="open-btn" onclick="event.stopPropagation(); openDrilldown('${item.id || item.clean_acct}')">View ▸</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ================= DE-RISK TABLE LOGIC =================
function setDeRiskQuarter(qtr) {
  activeDeRiskQtr = qtr;
  renderQuarterChips('dr-quarter-chips', activeDeRiskQtr, setDeRiskQuarter);
  renderDeRiskTable();
}

function filterDeRiskTable() { renderDeRiskTable(); }

function renderDeRiskTable() {
  const tbody = document.getElementById('dr-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  let list = [...(data.derisk || [])];
  const query = (document.getElementById('dr-search')?.value || '').toLowerCase().trim();
  const owner = document.getElementById('dr-owner-select')?.value || 'all';
  const qtr = activeDeRiskQtr;

  if (query) list = list.filter(d => (d.clean_acct || '').toLowerCase().includes(query) || (d.owner || '').toLowerCase().includes(query) || (d.risk_reason || '').toLowerCase().includes(query));
  if (owner !== 'all') list = list.filter(d => d.owner === owner);
  if (qtr !== 'all') {
    if (qtr === 'FY31+') list = list.filter(d => (d.renewal_quarter || '').includes('FY31') || (d.renewal_quarter || '').includes('FY32'));
    else list = list.filter(d => d.renewal_quarter === qtr);
  }

  const drARR = list.reduce((a, b) => a + (b.arr_num || 0), 0);
  const drAccts = document.getElementById('dr-kpi-accts');
  if (drAccts) drAccts.innerText = list.length;
  const drArrEl = document.getElementById('dr-kpi-arr');
  if (drArrEl) drArrEl.innerText = `$${(drARR / 1000000).toFixed(2)}M`;
  const drQtrEl = document.getElementById('dr-kpi-qtr-lbl');
  if (drQtrEl) drQtrEl.innerText = qtr === 'all' ? 'All Fiscal Quarters' : qtr;

  renderCSSStrip('dr-css-strip', list, owner, (chosen) => {
    const sel = document.getElementById('dr-owner-select');
    if (sel) sel.value = chosen;
    renderDeRiskTable();
  });

  list.forEach(item => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.onclick = () => openDrilldown(item.id || item.clean_acct);

    const hasSfdcAcct = item.sfdc_account_id && item.sfdc_account_id.startsWith('001');
    const hasSfdcPlan = item.sfdc_plan_id && (item.sfdc_plan_id.startsWith('aGte') || item.sfdc_plan_id.startsWith('aGt8'));

    tr.innerHTML = `
      <td style="font-weight:700;">
        ${item.clean_acct || item.account}
        ${hasSfdcAcct ? `<a href="https://ciscosales.lightning.force.com/lightning/r/Account/${item.sfdc_account_id}/view" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" class="ext-icon-link" title="Open Salesforce Account">↗</a>` : ''}
      </td>
      <td><strong>${item.owner}</strong></td>
      <td><span class="status-pill status-delayed">${item.pulse}</span></td>
      <td style="font-weight:800; color:var(--red);">${item.arr || '$0'}</td>
      <td style="font-weight:700; color:var(--cyan);">${item.renewal_quarter || 'FY27 Q1'}</td>
      <td style="font-size:12px; color:var(--mut); line-height:1.4;">${item.risk_reason || item.comments}</td>
      <td>
        <div style="display:flex; gap:6px; align-items:center;">
          ${hasSfdcPlan ? `<a href="https://ciscosales.lightning.force.com/lightning/r/${item.sfdc_plan_id}/view" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" class="btn ghost tiny-btn" title="Open Action Plan in Salesforce C360">🔗 C360 ↗</a>` : ''}
          <button class="open-btn" onclick="event.stopPropagation(); openDrilldown('${item.id || item.clean_acct}')">View ▸</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ================= NOTES & GOVERNANCE TABLE LOGIC =================
function filterGovTable() { renderGovTable(); }

function renderGovTable() {
  const tbody = document.getElementById('gov-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  let list = [...(data.notes_governance || [])];
  const query = (document.getElementById('gov-search')?.value || '').toLowerCase().trim();
  const owner = document.getElementById('gov-owner-select')?.value || 'all';

  if (query) list = list.filter(n => (n.clean_acct || '').toLowerCase().includes(query) || (n.comments || '').toLowerCase().includes(query) || (n.id || '').toLowerCase().includes(query));
  if (owner !== 'all') list = list.filter(n => n.owner === owner);

  renderCSSStrip('gov-css-strip', list, owner, (chosen) => {
    const sel = document.getElementById('gov-owner-select');
    if (sel) sel.value = chosen;
    renderGovTable();
  });

  list.forEach(item => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.onclick = () => openDrilldown(item.id || item.clean_acct);

    const hasSfdcAcct = item.sfdc_account_id && item.sfdc_account_id.startsWith('001');
    const hasSfdcPlan = item.id && (item.id.startsWith('aGte') || item.id.startsWith('aGt8'));

    tr.innerHTML = `
      <td style="font-weight:700;">
        ${item.clean_acct}
        ${hasSfdcAcct ? `<a href="https://ciscosales.lightning.force.com/lightning/r/Account/${item.sfdc_account_id}/view" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" class="ext-icon-link" title="Open Salesforce Account">↗</a>` : ''}
      </td>
      <td>
        ${hasSfdcPlan ? `<a href="https://ciscosales.lightning.force.com/lightning/r/${item.id}/view" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" class="font-mono sfdc-plan-btn" title="Open in Salesforce C360">${item.id} ↗</a>` : `<span class="font-mono text-muted">${item.id}</span>`}
      </td>
      <td><strong>${item.owner}</strong></td>
      <td><span class="status-pill status-on-track">${item.status}</span></td>
      <td>${item.pulse}</td>
      <td style="text-align:center; font-weight:700; color:var(--green);">${item.days_since_touch}d ago</td>
      <td style="text-align:center;">${item.days_open}d</td>
      <td style="font-size:11.5px; color:var(--mut); line-height:1.4;">${item.comments}</td>
      <td><button class="open-btn" onclick="event.stopPropagation(); openDrilldown('${item.id || item.clean_acct}')">View ▸</button></td>
    `;
    tbody.appendChild(tr);
  });
}

// ================= DATA QUALITY LOGIC =================
function filterQualityTable() { renderQualityTable(); }

function renderQualityTable() {
  const tbody = document.getElementById('qual-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  let list = [...(data.issues || [])];
  const query = (document.getElementById('qual-search')?.value || '').toLowerCase().trim();
  const owner = document.getElementById('qual-owner-select')?.value || 'all';

  if (query) list = list.filter(i => (i.account || '').toLowerCase().includes(query) || (i.action || '').toLowerCase().includes(query));
  if (owner !== 'all') list = list.filter(i => i.owner === owner);

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:24px; color:var(--green); font-weight:700;">✅ Optimal Data Quality - Zero active hygiene gaps across portfolio!</td></tr>';
    return;
  }

  list.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="badge-pill ${item.severity === 'HIGH' ? 'chip-danger active' : 'chip-warn active'}">${item.severity}</span></td>
      <td style="font-weight:700;">${item.type}</td>
      <td>${item.account}</td>
      <td><strong>${item.owner}</strong></td>
      <td style="color:var(--cyan);">${item.action}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ================= CSV EXPORT =================
function exportPortfolioCSV() {
  const all = getAllWorkingAccounts();
  const headers = ['Account Name', 'Plan ID', 'CSS Owner', 'Status', 'Customer Pulse', 'ARR', 'Renewal Quarter', 'Last Modified Date', 'Plan Name'];
  const rows = all.map(a => [
    `"${(a.clean_acct || a.account_name || '').replace(/"/g, '""')}"`,
    `"${(a.id || '').replace(/"/g, '""')}"`,
    `"${(a.owner || '').replace(/"/g, '""')}"`,
    `"${(a.status || '').replace(/"/g, '""')}"`,
    `"${(a.pulse || '').replace(/"/g, '""')}"`,
    `"${(a.arr || '$0').replace(/"/g, '""')}"`,
    `"${(a.renewal_quarter || '').replace(/"/g, '""')}"`,
    `"${(a.last_modified || '').replace(/"/g, '""')}"`,
    `"${(a.plan_name || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `workload_warriors_portfolio_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
