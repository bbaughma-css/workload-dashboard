/**
 * Workload Warriors Customer Success Tracker
 * Unified Vanilla JS Application Engine
 * Author: Bob Baughman (CSS)
 */

let data = null;
let currentView = 'portfolio';
let activeQuickFilter = 'all';
let expandedNotes = new Set();

// Sorting state machines
let portfolioSort = { col: 'arr_num', dir: 'desc' };
let agingSort = { col: 'days_open', dir: 'desc' };
let teamSort = { col: 'capacity_score', dir: 'desc' };
let renewalsSort = { col: 'arr_num', dir: 'desc' };
let deriskSort = { col: 'arr_num', dir: 'desc' };
let govSort = { col: 'days_open', dir: 'desc' };
let archivedSort = { col: 'clean_acct', dir: 'asc' };
let qualSort = { col: 'severity', dir: 'asc' };

// Utility: Normalize working account pool
function getAllWorkingAccounts() {
  if (!data) return [];
  const cps = data.cps || [];
  const workload = data.workload || [];
  const combined = [];
  const seen = new Set();

  [...cps, ...workload].forEach(a => {
    const rawName = (a.clean_acct || a.account_name || '').trim();
    const type = a.plan_type || 'Onboarding';
    const key = `${rawName}::${type}`;
    if (!seen.has(key)) {
      seen.add(key);
      combined.push(a);
    }
  });
  return combined;
}

function findAccountInAllCollections(identifier) {
  if (!data || !identifier) return null;
  const target = identifier.toLowerCase().trim();
  const allPools = [
    ...(data.cps || []),
    ...(data.workload || []),
    ...(data.derisk || []),
    ...(data.aging_onboarding || []),
    ...(data.renewals || []),
    ...(data.notes_governance || []),
    ...(data.archived_unsuccessful || [])
  ];

  return allPools.find(a =>
    (a.clean_acct && a.clean_acct.toLowerCase() === target) ||
    (a.account_name && a.account_name.toLowerCase() === target) ||
    (a.id && a.id.toLowerCase() === target)
  ) || null;
}

function getSfdcLinks(account) {
  if (!account) return { acctUrl: '', planUrl: '' };
  let acctUrl = account.sfdc_account_url || '';
  let planUrl = account.sfdc_plan_url || '';

  if (!acctUrl && account.account_id && account.account_id.startsWith('001')) {
    acctUrl = `https://ciscosales.lightning.force.com/lightning/r/Account/${account.account_id}/view`;
  }
  if (!planUrl && account.id) {
    if (account.id.startsWith('aIC')) {
      planUrl = `https://ciscosales.lightning.force.com/lightning/r/C360_Mitigation_Action_Plan__c/${account.id}/view`;
    } else if (account.id.startsWith('aGt')) {
      planUrl = `https://ciscosales.lightning.force.com/lightning/r/C360_CS_Task__c/${account.id}/view`;
    }
  }
  return { acctUrl, planUrl };
}

function formatNotesHtml(rawNotes, maxLen = 140, acctKey = '') {
  if (!rawNotes) return '<span class="text-muted">No notes recorded</span>';
  
  const isExpanded = acctKey && expandedNotes.has(acctKey);
  let clean = rawNotes.trim();
  
  const sections = clean.split(/\n\n+/);
  let formattedSections = sections.map(sec => {
    let lines = sec.split('\n').map(l => l.trim()).filter(Boolean);
    let htmlLines = lines.map(line => {
      if (line.startsWith('[') && line.includes(']:')) {
        return `<div style="font-weight:700; color:var(--cyan); margin-top:4px; margin-bottom:2px;">${escapeHtml(line)}</div>`;
      }
      if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('• ')) {
        return `<div style="padding-left:12px; position:relative; margin-bottom:3px;"><span style="position:absolute; left:0; color:var(--cyan);">•</span>${escapeHtml(line.substring(2))}</div>`;
      }
      return `<div style="margin-bottom:3px;">${escapeHtml(line)}</div>`;
    });
    return `<div style="margin-bottom:8px;">${htmlLines.join('')}</div>`;
  }).join('');

  if (!isExpanded && clean.length > maxLen) {
    let truncated = clean.substring(0, maxLen);
    let lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 80) truncated = truncated.substring(0, lastSpace);
    
    return `
      <div class="note-summary" style="line-height:1.45;">
        ${escapeHtml(truncated)}...
        ${acctKey ? `<button class="note-toggle-btn" onclick="toggleNoteText('${acctKey}', event)" style="background:none; border:none; color:var(--cyan); cursor:pointer; font-size:11px; font-weight:600; padding:0 4px; text-decoration:underline;">Show More ▸</button>` : ''}
      </div>
    `;
  }

  return `
    <div class="note-full" style="line-height:1.45; font-size:12px;">
      ${formattedSections}
      ${acctKey && clean.length > maxLen ? `<div style="margin-top:4px;"><button class="note-toggle-btn" onclick="toggleNoteText('${acctKey}', event)" style="background:none; border:none; color:var(--cyan); cursor:pointer; font-size:11px; font-weight:600; padding:0; text-decoration:underline;">Show Less ◂</button></div>` : ''}
    </div>
  `;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function toggleNoteText(key, event) {
  if (event) event.stopPropagation();
  if (expandedNotes.has(key)) {
    expandedNotes.delete(key);
  } else {
    expandedNotes.add(key);
  }
  
  if (currentView === 'portfolio') renderPortfolioRows();
  else if (currentView === 'aging') renderAgingOnboardingTable();
  else if (currentView === 'governance') renderGovTable();
  else if (currentView === 'archived') renderArchivedTable();
}

// ================= VIEW 1: PORTFOLIO =================

function handlePortfolioSearch() {
  renderPortfolioRows();
}

function handlePortfolioFilterChange() {
  renderPortfolioRows();
}

function resetPortfolioFilters() {
  const s = document.getElementById('pf-search-input'); if (s) s.value = '';
  const t = document.getElementById('pf-type-select'); if (t) t.value = 'all';
  const o = document.getElementById('pf-owner-select'); if (o) o.value = 'all';
  const st = document.getElementById('pf-status-select'); if (st) st.value = 'all';
  const p = document.getElementById('pf-pulse-select'); if (p) p.value = 'all';
  const q = document.getElementById('pf-qtr-select'); if (q) q.value = 'all';
  activeQuickFilter = 'all';
  renderPortfolioRows();
}

function setQuickFilter(fKey) {
  activeQuickFilter = (activeQuickFilter === fKey) ? 'all' : fKey;
  renderPortfolioRows();
}

function sortPortfolio(colKey) {
  if (portfolioSort.col === colKey) {
    portfolioSort.dir = portfolioSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    portfolioSort.col = colKey;
    portfolioSort.dir = (colKey === 'arr_num' || colKey === 'last_modified') ? 'desc' : 'asc';
  }
  document.querySelectorAll('.portfolio-grid-wrap .gh-cell.sortable .sort-arr').forEach(el => el.innerText = '↕');
  const activeArr = document.getElementById(`sort-arr-${colKey}`);
  if (activeArr) activeArr.innerText = portfolioSort.dir === 'asc' ? '↑' : '↓';
  renderPortfolioRows();
}

