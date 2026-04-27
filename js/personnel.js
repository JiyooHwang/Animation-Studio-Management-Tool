/* eslint-disable no-unused-vars */
// 인원 페이지 - 팀별 월별/주별 인원 변동값
const PersonnelPage = (function () {
  const STORE_HEADCOUNT = 'personnel.headcount.v2'; // { teamId: { year: { month: { week: value } } } }
  const STORE_FILTER = 'personnel.filter.v2';
  const STORE_PERIOD = 'personnel.period.v1';

  const WEEKS_PER_MONTH = 4;
  const DEFAULT_PERIOD = { startYear: 2026, startMonth: 5, monthCount: 12 };

  let mountEl = null;
  let headcount = {};
  let filter = { project: 'ALL' };
  let period = Object.assign({}, DEFAULT_PERIOD);

  function init(rootEl) {
    mountEl = rootEl;
    headcount = Store.read(STORE_HEADCOUNT, {});
    const sf = Store.read(STORE_FILTER, null);
    if (sf) filter = Object.assign(filter, sf);
    const sp = Store.read(STORE_PERIOD, null);
    if (sp) period = Object.assign(period, sp);
    render();
  }

  // 보이는 기간의 (year, month) 리스트
  function periodMonths() {
    const out = [];
    let y = period.startYear;
    let m = period.startMonth;
    for (let i = 0; i < period.monthCount; i++) {
      out.push({ year: y, month: m });
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return out;
  }

  function getCellValue(teamId, year, month, week) {
    return Store.getIn(headcount, `${teamId}.${year}.${month}.${week}`, '');
  }

  function setCellValue(teamId, year, month, week, value) {
    if (value === '' || value === null) {
      const monthObj = Store.getIn(headcount, `${teamId}.${year}.${month}`, null);
      if (monthObj) delete monthObj[week];
    } else {
      Store.setIn(headcount, `${teamId}.${year}.${month}.${week}`, value);
    }
    Store.write(STORE_HEADCOUNT, headcount);
  }

  function addMonthEnd() {
    period.monthCount++;
    Store.write(STORE_PERIOD, period);
    render();
  }

  function removeMonthEnd() {
    if (period.monthCount <= 1) return;
    period.monthCount--;
    Store.write(STORE_PERIOD, period);
    render();
  }

  function setPeriodStart(year, month) {
    period.startYear = year;
    period.startMonth = month;
    Store.write(STORE_PERIOD, period);
    render();
  }

  function render() {
    if (!mountEl) return;
    const months = periodMonths();
    const last = months[months.length - 1];

    const periodLabel = `${period.startYear}.${pad(period.startMonth)} ~ ${last.year}.${pad(last.month)} (${period.monthCount}개월)`;

    mountEl.innerHTML = `
      <div class="topbar">
        <h1>팀별 인원 관리</h1>
        <div class="summary">기간 <strong>${periodLabel}</strong></div>
      </div>
      ${renderFilters()}
      <div class="personnel-wrap">
        ${renderTable(months)}
      </div>
    `;

    bindFilters();
    bindTable();
  }

  function renderFilters() {
    const projOpts = PROJECT_FILTERS.map(
      (p) => `<option value="${p.value}" ${p.value === filter.project ? 'selected' : ''}>${p.label}</option>`
    ).join('');

    const yearOpts = YEARS.map(
      (y) => `<option value="${y}" ${y === period.startYear ? 'selected' : ''}>${y}</option>`
    ).join('');
    const monthOpts = MONTHS.map(
      (m) => `<option value="${m}" ${m === period.startMonth ? 'selected' : ''}>${m}월</option>`
    ).join('');

    return `
      <div class="filters">
        <label>프로젝트</label>
        <select id="p-project">${projOpts}</select>
        <label>시작</label>
        <select id="p-start-year">${yearOpts}</select>
        <select id="p-start-month">${monthOpts}</select>
        <span class="spacer"></span>
        <button class="btn" id="p-add-month" type="button">+ 한 달 추가</button>
        <button class="btn ghost" id="p-remove-month" type="button">- 한 달 제거</button>
        <button class="btn ghost" id="p-clear" type="button">전체 데이터 초기화</button>
      </div>
    `;
  }

  function renderTable(months) {
    // year 그룹핑 (year 헤더 colspan 계산)
    const yearGroups = [];
    months.forEach((m) => {
      const last = yearGroups[yearGroups.length - 1];
      if (last && last.year === m.year) last.count++;
      else yearGroups.push({ year: m.year, count: 1 });
    });

    const yearHeaderCells = yearGroups.map(
      (g, gi) => {
        const isLastGroup = gi === yearGroups.length - 1;
        const cls = isLastGroup ? 'year-header' : 'year-header year-end';
        return `<th class="${cls}" colspan="${g.count * WEEKS_PER_MONTH}">${g.year}</th>`;
      }
    ).join('');

    const monthHeaderCells = months.map((m, mi) => {
      const nextSameYear = months[mi + 1] && months[mi + 1].year === m.year;
      const cls = nextSameYear ? 'month-header month-end' : 'month-header year-end';
      return `<th class="${cls}" colspan="${WEEKS_PER_MONTH}">${m.month}</th>`;
    }).join('');

    const weekHeaderCells = months.map((m, mi) => {
      const nextSameYear = months[mi + 1] && months[mi + 1].year === m.year;
      const groupEndCls = nextSameYear ? 'month-end' : 'year-end';
      return [1, 2, 3, 4]
        .map((w, wi) => {
          const cls = wi === 3 ? `week-header ${groupEndCls}` : 'week-header';
          return `<th class="${cls}">${w}</th>`;
        })
        .join('');
    }).join('');

    const rows = TEAMS.map((team) => renderRow(team, months)).join('');

    // 합계 row
    const totalCells = months.map((m, mi) => {
      const nextSameYear = months[mi + 1] && months[mi + 1].year === m.year;
      const groupEndCls = nextSameYear ? 'month-end' : 'year-end';
      return [1, 2, 3, 4].map((w, wi) => {
        let sum = 0;
        TEAMS.forEach((t) => {
          const v = getCellValue(t.id, m.year, m.month, w);
          if (v !== '' && !isNaN(Number(v))) sum += Number(v);
        });
        const cls = wi === 3 ? `col-week ${groupEndCls}` : 'col-week';
        return `<td class="${cls}">${sum === 0 ? '0.0' : sum.toFixed(1)}</td>`;
      }).join('');
    }).join('');

    return `
      <table class="personnel-table">
        <thead>
          <tr>
            <th class="corner-team" rowspan="3">팀</th>
            <th class="corner-role" rowspan="3">역할</th>
            ${yearHeaderCells}
          </tr>
          <tr>${monthHeaderCells}</tr>
          <tr>${weekHeaderCells}</tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td class="col-team" colspan="2" style="text-align:center;">합계</td>
            ${totalCells}
          </tr>
        </tfoot>
      </table>
    `;
  }

  function renderRow(team, months) {
    const textColor = team.textColor || pickTextColor(team.color);

    const cells = months.map((m, mi) => {
      const nextSameYear = months[mi + 1] && months[mi + 1].year === m.year;
      const groupEndCls = nextSameYear ? 'month-end' : 'year-end';

      return [1, 2, 3, 4].map((w, wi) => {
        const v = getCellValue(team.id, m.year, m.month, w);
        const num = v === '' ? null : Number(v);
        let cls = 'col-week';
        if (num === null || num === 0) cls += ' month-zero';
        else if (num > 0) cls += ' month-pos';
        else cls += ' month-neg';
        if (wi === 3) cls += ' ' + groupEndCls;
        const display = num === null ? '' : num.toFixed(1);
        return `<td class="${cls}"><input type="text" class="cell-input" data-team="${team.id}" data-year="${m.year}" data-month="${m.month}" data-week="${w}" value="${display}" placeholder="0.0"/></td>`;
      }).join('');
    }).join('');

    return `
      <tr data-team="${team.id}">
        <td class="col-team">${escapeHtml(team.name)}</td>
        <td class="col-role" style="background:${team.color}; color:${textColor};">${escapeHtml(team.role)}</td>
        ${cells}
      </tr>
    `;
  }

  function bindFilters() {
    const proj = mountEl.querySelector('#p-project');
    if (proj) proj.addEventListener('change', (e) => {
      filter.project = e.target.value;
      Store.write(STORE_FILTER, filter);
      render();
    });

    const sy = mountEl.querySelector('#p-start-year');
    const sm = mountEl.querySelector('#p-start-month');
    if (sy) sy.addEventListener('change', (e) => setPeriodStart(Number(e.target.value), period.startMonth));
    if (sm) sm.addEventListener('change', (e) => setPeriodStart(period.startYear, Number(e.target.value)));

    const addBtn = mountEl.querySelector('#p-add-month');
    if (addBtn) addBtn.addEventListener('click', addMonthEnd);

    const rmBtn = mountEl.querySelector('#p-remove-month');
    if (rmBtn) rmBtn.addEventListener('click', removeMonthEnd);

    const clr = mountEl.querySelector('#p-clear');
    if (clr) clr.addEventListener('click', () => {
      if (!confirm('전체 인원 데이터를 초기화할까요?')) return;
      headcount = {};
      Store.write(STORE_HEADCOUNT, headcount);
      render();
    });
  }

  function bindTable() {
    mountEl.querySelectorAll('input.cell-input').forEach((input) => {
      input.addEventListener('change', () => {
        const teamId = input.dataset.team;
        const year = Number(input.dataset.year);
        const month = Number(input.dataset.month);
        const week = Number(input.dataset.week);
        const raw = input.value.trim();
        if (raw === '' || raw === '-') {
          setCellValue(teamId, year, month, week, '');
        } else {
          const num = Number(raw);
          if (isNaN(num)) {
            setCellValue(teamId, year, month, week, '');
          } else {
            setCellValue(teamId, year, month, week, num);
          }
        }
        render();
      });
    });
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return { init };
})();
