/* eslint-disable no-unused-vars */
// 본부인원 페이지 - 전체 직원 명단
// - 행: 한 명의 직원 (고용구분/성명/직책/계약종료일/팀/월별/비고)
// - 월별 값: 1=재직, 0=비재직, 빈칸=미설정 (합계는 숫자 합)
const RosterPage = (function () {
  const STORE_LIST = 'roster.list.v1';
  const STORE_PERIOD = 'roster.period.v1';
  const DEFAULT_PERIOD = { startYear: 2025, startMonth: 11, monthCount: 14 };

  const EMP_TYPES = ['임원', '정규직', '계약직', '휴직'];
  const POSITIONS = ['부사장/본부장', '실장', '팀장', '파트장', '팀원'];
  const MANAGER_POSITIONS = ['부사장/본부장', '실장', '팀장', '파트장'];

  let mountEl = null;
  let people = [];
  let period = Object.assign({}, DEFAULT_PERIOD);

  function init(rootEl) {
    mountEl = rootEl;
    people = Store.read(STORE_LIST, []);
    if (!Array.isArray(people)) people = [];
    const sp = Store.read(STORE_PERIOD, null);
    if (sp) period = Object.assign({}, period, sp);
    render();
  }

  function persist() {
    Store.write(STORE_LIST, people);
  }
  function persistPeriod() {
    Store.write(STORE_PERIOD, period);
  }

  function periodMonths() {
    const out = [];
    let y = period.startYear, m = period.startMonth;
    for (let i = 0; i < period.monthCount; i++) {
      out.push({ year: y, month: m });
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return out;
  }

  function monthKey(y, m) { return `${y}-${m}`; }

  function defaultPersonMonthly() {
    const obj = {};
    periodMonths().forEach(({ year, month }) => { obj[monthKey(year, month)] = 1; });
    return obj;
  }

  function teamLabel(team) { return team.name || team.role; }

  function addPerson() {
    people.push({
      id: 'emp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      empType: '정규직',
      name: '',
      position: '팀원',
      contractEnd: '',
      leaveStart: '',
      leaveEnd: '',
      teamId: TEAMS[0] ? TEAMS[0].id : '',
      monthly: defaultPersonMonthly(),
      note: '',
    });
    persist();
    render();
  }

  function addPeople(n) {
    for (let i = 0; i < n; i++) addPerson();
  }

  function deletePerson(id) {
    people = people.filter((p) => p.id !== id);
    persist();
    render();
  }

  function updatePerson(id, patch) {
    const idx = people.findIndex((p) => p.id === id);
    if (idx < 0) return;
    people[idx] = Object.assign({}, people[idx], patch);
    persist();
  }

  function setMonthValue(id, year, month, value) {
    const idx = people.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const p = people[idx];
    const monthly = Object.assign({}, p.monthly || {});
    const k = monthKey(year, month);
    if (value === '' || value === null || value === undefined) delete monthly[k];
    else monthly[k] = Number(value);
    people[idx] = Object.assign({}, p, { monthly });
    persist();
  }

  function render() {
    if (!mountEl) return;
    const months = periodMonths();
    const last = months[months.length - 1];

    mountEl.innerHTML = `
      <div class="topbar">
        <h1>본부 인원 (직원 명단)</h1>
        <div class="summary">
          기간 <strong>${period.startYear}.${pad(period.startMonth)} ~ ${last.year}.${pad(last.month)}</strong>
          · 등록 행 ${people.length}건
        </div>
      </div>
      ${renderToolbar()}
      <div class="roster-wrap">
        ${renderTable(months)}
      </div>
    `;
    bindEvents();
  }

  function renderToolbar() {
    const yearOpts = YEARS.map(
      (y) => `<option value="${y}" ${y === period.startYear ? 'selected' : ''}>${y}</option>`
    ).join('');
    const monthOpts = MONTHS.map(
      (m) => `<option value="${m}" ${m === period.startMonth ? 'selected' : ''}>${m}월</option>`
    ).join('');

    return `
      <div class="roster-toolbar">
        <button class="btn primary" id="r-add" type="button">+ 행 추가</button>
        <button class="btn" id="r-add10" type="button">+ 10행 추가</button>
        <button class="btn ghost" id="r-remove-last" type="button">- 마지막 행 제거</button>
        <span class="spacer" style="flex:1;"></span>
        <label style="font-size:11px; color:var(--text-dim);">시작</label>
        <select id="r-start-year">${yearOpts}</select>
        <select id="r-start-month">${monthOpts}</select>
        <button class="btn" id="r-add-month" type="button">+ 한 달 추가</button>
        <button class="btn ghost" id="r-remove-month" type="button">- 한 달 제거</button>
      </div>
    `;
  }

  function renderTable(months) {
    if (people.length === 0) {
      return `<div class="roster-empty">아직 등록된 인원이 없습니다. <strong>+ 행 추가</strong> 버튼으로 인원을 추가하세요.</div>`;
    }

    // 헤더 - year 그룹핑
    const yearGroups = [];
    months.forEach((m) => {
      const last = yearGroups[yearGroups.length - 1];
      if (last && last.year === m.year) last.count++;
      else yearGroups.push({ year: m.year, count: 1 });
    });

    const yearHeaderCells = yearGroups.map((g, gi) => {
      const cls = gi === yearGroups.length - 1 ? 'year-header' : 'year-header year-end';
      return `<th class="${cls}" colspan="${g.count}">${g.year}</th>`;
    }).join('');

    const monthHeaderCells = months.map((m, mi) => {
      const isYearEnd = mi < months.length - 1 && months[mi + 1].year !== m.year;
      const cls = isYearEnd ? 'month-header year-end' : 'month-header';
      return `<th class="${cls}">${m.month}월</th>`;
    }).join('');

    // 합계 row - 해당 월에 재직 중인 전체 인원 (휴직 중인 인원은 자동 제외)
    const sumCells = months.map((m, mi) => {
      let s = 0;
      people.forEach((p) => {
        s += RosterData.effectiveMonthly(p, m.year, m.month);
      });
      const isYearEnd = mi < months.length - 1 && months[mi + 1].year !== m.year;
      const cls = isYearEnd ? 'sum-header year-end' : 'sum-header';
      return `<th class="${cls}">${formatSum(s)}</th>`;
    }).join('');

    const bodyRows = people.map((p) => renderPersonRow(p, months)).join('');

    return `
      <table class="roster-table">
        <thead>
          <tr>
            <th rowspan="3" class="col-actions col-actions-left">삭제</th>
            <th rowspan="3" class="col-empType">고용구분</th>
            <th rowspan="3" class="col-name">성명</th>
            <th rowspan="3" class="col-position">직책</th>
            <th rowspan="3" class="col-contract">계약/휴직 기간</th>
            <th rowspan="3" class="col-team">팀</th>
            ${yearHeaderCells}
            <th rowspan="3" class="col-note">비고</th>
          </tr>
          <tr>${monthHeaderCells}</tr>
          <tr>${sumCells}</tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    `;
  }

  function renderPersonRow(p, months) {
    const empOpts = EMP_TYPES.map(
      (e) => `<option value="${e}" ${e === p.empType ? 'selected' : ''}>${e}</option>`
    ).join('');
    const posOpts = POSITIONS.map(
      (pos) => `<option value="${pos}" ${pos === p.position ? 'selected' : ''}>${pos}</option>`
    ).join('');
    const teamOpts = TEAMS.map(
      (t) => `<option value="${t.id}" ${t.id === p.teamId ? 'selected' : ''}>${escapeHtml(teamLabel(t))}</option>`
    ).join('');

    const monthCells = months.map((m, mi) => {
      const onLeave = RosterData.isOnLeave(p, m.year, m.month);
      const v = (p.monthly || {})[monthKey(m.year, m.month)];
      const display = (v === undefined || v === null || v === '') ? '' : String(v);
      const isZero = display !== '' && Number(v) === 0;
      const isYearEnd = mi < months.length - 1 && months[mi + 1].year !== m.year;
      const cls = ['col-month',
        onLeave ? 'cell-leave' : '',
        !onLeave && isZero ? 'cell-zero' : '',
        isYearEnd ? 'year-end' : ''].filter(Boolean).join(' ');
      if (onLeave) {
        // 휴직 중인 월은 입력 불가, "휴" 표시 (저장된 값은 유지)
        return `<td class="${cls}" title="휴직 중 (인원 카운트 제외)">휴</td>`;
      }
      return `<td class="${cls}"><input class="roster-month-input" type="text" data-action="month" data-id="${p.id}" data-year="${m.year}" data-month="${m.month}" value="${display}" placeholder=""/></td>`;
    }).join('');

    const isManager = MANAGER_POSITIONS.includes(p.position);
    const rowCls = isManager ? 'row-manager' : '';
    const empCls = `empType-${p.empType}`;

    // 계약/휴직 컬럼 - empType에 따라 동적
    let contractCell;
    if (p.empType === '계약직') {
      contractCell = `<input class="roster-input text-center" type="text" data-action="contractEnd" data-id="${p.id}" value="${escapeHtml(p.contractEnd || '')}" placeholder="YYYY-MM-DD" />`;
    } else if (p.empType === '휴직') {
      contractCell = `
        <div class="leave-period">
          <input class="roster-leave-input" type="month" data-action="leaveStart" data-id="${p.id}" value="${escapeHtml(p.leaveStart || '')}" title="휴직 시작 (YYYY-MM)" />
          <span class="leave-sep">~</span>
          <input class="roster-leave-input" type="month" data-action="leaveEnd" data-id="${p.id}" value="${escapeHtml(p.leaveEnd || '')}" title="휴직 종료 (YYYY-MM)" />
        </div>`;
    } else {
      contractCell = `<span class="cell-dash">-</span>`;
    }

    return `
      <tr class="${rowCls}" data-id="${p.id}">
        <td class="col-actions col-actions-left">
          <button class="btn-roster-del" type="button" data-action="del" data-id="${p.id}" title="행 삭제">×</button>
        </td>
        <td class="col-empType ${empCls}">
          <select class="roster-select" data-action="empType" data-id="${p.id}">${empOpts}</select>
        </td>
        <td class="col-name">
          <input class="roster-input" type="text" data-action="name" data-id="${p.id}" value="${escapeHtml(p.name)}" placeholder="이름" />
        </td>
        <td class="col-position">
          <select class="roster-select" data-action="position" data-id="${p.id}">${posOpts}</select>
        </td>
        <td class="col-contract">${contractCell}</td>
        <td class="col-team">
          <select class="roster-select" data-action="teamId" data-id="${p.id}">${teamOpts}</select>
        </td>
        ${monthCells}
        <td class="col-note">
          <input class="roster-input" type="text" data-action="note" data-id="${p.id}" value="${escapeHtml(p.note || '')}" placeholder="" />
        </td>
      </tr>
    `;
  }

  function bindEvents() {
    const addBtn = mountEl.querySelector('#r-add');
    if (addBtn) addBtn.addEventListener('click', addPerson);
    const add10 = mountEl.querySelector('#r-add10');
    if (add10) add10.addEventListener('click', () => addPeople(10));
    const rmLast = mountEl.querySelector('#r-remove-last');
    if (rmLast) rmLast.addEventListener('click', () => {
      if (people.length === 0) return;
      const last = people[people.length - 1];
      const name = last && last.name ? last.name : '마지막 행';
      if (!confirm(`"${name}" 을(를) 삭제할까요?`)) return;
      deletePerson(last.id);
    });

    const sy = mountEl.querySelector('#r-start-year');
    const sm = mountEl.querySelector('#r-start-month');
    if (sy) sy.addEventListener('change', (e) => {
      period.startYear = Number(e.target.value);
      persistPeriod();
      render();
    });
    if (sm) sm.addEventListener('change', (e) => {
      period.startMonth = Number(e.target.value);
      persistPeriod();
      render();
    });

    const addM = mountEl.querySelector('#r-add-month');
    const rmM = mountEl.querySelector('#r-remove-month');
    if (addM) addM.addEventListener('click', () => {
      period.monthCount++;
      persistPeriod();
      render();
    });
    if (rmM) rmM.addEventListener('click', () => {
      if (period.monthCount <= 1) return;
      period.monthCount--;
      persistPeriod();
      render();
    });

    // 행 삭제
    mountEl.querySelectorAll('[data-action="del"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const p = people.find((x) => x.id === id);
        const name = p && p.name ? p.name : '이 행';
        if (!confirm(`"${name}" 을(를) 삭제할까요?`)) return;
        deletePerson(id);
      });
    });

    // 텍스트/셀렉트 필드 (재렌더 필요한 항목: empType / position / teamId)
    mountEl.querySelectorAll('[data-action="empType"], [data-action="position"], [data-action="teamId"]').forEach((el) => {
      el.addEventListener('change', () => {
        const id = el.dataset.id;
        const action = el.dataset.action;
        updatePerson(id, { [action]: el.value });
        render();
      });
    });

    // 텍스트 필드 (재렌더 불필요: name / note / contractEnd)
    mountEl.querySelectorAll('[data-action="name"], [data-action="note"], [data-action="contractEnd"]').forEach((input) => {
      input.addEventListener('change', () => {
        const id = input.dataset.id;
        const action = input.dataset.action;
        updatePerson(id, { [action]: input.value });
      });
    });

    // 휴직 기간 입력 (재렌더 필요: 월별 셀의 휴직 표시 갱신)
    mountEl.querySelectorAll('[data-action="leaveStart"], [data-action="leaveEnd"]').forEach((input) => {
      input.addEventListener('change', () => {
        const id = input.dataset.id;
        const action = input.dataset.action;
        updatePerson(id, { [action]: input.value });
        render();
      });
    });

    // 월별 셀
    mountEl.querySelectorAll('input.roster-month-input').forEach((input) => {
      input.addEventListener('change', () => {
        const id = input.dataset.id;
        const y = Number(input.dataset.year);
        const m = Number(input.dataset.month);
        const raw = input.value.trim();
        if (raw === '') {
          setMonthValue(id, y, m, '');
        } else {
          const num = Number(raw);
          setMonthValue(id, y, m, isNaN(num) ? '' : num);
        }
        // 합계 셀과 zero-cell 색을 갱신하기 위해 재렌더
        render();
      });
    });
  }

  function formatSum(n) {
    // 정수면 정수로, 아니면 1자리 소수
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
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