function renderPortfolioRows() {
  const container = document.getElementById('portfolio-rows-container');
  if (!container) return;
  container.innerHTML = '';

  let list = getAllWorkingAccounts();

  const typeFilter = document.getElementById('pf-type-select')?.value || 'all';
  if (typeFilter !== 'all') {
    list = list.filter(a => a.plan_type === typeFilter);
  }

  const query = (document.getElementById('pf-search-input')?.value || '').toLowerCase().trim();
  const owner = document.getElementById('pf-owner-select')?.value || 'all';
  const status = document.getElementById('pf-status-select')?.value || 'all';
  const pulse = document.getElementById('pf-pulse-select')?.value || 'all';
  const qtr = document.getElementById('pf-qtr-select')?.value || 'all';

  if (query) {
    list = list.filter(a =>
      (a.clean_acct || '').toLowerCase().includes(query) ||
      (a.account_name || '').toLowerCase().includes(query) ||
      (a.id || '').toLowerCase().includes(query) ||
      (a.owner || '').toLowerCase().includes(query) ||
      (a.comments || '').toLowerCase().includes(query)
    );
  }

  if (owner !== 'all') list = list.filter(a => a.owner === owner);
  if (status !== 'all') list = list.filter(a => (a.status || '') === status);
  if (pulse !== 'all') list = list.filter(a => (a.pulse || '') === pulse);
  if (qtr !== 'all') list = list.filter(a => (a.renewal_quarter || '') === qtr);

  if (activeQuickFilter === 'derisk') {
    list = list.filter(a => a.is_derisk || (data.derisk || []).some(d => d.clean_acct === a.clean_acct));
  } else if (activeQuickFilter === 'red') {
    list = list.filter(a => a.pulse === 'Red');
  }

  list.sort((a, b) => {
    let vA = a[portfolioSort.col];
    let vB = b[portfolioSort.col];
    if (portfolioSort.col === 'arr_num') {
      vA = Number(vA) || 0;
      vB = Number(vB) || 0;
    } else {
      vA = (vA || '').toString().toLowerCase();
      vB = (vB || '').toString().toLowerCase();
    }
    if (vA < vB) return portfolioSort.dir === 'asc' ? -1 : 1;
    if (vA > vB) return portfolioSort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  const countBadge = document.getElementById('pf-visible-count');
  if (countBadge) countBadge.innerText = list.length;

  if (list.length === 0) {
    container.innerHTML = '<div style="padding:32px; text-align:center; color:var(--text-muted); font-size:13px;">No accounts match the selected filters.</div>';
    return;
  }

  list.forEach(item => {
    const row = document.createElement('div');
    row.className = 'grid-table-row';
    const targetDrillId = item.id || item.clean_acct;
    row.onclick = () => openDrilldown(targetDrillId);

    const isCPS = item.source_dataset === 'CPS' || (item.plan_name || '').includes('Protection') || (item.product_milestone || '').includes('Protection');
    const isDeRisk = item.is_derisk || (data.derisk || []).some(d => d.clean_acct === item.clean_acct);
    const pulseVal = item.pulse || 'None';
    const statusVal = item.status || 'Active';
    const planType = item.plan_type || 'Onboarding';

    let pDot = 'dot-none';
    if (pulseVal === 'Green') pDot = 'dot-green';
    else if (pulseVal === 'Yellow') pDot = 'dot-yellow';
    else if (pulseVal === 'Red') pDot = 'dot-red';

    let prio = 'P3';
    let prioClass = 'prio-p3';
    if (isDeRisk || pulseVal === 'Red') { prio = 'P1'; prioClass = 'prio-p1'; }
    else if (isCPS || pulseVal === 'Yellow') { prio = 'P2'; prioClass = 'prio-p2'; }

    let stClass = 'status-on-track';
    const stLower = statusVal.toLowerCase();
    if (stLower.includes('successful')) stClass = 'status-completed';
    else if (stLower.includes('delay') || stLower.includes('hold') || stLower.includes('unsuccessful')) stClass = 'status-delayed';
    else if (stLower.includes('implement') || stLower.includes('onboard')) stClass = 'status-implement';

    let filledSegs = 3;
    if (stLower.includes('successful')) filledSegs = 5;
    else if (stLower.includes('implement')) filledSegs = 2;
    else if (stLower.includes('onboard')) filledSegs = 1;
    else if (stLower.includes('adopt') || stLower.includes('active')) filledSegs = 4;

    const sfdc = getSfdcLinks(item);

    let formattedArr = '$0';
    if (item.arr_formatted) {
      formattedArr = item.arr_formatted;
    } else if (typeof item.arr === 'string' && item.arr.includes('$')) {
      formattedArr = item.arr;
    } else if (item.arr_num) {
      formattedArr = '$' + Number(item.arr_num).toLocaleString();
    }

    row.innerHTML = `
      <div class="gc-icon"><span class="badge-dot ${isCPS ? 'tag-cps' : 'tag-csw'}"></span></div>
      <div class="gc-acct">
        <div class="acct-nm">
          <a href="#/a/${targetDrillId}" onclick="event.stopPropagation(); openDrilldown('${targetDrillId}'); return false;" class="row-acct-link" title="Open Interactive Action Plan Drilldown">${escapeHtml(item.clean_acct || item.account_name)}</a>
          ${sfdc.acctUrl ? `<a href="${sfdc.acctUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" class="ext-icon-link" title="Open Salesforce Account">↗</a>` : ''}
        </div>
        <div class="acct-sub">
          <span class="tag-mini ${isCPS ? 'tag-cps' : 'tag-csw'}">${isCPS ? 'CPS' : 'CSW'}</span>
          ${isDeRisk ? '<span class="tag-mini tag-dr">Priority De-Risk</span>' : ''}
          ${sfdc.planUrl ? `<a href="${sfdc.planUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" class="plan-id-link" title="Open in Salesforce C360">${escapeHtml(item.id || 'C360')} ↗</a>` : `<span style="opacity:0.7;">${escapeHtml(item.id || '')}</span>`}
        </div>
      </div>
      <div class="gc-type">
        <span class="badge-type ${planType === 'Onboarding' ? 'type-onboard' : 'type-adopt'}">${planType}</span>
      </div>
      <div class="gc-prio"><span class="${prioClass}">${prio}</span></div>
      <div class="gc-owner"><strong>${escapeHtml(item.owner || '')}</strong></div>
      <div class="gc-stage"><span class="status-pill ${stClass}">${escapeHtml(statusVal)}</span></div>
      <div class="gc-pulse pulse-cell"><span class="dot-pulse ${pDot}"></span> ${escapeHtml(pulseVal)}</div>
      <div class="gc-arr arr-cell">${escapeHtml(formattedArr)}</div>
      <div class="gc-qtr qtr-cell">${escapeHtml(item.renewal_quarter || 'FY27 Q1')}</div>
      <div class="gc-progress">
        <div class="mini-stepper">
          <div class="ms-seg ${filledSegs >= 1 ? 'filled' : ''}"></div>
          <div class="ms-seg ${filledSegs >= 2 ? 'filled' : ''}"></div>
          <div class="ms-seg ${filledSegs >= 3 ? 'filled' : ''}"></div>
          <div class="ms-seg ${filledSegs >= 4 ? 'filled' : ''}"></div>
          <div class="ms-seg ${filledSegs >= 5 ? 'filled' : ''}"></div>
        </div>
      </div>
      <div class="gc-touch touch-cell">${escapeHtml(item.last_modified || 'Recently')}</div>
      <div class="gc-action">
        ${sfdc.planUrl ? `<a href="${sfdc.planUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" class="btn ghost tiny-btn" title="Open Action Plan in Salesforce C360" style="font-size:11px; padding:3px 7px;">🔗 C360 ↗</a>` : ''}
        <button class="open-btn" onclick="event.stopPropagation(); openDrilldown('${targetDrillId}')">View ▸</button>
      </div>
    `;
    container.appendChild(row);
  });
}

// ================= VIEW 3: AGING ONBOARDING > 120D =================

function filterAgingTable() {
  renderAgingOnboardingTable();
}

function resetAgingFilters() {
  const s = document.getElementById('aging-search'); if (s) s.value = '';
  const o = document.getElementById('aging-owner-select'); if (o) o.value = 'all';
  const st = document.getElementById('aging-status-select'); if (st) st.value = 'all';
  const p = document.getElementById('aging-pulse-select'); if (p) p.value = 'all';
  const d = document.getElementById('aging-days-select'); if (d) d.value = 'all';
  renderAgingOnboardingTable();
}

function sortAging(colKey) {
  if (agingSort.col === colKey) {
    agingSort.dir = agingSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    agingSort.col = colKey;
    agingSort.dir = (colKey === 'days_open' || colKey === 'arr_num') ? 'desc' : 'asc';
  }
  document.querySelectorAll('#view-aging th.sortable-hdr .sort-badge').forEach(el => el.innerText = '↕');
  const activeBadge = document.getElementById(`aging-sort-${colKey}`);
  if (activeBadge) activeBadge.innerText = agingSort.dir === 'asc' ? '↑' : '↓';
  renderAgingOnboardingTable();
}

function renderAgingOnboardingTable() {
  const tbody = document.getElementById('aging-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  let list = [...(data.aging_onboarding || [])];
  const query = (document.getElementById('aging-search')?.value || '').toLowerCase().trim();
  const owner = document.getElementById('aging-owner-select')?.value || 'all';
  const status = document.getElementById('aging-status-select')?.value || 'all';
  const pulse = document.getElementById('aging-pulse-select')?.value || 'all';
  const daysFilter = document.getElementById('aging-days-select')?.value || 'all';

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

  if (daysFilter === '120-180') {
    list = list.filter(a => (a.days_open || 0) >= 120 && (a.days_open || 0) <= 180);
  } else if (daysFilter === '180-270') {
    list = list.filter(a => (a.days_open || 0) > 180 && (a.days_open || 0) <= 270);
  } else if (daysFilter === '270+') {
    list = list.filter(a => (a.days_open || 0) > 270);
  }

  list.sort((a, b) => {
    let vA = a[agingSort.col];
    let vB = b[agingSort.col];
    if (typeof vA === 'number') {
      return agingSort.dir === 'asc' ? (vA || 0) - (vB || 0) : (vB || 0) - (vA || 0);
    }
    vA = (vA || '').toString().toLowerCase();
    vB = (vB || '').toString().toLowerCase();
    if (vA < vB) return agingSort.dir === 'asc' ? -1 : 1;
    if (vA > vB) return agingSort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  const countBadge = document.getElementById('aging-visible-count');
  if (countBadge) countBadge.innerText = list.length;

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:32px; color:var(--text-muted);">No aging onboarding accounts match criteria.</td></tr>';
    return;
  }

  list.forEach(a => {
    const tr = document.createElement('tr');
    const links = getSfdcLinks(a);
    const pulseClass = (a.pulse === 'Green') ? 'pulse-green' : (a.pulse === 'Yellow') ? 'pulse-yellow' : (a.pulse === 'Red') ? 'pulse-red' : 'pulse-none';
    const notesKey = `aging_${a.id || a.clean_acct}`;

    tr.innerHTML = `
      <td style="font-weight:600; color:var(--cyan); cursor:pointer;" onclick="openDrilldown('${escapeHtml(a.clean_acct)}')">${escapeHtml(a.clean_acct || a.account_name)}</td>
      <td style="font-size:11.5px; font-family:var(--font-mono); color:var(--text-muted);">${escapeHtml(a.id || '')}</td>
      <td>${escapeHtml(a.owner || '')}</td>
      <td style="font-size:11.5px;">${escapeHtml(a.plan_name || '')}</td>
      <td><span class="stage-tag">${escapeHtml(a.status || 'Onboard')}</span></td>
      <td><span class="pulse-tag ${pulseClass}">${escapeHtml(a.pulse || 'None')}</span></td>
      <td style="font-weight:700; color:${(a.days_open || 0) > 180 ? 'var(--red)' : 'var(--amber)'};">${a.days_open || 120}d</td>
      <td style="font-weight:600;">${escapeHtml(a.arr_formatted || a.arr || '$0')}</td>
      <td style="font-size:11.5px; color:var(--text-muted);">${escapeHtml(a.last_modified || '')}</td>
      <td style="max-width:380px; font-size:12px;">${formatNotesHtml(a.comments || a.notes || '', 130, notesKey)}</td>
      <td>
        <div style="display:flex; gap:6px;">
          ${links.planUrl ? `<a class="btn ghost small-btn" href="${links.planUrl}" target="_blank" rel="noopener noreferrer" style="font-size:11px; padding:3px 7px;">🔗 Plan</a>` : ''}
          <button class="btn ghost small-btn" onclick="openDrilldown('${escapeHtml(a.clean_acct)}')" style="font-size:11px; padding:3px 7px;">View ▸</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function exportAgingCSV() {
  if (!data) return;
  const list = data.aging_onboarding || [];
  const headers = ['Account Name', 'Plan ID', 'CSS Owner', 'Plan Scope', 'Status', 'Customer Pulse', 'Days Open', 'ARR', 'Last Touch', 'C360 Notes'];
  const rows = list.map(a => [
    `"${(a.clean_acct || a.account_name || '').replace(/"/g, '""')}"`,
    `"${(a.id || '').replace(/"/g, '""')}"`,
    `"${(a.owner || '').replace(/"/g, '""')}"`,
    `"${(a.plan_name || '').replace(/"/g, '""')}"`,
    `"${(a.status || '').replace(/"/g, '""')}"`,
    `"${(a.pulse || '').replace(/"/g, '""')}"`,
    a.days_open || 0,
    `"${(a.arr_formatted || a.arr || '$0').replace(/"/g, '""')}"`,
    `"${(a.last_modified || '').replace(/"/g, '""')}"`,
    `"${(a.comments || a.notes || '').replace(/"/g, '""')}"`
  ]);
  downloadCSV('Workload_Warriors_Aging_Onboarding.csv', [headers.join(','), ...rows.map(r => r.join(','))].join('\n'));
}

// ================= VIEW 4: TEAM CAPACITY =================

function filterTeamTable() {
  renderTeamTable();
}

function handleTeamSortDropdownChange() {
  const selVal = document.getElementById('team-sort-select')?.value || 'capacity_score:desc';
  const parts = selVal.split(':');
  teamSort.col = parts[0];
  teamSort.dir = parts[1] || 'desc';
  renderTeamTable();
}

function resetTeamFilters() {
  const o = document.getElementById('team-owner-select'); if (o) o.value = 'all';
  const s = document.getElementById('team-sort-select'); if (s) s.value = 'capacity_score:desc';
  teamSort = { col: 'capacity_score', dir: 'desc' };
  renderTeamTable();
}

function sortTeam(colKey) {
  if (teamSort.col === colKey) {
    teamSort.dir = teamSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    teamSort.col = colKey;
    teamSort.dir = (colKey === 'name') ? 'asc' : 'desc';
  }
  document.querySelectorAll('#view-team th.sortable-hdr .sort-badge').forEach(el => el.innerText = '↕');
  const activeBadge = document.getElementById(`team-sort-${colKey}`);
  if (activeBadge) activeBadge.innerText = teamSort.dir === 'asc' ? '↑' : '↓';
  renderTeamTable();
}

function renderTeamTable() {
  const tbody = document.getElementById('team-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  let list = [...(data.people || [])];
  const owner = document.getElementById('team-owner-select')?.value || 'all';

  if (owner !== 'all') {
    list = list.filter(p => p.name === owner);
  }

  list.sort((a, b) => {
    let vA = a[teamSort.col];
    let vB = b[teamSort.col];
    if (typeof vA === 'number') {
      return teamSort.dir === 'asc' ? (vA || 0) - (vB || 0) : (vB || 0) - (vA || 0);
    }
    vA = (vA || '').toString().toLowerCase();
    vB = (vB || '').toString().toLowerCase();
    if (vA < vB) return teamSort.dir === 'asc' ? -1 : 1;
    if (vA > vB) return teamSort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  const countBadge = document.getElementById('team-visible-count');
  if (countBadge) countBadge.innerText = list.length;

  list.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:700; color:var(--cyan);">${escapeHtml(p.name)}</td>
      <td style="text-align:center;">${p.cps_count || 0}</td>
      <td style="text-align:center;">${p.workload_count || 0}</td>
      <td style="text-align:center;">${p.onboarding_count || 0}</td>
      <td style="text-align:center;">${p.adoption_count || 0}</td>
      <td style="text-align:center; font-weight:700;">${p.total_accounts || 0}</td>
      <td style="font-weight:700; color:var(--cyan);">${escapeHtml(p.total_arr || '$0')}</td>
      <td style="text-align:center; color:var(--green); font-weight:600;">${p.completed_successful_count || 0}</td>
      <td style="text-align:center; color:var(--amber); font-weight:600;">${p.derisk_count || 0}</td>
      <td style="text-align:center; color:var(--red); font-weight:700;">${p.red_pulse_count || 0}</td>
      <td style="font-weight:800; font-size:13px; color:var(--cyan);">${(p.capacity_score || 0).toFixed(2)}</td>
      <td>
        <button class="btn ghost small-btn" onclick="filterPortfolioByOwner('${escapeHtml(p.name)}')" style="font-size:11px; padding:3px 7px;">Filter Portfolio ▸</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function filterPortfolioByOwner(ownerName) {
  navigateTo('portfolio');
  const ownerSel = document.getElementById('pf-owner-select');
  if (ownerSel) {
    ownerSel.value = ownerName;
    handlePortfolioFilterChange();
  }
}

function exportTeamCSV() {
  if (!data) return;
  const list = data.people || [];
  const headers = ['CSS Name', 'Active CPS', 'Active CSW', 'Onboarding Plans', 'Adoption Plans', 'Total Accounts', 'Total ARR', 'Successful Closed', 'De-Risk Accounts', 'Red Pulses', 'Weighted Capacity Score'];
  const rows = list.map(p => [
    `"${(p.name || '').replace(/"/g, '""')}"`,
    p.cps_count || 0,
    p.workload_count || 0,
    p.onboarding_count || 0,
    p.adoption_count || 0,
    p.total_accounts || 0,
    `"${(p.total_arr || '$0').replace(/"/g, '""')}"`,
    p.completed_successful_count || 0,
    p.derisk_count || 0,
    p.red_pulse_count || 0,
    p.capacity_score || 0
  ]);
  downloadCSV('Workload_Warriors_Team_Capacity.csv', [headers.join(','), ...rows.map(r => r.join(','))].join('\n'));
}

// ================= VIEW 5: RENEWALS RUNWAY =================

function filterRenewalsTable() {
  renderRenewalsTable();
}

function resetRenewalsFilters() {
  const s = document.getElementById('ren-search-input'); if (s) s.value = '';
  const o = document.getElementById('ren-owner-select'); if (o) o.value = 'all';
  const q = document.getElementById('ren-qtr-select'); if (q) q.value = 'all';
  const p = document.getElementById('ren-pulse-select'); if (p) p.value = 'all';
  const st = document.getElementById('ren-status-select'); if (st) st.value = 'all';
  renderRenewalsTable();
}

function sortRenewals(colKey) {
  if (renewalsSort.col === colKey) {
    renewalsSort.dir = renewalsSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    renewalsSort.col = colKey;
    renewalsSort.dir = (colKey === 'arr_num') ? 'desc' : 'asc';
  }
  document.querySelectorAll('#view-renewals th.sortable-hdr .sort-badge').forEach(el => el.innerText = '↕');
  const activeBadge = document.getElementById(`ren-sort-${colKey}`);
  if (activeBadge) activeBadge.innerText = renewalsSort.dir === 'asc' ? '↑' : '↓';
  renderRenewalsTable();
}

function renderRenewalsTable() {
  const tbody = document.getElementById('ren-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  let list = [...(data.renewals || [])];
  const query = (document.getElementById('ren-search-input')?.value || '').toLowerCase().trim();
  const owner = document.getElementById('ren-owner-select')?.value || 'all';
  const qtr = document.getElementById('ren-qtr-select')?.value || 'all';
  const pulse = document.getElementById('ren-pulse-select')?.value || 'all';
  const statusFilter = document.getElementById('ren-status-select')?.value || 'all';

  if (query) {
    list = list.filter(r =>
      (r.clean_acct || '').toLowerCase().includes(query) ||
      (r.account_name || '').toLowerCase().includes(query) ||
      (r.id || '').toLowerCase().includes(query) ||
      (r.owner || '').toLowerCase().includes(query)
    );
  }

  if (owner !== 'all') list = list.filter(r => r.owner === owner);
  if (qtr !== 'all') list = list.filter(r => r.renewal_quarter === qtr);
  if (pulse !== 'all') list = list.filter(r => r.pulse === pulse);
  if (statusFilter === 'derisk') list = list.filter(r => r.is_derisk || (data.derisk || []).some(d => d.clean_acct === r.clean_acct));
  else if (statusFilter === 'standard') list = list.filter(r => !r.is_derisk && !(data.derisk || []).some(d => d.clean_acct === r.clean_acct));

  list.sort((a, b) => {
    let vA = a[renewalsSort.col];
    let vB = b[renewalsSort.col];
    if (typeof vA === 'number') {
      return renewalsSort.dir === 'asc' ? (vA || 0) - (vB || 0) : (vB || 0) - (vA || 0);
    }
    vA = (vA || '').toString().toLowerCase();
    vB = (vB || '').toString().toLowerCase();
    if (vA < vB) return renewalsSort.dir === 'asc' ? -1 : 1;
    if (vA > vB) return renewalsSort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  const countBadge = document.getElementById('ren-visible-count');
  if (countBadge) countBadge.innerText = list.length;

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:32px; color:var(--text-muted);">No renewals match criteria.</td></tr>';
    return;
  }

  list.forEach(r => {
    const tr = document.createElement('tr');
    const links = getSfdcLinks(r);
    const pulseClass = (r.pulse === 'Green') ? 'pulse-green' : (r.pulse === 'Yellow') ? 'pulse-yellow' : (r.pulse === 'Red') ? 'pulse-red' : 'pulse-none';
    const isDeRisk = r.is_derisk || (data.derisk || []).some(d => d.clean_acct === r.clean_acct);

    tr.innerHTML = `
      <td style="font-weight:600; color:var(--cyan); cursor:pointer;" onclick="openDrilldown('${escapeHtml(r.clean_acct)}')">${escapeHtml(r.clean_acct || r.account_name)}</td>
      <td>${escapeHtml(r.owner || '')}</td>
      <td style="font-weight:600;">${escapeHtml(r.renewal_quarter || 'FY27 Q1')}</td>
      <td style="font-weight:700; color:var(--cyan);">${escapeHtml(r.arr || '$0')}</td>
      <td><span class="pulse-tag ${pulseClass}">${escapeHtml(r.pulse || 'None')}</span></td>
      <td><span class="stage-tag">${escapeHtml(r.status || 'Active')}</span></td>
      <td>${isDeRisk ? '<span class="badge" style="background:rgba(239,68,68,0.15); color:var(--red); border:1px solid rgba(239,68,68,0.3); font-weight:700; padding:2px 6px; border-radius:4px;">De-Risk</span>' : '<span class="text-muted">-</span>'}</td>
      <td>
        <div style="display:flex; gap:6px;">
          ${links.planUrl ? `<a class="btn ghost small-btn" href="${links.planUrl}" target="_blank" rel="noopener noreferrer" style="font-size:11px; padding:3px 7px;">🔗 Plan</a>` : ''}
          <button class="btn ghost small-btn" onclick="openDrilldown('${escapeHtml(r.clean_acct)}')" style="font-size:11px; padding:3px 7px;">View ▸</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function exportRenewalsCSV() {
  if (!data) return;
  const list = data.renewals || [];
  const headers = ['Account Name', 'CSS Owner', 'Renewal Quarter', 'ARR', 'Customer Pulse', 'Status', 'De-Risk Status'];
  const rows = list.map(r => [
    `"${(r.clean_acct || r.account_name || '').replace(/"/g, '""')}"`,
    `"${(r.owner || '').replace(/"/g, '""')}"`,
    `"${(r.renewal_quarter || 'FY27 Q1').replace(/"/g, '""')}"`,
    `"${(r.arr || '$0').replace(/"/g, '""')}"`,
    `"${(r.pulse || '').replace(/"/g, '""')}"`,
    `"${(r.status || '').replace(/"/g, '""')}"`,
    r.is_derisk ? 'Priority De-Risk' : 'Standard'
  ]);
  downloadCSV('Workload_Warriors_Renewals_Runway.csv', [headers.join(','), ...rows.map(r => r.join(','))].join('\n'));
}

// ================= VIEW 6: DE-RISK PIPELINE =================

function filterDeRiskTable() {
  renderDeRiskTable();
}

function resetDeriskFilters() {
  const s = document.getElementById('dr-search-input'); if (s) s.value = '';
  const o = document.getElementById('dr-owner-select'); if (o) o.value = 'all';
  const q = document.getElementById('dr-qtr-select'); if (q) q.value = 'all';
  const p = document.getElementById('dr-pulse-select'); if (p) p.value = 'all';
  renderDeRiskTable();
}

function sortDerisk(colKey) {
  if (deriskSort.col === colKey) {
    deriskSort.dir = deriskSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    deriskSort.col = colKey;
    deriskSort.dir = (colKey === 'arr_num') ? 'desc' : 'asc';
  }
  document.querySelectorAll('#view-derisk th.sortable-hdr .sort-badge').forEach(el => el.innerText = '↕');
  const activeBadge = document.getElementById(`dr-sort-${colKey}`);
  if (activeBadge) activeBadge.innerText = deriskSort.dir === 'asc' ? '↑' : '↓';
  renderDeRiskTable();
}

function renderDeRiskTable() {
  const tbody = document.getElementById('dr-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  let list = [...(data.derisk || [])].filter(a => {
    const st = String(a.status || '').toLowerCase();
    return !st.includes('closed') && !st.includes('complete') && !st.includes('unsuccessful') && !st.includes('stalled');
  });
  const query = (document.getElementById('dr-search-input')?.value || '').toLowerCase().trim();
  const owner = document.getElementById('dr-owner-select')?.value || 'all';
  const qtr = document.getElementById('dr-qtr-select')?.value || 'all';
  const pulse = document.getElementById('dr-pulse-select')?.value || 'all';

  if (query) {
    list = list.filter(r =>
      (r.clean_acct || '').toLowerCase().includes(query) ||
      (r.comments || '').toLowerCase().includes(query) ||
      (r.owner || '').toLowerCase().includes(query)
    );
  }
  if (owner !== 'all') list = list.filter(r => r.owner === owner);
  if (qtr !== 'all') list = list.filter(r => r.renewal_quarter === qtr);
  if (pulse !== 'all') list = list.filter(r => r.pulse === pulse);

  list.sort((a, b) => {
    let vA = a[deriskSort.col];
    let vB = b[deriskSort.col];
    if (typeof vA === 'number') {
      return deriskSort.dir === 'asc' ? (vA || 0) - (vB || 0) : (vB || 0) - (vA || 0);
    }
    vA = (vA || '').toString().toLowerCase();
    vB = (vB || '').toString().toLowerCase();
    if (vA < vB) return deriskSort.dir === 'asc' ? -1 : 1;
    if (vA > vB) return deriskSort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  const countBadge = document.getElementById('dr-visible-count');
  if (countBadge) countBadge.innerText = list.length;

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--text-muted);">No de-risk accounts match criteria.</td></tr>';
    return;
  }

  list.forEach(r => {
    const tr = document.createElement('tr');
    const links = getSfdcLinks(r);
    const pulseClass = (r.pulse === 'Green') ? 'pulse-green' : (r.pulse === 'Yellow') ? 'pulse-yellow' : 'pulse-red';
    const notesKey = `dr_${r.id || r.clean_acct}`;

    tr.innerHTML = `
      <td style="font-weight:700; color:var(--cyan); cursor:pointer;" onclick="openDrilldown('${escapeHtml(r.clean_acct)}')">${escapeHtml(r.clean_acct || r.account_name)}</td>
      <td>${escapeHtml(r.owner || '')}</td>
      <td><span class="pulse-tag ${pulseClass}">${escapeHtml(r.pulse || 'Red')}</span></td>
      <td style="font-weight:700; color:var(--cyan);">${escapeHtml(r.arr || '$0')}</td>
      <td style="font-weight:600;">${escapeHtml(r.renewal_quarter || 'FY27 Q1')}</td>
      <td style="max-width:440px; font-size:12px;">${formatNotesHtml(r.comments || r.notes || '', 140, notesKey)}</td>
      <td>
        <div style="display:flex; gap:6px;">
          ${links.planUrl ? `<a class="btn ghost small-btn" href="${links.planUrl}" target="_blank" rel="noopener noreferrer" style="font-size:11px; padding:3px 7px;">🔗 Plan</a>` : ''}
          <button class="btn ghost small-btn" onclick="openDrilldown('${escapeHtml(r.clean_acct)}')" style="font-size:11px; padding:3px 7px;">View ▸</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function exportDeriskCSV() {
  if (!data) return;
  const list = data.derisk || [];
  const headers = ['Account Name', 'CSS Owner', 'Customer Pulse', 'ARR', 'Renewal Quarter', 'Risk Context & Mitigation Notes'];
  const rows = list.map(r => [
    `"${(r.clean_acct || r.account_name || '').replace(/"/g, '""')}"`,
    `"${(r.owner || '').replace(/"/g, '""')}"`,
    `"${(r.pulse || 'Red').replace(/"/g, '""')}"`,
    `"${(r.arr || '$0').replace(/"/g, '""')}"`,
    `"${(r.renewal_quarter || 'FY27 Q1').replace(/"/g, '""')}"`,
    `"${(r.comments || r.notes || '').replace(/"/g, '""')}"`
  ]);
  downloadCSV('Workload_Warriors_DeRisk_Pipeline.csv', [headers.join(','), ...rows.map(r => r.join(','))].join('\n'));
}

// ================= VIEW 7: NOTES & GOVERNANCE =================

function filterGovTable() {
  renderGovTable();
}

function resetGovFilters() {
  const s = document.getElementById('gov-search-input'); if (s) s.value = '';
  const o = document.getElementById('gov-owner-select'); if (o) o.value = 'all';
  const t = document.getElementById('gov-type-select'); if (t) t.value = 'all';
  const st = document.getElementById('gov-status-select'); if (st) st.value = 'all';
  const p = document.getElementById('gov-pulse-select'); if (p) p.value = 'all';
  renderGovTable();
}

function sortGovTable(colKey) {
  if (govSort.col === colKey) {
    govSort.dir = govSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    govSort.col = colKey;
    govSort.dir = (colKey === 'days_since_touch' || colKey === 'days_open') ? 'desc' : 'asc';
  }
  document.querySelectorAll('#view-governance th.sortable-hdr .sort-badge').forEach(el => el.innerText = '↕');
  const activeBadge = document.getElementById(`gov-sort-${colKey}`);
  if (activeBadge) activeBadge.innerText = govSort.dir === 'asc' ? '↑' : '↓';
  renderGovTable();
}

function renderGovTable() {
  const tbody = document.getElementById('gov-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  let list = [...(data.notes_governance || [])];
  const query = (document.getElementById('gov-search-input')?.value || '').toLowerCase().trim();
  const owner = document.getElementById('gov-owner-select')?.value || 'all';
  const typeFilter = document.getElementById('gov-type-select')?.value || 'all';
  const statusFilter = document.getElementById('gov-status-select')?.value || 'all';
  const pulse = document.getElementById('gov-pulse-select')?.value || 'all';

  if (typeFilter !== 'all') {
    list = list.filter(n => n.plan_type === typeFilter);
  }

  if (statusFilter !== 'all') {
    if (statusFilter === 'active') {
      list = list.filter(n => !n.is_unsuccessful && (n.status || '') !== 'Completed - Unsuccessful');
    } else {
      list = list.filter(n => (n.status || '') === statusFilter);
    }
  }

  if (query) {
    list = list.filter(n =>
      (n.clean_acct || '').toLowerCase().includes(query) ||
      (n.comments || '').toLowerCase().includes(query) ||
      (n.id || '').toLowerCase().includes(query) ||
      (n.owner || '').toLowerCase().includes(query)
    );
  }

  if (owner !== 'all') list = list.filter(n => n.owner === owner);
  if (pulse !== 'all') list = list.filter(n => n.pulse === pulse);

  list.sort((a, b) => {
    let vA = a[govSort.col];
    let vB = b[govSort.col];
    if (typeof vA === 'number') {
      return govSort.dir === 'asc' ? (vA || 0) - (vB || 0) : (vB || 0) - (vA || 0);
    }
    vA = (vA || '').toString().toLowerCase();
    vB = (vB || '').toString().toLowerCase();
    if (vA < vB) return govSort.dir === 'asc' ? -1 : 1;
    if (vA > vB) return govSort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  const countBadge = document.getElementById('gov-visible-count');
  if (countBadge) countBadge.innerText = list.length;

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:32px; color:var(--text-muted);">No records match criteria.</td></tr>';
    return;
  }

  list.forEach(n => {
    const tr = document.createElement('tr');
    const links = getSfdcLinks(n);
    const pulseClass = (n.pulse === 'Green') ? 'pulse-green' : (n.pulse === 'Yellow') ? 'pulse-yellow' : (n.pulse === 'Red') ? 'pulse-red' : 'pulse-none';
    const notesKey = `gov_${n.id || n.clean_acct}`;

    tr.innerHTML = `
      <td style="font-weight:600; color:var(--cyan); cursor:pointer;" onclick="openDrilldown('${escapeHtml(n.clean_acct)}')">${escapeHtml(n.clean_acct || n.account_name)}</td>
      <td style="font-size:11.5px; font-family:var(--font-mono); color:var(--text-muted);">${escapeHtml(n.id || '')}</td>
      <td>${escapeHtml(n.owner || '')}</td>
      <td><span class="stage-tag">${escapeHtml(n.status || 'Active')}</span></td>
      <td><span class="pulse-tag ${pulseClass}">${escapeHtml(n.pulse || 'None')}</span></td>
      <td style="font-size:11.5px; color:var(--text-muted);">${escapeHtml(n.last_modified || '')}</td>
      <td style="font-weight:600; text-align:center;">${n.days_open || 0}d</td>
      <td style="max-width:440px; font-size:12px;">${formatNotesHtml(n.comments || n.notes || '', 140, notesKey)}</td>
      <td>
        <div style="display:flex; gap:6px;">
          ${links.planUrl ? `<a class="btn ghost small-btn" href="${links.planUrl}" target="_blank" rel="noopener noreferrer" style="font-size:11px; padding:3px 7px;">🔗 Plan</a>` : ''}
          <button class="btn ghost small-btn" onclick="openDrilldown('${escapeHtml(n.clean_acct)}')" style="font-size:11px; padding:3px 7px;">View ▸</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function exportGovCSV() {
  if (!data) return;
  const list = data.notes_governance || [];
  const headers = ['Account Name', 'Plan ID', 'CSS Owner', 'Status', 'Customer Pulse', 'Last Touch', 'Days Open', 'C360 Notes'];
  const rows = list.map(n => [
    `"${(n.clean_acct || n.account_name || '').replace(/"/g, '""')}"`,
    `"${(n.id || '').replace(/"/g, '""')}"`,
    `"${(n.owner || '').replace(/"/g, '""')}"`,
    `"${(n.status || '').replace(/"/g, '""')}"`,
    `"${(n.pulse || '').replace(/"/g, '""')}"`,
    `"${(n.last_modified || '').replace(/"/g, '""')}"`,
    n.days_open || 0,
    `"${(n.comments || n.notes || '').replace(/"/g, '""')}"`
  ]);
  downloadCSV('Workload_Warriors_Notes_Governance.csv', [headers.join(','), ...rows.map(r => r.join(','))].join('\n'));
}

// ================= VIEW 8: ARCHIVED / CLOSED =================

function filterArchivedTable() {
  renderArchivedTable();
}

function resetArchivedFilters() {
  const s = document.getElementById('archived-search-input'); if (s) s.value = '';
  const o = document.getElementById('archived-owner-select'); if (o) o.value = 'all';
  const out = document.getElementById('archived-outcome-select'); if (out) out.value = 'all';
  const t = document.getElementById('archived-type-select'); if (t) t.value = 'all';
  renderArchivedTable();
}

function sortArchived(colKey) {
  if (archivedSort.col === colKey) {
    archivedSort.dir = archivedSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    archivedSort.col = colKey;
    archivedSort.dir = (colKey === 'days_open' || colKey === 'last_modified') ? 'desc' : 'asc';
  }
  document.querySelectorAll('#view-archived th.sortable-hdr .sort-badge').forEach(el => el.innerText = '↕');
  const activeBadge = document.getElementById(`archived-sort-${colKey}`);
  if (activeBadge) activeBadge.innerText = archivedSort.dir === 'asc' ? '↑' : '↓';
  renderArchivedTable();
}

function renderArchivedTable() {
  const tbody = document.getElementById('archived-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  let list = [...(data.archived_unsuccessful || [])];

  const query = (document.getElementById('archived-search-input')?.value || '').toLowerCase().trim();
  const owner = document.getElementById('archived-owner-select')?.value || 'all';
  const outcomeFilter = document.getElementById('archived-outcome-select')?.value || 'all';
  const typeFilter = document.getElementById('archived-type-select')?.value || 'all';

  if (outcomeFilter === 'successful') {
    list = list.filter(n => (n.status || '').toLowerCase().includes('successful') && !(n.status || '').toLowerCase().includes('unsuccessful'));
  } else if (outcomeFilter === 'unsuccessful') {
    list = list.filter(n => (n.status || '').toLowerCase().includes('unsuccessful') || n.is_unsuccessful);
  }

  if (typeFilter !== 'all') {
    list = list.filter(n => n.plan_type === typeFilter);
  }

  if (query) {
    list = list.filter(n =>
      (n.clean_acct || '').toLowerCase().includes(query) ||
      (n.comments || '').toLowerCase().includes(query) ||
      (n.id || '').toLowerCase().includes(query) ||
      (n.owner || '').toLowerCase().includes(query)
    );
  }

  if (owner !== 'all') list = list.filter(n => n.owner === owner);

  list.sort((a, b) => {
    let vA = a[archivedSort.col];
    let vB = b[archivedSort.col];
    if (typeof vA === 'number') {
      return archivedSort.dir === 'asc' ? (vA || 0) - (vB || 0) : (vB || 0) - (vA || 0);
    }
    vA = (vA || '').toString().toLowerCase();
    vB = (vB || '').toString().toLowerCase();
    if (vA < vB) return archivedSort.dir === 'asc' ? -1 : 1;
    if (vA > vB) return archivedSort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  const countBadge = document.getElementById('archived-visible-count');
  if (countBadge) countBadge.innerText = list.length;

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:32px; color:var(--text-muted);">No archived records match criteria.</td></tr>';
    return;
  }

  list.forEach(n => {
    const tr = document.createElement('tr');
    const links = getSfdcLinks(n);
    const pulseClass = (n.pulse === 'Green') ? 'pulse-green' : (n.pulse === 'Yellow') ? 'pulse-yellow' : (n.pulse === 'Red') ? 'pulse-red' : 'pulse-none';
    const notesKey = `arch_${n.id || n.clean_acct}`;

    tr.innerHTML = `
      <td style="font-weight:600; color:var(--cyan); cursor:pointer;" onclick="openDrilldown('${escapeHtml(n.clean_acct)}')">${escapeHtml(n.clean_acct || n.account_name)}</td>
      <td style="font-size:11.5px; font-family:var(--font-mono); color:var(--text-muted);">${escapeHtml(n.id || '')}</td>
      <td>${escapeHtml(n.owner || '')}</td>
      <td><span class="stage-tag" style="background:rgba(100,116,139,0.2);">${escapeHtml(n.status || 'Archived')}</span></td>
      <td><span class="pulse-tag ${pulseClass}">${escapeHtml(n.pulse || 'None')}</span></td>
      <td style="font-size:11.5px; color:var(--text-muted);">${escapeHtml(n.last_modified || '')}</td>
      <td style="font-weight:600; text-align:center;">${n.days_open || 0}d</td>
      <td style="max-width:440px; font-size:12px;">${formatNotesHtml(n.comments || n.notes || '', 140, notesKey)}</td>
      <td>
        <div style="display:flex; gap:6px;">
          ${links.planUrl ? `<a class="btn ghost small-btn" href="${links.planUrl}" target="_blank" rel="noopener noreferrer" style="font-size:11px; padding:3px 7px;">🔗 Plan</a>` : ''}
          <button class="btn ghost small-btn" onclick="openDrilldown('${escapeHtml(n.clean_acct)}')" style="font-size:11px; padding:3px 7px;">View ▸</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function exportArchivedCSV() {
  if (!data) return;
  const list = data.archived_unsuccessful || [];
  const headers = ['Account Name', 'Plan ID', 'CSS Owner', 'Status', 'Customer Pulse', 'Last Touch', 'Days Open', 'Closure Notes / Reason'];
  const rows = list.map(n => [
    `"${(n.clean_acct || n.account_name || '').replace(/"/g, '""')}"`,
    `"${(n.id || '').replace(/"/g, '""')}"`,
    `"${(n.owner || '').replace(/"/g, '""')}"`,
    `"${(n.status || '').replace(/"/g, '""')}"`,
    `"${(n.pulse || '').replace(/"/g, '""')}"`,
    `"${(n.last_modified || '').replace(/"/g, '""')}"`,
    n.days_open || 0,
    `"${(n.comments || n.notes || '').replace(/"/g, '""')}"`
  ]);
  downloadCSV('Workload_Warriors_Archived_Plans.csv', [headers.join(','), ...rows.map(r => r.join(','))].join('\n'));
}

// ================= VIEW 9: DATA QUALITY =================

function filterQualityTable() {
  renderQualityTable();
}

function resetQualityFilters() {
  const s = document.getElementById('qual-search-input'); if (s) s.value = '';
  const sev = document.getElementById('qual-sev-select'); if (sev) sev.value = 'all';
  const typ = document.getElementById('qual-type-select'); if (typ) typ.value = 'all';
  const o = document.getElementById('qual-owner-select'); if (o) o.value = 'all';
  renderQualityTable();
}

function sortQuality(colKey) {
  if (qualSort.col === colKey) {
    qualSort.dir = qualSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    qualSort.col = colKey;
    qualSort.dir = 'asc';
  }
  document.querySelectorAll('#view-quality th.sortable-hdr .sort-badge').forEach(el => el.innerText = '↕');
  const activeBadge = document.getElementById(`qual-sort-${colKey}`);
  if (activeBadge) activeBadge.innerText = qualSort.dir === 'asc' ? '↑' : '↓';
  renderQualityTable();
}

function renderQualityTable() {
  const tbody = document.getElementById('qual-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  let list = [...(data.issues || [])];
  const query = (document.getElementById('qual-search-input')?.value || '').toLowerCase().trim();
  const owner = document.getElementById('qual-owner-select')?.value || 'all';
  const sev = document.getElementById('qual-sev-select')?.value || 'all';
  const typ = document.getElementById('qual-type-select')?.value || 'all';

  if (query) {
    list = list.filter(i =>
      (i.account || '').toLowerCase().includes(query) ||
      (i.action || '').toLowerCase().includes(query) ||
      (i.owner || '').toLowerCase().includes(query)
    );
  }

  if (owner !== 'all') list = list.filter(i => i.owner === owner);
  if (sev !== 'all') list = list.filter(i => i.severity === sev);
  if (typ !== 'all') list = list.filter(i => i.type === typ);

  list.sort((a, b) => {
    let vA = (a[qualSort.col] || '').toString().toLowerCase();
    let vB = (b[qualSort.col] || '').toString().toLowerCase();
    if (vA < vB) return qualSort.dir === 'asc' ? -1 : 1;
    if (vA > vB) return qualSort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  const countBadge = document.getElementById('qual-visible-count');
  if (countBadge) countBadge.innerText = list.length;

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--text-muted);">No data quality issues match the selected criteria.</td></tr>';
    return;
  }

  list.forEach(i => {
    const tr = document.createElement('tr');
    const sevClass = (i.severity === 'HIGH') ? 'pulse-red' : (i.severity === 'MEDIUM') ? 'pulse-yellow' : 'pulse-green';
    const links = getSfdcLinks(i);

    tr.innerHTML = `
      <td><span class="pulse-tag ${sevClass}">${escapeHtml(i.severity)}</span></td>
      <td style="font-weight:600;">${escapeHtml(i.type)}</td>
      <td style="color:var(--cyan); font-weight:600; cursor:pointer;" onclick="openDrilldown('${escapeHtml(i.account)}')">${escapeHtml(i.account)}</td>
      <td>${escapeHtml(i.owner || '')}</td>
      <td style="color:var(--fg);">${escapeHtml(i.action)}</td>
      <td>
        <div style="display:flex; gap:6px;">
          ${links.planUrl ? `<a class="btn ghost small-btn" href="${links.planUrl}" target="_blank" rel="noopener noreferrer" style="font-size:11px; padding:3px 7px;">🔗 Fix in SFDC</a>` : `<button class="btn ghost small-btn" onclick="openDrilldown('${escapeHtml(i.account)}')" style="font-size:11px; padding:3px 7px;">Remediate ▸</button>`}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function exportQualityCSV() {
  if (!data) return;
  const list = data.issues || [];
  const headers = ['Severity', 'Issue Type', 'Account Name', 'CSS Owner', 'Required Remediation'];
  const rows = list.map(i => [
    `"${(i.severity || '').replace(/"/g, '""')}"`,
    `"${(i.type || '').replace(/"/g, '""')}"`,
    `"${(i.account || '').replace(/"/g, '""')}"`,
    `"${(i.owner || '').replace(/"/g, '""')}"`,
    `"${(i.action || '').replace(/"/g, '""')}"`
  ]);
  downloadCSV('Workload_Warriors_Data_Quality_Ledger.csv', [headers.join(','), ...rows.map(r => r.join(','))].join('\n'));
}

// ================= VIEW 2: DRILLDOWN MODAL =================

function openDrilldown(acctName) {
  const acct = findAccountInAllCollections(acctName);
  if (!acct) return;

  const titleEl = document.getElementById('drilldown-acct-name');
  const subEl = document.getElementById('drilldown-acct-sub');
  const actionsEl = document.getElementById('drilldown-actions-header');

  if (titleEl) titleEl.innerText = acct.clean_acct || acct.account_name;
  if (subEl) subEl.innerText = `C360 Plan: ${acct.plan_name || 'Action Plan'} (${acct.id || 'N/A'}) - Owner: ${acct.owner || 'Unassigned'}`;

  const links = getSfdcLinks(acct);
  if (actionsEl) {
    actionsEl.innerHTML = `
      ${links.acctUrl ? `<a class="btn ghost small-btn" href="${links.acctUrl}" target="_blank" rel="noopener noreferrer" style="color:var(--cyan); border-color:rgba(2,200,255,0.4);">🔗 SFDC Account</a>` : ''}
      ${links.planUrl ? `<a class="btn ghost small-btn" href="${links.planUrl}" target="_blank" rel="noopener noreferrer" style="color:var(--cyan); border-color:rgba(2,200,255,0.4);">🔗 SFDC Plan</a>` : ''}
    `;
  }

  showDrilldownView(acct);
  navigateTo('drilldown');
}

function closeDrilldown() {
  navigateTo('portfolio');
}

function switchSubTab(tabKey) {
  document.querySelectorAll('#drilldown-subtabs .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#view-drilldown .subview-panel').forEach(p => p.classList.remove('active'));

  const btn = Array.from(document.querySelectorAll('#drilldown-subtabs .tab-btn')).find(b => b.getAttribute('onclick')?.includes(tabKey));
  const panel = document.getElementById(`subview-${tabKey}`);

  if (btn) btn.classList.add('active');
  if (panel) panel.classList.add('active');
}

function showDrilldownView(acct) {
  const overPanel = document.getElementById('subview-overview');
  const msPanel = document.getElementById('subview-milestones');
  const notesPanel = document.getElementById('subview-notes');
  const sfdcPanel = document.getElementById('subview-sfdc');

  const pulseClass = (acct.pulse === 'Green') ? 'pulse-green' : (acct.pulse === 'Yellow') ? 'pulse-yellow' : (acct.pulse === 'Red') ? 'pulse-red' : 'pulse-none';

  if (overPanel) {
    overPanel.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:16px; margin-bottom:20px;">
        <div style="background:var(--bg-card); padding:16px; border-radius:8px; border:1px solid var(--line);">
          <div class="text-muted" style="font-size:11px; text-transform:uppercase; font-weight:700;">Account ARR</div>
          <div style="font-size:24px; font-weight:800; color:var(--cyan); margin-top:4px;">${escapeHtml(acct.arr_formatted || acct.arr || '$0')}</div>
        </div>
        <div style="background:var(--bg-card); padding:16px; border-radius:8px; border:1px solid var(--line);">
          <div class="text-muted" style="font-size:11px; text-transform:uppercase; font-weight:700;">Customer Pulse</div>
          <div style="margin-top:6px;"><span class="pulse-tag ${pulseClass}" style="font-size:13px; padding:4px 10px;">${escapeHtml(acct.pulse || 'None')}</span></div>
        </div>
        <div style="background:var(--bg-card); padding:16px; border-radius:8px; border:1px solid var(--line);">
          <div class="text-muted" style="font-size:11px; text-transform:uppercase; font-weight:700;">Stage & Status</div>
          <div style="margin-top:6px;"><span class="stage-tag" style="font-size:13px; padding:4px 10px;">${escapeHtml(acct.status || 'Active')}</span></div>
        </div>
        <div style="background:var(--bg-card); padding:16px; border-radius:8px; border:1px solid var(--line);">
          <div class="text-muted" style="font-size:11px; text-transform:uppercase; font-weight:700;">Renewal Target</div>
          <div style="font-size:20px; font-weight:700; color:var(--fg); margin-top:4px;">${escapeHtml(acct.renewal_quarter || 'FY27 Q1')}</div>
        </div>
      </div>
      <div style="background:var(--bg-card); padding:18px; border-radius:8px; border:1px solid var(--line);">
        <h4 style="margin:0 0 10px 0; font-size:14px; color:var(--fg); font-weight:700;">Primary Engagement Focus</h4>
        <p style="margin:0; font-size:13px; line-height:1.5; color:var(--fg);">${escapeHtml(acct.next_action || acct.comments || 'Active technical alignment in progress.')}</p>
      </div>
    `;
  }

  if (msPanel) {
    const actionItems = acct.action_items || [];
    if (actionItems.length === 0) {
      msPanel.innerHTML = '<div style="padding:24px; color:var(--text-muted); font-size:13px;">No milestone sub-tasks recorded for this action plan in C360.</div>';
    } else {
      let itemsHtml = actionItems.map(item => `
        <div style="background:var(--bg-card); border:1px solid var(--line); border-radius:8px; padding:14px; margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <strong style="color:var(--cyan); font-size:13px;">${escapeHtml(item.action)}</strong>
            <span class="stage-tag">${escapeHtml(item.status)}</span>
          </div>
          <div style="font-size:12px; color:var(--fg); line-height:1.45;">${escapeHtml(item.notes || 'No sub-notes')}</div>
        </div>
      `).join('');
      msPanel.innerHTML = itemsHtml;
    }
  }

  if (notesPanel) {
    notesPanel.innerHTML = `
      <div style="background:var(--bg-card); border:1px solid var(--line); border-radius:8px; padding:18px;">
        <h4 style="margin:0 0 12px 0; font-size:14px; color:var(--fg); font-weight:700;">C360 Operational Notes Ledger</h4>
        ${formatNotesHtml(acct.comments || acct.notes || 'No governance notes recorded.', 999999, '')}
      </div>
    `;
  }

  if (sfdcPanel) {
    const links = getSfdcLinks(acct);
    sfdcPanel.innerHTML = `
      <div style="background:var(--bg-card); border:1px solid var(--line); border-radius:8px; padding:18px;">
        <h4 style="margin:0 0 12px 0; font-size:14px; color:var(--fg); font-weight:700;">Salesforce Record Architecture</h4>
        <div style="display:grid; grid-template-columns: 140px 1fr; gap:12px; font-size:13px; align-items:center;">
          <span class="text-muted">Account Name:</span><strong>${escapeHtml(acct.account_name || acct.clean_acct)}</strong>
          <span class="text-muted">Account ID:</span><code>${escapeHtml(acct.account_id || 'N/A')}</code>
          <span class="text-muted">C360 Plan ID:</span><code>${escapeHtml(acct.id || 'N/A')}</code>
          <span class="text-muted">Plan Object:</span><code>${acct.id && acct.id.startsWith('aIC') ? 'C360_Mitigation_Action_Plan__c' : 'C360_CS_Task__c'}</code>
          <span class="text-muted">Account Link:</span>${links.acctUrl ? `<a href="${links.acctUrl}" target="_blank" rel="noopener noreferrer" style="color:var(--cyan);">${links.acctUrl}</a>` : 'None'}
          <span class="text-muted">Plan Link:</span>${links.planUrl ? `<a href="${links.planUrl}" target="_blank" rel="noopener noreferrer" style="color:var(--cyan);">${links.planUrl}</a>` : 'None'}
        </div>
      </div>
    `;
  }

  switchSubTab('overview');
}

// ================= NAVIGATION & ROUTING =================

function navigateTo(viewId, updateHash = true) {
  currentView = viewId;
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.navgroup .navbtn').forEach(b => b.classList.remove('active'));

  const targetPanel = document.getElementById(`view-${viewId}`);
  const targetNavBtn = document.getElementById(`nav-${viewId}`);

  if (targetPanel) targetPanel.classList.add('active');
  if (targetNavBtn) targetNavBtn.classList.add('active');

  if (updateHash) {
    window.location.hash = `#/${viewId}`;
  }

  // Trigger relevant view renderers
  if (viewId === 'portfolio') renderPortfolioRows();
  else if (viewId === 'aging') renderAgingOnboardingTable();
  else if (viewId === 'team') renderTeamTable();
  else if (viewId === 'renewals') renderRenewalsTable();
  else if (viewId === 'derisk') renderDeRiskTable();
  else if (viewId === 'governance') renderGovTable();
  else if (viewId === 'archived') renderArchivedTable();
  else if (viewId === 'quality') renderQualityTable();
}

function handleHashRouting() {
  const hash = window.location.hash;
  if (hash === '#/aging') navigateTo('aging', false);
  else if (hash === '#/team') navigateTo('team', false);
  else if (hash === '#/renewals') navigateTo('renewals', false);
  else if (hash === '#/derisk') navigateTo('derisk', false);
  else if (hash === '#/governance') navigateTo('governance', false);
  else if (hash === '#/archived') navigateTo('archived', false);
  else if (hash === '#/quality') navigateTo('quality', false);
  else navigateTo('portfolio', false);
}

// ================= DYNAMIC DROPDOWN POPULATION =================

function populateDropdowns() {
  if (!data) return;
  const all = getAllWorkingAccounts();
  const owners = Array.from(new Set(all.map(a => a.owner).filter(Boolean))).sort();

  // 1. Populate CSS Owners across all views
  ['pf-owner-select', 'aging-owner-select', 'team-owner-select', 'ren-owner-select', 'dr-owner-select', 'gov-owner-select', 'archived-owner-select', 'qual-owner-select'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const curr = sel.value;
    const defaultLabel = (id === 'team-owner-select') ? 'All CSS Specialists (10)' : 'All CSS Owners';
    sel.innerHTML = `<option value="all">${defaultLabel}</option>`;
    owners.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o;
      opt.innerText = o;
      sel.appendChild(opt);
    });
    if (curr && Array.from(sel.options).some(o => o.value === curr)) sel.value = curr;
  });

  // 2. Populate Statuses across Portfolio, Aging, and Governance
  const statuses = Array.from(new Set(all.map(a => a.status).filter(Boolean))).sort();
  ['pf-status-select', 'aging-status-select', 'gov-status-select'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const curr = sel.value;
    sel.innerHTML = '<option value="all">All Stages / Statuses</option>';
    statuses.forEach(st => {
      const opt = document.createElement('option');
      opt.value = st;
      opt.innerText = st;
      sel.appendChild(opt);
    });
    if (curr && Array.from(sel.options).some(o => o.value === curr)) sel.value = curr;
  });

  // 3. Populate Renewal Quarters across Portfolio, Renewals, and De-Risk
  const quarters = ['FY26 Q4', 'FY27 Q1', 'FY27 Q2', 'FY27 Q3', 'FY27 Q4', 'FY28+'];
  ['pf-qtr-select', 'ren-qtr-select', 'dr-qtr-select'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const curr = sel.value;
    sel.innerHTML = '<option value="all">All Renewal Quarters</option>';
    quarters.forEach(q => {
      const opt = document.createElement('option');
      opt.value = q;
      opt.innerText = q;
      sel.appendChild(opt);
    });
    if (curr && Array.from(sel.options).some(o => o.value === curr)) sel.value = curr;
  });

  // 4. Populate Quality Issue Types
  const typeSel = document.getElementById('qual-type-select');
  if (typeSel) {
    const types = Array.from(new Set((data.issues || []).map(i => i.type).filter(Boolean))).sort();
    const curr = typeSel.value;
    typeSel.innerHTML = '<option value="all">All Issue Types</option>';
    types.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.innerText = t;
      typeSel.appendChild(opt);
    });
    if (curr && Array.from(typeSel.options).some(o => o.value === curr)) typeSel.value = curr;
  }
}

