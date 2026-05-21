/* eslint-disable no-unused-vars */
// 본부인원 페이지 - 전체 직원 명단
// - 행: 한 명의 직원 (고용구분/성명/직책/계약종료일/팀/월별/비고)
// - 월별 값: 1=재직, 0=비재직, 빈칸=미설정 (합계는 숫자 합)
const RosterPage = (function () {
  const STORE_LIST = 'roster.list.v1';
  const STORE_PERIOD = 'roster.period.v1';
  const STORE_VIEW = 'roster.viewMode.v1';
  const DEFAULT_PERIOD = { startYear: 2025, startMonth: 11, monthCount: 14 };

  const EMP_TYPES = ['임원', '정규직', '계약직', '휴직', '퇴사자'];
  const POSITIONS = ['부사장/본부장', '실장', '팀장', '파트장', '팀원'];
  const MANAGER_POSITIONS = ['부사장/본부장', '실장', '팀장', '파트장'];
  const VIEW_MODES = ['day', 'week', 'month'];
  const VIEW_LABELS = { day: '일', week: '주', month: '월' };
  const WEEKS_PER_MONTH = 4;

  let mountEl = null;
  let people = [];
  let period = Object.assign({}, DEFAULT_PERIOD);
  let viewMode = 'month'; // 'day' | 'week' | 'month' (기본 = 현재 동작인 월별)
  let teamsModalOpen = false;

  function init(rootEl) {
    mountEl = rootEl;
    people = Store.read(STORE_LIST, []);
    if (!Array.isArray(people)) people = [];
    const sp = Store.read(STORE_PERIOD, null);
    if (sp) period = Object.assign({}, period, sp);
    const sv = Store.read(STORE_VIEW, null);
    if (sv && VIEW_MODES.indexOf(sv) >= 0) viewMode = sv;
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

  // 뷰 모드에 따른 컬럼 목록
  //   month: 월별 1셀 (현재 동작)
  //   week:  월별 4주 (W1~W4)
  //   day:   월별 그 달 일수만큼 (1일~말일)
  function periodColumns() {
    const cols = [];
    periodMonths().forEach((m) => {
      if (viewMode === 'month') {
        cols.push({ year: m.year, month: m.month });
      } else if (viewMode === 'week') {
        for (let w = 1; w <= WEEKS_PER_MONTH; w++) {
          cols.push({ year: m.year, month: m.month, week: w, label: String(w) });
        }
      } else {
        const daysInMonth = new Date(m.year, m.month, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
          cols.push({ year: m.year, month: m.month, day: d, label: String(d) });
        }
      }
    });
    return cols;
  }

  // 날짜 정밀 퇴사 체크: 컬럼이 day를 가지면 YYYY-MM-DD 기준, 아니면 month 기준
  function isAfterResignCol(p, col) {
    if (!p) return false;
    if (col.day != null && p.resignDate) {
      const dateStr = `${col.year}-${pad(col.month)}-${pad(col.day)}`;
      return dateStr > String(p.resignDate);
    }
    return RosterData.isAfterResign(p, col.year, col.month);
  }

  function monthKey(y, m) { return `${y}-${m}`; }

  function defaultPersonMonthly() {
    const obj = {};
    periodMonths().forEach(({ year, month }) => { obj[monthKey(year, month)] = 1; });
    return obj;
  }

  function teamLabel(team) { return team.name || team.role; }

  function makeNewPerson() {
    return {
      id: 'emp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      empType: '정규직',
      name: '',
      position: '팀원',
      contractEnd: '',
      leaveStart: '',
      leaveEnd: '',
      resignDate: '',
      teamId: TEAMS[0] ? TEAMS[0].id : '',
      monthly: defaultPersonMonthly(),
      note: '',
    };
  }

  function addPerson(insertIndex) {
    const p = makeNewPerson();
    if (typeof insertIndex === 'number' && insertIndex >= 0 && insertIndex <= people.length) {
      people.splice(insertIndex, 0, p);
    } else {
      people.push(p);
    }
    persist();
    render();
    return p.id;
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

    // 스크롤 위치 보존 - innerHTML 교체로 인한 스크롤 리셋 방지
    const oldWrap = mountEl.querySelector('.roster-wrap');
    const savedScroll = {
      wrapLeft: oldWrap ? oldWrap.scrollLeft : 0,
      wrapTop: oldWrap ? oldWrap.scrollTop : 0,
      winX: window.scrollX,
      winY: window.scrollY,
    };
    // 현재 포커스된 입력의 식별자 보존 (재렌더 후 같은 위치에 포커스 복원 시도)
    const ae = document.activeElement;
    const focusInfo = (ae && mountEl.contains(ae) && ae.dataset && ae.dataset.action)
      ? {
          action: ae.dataset.action,
          id: ae.dataset.id || '',
          year: ae.dataset.year || '',
          month: ae.dataset.month || '',
          selStart: ae.selectionStart,
          selEnd: ae.selectionEnd,
        }
      : null;

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
      ${renderTeamsModal()}
    `;
    bindEvents();

    // 스크롤 위치 복원
    const newWrap = mountEl.querySelector('.roster-wrap');
    if (newWrap) {
      newWrap.scrollLeft = savedScroll.wrapLeft;
      newWrap.scrollTop = savedScroll.wrapTop;
    }
    window.scrollTo(savedScroll.winX, savedScroll.winY);

    // 포커스 복원 (가능할 때만)
    if (focusInfo) {
      const sel = `[data-action="${focusInfo.action}"][data-id="${focusInfo.id}"]`
        + (focusInfo.year ? `[data-year="${focusInfo.year}"]` : '')
        + (focusInfo.month ? `[data-month="${focusInfo.month}"]` : '');
      const target = mountEl.querySelector(sel);
      if (target && typeof target.focus === 'function') {
        target.focus();
        if (target.setSelectionRange && focusInfo.selStart != null) {
          try { target.setSelectionRange(focusInfo.selStart, focusInfo.selEnd); } catch (_) { /* noop */ }
        }
      }
    }
  }

  function renderToolbar() {
    const yearOpts = YEARS.map(
      (y) => `<option value="${y}" ${y === period.startYear ? 'selected' : ''}>${y}</option>`
    ).join('');
    const monthOpts = MONTHS.map(
      (m) => `<option value="${m}" ${m === period.startMonth ? 'selected' : ''}>${m}월</option>`
    ).join('');

    const viewToggle = VIEW_MODES.map((m) =>
      `<button class="${m === viewMode ? 'active' : ''}" type="button" data-action="view-mode" data-view="${m}">${VIEW_LABELS[m]}</button>`
    ).join('');

    return `
      <div class="roster-toolbar">
        <button class="btn primary" id="r-add" type="button">+ 행 추가</button>
        <button class="btn" id="r-add10" type="button">+ 10행 추가</button>
        <button class="btn ghost" id="r-remove-last" type="button">- 마지막 행 제거</button>
        <button class="btn" id="r-teams" type="button" title="팀 추가/삭제/이름 변경">👥 팀 관리 (${Teams.list().length})</button>
        <span style="font-size:11px; color:var(--text-dim); margin-left:6px;">💡 행 위에서 <strong>우클릭</strong>으로 위/아래 삽입 가능</span>
        <span class="spacer" style="flex:1;"></span>
        <span style="font-size:11px; color:var(--text-dim);">보기</span>
        <div class="view-toggle">${viewToggle}</div>
        <button class="btn" id="r-export" type="button" title="현재 본부 인원을 .xlsx 파일로 저장">⬇ 엑셀 다운로드</button>
        <button class="btn" id="r-import" type="button" title="엑셀에서 본부 인원을 불러와 교체/추가">⬆ 엑셀 업로드</button>
        <input type="file" id="r-import-file" accept=".xlsx,.xls" style="display:none" />
        <label style="font-size:11px; color:var(--text-dim); margin-left:8px;">시작</label>
        <select id="r-start-year">${yearOpts}</select>
        <select id="r-start-month">${monthOpts}</select>
        <button class="btn" id="r-add-month" type="button">+ 한 달 추가</button>
        <button class="btn ghost" id="r-remove-month" type="button">- 한 달 제거</button>
      </div>
    `;
  }

  // ===== 팀 관리 모달 =====
  function renderTeamsModal() {
    if (!teamsModalOpen) return '';
    const items = Teams.list().map((t, i) => {
      const last = i === Teams.list().length - 1;
      const usedBy = people.filter((p) => p.teamId === t.id).length;
      const usedHint = usedBy > 0 ? `<span class="tm-used" title="${usedBy}명 사용 중">${usedBy}명</span>` : '';
      return `
        <li class="tm-item">
          <div class="tm-color-wrap">
            <input class="tm-color" type="color" data-action="tm-color" data-id="${t.id}" value="${t.color || '#ececec'}" title="컬러" />
          </div>
          <input class="tm-role" type="text" data-action="tm-role" data-id="${t.id}" value="${escapeHtml(t.role || '')}" placeholder="역할 (예: 모델링)" />
          <input class="tm-name" type="text" data-action="tm-name" data-id="${t.id}" value="${escapeHtml(t.name || '')}" placeholder="팀명 (선택, 예: Modeling팀)" />
          <div class="tm-actions">
            ${usedHint}
            <button type="button" class="tm-btn" data-action="tm-up" data-id="${t.id}" ${i === 0 ? 'disabled' : ''} title="위로">↑</button>
            <button type="button" class="tm-btn" data-action="tm-down" data-id="${t.id}" ${last ? 'disabled' : ''} title="아래로">↓</button>
            <button type="button" class="tm-btn tm-btn-del" data-action="tm-del" data-id="${t.id}" title="삭제">×</button>
          </div>
        </li>`;
    }).join('');

    return `
      <div class="tm-modal-overlay" id="tm-modal-overlay">
        <div class="tm-modal" role="dialog" aria-modal="true">
          <header class="tm-modal-header">
            <h3>👥 팀 관리</h3>
            <button class="btn-close" type="button" id="tm-modal-close" aria-label="닫기">×</button>
          </header>
          <div class="tm-modal-body">
            <ul class="tm-list">${items}</ul>
          </div>
          <footer class="tm-modal-footer">
            <button class="btn primary" type="button" id="tm-add">+ 팀 추가</button>
            <button class="btn ghost" type="button" id="tm-reset" title="기본 팀 목록으로 복원 (사용자 추가/수정 모두 초기화)">기본값 복원</button>
            <span class="tm-hint">⚠ 사용 중인 팀을 삭제하면 해당 인원/프로젝트 행이 표시 안 될 수 있습니다.</span>
          </footer>
        </div>
      </div>
    `;
  }

  function renderTable(months) {
    if (people.length === 0) {
      return `<div class="roster-empty">아직 등록된 인원이 없습니다. <strong>+ 행 추가</strong> 버튼으로 인원을 추가하세요.</div>`;
    }

    const cols = periodColumns();

    // 헤더 - year/month 그룹핑
    const yearGroups = [];
    const monthGroups = [];
    cols.forEach((c) => {
      const yLast = yearGroups[yearGroups.length - 1];
      if (yLast && yLast.year === c.year) yLast.count++;
      else yearGroups.push({ year: c.year, count: 1 });

      const mLast = monthGroups[monthGroups.length - 1];
      if (mLast && mLast.year === c.year && mLast.month === c.month) mLast.count++;
      else monthGroups.push({ year: c.year, month: c.month, count: 1 });
    });

    const yearHeaderCells = yearGroups.map((g, gi) => {
      const cls = gi === yearGroups.length - 1 ? 'year-header' : 'year-header year-end';
      return `<th class="${cls}" colspan="${g.count}">${g.year}</th>`;
    }).join('');

    const monthHeaderCells = monthGroups.map((g, gi) => {
      const isYearEnd = gi < monthGroups.length - 1 && monthGroups[gi + 1].year !== g.year;
      const cls = isYearEnd ? 'month-header year-end' : 'month-header';
      return `<th class="${cls}" colspan="${g.count}">${g.month}월</th>`;
    }).join('');

    // 일/주 모드일 때만 sub 헤더 (1~말일 또는 1~4)
    const showSubHeader = viewMode !== 'month';
    const subHeaderCells = showSubHeader
      ? cols.map((c, ci) => {
          const next = cols[ci + 1];
          const isMonthEnd = !next || next.year !== c.year || next.month !== c.month;
          const isYearEnd = !next || next.year !== c.year;
          const cls = ['sub-header', isYearEnd ? 'year-end' : (isMonthEnd ? 'month-end' : '')].filter(Boolean).join(' ');
          return `<th class="${cls}">${c.label || ''}</th>`;
        }).join('')
      : '';

    // 합계 row - 월 단위 sum을 colspan으로 표시 (data는 monthly 기준)
    const sumCells = monthGroups.map((g, gi) => {
      let s = 0;
      people.forEach((p) => { s += RosterData.effectiveMonthly(p, g.year, g.month); });
      const isYearEnd = gi < monthGroups.length - 1 && monthGroups[gi + 1].year !== g.year;
      const cls = isYearEnd ? 'sum-header year-end' : 'sum-header';
      return `<th class="${cls}" colspan="${g.count}">${formatSum(s)}</th>`;
    }).join('');

    const bodyRows = people.map((p) => renderPersonRow(p, cols)).join('');

    // 헤더 rowspan: month 모드는 3, day/week 모드는 4
    const headerRowspan = showSubHeader ? 4 : 3;

    return `
      <table class="roster-table view-${viewMode}">
        <thead>
          <tr>
            <th rowspan="${headerRowspan}" class="col-actions col-actions-left">삭제</th>
            <th rowspan="${headerRowspan}" class="col-empType">고용구분</th>
            <th rowspan="${headerRowspan}" class="col-name">성명</th>
            <th rowspan="${headerRowspan}" class="col-position">직책</th>
            <th rowspan="${headerRowspan}" class="col-contract">계약/휴직 기간</th>
            <th rowspan="${headerRowspan}" class="col-team">팀</th>
            ${yearHeaderCells}
            <th rowspan="${headerRowspan}" class="col-note">비고</th>
          </tr>
          <tr>${monthHeaderCells}</tr>
          ${showSubHeader ? `<tr>${subHeaderCells}</tr>` : ''}
          <tr>${sumCells}</tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    `;
  }

  function renderPersonRow(p, cols) {
    const empOpts = EMP_TYPES.map(
      (e) => `<option value="${e}" ${e === p.empType ? 'selected' : ''}>${e}</option>`
    ).join('');
    const posOpts = POSITIONS.map(
      (pos) => `<option value="${pos}" ${pos === p.position ? 'selected' : ''}>${pos}</option>`
    ).join('');
    const teamOpts = TEAMS.map(
      (t) => `<option value="${t.id}" ${t.id === p.teamId ? 'selected' : ''}>${escapeHtml(teamLabel(t))}</option>`
    ).join('');

    // 일/주/월 뷰 모드에 따른 셀 렌더링
    //   month: 셀당 입력(현재 동작) - 데이터 편집 가능
    //   week/day: 같은 달의 셀들이 월별 값을 공유(read-only 표시) - 시각화 전용
    const isInputMode = viewMode === 'month';
    const monthCells = cols.map((c, ci) => {
      const onLeave = RosterData.isOnLeave(p, c.year, c.month);
      const afterResign = isAfterResignCol(p, c);
      const v = (p.monthly || {})[monthKey(c.year, c.month)];
      // 휴직/퇴사가 아닌데 값 미설정이면 기본 1로 표시 (재직)
      const isUnset = v === undefined || v === null || v === '';
      const display = isUnset
        ? (onLeave || afterResign ? '' : '1')
        : String(v);
      const isZero = !isUnset && Number(v) === 0;
      const next = cols[ci + 1];
      const isMonthEnd = !next || next.year !== c.year || next.month !== c.month;
      const isYearEnd = !next || next.year !== c.year;
      const cls = ['col-month',
        onLeave ? 'cell-leave' : '',
        afterResign ? 'cell-resigned' : '',
        !onLeave && !afterResign && isZero ? 'cell-zero' : '',
        isYearEnd ? 'year-end' : (isMonthEnd ? 'month-end' : ''),
      ].filter(Boolean).join(' ');
      if (onLeave) {
        return `<td class="${cls}" title="휴직 중 (인원 카운트 제외)">휴</td>`;
      }
      if (afterResign) {
        return `<td class="${cls}" title="퇴사 이후 (인원 카운트 제외)">퇴</td>`;
      }
      if (isInputMode) {
        return `<td class="${cls}"><input class="roster-month-input" type="text" data-action="month" data-id="${p.id}" data-year="${c.year}" data-month="${c.month}" value="${display}" placeholder=""/></td>`;
      }
      // 일/주 뷰: read-only 표시 (값은 monthly 단위)
      return `<td class="${cls}">${display}</td>`;
    }).join('');

    const isManager = MANAGER_POSITIONS.includes(p.position);
    const isResigned = p.empType === '퇴사자';
    const rowCls = [isResigned ? 'row-resigned' : '', isManager ? 'row-manager' : ''].filter(Boolean).join(' ');
    const empCls = `empType-${p.empType}`;

    // 계약/휴직/퇴사 컬럼 - empType에 따라 동적
    const hasLeavePeriod = !!(p.leaveStart || p.leaveEnd);
    let primaryCell;
    if (p.empType === '계약직') {
      primaryCell = `<input class="roster-input text-center" type="text" data-action="contractEnd" data-id="${p.id}" value="${escapeHtml(p.contractEnd || '')}" placeholder="YYYY-MM-DD" />`;
    } else if (p.empType === '휴직') {
      primaryCell = `
        <div class="leave-period">
          <input class="roster-leave-input" type="month" data-action="leaveStart" data-id="${p.id}" value="${escapeHtml(p.leaveStart || '')}" title="휴직 시작 (YYYY-MM)" />
          <span class="leave-sep">~</span>
          <input class="roster-leave-input" type="month" data-action="leaveEnd" data-id="${p.id}" value="${escapeHtml(p.leaveEnd || '')}" title="휴직 종료 (YYYY-MM)" />
        </div>`;
    } else if (p.empType === '퇴사자') {
      primaryCell = `
        <div class="resign-cell">
          <span class="resign-label">퇴사일</span>
          <input class="roster-input text-center" type="text" data-action="resignDate" data-id="${p.id}" value="${escapeHtml(p.resignDate || '')}" placeholder="YYYY-MM-DD" />
        </div>`;
    } else {
      primaryCell = `<span class="cell-dash">-</span>`;
    }

    // 휴직이 아니지만 휴직 기록이 남아있는 경우 - 표시 + 삭제 버튼
    const leaveHistory = (p.empType !== '휴직' && hasLeavePeriod)
      ? `<div class="leave-history" title="휴직 기록 (인원 카운트에서 해당 월 자동 제외)">
           <span class="leave-history-label">휴직</span>
           <span class="leave-history-range">${escapeHtml(p.leaveStart || '?')} ~ ${escapeHtml(p.leaveEnd || '?')}</span>
           <button class="btn-leave-clear" type="button" data-action="clearLeave" data-id="${p.id}" title="휴직 기록 삭제">×</button>
         </div>`
      : '';

    const contractCell = `${primaryCell}${leaveHistory}`;

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

    // 엑셀 다운로드/업로드
    // 뷰 모드 토글 (일/주/월)
    mountEl.querySelectorAll('[data-action="view-mode"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.view;
        if (!VIEW_MODES.includes(v) || v === viewMode) return;
        viewMode = v;
        Store.write(STORE_VIEW, viewMode);
        render();
      });
    });

    // 팀 관리 모달 열기/닫기
    const teamsBtn = mountEl.querySelector('#r-teams');
    if (teamsBtn) teamsBtn.addEventListener('click', () => { teamsModalOpen = true; render(); });
    const tmClose = mountEl.querySelector('#tm-modal-close');
    if (tmClose) tmClose.addEventListener('click', () => { teamsModalOpen = false; render(); });
    const tmOverlay = mountEl.querySelector('#tm-modal-overlay');
    if (tmOverlay) tmOverlay.addEventListener('click', (e) => {
      if (e.target === tmOverlay) { teamsModalOpen = false; render(); }
    });

    // 팀 추가 / 기본값 복원
    const tmAdd = mountEl.querySelector('#tm-add');
    if (tmAdd) tmAdd.addEventListener('click', () => {
      Teams.add({ role: '새 팀', name: '', color: '#ececec' });
      render();
    });
    const tmReset = mountEl.querySelector('#tm-reset');
    if (tmReset) tmReset.addEventListener('click', () => {
      if (!confirm('기본 팀 목록으로 복원할까요?\n사용자가 추가/수정한 팀은 모두 초기화됩니다.')) return;
      Teams.reset();
      render();
    });

    // 개별 팀 편집 (role / name / color)
    mountEl.querySelectorAll('[data-action="tm-role"], [data-action="tm-name"]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const field = inp.dataset.action === 'tm-role' ? 'role' : 'name';
        Teams.update(inp.dataset.id, { [field]: inp.value });
        render();
      });
    });
    mountEl.querySelectorAll('[data-action="tm-color"]').forEach((inp) => {
      inp.addEventListener('change', () => {
        Teams.update(inp.dataset.id, { color: inp.value });
        render();
      });
    });
    mountEl.querySelectorAll('[data-action="tm-up"]').forEach((btn) => {
      btn.addEventListener('click', () => { Teams.move(btn.dataset.id, 'up'); render(); });
    });
    mountEl.querySelectorAll('[data-action="tm-down"]').forEach((btn) => {
      btn.addEventListener('click', () => { Teams.move(btn.dataset.id, 'down'); render(); });
    });
    mountEl.querySelectorAll('[data-action="tm-del"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const t = Teams.list().find((x) => x.id === id);
        const usedBy = people.filter((p) => p.teamId === id).length;
        const msg = usedBy > 0
          ? `"${t ? (t.role || t.name) : ''}" 팀을 삭제할까요?\n현재 ${usedBy}명이 이 팀에 속해 있어, 삭제 시 해당 인원의 팀 선택이 비워집니다.`
          : `"${t ? (t.role || t.name) : ''}" 팀을 삭제할까요?`;
        if (!confirm(msg)) return;
        Teams.remove(id);
        render();
      });
    });

    const exportBtn = mountEl.querySelector('#r-export');
    if (exportBtn) exportBtn.addEventListener('click', exportToExcel);
    const importBtn = mountEl.querySelector('#r-import');
    const importFile = mountEl.querySelector('#r-import-file');
    if (importBtn && importFile) {
      importBtn.addEventListener('click', () => importFile.click());
      importFile.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        importFromExcel(file);
        importFile.value = '';
      });
    }

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

    // 텍스트 필드 (재렌더 불필요: name / note / contractEnd / resignDate)
    mountEl.querySelectorAll('[data-action="name"], [data-action="note"], [data-action="contractEnd"], [data-action="resignDate"]').forEach((input) => {
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

    // 휴직 기록 삭제 (정규직/계약직 등으로 전환된 후 남아있는 휴직 기간을 제거)
    mountEl.querySelectorAll('[data-action="clearLeave"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const p = people.find((x) => x.id === id);
        const name = p && p.name ? p.name : '이 행';
        if (!confirm(`"${name}"의 휴직 기록(${p && p.leaveStart || '?'} ~ ${p && p.leaveEnd || '?'})을 삭제할까요?\n해당 월의 휴직 표시가 모두 제거됩니다.`)) return;
        updatePerson(id, { leaveStart: '', leaveEnd: '' });
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

    // 우클릭 컨텍스트 메뉴 - 스프레드시트처럼 위/아래 행 삽입
    mountEl.querySelectorAll('tbody tr[data-id]').forEach((tr) => {
      tr.addEventListener('contextmenu', (e) => {
        // 입력/셀렉트 우클릭은 기본 동작(텍스트 선택 등)에 방해되지 않게 정밀 타깃팅
        if (e.target.closest('input, select, button')) {
          // 그래도 메뉴는 띄우자 - 사용자 편의
        }
        e.preventDefault();
        showContextMenu(e.pageX, e.pageY, tr.dataset.id);
      });
    });
  }

  // ===== 컨텍스트 메뉴 =====
  let ctxMenu = null;

  function ensureContextMenu() {
    if (ctxMenu && document.body.contains(ctxMenu)) return ctxMenu;
    const menu = document.createElement('div');
    menu.className = 'roster-ctxmenu';
    menu.innerHTML = `
      <button type="button" data-act="insert-above">↑ 위에 행 추가</button>
      <button type="button" data-act="insert-below">↓ 아래에 행 추가</button>
      <div class="ctx-sep"></div>
      <button type="button" data-act="delete" class="danger">× 이 행 삭제</button>
    `;
    document.body.appendChild(menu);
    menu.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const act = btn.dataset.act;
      const targetId = menu.dataset.targetId;
      const idx = people.findIndex((p) => p.id === targetId);
      hideContextMenu();
      if (idx < 0) return;
      if (act === 'insert-above') {
        addPerson(idx);
      } else if (act === 'insert-below') {
        addPerson(idx + 1);
      } else if (act === 'delete') {
        const p = people[idx];
        const name = p && p.name ? p.name : '이 행';
        if (confirm(`"${name}" 을(를) 삭제할까요?`)) deletePerson(targetId);
      }
    });
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target)) hideContextMenu();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideContextMenu();
    });
    ctxMenu = menu;
    return menu;
  }

  function showContextMenu(x, y, personId) {
    const menu = ensureContextMenu();
    menu.dataset.targetId = personId;
    menu.style.display = 'block';
    // viewport 경계 보정
    const rect = menu.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 8;
    const maxY = window.innerHeight - rect.height - 8;
    menu.style.left = Math.min(x, maxX + window.scrollX) + 'px';
    menu.style.top = Math.min(y, maxY + window.scrollY) + 'px';
  }

  function hideContextMenu() {
    if (ctxMenu) ctxMenu.style.display = 'none';
  }

  // ===== 엑셀 다운로드 / 업로드 =====
  // 현재 보이는 기간(periodMonths)의 모든 월을 컬럼으로 export
  // 컬럼: 고용구분, 성명, 직책, 계약종료일, 휴직시작, 휴직종료, 팀, [YYYY-MM ...], 비고
  function exportToExcel() {
    if (typeof XLSX === 'undefined') {
      alert('엑셀 라이브러리(XLSX)를 불러오지 못했습니다. 네트워크를 확인해주세요.');
      return;
    }
    const months = periodMonths();
    const headers = [
      '고용구분', '성명', '직책', '계약종료일', '휴직시작', '휴직종료', '퇴사일', '팀',
      ...months.map((m) => `${m.year}-${pad(m.month)}`),
      '비고',
    ];
    const rows = people.map((p) => {
      const team = TEAMS.find((t) => t.id === p.teamId);
      const teamName = team ? (team.name || team.role) : '';
      const monthVals = months.map((m) => {
        // UI와 동일하게 휴직/퇴사 상태를 우선 반영해 표기
        if (RosterData.isOnLeave(p, m.year, m.month)) return '휴';
        if (RosterData.isAfterResign(p, m.year, m.month)) return '퇴';
        const v = (p.monthly || {})[monthKey(m.year, m.month)];
        // 미설정 = 재직 1로 간주 (UI와 일치)
        return (v === undefined || v === null || v === '') ? 1 : Number(v);
      });
      return [
        p.empType || '',
        p.name || '',
        p.position || '',
        p.contractEnd || '',
        p.leaveStart || '',
        p.leaveEnd || '',
        p.resignDate || '',
        teamName,
        ...monthVals,
        p.note || '',
      ];
    });

    const aoa = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // 컬럼 폭 (대략)
    ws['!cols'] = headers.map((h, i) => {
      if (i === 1) return { wch: 12 };  // 성명
      if (i === 7) return { wch: 22 };  // 팀
      if (i === headers.length - 1) return { wch: 24 }; // 비고
      if (i < 8) return { wch: 12 };
      return { wch: 8 };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '본부인원');
    const today = new Date();
    const fname = `본부인원_${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}.xlsx`;
    XLSX.writeFile(wb, fname);
  }

  function importFromExcel(file) {
    if (typeof XLSX === 'undefined') {
      alert('엑셀 라이브러리(XLSX)를 불러오지 못했습니다. 네트워크를 확인해주세요.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws) {
          alert('시트를 찾을 수 없습니다.');
          return;
        }
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
        if (!aoa.length) {
          alert('비어있는 시트입니다.');
          return;
        }
        const headers = aoa[0].map((h) => String(h == null ? '' : h).trim());
        const colOf = (name) => headers.findIndex((h) => h === name);
        const cEmp = colOf('고용구분');
        const cName = colOf('성명');
        const cPos = colOf('직책');
        const cContract = colOf('계약종료일');
        const cLeaveS = colOf('휴직시작');
        const cLeaveE = colOf('휴직종료');
        const cResign = colOf('퇴사일');
        const cTeam = colOf('팀');
        const cNote = colOf('비고');
        // 월 컬럼: "YYYY-M" 또는 "YYYY-MM" 또는 "YYYY.M(M)" 형식
        const monthCols = [];
        headers.forEach((h, i) => {
          const m = String(h).match(/^(\d{4})[-.](\d{1,2})$/);
          if (m) monthCols.push({ idx: i, year: Number(m[1]), month: Number(m[2]) });
        });
        if (cName < 0) {
          alert('"성명" 컬럼을 찾지 못했습니다. 헤더 행이 첫 번째 행에 있고 컬럼명이 정확한지 확인해주세요.');
          return;
        }

        // 팀 라벨 → teamId 맵
        const teamLabelMap = {};
        TEAMS.forEach((t) => {
          if (t.name) teamLabelMap[t.name] = t.id;
          if (t.role) teamLabelMap[t.role] = t.id;
          teamLabelMap[(t.name || t.role)] = t.id;
        });

        const newPeople = [];
        for (let r = 1; r < aoa.length; r++) {
          const row = aoa[r];
          if (!row || row.every((v) => v === '' || v === null || v === undefined)) continue;
          const monthly = {};
          monthCols.forEach(({ idx: ci, year, month }) => {
            const v = row[ci];
            if (v === '' || v === null || v === undefined) return;
            const num = Number(v);
            if (!isNaN(num)) monthly[`${year}-${month}`] = num;
          });
          const teamLabel = String(row[cTeam] == null ? '' : row[cTeam]).trim();
          const teamId = teamLabelMap[teamLabel] || (TEAMS[0] ? TEAMS[0].id : '');
          const empType = cEmp >= 0 ? (String(row[cEmp] || '').trim() || '정규직') : '정규직';
          const position = cPos >= 0 ? (String(row[cPos] || '').trim() || '팀원') : '팀원';
          newPeople.push({
            id: 'emp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6) + '_' + r,
            empType: EMP_TYPES.includes(empType) ? empType : '정규직',
            name: cName >= 0 ? String(row[cName] == null ? '' : row[cName]).trim() : '',
            position: POSITIONS.includes(position) ? position : '팀원',
            contractEnd: cContract >= 0 ? cellAsDate(row[cContract]) : '',
            leaveStart: cLeaveS >= 0 ? cellAsMonth(row[cLeaveS]) : '',
            leaveEnd: cLeaveE >= 0 ? cellAsMonth(row[cLeaveE]) : '',
            resignDate: cResign >= 0 ? cellAsDate(row[cResign]) : '',
            teamId,
            monthly,
            note: cNote >= 0 ? String(row[cNote] == null ? '' : row[cNote]).trim() : '',
          });
        }

        if (newPeople.length === 0) {
          alert('가져올 데이터 행이 없습니다.');
          return;
        }
        const replace = confirm(
          `엑셀에서 ${newPeople.length}건을 읽었습니다.\n\n[확인] 기존 인원을 모두 교체\n[취소] 기존 인원 뒤에 추가`
        );
        if (replace) {
          people = newPeople;
        } else {
          people = people.concat(newPeople);
        }
        persist();
        render();
        alert(`엑셀 업로드 완료 (${newPeople.length}건 ${replace ? '교체' : '추가'})`);
      } catch (err) {
        console.error(err);
        alert('엑셀 파싱 중 오류가 발생했습니다: ' + (err && err.message ? err.message : err));
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // 셀 → 'YYYY-MM-DD' (날짜 시리얼/Date/문자열 모두 처리)
  function cellAsDate(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date && !isNaN(v.getTime())) {
      return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
    }
    if (typeof v === 'number' && v > 0 && v < 100000) {
      try {
        const dc = XLSX.SSF.parse_date_code(v);
        if (dc) return `${dc.y}-${pad(dc.m)}-${pad(dc.d)}`;
      } catch (_) { /* noop */ }
    }
    return String(v).trim();
  }

  // 셀 → 'YYYY-MM'
  function cellAsMonth(v) {
    const s = cellAsDate(v);
    const m = s.match(/^(\d{4})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}` : s;
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
