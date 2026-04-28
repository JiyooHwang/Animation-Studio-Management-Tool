/* eslint-disable no-unused-vars */
// 프로젝트 상세 페이지
// - 프로젝트 선택 / 제목 편집
// - 주당단가 (exec / premium / standard) 편집
// - TEAMS 21개 모두 고정 행으로 표시 (행 추가/삭제 없음)
// - 분류(내부/외주), 주별 리소스, 단가 override, 외주비용 직접 입력
const ProjectPage = (function () {
  const STORE_FILTER = 'project.filter.v1'; // { projectId, period }
  const WEEKS_PER_MONTH = 4;
  const DEFAULT_PERIOD = { startYear: 2026, startMonth: 4, monthCount: 9 };

  let mountEl = null;
  let state = {
    projectId: null,
    period: Object.assign({}, DEFAULT_PERIOD),
  };

  function init(rootEl) {
    mountEl = rootEl;
    const sf = Store.read(STORE_FILTER, null);
    if (sf) {
      if (sf.projectId) state.projectId = sf.projectId;
      if (sf.period) state.period = Object.assign(state.period, sf.period);
    }
    // state.projectId 유효성 검증 (없거나 삭제된 프로젝트면 첫 번째로 fallback)
    const projects = Projects.list();
    const exists = projects.find((p) => p.id === state.projectId);
    if (!exists) {
      state.projectId = projects.length ? projects[0].id : null;
      persistFilter();
    }
    render();
  }

  function persistFilter() {
    Store.write(STORE_FILTER, state);
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

  function weekKey(year, month, week) { return `${year}-${month}-${week}`; }

  function setRowField(teamId, patch) {
    if (!state.projectId) return;
    ProjectData.setRow(state.projectId, teamId, patch);
  }

  function setWeek(teamId, year, month, week, value) {
    if (!state.projectId) return;
    const r = ProjectData.rowFor(state.projectId, teamId);
    const weeks = Object.assign({}, r.weeks || {});
    const k = weekKey(year, month, week);
    if (!value) delete weeks[k];
    else weeks[k] = Number(value);
    ProjectData.setRow(state.projectId, teamId, { weeks });
  }

  function render() {
    if (!mountEl) return;
    const months = periodMonths();
    const last = months[months.length - 1];
    const projectName = state.projectId ? Projects.getName(state.projectId) : '';

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
        <button class="btn primary" id="proj-add-project" type="button">+ 프로젝트 추가</button>
        <button class="btn ghost" id="proj-del-project" type="button">현재 프로젝트 삭제</button>
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
    if (!state.projectId) {
      return `<div class="empty-rows-note" style="padding:40px; text-align:center;">먼저 비용 탭에서 프로젝트를 추가하거나 선택하세요.</div>`;
    }

    // 합계
    let totalInternal = 0, totalExternal = 0;
    TEAMS.forEach((t) => {
      totalInternal += ProjectData.rowInternalCost(state.projectId, t.id);
      totalExternal += ProjectData.rowExternalCost(state.projectId, t.id);
    });
    const totalCost = totalInternal + totalExternal;

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
      <th class="col-cost col-cost-total" rowspan="3">총비용</th>
      <th class="col-cost" rowspan="3">내부비용</th>
      <th class="col-cost" rowspan="3">외주비용</th>
    `;

    const bodyRows = TEAMS.map((team) => renderRow(team, months, totalCost)).join('');

    const totalsWeek = months.map((m, mi) => {
      const nextSameYear = months[mi + 1] && months[mi + 1].year === m.year;
      const groupEnd = nextSameYear ? 'month-end' : 'year-end';
      return [1, 2, 3, 4].map((w, wi) => {
        let s = 0;
        TEAMS.forEach((t) => {
          const r = ProjectData.rowFor(state.projectId, t.id);
          s += Number((r.weeks || {})[weekKey(m.year, m.month, w)]) || 0;
        });
        const cls = wi === 3 ? `col-week ${groupEnd}` : 'col-week';
        return `<td class="${cls}">${s ? s : ''}</td>`;
      }).join('');
    }).join('');

    const totalResources = TEAMS.reduce(
      (s, t) => s + ProjectData.rowResources(ProjectData.rowFor(state.projectId, t.id)),
      0
    );

    // 월별 비용 계산 - 각 팀의 그 달 리소스(4주 합)를 기준으로 derive
    const monthlyBreakdown = months.map((m) => {
      let monthInternal = 0;
      let monthExternal = 0;
      TEAMS.forEach((t) => {
        const r = ProjectData.withTeamId(state.projectId, t.id);
        const monthRes = [1, 2, 3, 4].reduce((s, w) => {
          return s + (Number((r.weeks || {})[weekKey(m.year, m.month, w)]) || 0);
        }, 0);
        const totalRes = ProjectData.rowResources(r);
        // 내부비용 = 그 달 리소스 × 단가 (kind=='내부'일 때)
        if (r.kind === '내부') {
          monthInternal += monthRes * ProjectData.rowRate(r);
        }
        // 외주비용은 lump sum이므로 월별 리소스 비율로 분배
        const ext = Number(r.externalCost) || 0;
        if (totalRes > 0 && ext > 0) {
          monthExternal += (monthRes / totalRes) * ext;
        }
      });
      return {
        internal: monthInternal,
        external: monthExternal,
        total: monthInternal + monthExternal,
      };
    });

    const monthlyCells = (key) => monthlyBreakdown.map((mb, mi) => {
      const isYearEnd = mi < months.length - 1 && months[mi + 1].year !== months[mi].year;
      const cls = ['monthly-cell', isYearEnd ? 'year-end' : ''].filter(Boolean).join(' ');
      return `<td class="${cls}" colspan="${WEEKS_PER_MONTH}">${formatNumber(Math.round(mb[key]), { zeroAsBlank: true })}</td>`;
    }).join('');

    return `
      <table class="project-table">
        <thead>
          <tr>${headerLeft}${yearHeaderCells}</tr>
          <tr>${monthHeaderCells}</tr>
          <tr>${weekHeaderCells}</tr>
        </thead>
        <tbody>${bodyRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="text-align:center;">합계</td>
            <td class="col-resource">${totalResources || ''}</td>
            <td class="col-rate"></td>
            <td class="col-cost col-cost-total">${formatNumber(totalCost, { zeroAsBlank: true })}</td>
            <td class="col-cost">${formatNumber(totalInternal, { zeroAsBlank: true })}</td>
            <td class="col-cost">${formatNumber(totalExternal, { zeroAsBlank: true })}</td>
            ${totalsWeek}
          </tr>
          <tr class="monthly-row monthly-row-total">
            <td colspan="8" class="monthly-label">월별 총비용</td>
            ${monthlyCells('total')}
          </tr>
          <tr class="monthly-row monthly-row-internal">
            <td colspan="8" class="monthly-label">월별 내부비용</td>
            ${monthlyCells('internal')}
          </tr>
          <tr class="monthly-row monthly-row-external">
            <td colspan="8" class="monthly-label">월별 외주비용</td>
            ${monthlyCells('external')}
          </tr>
          <tr>
            <td colspan="3" style="text-align:center;">총비용</td>
            <td colspan="${5 + months.length * WEEKS_PER_MONTH}" style="text-align:right; padding-right:14px; background:#fff7a8; font-weight:700;">${formatNumber(totalCost)}</td>
          </tr>
        </tfoot>
      </table>
    `;
  }

  function renderRow(team, months, totalCost) {
    const row = ProjectData.withTeamId(state.projectId, team.id);
    const color = team.color;
    const textColor = team.textColor || pickTextColor(team.color);

    const resources = ProjectData.rowResources(row);
    const rate = ProjectData.rowRate(row);
    const internalCost = row.kind === '내부' ? resources * rate : 0;
    const externalCost = Number(row.externalCost) || 0;
    const rowTotal = internalCost + externalCost;
    const pct = totalCost > 0 ? (rowTotal / totalCost * 100) : 0;
    const isInternal = row.kind === '내부';

    const weekCells = months.map((m, mi) => {
      const nextSameYear = months[mi + 1] && months[mi + 1].year === m.year;
      const groupEnd = nextSameYear ? 'month-end' : 'year-end';
      return [1, 2, 3, 4].map((w, wi) => {
        const v = (row.weeks || {})[weekKey(m.year, m.month, w)] || '';
        const cls = wi === 3 ? `col-week ${groupEnd}` : 'col-week';
        const styleBg = v ? `style="background:${color}; color:${textColor};"` : '';
        return `<td class="${cls}" ${styleBg} data-week-cell="1" data-team="${team.id}" data-year="${m.year}" data-month="${m.month}" data-week="${w}"><input class="proj-row-input" type="text" data-action="week" data-team="${team.id}" data-year="${m.year}" data-month="${m.month}" data-week="${w}" value="${v || ''}" placeholder=""/><span class="fill-handle" data-fill-handle="1" title="드래그하여 같은 값 채우기"></span></td>`;
      }).join('');
    }).join('');

    const rateDisplay = (row.rateOverride !== undefined && row.rateOverride !== '' && row.rateOverride !== null)
      ? formatNumber(row.rateOverride) : formatNumber(rate);

    return `
      <tr class="has-color" data-team="${team.id}">
        <td class="col-pct">${pct ? pct.toFixed(1) + '%' : ''}</td>
        <td class="col-role" style="background:${color}; color:${textColor};">${escapeHtml(team.role)}</td>
        <td class="col-kind">
          <select class="proj-kind-select" data-action="kind" data-team="${team.id}">
            <option value="내부" ${isInternal ? 'selected' : ''}>내부</option>
            <option value="외주" ${!isInternal ? 'selected' : ''}>외주</option>
          </select>
        </td>
        <td class="col-resource">${resources || ''}</td>
        <td class="col-rate"><input class="proj-rate-input" type="text" data-action="rate" data-team="${team.id}" value="${rateDisplay}" /></td>
        <td class="col-cost col-cost-total" title="총비용 = 내부비용 + 외주비용">${formatNumber(rowTotal, { zeroAsBlank: true })}</td>
        <td class="col-cost" title="자동 계산: 리소스합 × 단가 (내부일 때)">${formatNumber(internalCost, { zeroAsBlank: true })}</td>
        <td class="col-cost"><input class="proj-cost-input" type="text" data-action="external" data-team="${team.id}" value="${externalCost ? formatNumber(externalCost) : ''}" placeholder="0" /></td>
        ${weekCells}
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

    // 프로젝트 추가 (현재 프로젝트로 즉시 전환)
    const addProjBtn = mountEl.querySelector('#proj-add-project');
    if (addProjBtn) addProjBtn.addEventListener('click', () => {
      const name = prompt('새 프로젝트 이름을 입력하세요:', '');
      if (name === null) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      const newId = Projects.add(trimmed);
      state.projectId = newId;
      persistFilter();
      render();
    });

    // 현재 프로젝트 삭제
    const delProjBtn = mountEl.querySelector('#proj-del-project');
    if (delProjBtn) delProjBtn.addEventListener('click', () => {
      if (!state.projectId) return;
      const name = Projects.getName(state.projectId);
      if (!confirm(`프로젝트 "${name}" 을(를) 삭제할까요?\n관련 비용/투입 인력 데이터도 함께 삭제됩니다.`)) return;
      Projects.remove(state.projectId);
      const list = Projects.list();
      state.projectId = list.length ? list[0].id : null;
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

    mountEl.querySelectorAll('[data-action="kind"]').forEach((sel) => {
      sel.addEventListener('change', () => {
        setRowField(sel.dataset.team, { kind: sel.value });
        render();
      });
    });
    mountEl.querySelectorAll('[data-action="rate"]').forEach((input) => {
      input.addEventListener('change', () => {
        const v = input.value.trim();
        const num = v === '' ? null : parseNumber(v);
        setRowField(input.dataset.team, { rateOverride: num });
        render();
      });
    });
    mountEl.querySelectorAll('[data-action="external"]').forEach((input) => {
      input.addEventListener('change', () => {
        const num = parseNumber(input.value);
        setRowField(input.dataset.team, { externalCost: num });
        render();
      });
    });
    mountEl.querySelectorAll('[data-action="week"]').forEach((input) => {
      input.addEventListener('change', () => {
        const num = parseNumber(input.value);
        setWeek(
          input.dataset.team,
          Number(input.dataset.year),
          Number(input.dataset.month),
          Number(input.dataset.week),
          num
        );
        render();
      });
    });

    bindDragFill();
  }

  // 구글 스프레드시트 스타일 드래그 채우기
  let drag = null;

  function bindDragFill() {
    mountEl.querySelectorAll('[data-fill-handle="1"]').forEach((h) => {
      h.addEventListener('mousedown', onFillStart);
    });
  }

  function onFillStart(e) {
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    const startTd = handle.closest('td[data-week-cell="1"]');
    if (!startTd) return;
    const startInput = startTd.querySelector('input.proj-row-input');
    if (!startInput) return;

    drag = {
      sourceValue: startInput.value,
      targets: new Map(),
    };
    addDragTarget(startTd);

    document.addEventListener('mousemove', onFillMove);
    document.addEventListener('mouseup', onFillEnd, { once: true });
  }

  function addDragTarget(td) {
    if (!drag) return;
    const key = `${td.dataset.team}|${td.dataset.year}|${td.dataset.month}|${td.dataset.week}`;
    if (drag.targets.has(key)) return;
    drag.targets.set(key, td);
    td.classList.add('fill-target');
  }

  function onFillMove(e) {
    if (!drag) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;
    const td = el.closest && el.closest('td[data-week-cell="1"]');
    if (!td) return;
    addDragTarget(td);
  }

  function onFillEnd() {
    if (!drag) return;
    const num = parseNumber(drag.sourceValue);

    // 한 번에 batch 적용
    const all = ProjectData.allRows();
    if (!all[state.projectId]) all[state.projectId] = {};
    const projRows = all[state.projectId];
    let touched = false;
    drag.targets.forEach((td) => {
      const teamId = td.dataset.team;
      const y = Number(td.dataset.year);
      const m = Number(td.dataset.month);
      const w = Number(td.dataset.week);
      const cur = projRows[teamId] || { kind: '내부', weeks: {}, externalCost: 0 };
      const weeks = Object.assign({}, cur.weeks || {});
      const k = `${y}-${m}-${w}`;
      if (!num) delete weeks[k];
      else weeks[k] = num;
      projRows[teamId] = Object.assign({}, cur, { weeks });
      touched = true;
      td.classList.remove('fill-target');
    });
    if (touched) ProjectData.saveAllRows(all);

    drag = null;
    document.removeEventListener('mousemove', onFillMove);
    render();
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
