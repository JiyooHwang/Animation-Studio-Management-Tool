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
    const projOpts = Projects.filterOptions().map(
      (p) => `<option value="${p.value}" ${p.value === filter.project ? 'selected' : ''}>${escapeHtml(p.label)}</option>`
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
        <span style="font-size:11px; color:var(--text-dim); margin-left:10px;">※ 본부인원 - 프로젝트 투입 = 잉여(+) / 부족(-)</span>
      </div>
    `;
  }

  // 셀 값 계산: 본부인원의 팀별 가용 - 프로젝트의 그 주 투입
  // 잉여(+) / 부족(-) — 양수=빨강, 음수=파랑
  function cellValueFor(teamId, year, month, week) {
    const available = RosterData.countForTeamMonth(teamId, year, month);
    const allocated = ProjectData.headcountFor(teamId, year, month, week, filter.project);
    return available - allocated;
  }

  // +/- 포맷팅
  function formatCell(num) {
    if (num === 0) return '0';
    const abs = Math.abs(num);
    const str = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
    return num > 0 ? `+${str}` : `-${str}`;
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

    // 합계 row - 모든 팀의 잉여/부족 합산
    const totalCells = months.map((m, mi) => {
      const nextSameYear = months[mi + 1] && months[mi + 1].year === m.year;
      const groupEndCls = nextSameYear ? 'month-end' : 'year-end';
      return [1, 2, 3, 4].map((w, wi) => {
        let sum = 0;
        TEAMS.forEach((t) => {
          sum += cellValueFor(t.id, m.year, m.month, w);
        });
        let cls = 'col-week';
        if (sum > 0) cls += ' month-pos';
        else if (sum < 0) cls += ' month-neg';
        else cls += ' month-zero';
        if (wi === 3) cls += ' ' + groupEndCls;
        return `<td class="${cls}">${formatCell(sum)}</td>`;
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

    // 본부인원(가용) - 프로젝트 투입 = 잉여(+) / 부족(-)
    const cells = months.map((m, mi) => {
      const nextSameYear = months[mi + 1] && months[mi + 1].year === m.year;
      const groupEndCls = nextSameYear ? 'month-end' : 'year-end';

      return [1, 2, 3, 4].map((w, wi) => {
        const available = RosterData.countForTeamMonth(team.id, m.year, m.month);
        const allocated = ProjectData.headcountFor(team.id, m.year, m.month, w, filter.project);
        const num = available - allocated;
        let cls = 'col-week';
        if (num === 0) cls += ' month-zero';
        else if (num > 0) cls += ' month-pos';
        else cls += ' month-neg';
        if (wi === 3) cls += ' ' + groupEndCls;
        const tip = `본부 가용 ${available} - 투입 ${allocated.toFixed(1)} = ${num > 0 ? '+' : ''}${num.toFixed(1)}`;
        return `<td class="${cls}" title="${tip}">${formatCell(num)}</td>`;
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
  }

  function bindTable() {
    // 셀이 read-only이므로 입력 바인딩 없음 (값은 ProjectData에서 derive)
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
