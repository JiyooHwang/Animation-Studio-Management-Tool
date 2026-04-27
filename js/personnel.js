/* eslint-disable no-unused-vars */
// 인원 페이지 - 팀별 멤버 목록 + 월별 인원 변동값
const PersonnelPage = (function () {
  const STORE_MEMBERS = 'personnel.members.v2';   // { teamId: [name, ...] }
  const STORE_HEADCOUNT = 'personnel.headcount.v1'; // { teamId: { 'YYYY': { 'M': value } } }
  const STORE_FILTER = 'personnel.filter.v1';

  let mountEl = null;
  let members = {};
  let headcount = {};
  let filter = { year: 2026, project: 'ALL' };

  function init(rootEl) {
    mountEl = rootEl;
    members = Store.read(STORE_MEMBERS, {});
    headcount = Store.read(STORE_HEADCOUNT, {});
    const savedFilter = Store.read(STORE_FILTER, null);
    if (savedFilter) filter = Object.assign(filter, savedFilter);
    render();
  }

  function getCellValue(teamId, year, month) {
    return Store.getIn(headcount, `${teamId}.${year}.${month}`, '');
  }

  function setCellValue(teamId, year, month, value) {
    if (value === '' || value === null) {
      const yearObj = Store.getIn(headcount, `${teamId}.${year}`, null);
      if (yearObj) delete yearObj[month];
    } else {
      Store.setIn(headcount, `${teamId}.${year}.${month}`, value);
    }
    Store.write(STORE_HEADCOUNT, headcount);
  }

  function addMember(teamId, name) {
    if (!members[teamId]) members[teamId] = [];
    members[teamId].push(name);
    Store.write(STORE_MEMBERS, members);
    render();
  }

  function removeMember(teamId, idx) {
    if (!members[teamId]) return;
    members[teamId].splice(idx, 1);
    Store.write(STORE_MEMBERS, members);
    render();
  }

  function updateFilter(patch) {
    filter = Object.assign({}, filter, patch);
    Store.write(STORE_FILTER, filter);
    render();
  }

  function render() {
    if (!mountEl) return;

    const totalMembers = TEAMS.reduce(
      (acc, t) => acc + ((members[t.id] || []).length),
      0
    );

    mountEl.innerHTML = `
      <div class="topbar">
        <h1>팀별 인원 관리</h1>
        <div class="summary">전체 인원 <strong>${totalMembers}</strong>명</div>
      </div>
      ${renderFilters()}
      <div class="personnel-wrap">
        ${renderTable()}
      </div>
    `;

    bindFilters();
    bindTable();
  }

  function renderFilters() {
    const yearOpts = YEARS.map(
      (y) => `<option value="${y}" ${y === filter.year ? 'selected' : ''}>${y}</option>`
    ).join('');
    const projOpts = PROJECT_FILTERS.map(
      (p) =>
        `<option value="${p.value}" ${p.value === filter.project ? 'selected' : ''}>${p.label}</option>`
    ).join('');

    return `
      <div class="filters">
        <label>연도</label>
        <select id="p-year">${yearOpts}</select>
        <label>프로젝트</label>
        <select id="p-project">${projOpts}</select>
        <span class="spacer"></span>
        <button class="btn ghost" id="p-clear">월별 데이터 초기화</button>
      </div>
    `;
  }

  function renderTable() {
    const monthHeaders = MONTHS.map(
      (m) => `<th class="col-month">${m}</th>`
    ).join('');

    const rows = TEAMS.map((team) => renderRow(team)).join('');

    const totals = MONTHS.map((m) => {
      let sum = 0;
      TEAMS.forEach((t) => {
        const v = getCellValue(t.id, filter.year, m);
        if (v !== '' && !isNaN(Number(v))) sum += Number(v);
      });
      return `<td class="col-month">${sum.toFixed(1)}</td>`;
    }).join('');

    return `
      <table class="personnel-table">
        <thead>
          <tr>
            <th class="col-team">${filter.year}</th>
            <th class="col-role">${PROJECT_FILTERS.find(p => p.value === filter.project)?.label || ''}</th>
            <th class="col-members">팀 인원</th>
            ${monthHeaders}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td class="col-team" colspan="2" style="text-align:center;">합계</td>
            <td></td>
            ${totals}
          </tr>
        </tfoot>
      </table>
    `;
  }

  function renderRow(team) {
    const teamMembers = members[team.id] || [];
    const textColor = team.textColor || pickTextColor(team.color);

    const chips = teamMembers
      .map(
        (n, i) =>
          `<span class="member-chip">${escapeHtml(n)}<button data-action="remove-member" data-team="${team.id}" data-idx="${i}" type="button" title="제거">×</button></span>`
      )
      .join('');

    const cells = MONTHS.map((m) => {
      const v = getCellValue(team.id, filter.year, m);
      const num = v === '' ? null : Number(v);
      let cls = 'col-month';
      if (num === null || num === 0) cls += ' month-zero';
      else if (num > 0) cls += ' month-pos';
      else cls += ' month-neg';
      const display = num === null ? '0.0' : num.toFixed(1);
      return `<td class="${cls}"><input type="text" class="cell-input" data-team="${team.id}" data-month="${m}" value="${num === null ? '' : display}" placeholder="0.0"/></td>`;
    }).join('');

    return `
      <tr data-team="${team.id}">
        <td class="col-team">${escapeHtml(team.name)}</td>
        <td class="col-role" style="background:${team.color}; color:${textColor};">${escapeHtml(team.role)}</td>
        <td class="col-members">
          <div class="member-cell">
            ${chips}
            <form class="add-form" data-team="${team.id}">
              <input type="text" placeholder="이름" maxlength="20"/>
              <button type="submit">+</button>
            </form>
          </div>
        </td>
        ${cells}
      </tr>
    `;
  }

  function bindFilters() {
    const y = mountEl.querySelector('#p-year');
    const p = mountEl.querySelector('#p-project');
    if (y) y.addEventListener('change', (e) => updateFilter({ year: Number(e.target.value) }));
    if (p) p.addEventListener('change', (e) => updateFilter({ project: e.target.value }));
    const clr = mountEl.querySelector('#p-clear');
    if (clr) clr.addEventListener('click', () => {
      if (!confirm(`${filter.year}년 월별 데이터를 모두 지울까요? (인원 명단은 유지됨)`)) return;
      TEAMS.forEach((t) => {
        if (headcount[t.id]) delete headcount[t.id][filter.year];
      });
      Store.write(STORE_HEADCOUNT, headcount);
      render();
    });
  }

  function bindTable() {
    // member add forms
    mountEl.querySelectorAll('form.add-form').forEach((form) => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const teamId = form.dataset.team;
        const input = form.querySelector('input');
        const name = (input.value || '').trim();
        if (!name) return;
        addMember(teamId, name);
      });
    });

    // member remove
    mountEl.querySelectorAll('[data-action="remove-member"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        removeMember(btn.dataset.team, Number(btn.dataset.idx));
      });
    });

    // monthly cells
    mountEl.querySelectorAll('input.cell-input').forEach((input) => {
      input.addEventListener('change', () => {
        const teamId = input.dataset.team;
        const month = Number(input.dataset.month);
        const raw = input.value.trim();
        if (raw === '' || raw === '-' ) {
          setCellValue(teamId, filter.year, month, '');
        } else {
          const num = Number(raw);
          if (isNaN(num)) {
            input.value = '';
            setCellValue(teamId, filter.year, month, '');
          } else {
            setCellValue(teamId, filter.year, month, num);
          }
        }
        render();
      });
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return { init };
})();
