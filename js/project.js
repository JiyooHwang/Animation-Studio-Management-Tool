/* eslint-disable no-unused-vars */
// 프로젝트 상세 페이지
// - 프로젝트 선택
// - 제목 편집 (Projects.setName 으로 동기화)
// - 주당단가 (premium / standard) 편집 → Projects.setRates
// - 투입 인력 행 추가/삭제, 행마다 역할/내부외주/주별 리소스 수
// - 자동 계산: 리소스합 × 단가 = 비용 (내부 또는 외주에 들어감)
const ProjectPage = (function () {
  const STORE_ROWS = 'project.rows.v1';     // { projectId: [ { id, teamId, kind, weeks: { 'YYYY-MM-W': n }, rateOverride? } ] }
  const STORE_FILTER = 'project.filter.v1'; // { projectId, period }
  const WEEKS_PER_MONTH = 4;
  const DEFAULT_PERIOD = { startYear: 2026, startMonth: 4, monthCount: 9 };

  let mountEl = null;
  let allRows = {};
  let state = {
    projectId: 'toema2',
    period: Object.assign({}, DEFAULT_PERIOD),
  };

  function init(rootEl) {
    mountEl = rootEl;
    allRows = Store.read(STORE_ROWS, {});
    const sf = Store.read(STORE_FILTER, null);
    if (sf) {
      if (sf.projectId) state.projectId = sf.projectId;
      if (sf.period) state.period = Object.assign(state.period, sf.period);
    }
    render();
  }

  function persistFilter() {
    Store.write(STORE_FILTER, state);
  }

  function persistRows() {
    Store.write(STORE_ROWS, allRows);
  }

  function rowsForCurrent() {
    return allRows[state.projectId] || [];
  }

  function setRowsForCurrent(rows) {
    allRows[state.projectId] = rows;
    persistRows();
  }

  function periodMonths() {
    const out = [];
    let y = state.period.startYear;
    let m = state.period.startMonth;
    for (let i = 0; i < state.period.monthCount; i++) {
      out.push({ year: y, month: m });
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return out;
  }

  function weekKey(year, month, week) {
    return `${year}-${month}-${week}`;
  }

  function rowResources(row) {
    let s = 0;
    if (!row || !row.weeks) return 0;
    Object.values(row.weeks).forEach((v) => { s += Number(v) || 0; });
    return s;
  }

  function rowRate(row) {
    if (row && row.rateOverride !== undefined && row.rateOverride !== null && row.rateOverride !== '') {
      return Number(row.rateOverride) || 0;
    }
    return Projects.rateFor(row && row.teamId);
  }

  function rowCost(row) {
    return rowResources(row) * rowRate(row);
  }

  function addRow() {
    const rows = rowsForCurrent().slice();
    rows.push({
      id: 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      teamId: 'producer',
      kind: '내부',
      weeks: {},
    });
    setRowsForCurrent(rows);
    render();
  }

  function deleteRow(rowId) {
    const rows = rowsForCurrent().filter((r) => r.id !== rowId);
    setRowsForCurrent(rows);
    render();
  }

  function updateRow(rowId, patch) {
    const rows = rowsForCurrent().map((r) => (r.id === rowId ? Object.assign({}, r, patch) : r));
    setRowsForCurrent(rows);
  }

  function setWeek(rowId, year, month, week, value) {
    const rows = rowsForCurrent().map((r) => {
      if (r.id !== rowId) return r;
      const weeks = Object.assign({}, r.weeks || {});
      const k = weekKey(year, month, week);
      if (value === '' || value === 0 || value === null) delete weeks[k];
      else weeks[k] = Number(value);
      return Object.assign({}, r, { weeks });
    });
    setRowsForCurrent(rows);
  }

  function render() {
    if (!mountEl) return;
    const months = periodMonths();
    const last = months[months.length - 1];
    const projectName = Projects.getName(state.projectId);

    mountEl.innerHTML = `
      <div class="topbar">
        <h1>프로젝트 상세</h1>
        <div class="summary">기간 <strong>${state.period.startYear}.${pad(state.period.startMonth)} ~ ${last.year}.${pad(last.month)}</strong> (${state.period.monthCount}개월)</div>
      </div>
      ${renderProjectMeta(projectName)}
      ${renderToolbar()}
      <div class="project-wrap">
        ${renderTable(months)}
      </div>
    `;

    bindEvents();
  }

  function renderProjectMeta(projectName) {
    const projOpts = Projects.list().map(
      (p) => `<option value="${p.id}" ${p.id === state.projectId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
    ).join('');

    const rates = Projects.getRates();

    return `
      <div class="project-meta">
        <div>
          <div class="project-title-row">
            <span class="label">Project</span>
            <select id="proj-select" class="proj-select-row" style="max-width:200px; text-align:left; padding-left:8px;">${projOpts}</select>
          </div>
          <div class="project-title-row" style="margin-top:6px;">
            <span class="label">제목</span>
            <input class="project-title-input" id="proj-title" type="text" value="${escapeHtml(projectName)}" placeholder="프로젝트 제목" />
          </div>
        </div>
        <div class="rate-config">
          <label>주당단가 (본부장)</label>
          <input id="rate-exec" type="text" value="${formatNumber(rates.exec)}" />
          <label>주당단가 (PD,SUP,Dr,IPB)</label>
          <input id="rate-premium" type="text" value="${formatNumber(rates.premium)}" />
          <label>주당단가 (그 외 부서)</label>
          <input id="rate-standard" type="text" value="${formatNumber(rates.standard)}" />
        </div>
      </div>
    `;
  }

  function renderToolbar() {
    const yearOpts = YEARS.map(
      (y) => `<option value="${y}" ${y === state.period.startYear ? 'selected' : ''}>${y}</option>`
    ).join('');
    const monthOpts = MONTHS.map(
      (m) => `<option value="${m}" ${m === state.period.startMonth ? 'selected' : ''}>${m}월</option>`
    ).join('');

    return `
      <div class="project-toolbar">
        <button class="btn primary" id="proj-add-row" type="button">+ 행 추가</button>
        <span class="spacer" style="flex:1;"></span>
        <label style="font-size:11px; color:var(--text-dim);">시작</label>
        <select id="proj-start-year">${yearOpts}</select>
        <select id="proj-start-month">${monthOpts}</select>
        <button class="btn" id="proj-add-month" type="button">+ 한 달 추가</button>
        <button class="btn ghost" id="proj-remove-month" type="button">- 한 달 제거</button>
      </div>
    `;
  }

  function renderTable(months) {
    const rows = rowsForCurrent();
    const totalCost = rows.reduce((s, r) => s + rowCost(r), 0);
    const totalInternal = rows.filter((r) => r.kind === '내부').reduce((s, r) => s + rowCost(r), 0);
    const totalExternal = rows.filter((r) => r.kind === '외주').reduce((s, r) => s + rowCost(r), 0);

    // 주별 헤더
    const yearGroups = [];
    months.forEach((m) => {
      const last = yearGroups[yearGroups.length - 1];
      if (last && last.year === m.year) last.count++;
      else yearGroups.push({ year: m.year, count: 1 });
    });
    const yearHeaderCells = yearGroups.map((g, gi) => {
      const cls = gi === yearGroups.length - 1 ? 'header-yellow' : 'header-yellow year-end';
      return `<th class="${cls}" colspan="${g.count * WEEKS_PER_MONTH}">${g.year}</th>`;
    }).join('');
    const monthHeaderCells = months.map((m, mi) => {
      const nextSameYear = months[mi + 1] && months[mi + 1].year === m.year;
      const cls = nextSameYear ? 'month-end' : 'year-end';
      return `<th class="${cls}" colspan="${WEEKS_PER_MONTH}">${m.month}</th>`;
    }).join('');
    const weekHeaderCells = months.map((m, mi) => {
      const nextSameYear = months[mi + 1] && months[mi + 1].year === m.year;
      const groupEnd = nextSameYear ? 'month-end' : 'year-end';
      return [1, 2, 3, 4].map((w, wi) => {
        const woy = weekOfYear(m.month, w);
        const cls = wi === 3 ? `week-header ${groupEnd}` : 'week-header';
        return `<th class="${cls}">${woy}</th>`;
      }).join('');
    }).join('');

    const headerLeft = `
      <th class="col-pct" rowspan="3">%</th>
      <th class="col-role" rowspan="3">역할</th>
      <th class="col-kind" rowspan="3">분류</th>
      <th class="col-resource" rowspan="3">리소스합</th>
      <th class="col-rate" rowspan="3">주당단가</th>
      <th class="col-cost" rowspan="3">내부비용</th>
      <th class="col-cost" rowspan="3">외주비용</th>
    `;
    const headerRight = `<th class="col-actions" rowspan="3"></th>`;

    let bodyRows;
    if (rows.length === 0) {
      const totalCols = 7 + months.length * WEEKS_PER_MONTH + 1;
      bodyRows = `<tr><td colspan="${totalCols}" class="empty-rows-note">+ 행 추가 버튼으로 투입 인력을 입력하세요.</td></tr>`;
    } else {
      bodyRows = rows.map((row) => renderRow(row, months, totalCost)).join('');
    }

    // 합계 row
    const totalsWeek = months.map((m, mi) => {
      const nextSameYear = months[mi + 1] && months[mi + 1].year === m.year;
      const groupEnd = nextSameYear ? 'month-end' : 'year-end';
      return [1, 2, 3, 4].map((w, wi) => {
        let s = 0;
        rows.forEach((r) => { s += Number((r.weeks || {})[weekKey(m.year, m.month, w)]) || 0; });
        const cls = wi === 3 ? `col-week ${groupEnd}` : 'col-week';
        return `<td class="${cls}">${s ? s : ''}</td>`;
      }).join('');
    }).join('');

    return `
      <table class="project-table">
        <thead>
          <tr>${headerLeft}${yearHeaderCells}${headerRight}</tr>
          <tr>${monthHeaderCells}</tr>
          <tr>${weekHeaderCells}</tr>
        </thead>
        <tbody>${bodyRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="text-align:center;">합계</td>
            <td class="col-resource">${rows.reduce((s, r) => s + rowResources(r), 0) || ''}</td>
            <td class="col-rate"></td>
            <td class="col-cost">${formatNumber(totalInternal, { zeroAsBlank: true })}</td>
            <td class="col-cost">${formatNumber(totalExternal, { zeroAsBlank: true })}</td>
            ${totalsWeek}
            <td></td>
          </tr>
          <tr>
            <td colspan="3" style="text-align:center;">총비용</td>
            <td colspan="${4 + months.length * WEEKS_PER_MONTH + 1}" style="text-align:right; padding-right:14px; background:#fff7a8;">${formatNumber(totalCost)}</td>
          </tr>
        </tfoot>
      </table>
    `;
  }

  function renderRow(row, months, totalCost) {
    const team = getTeam(row.teamId);
    const color = team ? team.color : '#fff';
    const textColor = team ? (team.textColor || pickTextColor(team.color)) : '#1f1f1f';

    const teamOpts = TEAMS.map(
      (t) => `<option value="${t.id}" ${t.id === row.teamId ? 'selected' : ''}>${escapeHtml(t.role)}</option>`
    ).join('');

    const resources = rowResources(row);
    const rate = rowRate(row);
    const cost = resources * rate;
    const pct = totalCost > 0 ? (cost / totalCost * 100) : 0;
    const isInternal = row.kind === '내부';

    const weekCells = months.map((m, mi) => {
      const nextSameYear = months[mi + 1] && months[mi + 1].year === m.year;
      const groupEnd = nextSameYear ? 'month-end' : 'year-end';
      return [1, 2, 3, 4].map((w, wi) => {
        const v = (row.weeks || {})[weekKey(m.year, m.month, w)] || '';
        const cls = wi === 3 ? `col-week ${groupEnd}` : 'col-week';
        const styleBg = v && team ? `style="background:${color}; color:${textColor};"` : '';
        return `<td class="${cls}" ${styleBg}><input class="proj-row-input" type="text" data-action="week" data-row="${row.id}" data-year="${m.year}" data-month="${m.month}" data-week="${w}" value="${v || ''}" placeholder=""/></td>`;
      }).join('');
    }).join('');

    return `
      <tr class="has-color" data-row="${row.id}">
        <td class="col-pct">${pct ? pct.toFixed(1) + '%' : ''}</td>
        <td class="col-role" style="background:${color}; color:${textColor};">
          <select class="proj-select-row" data-action="team" data-row="${row.id}">${teamOpts}</select>
        </td>
        <td class="col-kind">
          <select class="proj-kind-select" data-action="kind" data-row="${row.id}">
            <option value="내부" ${isInternal ? 'selected' : ''}>내부</option>
            <option value="외주" ${!isInternal ? 'selected' : ''}>외주</option>
          </select>
        </td>
        <td class="col-resource">${resources || ''}</td>
        <td class="col-rate"><input class="proj-rate-input" type="text" data-action="rate" data-row="${row.id}" value="${row.rateOverride !== undefined && row.rateOverride !== '' && row.rateOverride !== null ? formatNumber(row.rateOverride) : formatNumber(rate)}" /></td>
        <td class="col-cost">${isInternal ? formatNumber(cost, { zeroAsBlank: true }) : ''}</td>
        <td class="col-cost">${!isInternal ? formatNumber(cost, { zeroAsBlank: true }) : ''}</td>
        ${weekCells}
        <td class="col-actions"><button class="btn-row-del" data-action="del" data-row="${row.id}" type="button" title="행 삭제">×</button></td>
      </tr>
    `;
  }

  function bindEvents() {
    const projSel = mountEl.querySelector('#proj-select');
    if (projSel) projSel.addEventListener('change', (e) => {
      state.projectId = e.target.value;
      persistFilter();
      render();
    });

    const titleInput = mountEl.querySelector('#proj-title');
    if (titleInput) titleInput.addEventListener('change', () => {
      Projects.setName(state.projectId, titleInput.value);
      render();
    });

    const rateExec = mountEl.querySelector('#rate-exec');
    const ratePremium = mountEl.querySelector('#rate-premium');
    const rateStandard = mountEl.querySelector('#rate-standard');
    if (rateExec) rateExec.addEventListener('change', () => {
      const r = Projects.getRates();
      r.exec = parseNumber(rateExec.value);
      Projects.setRates(r);
      render();
    });
    if (ratePremium) ratePremium.addEventListener('change', () => {
      const r = Projects.getRates();
      r.premium = parseNumber(ratePremium.value);
      Projects.setRates(r);
      render();
    });
    if (rateStandard) rateStandard.addEventListener('change', () => {
      const r = Projects.getRates();
      r.standard = parseNumber(rateStandard.value);
      Projects.setRates(r);
      render();
    });

    const sy = mountEl.querySelector('#proj-start-year');
    const sm = mountEl.querySelector('#proj-start-month');
    if (sy) sy.addEventListener('change', (e) => {
      state.period.startYear = Number(e.target.value);
      persistFilter();
      render();
    });
    if (sm) sm.addEventListener('change', (e) => {
      state.period.startMonth = Number(e.target.value);
      persistFilter();
      render();
    });

    const addM = mountEl.querySelector('#proj-add-month');
    const rmM = mountEl.querySelector('#proj-remove-month');
    if (addM) addM.addEventListener('click', () => {
      state.period.monthCount++;
      persistFilter();
      render();
    });
    if (rmM) rmM.addEventListener('click', () => {
      if (state.period.monthCount <= 1) return;
      state.period.monthCount--;
      persistFilter();
      render();
    });

    const addR = mountEl.querySelector('#proj-add-row');
    if (addR) addR.addEventListener('click', addRow);

    mountEl.querySelectorAll('[data-action="team"]').forEach((sel) => {
      sel.addEventListener('change', () => {
        updateRow(sel.dataset.row, { teamId: sel.value });
        render();
      });
    });
    mountEl.querySelectorAll('[data-action="kind"]').forEach((sel) => {
      sel.addEventListener('change', () => {
        updateRow(sel.dataset.row, { kind: sel.value });
        render();
      });
    });
    mountEl.querySelectorAll('[data-action="rate"]').forEach((input) => {
      input.addEventListener('change', () => {
        const v = input.value.trim();
        const num = v === '' ? null : parseNumber(v);
        updateRow(input.dataset.row, { rateOverride: num });
        render();
      });
    });
    mountEl.querySelectorAll('[data-action="week"]').forEach((input) => {
      input.addEventListener('change', () => {
        const num = parseNumber(input.value);
        setWeek(
          input.dataset.row,
          Number(input.dataset.year),
          Number(input.dataset.month),
          Number(input.dataset.week),
          num
        );
        render();
      });
    });
    mountEl.querySelectorAll('[data-action="del"]').forEach((btn) => {
      btn.addEventListener('click', () => deleteRow(btn.dataset.row));
    });
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return { init };
})();