function initApp() {
  data = window.DASHBOARD_DATA;
  if (!data) return;

  const all = getAllWorkingAccounts();
  const cps = data.cps || [];
  const csw = data.workload || [];
  const derisk = data.derisk || [];

  const totalARR = all.reduce((acc, cur) => acc + (cur.arr_num || 0), 0);
  const cpsARR = cps.reduce((acc, cur) => acc + (cur.arr_num || 0), 0);
  const cswARR = csw.reduce((acc, cur) => acc + (cur.arr_num || 0), 0);
  const drARR = derisk.reduce((acc, cur) => acc + (cur.arr_num || 0), 0);
  const redPulses = all.filter(a => a.pulse === 'Red').length;

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
  const setElHtml = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };

  setEl('kpi-total-accts', all.length);
  setEl('kpi-total-arr', `$${(totalARR / 1000000).toFixed(2)}M`);
  setElHtml('kpi-cps-accts', `${cps.length} <span class="kpi-mini">($${(cpsARR / 1000000).toFixed(2)}M)</span>`);
  setElHtml('kpi-csw-accts', `${csw.length} <span class="kpi-mini">($${(cswARR / 1000000).toFixed(2)}M)</span>`);
  setElHtml('kpi-dr-accts', `${derisk.length} <span class="kpi-mini">($${(drARR / 1000000).toFixed(2)}M)</span>`);
  setEl('kpi-red-pulses', redPulses);

  // Synchronize Nav Counts Dynamically
  setEl('nav-pf-count', all.length);
  setEl('nav-aging-count', (data.aging_onboarding || []).length);
  setEl('nav-team-count', (data.people || []).length);
  setEl('nav-dr-count', derisk.length);
  setEl('nav-notes-count', (data.notes_governance || []).length);
  setEl('nav-archived-count', (data.archived_unsuccessful || []).length);
  setEl('nav-qual-count', (data.issues || []).length);

  populateDropdowns();
}

function exportPortfolioCSV() {
  if (!data) return;
  const all = getAllWorkingAccounts();
  const headers = ['Account Name', 'Plan ID', 'Plan Type', 'CSS Owner', 'Status', 'Customer Pulse', 'ARR', 'Renewal Quarter', 'Last Modified Date', 'Notes'];
  const rows = all.map(a => [
    `"${(a.clean_acct || a.account_name || '').replace(/"/g, '""')}"`,
    `"${(a.id || '').replace(/"/g, '""')}"`,
    `"${(a.plan_type || '').replace(/"/g, '""')}"`,
    `"${(a.owner || '').replace(/"/g, '""')}"`,
    `"${(a.status || '').replace(/"/g, '""')}"`,
    `"${(a.pulse || '').replace(/"/g, '""')}"`,
    `"${(a.arr_formatted || a.arr || '$0').replace(/"/g, '""')}"`,
    `"${(a.renewal_quarter || 'FY27 Q1').replace(/"/g, '""')}"`,
    `"${(a.last_modified || '').replace(/"/g, '""')}"`,
    `"${(a.comments || a.notes || '').replace(/"/g, '""')}"`
  ]);
  downloadCSV('Workload_Warriors_Customer_Portfolio.csv', [headers.join(','), ...rows.map(r => r.join(','))].join('\n'));
}

function downloadCSV(filename, csvContent) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function toggleTheme() {
  const body = document.body;
  const curr = body.getAttribute('data-theme') || 'dark';
  const next = curr === 'dark' ? 'light' : 'dark';
  body.setAttribute('data-theme', next);
}

function bootstrapApp() {
  initApp();
  handleHashRouting();
  window.addEventListener('hashchange', handleHashRouting);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
  bootstrapApp();
}
