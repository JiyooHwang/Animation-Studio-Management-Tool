/* eslint-disable no-unused-vars */
// 프로젝트 상세 페이지
// - 프로젝트 선택 / 제목 편집
// - 주당단가 (exec / premium / standard) 편집
// - TEAMS 21개 역할 표시. 한 역할(팀)은 여러 행을 가질 수 있음.
//   각 행은 개별적으로 분류(내부/외주), 주별 리소스, 단가 override를 가짐.
// - "+" 버튼으로 행 추가, "×" 버튼으로 행 삭제 (마지막 한 행은 남김)
const ProjectPage = (function () {
  const STORE_FILTER = 'project.filter.v1'; // { projectId, period }
  const WEEKS_PER_MONTH = 4;
  const DEFAULT_PERIOD = { startYear: 2026, startMonth: 4, monthCount: 9 };

  // 팀별 총작업분량 단위 & 단가 필드 매핑
  //   unit: 'sec' 초 / 'cut' 컷
  //   field: getProjectMeta()의 필드명
  //   매핑에 없는 팀은 총작업분량 표기 안 함
  const TEAM_WORK_UNITS = {
    animation: { unit: 'sec', field: 'secondsPerWeek' },
    lighting:  { unit: 'cut', field: 'cutsPerWeekLighting' },
    fx:        { unit: 'cut', field: 'cutsPerWeekFx' },
    simulation:{ unit: 'cut', field: 'cutsPerWeekFx' },
    blender:   { unit: 'cut', field: 'cutsPerWeekFx' },
    composite: { unit: 'cut', field: 'cutsPerWeekComp' },
  };

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

  // 팀의 외주 행 주별 리소스 합 × 외주 단가 = 그 팀의 그 달 외주 항목 monthly 금액
  // 외주 행 주별 입력이 변경될 때마다 호출해 외주 항목(bottom 섹션)을 자동 동기화.
  // 팀에 외주 항목이 없으면 (금액 > 0일 때) 자동 생성. 항목이 여러 개면 첫 번째에 모임.
  function syncExternalItemFromTeam(teamId, year, month) {
    if (!state.projectId || !teamId) return;
    const rows = ProjectData.rowsFor(state.projectId, teamId);
    let monthSum = 0;
    rows.forEach((row) => {
      if (row.kind !== '외주') return;
      [1, 2, 3, 4].forEach((w) => {
        const v = (row.weeks || {})[weekKey(year, month, w)];
        monthSum += Number(v) || 0;
      });
    });
    const rate = Projects.getRates().external || 0;
    const amount = monthSum * rate;
    let items = ProjectData.externalItems(state.projectId).filter((it) => it.teamId === teamId);
    let itemId;
    if (items.length > 0) {
      itemId = items[0].id;
    } else {
      if (amount === 0) return; // 금액이 0이면 빈 항목 생성 안 함
      itemId = ProjectData.addExternalItem(state.projectId, teamId);
    }
    ProjectData.setExternalMonthly(state.projectId, itemId, year, month, amount);
  }

  // 외주 행의 모든 월에 대해 외주 항목 동기 (kind 변경/행 삭제 시 호출)
  function syncExternalItemsForTeamAllMonths(teamId) {
    if (!state.projectId || !teamId) return;
    periodMonths().forEach((m) => syncExternalItemFromTeam(teamId, m.year, m.month));
  }

  // 외주 항목(itemId)이 가리키는 팀에 외주 행이 없으면 자동으로 1개 생성
  function ensureExternalRowForItem(itemId) {
    if (!state.projectId) return;
    const items = ProjectData.externalItems(state.projectId);
    const item = items.find((x) => x.id === itemId);
    if (!item || !item.teamId) return;
    const hasExt = ProjectData.rowsFor(state.projectId, item.teamId).some((r) => r.kind === '외주');
    if (!hasExt) ProjectData.addRow(state.projectId, item.teamId, '외주');
  }

  // 팀에 외주 항목이 더 이상 없고 외주 행도 비어 있으면 (리소스/단가 override 모두 없음) 그 행을 정리
  // 외주 항목의 팀이 변경되거나 항목이 삭제될 때 이전 팀의 빈 외주 행이 남는 것을 방지
  function cleanupEmptyExternalRows(teamId) {
    if (!state.projectId || !teamId) return;
    const remaining = ProjectData.externalItems(state.projectId).filter((it) => it.teamId === teamId);
    if (remaining.length > 0) return; // 아직 외주 항목이 있으면 그대로
    const all = ProjectData.allRows();
    if (!all[state.projectId] || !Array.isArray(all[state.projectId][teamId])) return;
    const rows = all[state.projectId][teamId];
    const kept = rows.filter((row) => {
      if (row.kind !== '외주') return true;
      if (ProjectData.rowResources(row) > 0) return true;
      if (row.rateOverride) return true;
      return false; // 빈 외주 행 → 제거
    });
    if (kept.length === rows.length) return; // 변경 없음
    if (kept.length === 0) {
      delete all[state.projectId][teamId]; // 가상 default(내부)로 복귀
    } else {
      all[state.projectId][teamId] = kept;
    }
    ProjectData.saveAllRows(all);
  }

  function setRowField(teamId, rowId, patch) {
    if (!state.projectId) return;
    ProjectData.updateRow(state.projectId, teamId, rowId, patch);
  }

  function setWeek(teamId, rowId, year, month, week, value) {
    if (!state.projectId) return;
    ProjectData.setRowWeek(state.projectId, teamId, rowId, year, month, week, value);
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
      ${renderProjectChips()}
      ${renderProjectMeta(projectName)}
      ${renderToolbar()}
      <div class="project-wrap">
        ${renderTable(months)}
      </div>
      ${renderExternalSection(months)}
    `;

    bindEvents();
  }

  // 외주 항목 섹션 - 사용자가 행 추가, 팀 선택, 월별 외주비 입력
  // 각 행의 합은 그 팀의 외주비용 컬럼에 auto-sum
  function renderExternalSection(months) {
    if (!state.projectId) return '';
    const items = ProjectData.externalItems(state.projectId);

    const monthHeaderCells = months.map((m, mi) => {
      const isYearEnd = mi < months.length - 1 && months[mi + 1].year !== m.year;
      const cls = isYearEnd ? 'ext-month-header year-end' : 'ext-month-header';
      return `<th class="${cls}">${m.year}.${m.month}월</th>`;
    }).join('');

    const yearGroups = [];
    months.forEach((m) => {
      const last = yearGroups[yearGroups.length - 1];
      if (last && last.year === m.year) last.count++;
      else yearGroups.push({ year: m.year, count: 1 });
    });
    const yearHeaderCells = yearGroups.map((g, gi) => {
      const cls = gi === yearGroups.length - 1 ? 'ext-year-header' : 'ext-year-header year-end';
      return `<th class="${cls}" colspan="${g.count}">${g.year}</th>`;
    }).join('');

    const teamOptionsFor = (selectedId) => TEAMS.map(
      (t) => `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${escapeHtml(t.role)}</option>`
    ).join('');

    let bodyRows;
    if (items.length === 0) {
      const totalCols = 1 + months.length + 2;
      bodyRows = `<tr><td colspan="${totalCols}" class="ext-empty">아직 외주 항목이 없습니다. <strong>+ 외주 추가</strong> 버튼으로 추가하세요.</td></tr>`;
    } else {
      bodyRows = items.map((item) => {
        const team = getTeam(item.teamId);
        const color = team ? team.color : '#fff';
        const textColor = team ? (team.textColor || pickTextColor(team.color)) : '#1f1f1f';
        const monthCells = months.map((m, mi) => {
          const k = `${m.year}-${m.month}`;
          const v = (item.monthly || {})[k] || '';
          const isYearEnd = mi < months.length - 1 && months[mi + 1].year !== m.year;
          const cls = ['ext-cell', isYearEnd ? 'year-end' : ''].filter(Boolean).join(' ');
          return `<td class="${cls}"><input class="ext-input" type="text" data-action="ext-month" data-item="${item.id}" data-year="${m.year}" data-month="${m.month}" value="${v ? formatNumber(v) : ''}" placeholder="0"/></td>`;
        }).join('');
        const sum = Object.values(item.monthly || {}).reduce((s, v) => s + (Number(v) || 0), 0);
        return `
          <tr data-item="${item.id}">
            <td class="ext-team" style="background:${color}; color:${textColor};">
              <select class="ext-team-select" data-action="ext-team" data-item="${item.id}">${teamOptionsFor(item.teamId)}</select>
            </td>
            ${monthCells}
            <td class="ext-sum">${formatNumber(sum, { zeroAsBlank: true })}</td>
            <td class="ext-actions"><button class="btn-ext-del" type="button" data-action="ext-del" data-item="${item.id}" title="외주 항목 삭제">×</button></td>
          </tr>`;
      }).join('');
    }

    // 합계 row - 모든 외주 항목의 월별 합 (= 본부 외주비 월별)
    const totalRow = (() => {
      const monthCells = months.map((m, mi) => {
        const isYearEnd = mi < months.length - 1 && months[mi + 1].year !== m.year;
        const cls = ['ext-total-cell', isYearEnd ? 'year-end' : ''].filter(Boolean).join(' ');
        const s = ProjectData.externalSumForMonth(state.projectId, m.year, m.month);
        return `<td class="${cls}">${formatNumber(s, { zeroAsBlank: true })}</td>`;
      }).join('');
      const grand = items.reduce((acc, it) => {
        Object.values(it.monthly || {}).forEach((v) => { acc += Number(v) || 0; });
        return acc;
      }, 0);
      return `<tr class="ext-total-row"><td class="ext-total-label">월별 합계</td>${monthCells}<td class="ext-sum total">${formatNumber(grand, { zeroAsBlank: true })}</td><td class="ext-actions"></td></tr>`;
    })();

    return `
      <div class="ext-section">
        <div class="ext-toolbar">
          <h3>외주 항목 (월별 외주비용)</h3>
          <span class="ext-hint">팀별 합계는 위 표의 "외주비용" 컬럼에 자동 반영됩니다.</span>
          <span class="spacer" style="flex:1;"></span>
          <button class="btn primary" id="ext-add" type="button">+ 외주 추가</button>
        </div>
        <div class="ext-wrap">
          <table class="ext-table">
            <thead>
              <tr>
                <th rowspan="2" class="ext-team-header">팀</th>
                ${yearHeaderCells}
                <th rowspan="2" class="ext-sum-header">합계</th>
                <th rowspan="2" class="ext-actions"></th>
              </tr>
              <tr>${monthHeaderCells}</tr>
            </thead>
            <tbody>${bodyRows}</tbody>
            <tfoot>${totalRow}</tfoot>
          </table>
        </div>
      </div>
    `;
  }

  function renderProjectChips() {
    const list = Projects.list();
    if (!list.length) {
      return `<div class="proj-chips empty">등록된 프로젝트가 없습니다. 우측 "+ 프로젝트 추가" 버튼으로 시작하세요.</div>`;
    }
    const chips = list.map((p) => {
      const cls = p.id === state.projectId ? 'proj-chip active' : 'proj-chip';
      return `<button type="button" class="${cls}" data-action="chip" data-id="${p.id}" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</button>`;
    }).join('');
    return `<div class="proj-chips"><span class="proj-chips-label">프로젝트</span>${chips}</div>`;
  }

  function renderProjectMeta(projectName) {
    const projOpts = Projects.list().map(
      (p) => `<option value="${p.id}" ${p.id === state.projectId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
    ).join('');

    const rates = Projects.getRates();
    const meta = state.projectId
      ? Projects.getProjectMeta(state.projectId)
      : { totalSeconds: 0, secondsPerWeek: 0, cutsPerWeek: 0 };

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
          <div class="anim-config" style="margin-top:10px;">
            <div class="anim-row">
              <span class="anim-label">총 제작분량</span>
              <div class="anim-field">
                <input id="proj-total-sec" type="text" value="${meta.totalSeconds ? formatNumber(meta.totalSeconds) : ''}" placeholder="0" />
                <span class="anim-unit">초</span>
              </div>
              <div class="anim-field">
                <input id="proj-total-min" type="text" value="${meta.totalSeconds ? formatNumber(Math.round(meta.totalSeconds / 60 * 100) / 100) : ''}" placeholder="0" />
                <span class="anim-unit">분</span>
              </div>
            </div>
            <div class="anim-row">
              <div class="anim-field">
                <span class="anim-label">주당 애니메이션 제작 분량</span>
                <input id="proj-sec-per-week" type="text" value="${meta.secondsPerWeek ? formatNumber(meta.secondsPerWeek) : ''}" placeholder="0" />
                <span class="anim-unit">초</span>
              </div>
              <div class="anim-field">
                <span class="anim-label">주당 라이팅&amp;렌더 제작 분량</span>
                <input id="proj-cuts-lighting" type="text" value="${meta.cutsPerWeekLighting ? formatNumber(meta.cutsPerWeekLighting) : ''}" placeholder="0" />
                <span class="anim-unit">컷</span>
              </div>
              <div class="anim-field">
                <span class="anim-label">주당 FX 제작 분량</span>
                <input id="proj-cuts-fx" type="text" value="${meta.cutsPerWeekFx ? formatNumber(meta.cutsPerWeekFx) : ''}" placeholder="0" />
                <span class="anim-unit">컷</span>
              </div>
              <div class="anim-field">
                <span class="anim-label">주당 Comp 제작 분량</span>
                <input id="proj-cuts-comp" type="text" value="${meta.cutsPerWeekComp ? formatNumber(meta.cutsPerWeekComp) : ''}" placeholder="0" />
                <span class="anim-unit">컷</span>
              </div>
            </div>
          </div>
        </div>
        <div class="rate-config">
          <label>ManWeek (본부장)</label>
          <input id="rate-exec" type="text" value="${formatNumber(rates.exec)}" />
          <label>ManWeek (PD,Director,Supervisor,IPB)</label>
          <input id="rate-premium" type="text" value="${formatNumber(rates.premium)}" />
          <label>ManWeek (그 외 부서)</label>
          <input id="rate-standard" type="text" value="${formatNumber(rates.standard)}" />
          <label>ManWeek (외주)</label>
          <input id="rate-external" type="text" value="${formatNumber(rates.external)}" />
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
      <th class="col-resource" rowspan="3">총작업분량</th>
      <th class="col-cost col-cost-total" rowspan="3">총비용</th>
      <th class="col-cost" rowspan="3">내부비용</th>
      <th class="col-cost" rowspan="3">외주비용</th>
      <th class="col-actions" rowspan="3"></th>
    `;

    const bodyRows = TEAMS.map((team) => {
      const rows = ProjectData.rowsFor(state.projectId, team.id);
      const firstExternalIdx = rows.findIndex((r) => r.kind === '외주');
      // 팀 총비용 = 팀의 내부비용 + 외주비용 (외주 항목 합 포함)
      const teamTotal = ProjectData.rowInternalCost(state.projectId, team.id)
        + ProjectData.rowExternalCost(state.projectId, team.id);
      return rows.map((row, idx) => renderRow(team, row, idx, rows.length, months, totalCost, firstExternalIdx, teamTotal)).join('');
    }).join('');

    const totalsWeek = months.map((m, mi) => {
      const nextSameYear = months[mi + 1] && months[mi + 1].year === m.year;
      const groupEnd = nextSameYear ? 'month-end' : 'year-end';
      return [1, 2, 3, 4].map((w, wi) => {
        let s = 0;
        TEAMS.forEach((t) => {
          ProjectData.rowsFor(state.projectId, t.id).forEach((r) => {
            s += Number((r.weeks || {})[weekKey(m.year, m.month, w)]) || 0;
          });
        });
        const cls = wi === 3 ? `col-week ${groupEnd}` : 'col-week';
        return `<td class="${cls}">${s ? s : ''}</td>`;
      }).join('');
    }).join('');

    // 총작업분량 합계 (초로 환산, 1컷=3초): 팀별 단가 필드 사용해 내부+외주 모두 합산
    const metaForTotal = state.projectId
      ? Projects.getProjectMeta(state.projectId)
      : {};
    let totalWorkSec = 0;
    TEAMS.forEach((t) => {
      const u = TEAM_WORK_UNITS[t.id];
      if (!u) return;
      const perWeek = metaForTotal[u.field] || 0;
      if (perWeek <= 0) return;
      ProjectData.rowsFor(state.projectId, t.id).forEach((r) => {
        const res = ProjectData.rowResources(r);
        if (res <= 0) return;
        if (u.unit === 'sec') totalWorkSec += res * perWeek;
        else totalWorkSec += res * perWeek * 3;
      });
    });
    const totalWorkDisplay = totalWorkSec > 0 ? formatMinutes(totalWorkSec) : '';

    // 월별 비용 계산: 내부 행은 그 달 리소스 × 단가, 외주는 외주 항목 합 (단일 소스)
    const monthlyBreakdown = months.map((m) => {
      let monthInternal = 0;
      TEAMS.forEach((t) => {
        ProjectData.rowsFor(state.projectId, t.id).forEach((row) => {
          if (row.kind !== '내부') return;
          const r = Object.assign({ _teamId: t.id }, row);
          const monthRes = [1, 2, 3, 4].reduce((s, w) => {
            return s + (Number((r.weeks || {})[weekKey(m.year, m.month, w)]) || 0);
          }, 0);
          if (monthRes <= 0) return;
          monthInternal += monthRes * ProjectData.rowRate(r);
        });
      });
      const monthExternal = ProjectData.externalSumForMonth(state.projectId, m.year, m.month);
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
            <td class="col-resource" title="초 환산 합계 (1컷=3초)">${totalWorkDisplay}</td>
            <td class="col-cost col-cost-total">${formatNumber(totalCost, { zeroAsBlank: true })}</td>
            <td class="col-cost">${formatNumber(totalInternal, { zeroAsBlank: true })}</td>
            <td class="col-cost">${formatNumber(totalExternal, { zeroAsBlank: true })}</td>
            <td class="col-actions"></td>
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

  function renderRow(team, row, idx, rowCount, months, totalCost, firstExternalIdx, teamTotal) {
    const isFirst = idx === 0;
    const isLast = idx === rowCount - 1;
    const onlyOne = rowCount === 1;
    const color = team.color;
    const textColor = team.textColor || pickTextColor(team.color);

    const rWithT = Object.assign({ _teamId: team.id }, row);
    const resources = ProjectData.rowResources(row);
    const rate = ProjectData.rowRate(rWithT);
    const isInternal = row.kind === '내부';
    const internalCost = isInternal ? resources * rate : 0;

    // 외주비용 표시 위치:
    //  - 팀의 첫 외주 행에 팀 전체 외주 항목 합 표시
    //  - 외주 행이 없는 팀이고 외주 항목이 있으면 첫 행에 fallback (legacy)
    //  - 외주비용 = 외주 항목 합 (외주 행 주별 리소스는 외주 항목으로 동기되어 단일 소스)
    const hasExternalRow = firstExternalIdx >= 0;
    const isFirstExternalRow = hasExternalRow && idx === firstExternalIdx;
    const showExternalItemsHere = isFirstExternalRow || (!hasExternalRow && isFirst);
    const externalCostDisplay = showExternalItemsHere
      ? ProjectData.externalSumForTeam(state.projectId, team.id)
      : 0;

    // 총비용 = 내부비용 + 외주비용
    const rowTotal = internalCost + externalCostDisplay;
    const pct = totalCost > 0 ? (rowTotal / totalCost * 100) : 0;

    // 외주 행 자동 채색: 외주 항목에 비용이 들어간 달에 한해 첫 번째 외주 행에만 적용
    // (서브 외주 행은 자기 weekly 값에 따라서만 색칠 - 빈 행이 자동 채색되지 않도록)
    const monthHasExtCost = {};
    if (!isInternal && isFirstExternalRow) {
      months.forEach((m) => {
        const k = `${m.year}-${m.month}`;
        if (monthHasExtCost[k] !== undefined) return;
        monthHasExtCost[k] = ProjectData.externalSumForTeamMonth(state.projectId, team.id, m.year, m.month) > 0;
      });
    }

    const weekCells = months.map((m, mi) => {
      const nextSameYear = months[mi + 1] && months[mi + 1].year === m.year;
      const groupEnd = nextSameYear ? 'month-end' : 'year-end';
      const autoColorMonth = !isInternal && monthHasExtCost[`${m.year}-${m.month}`];
      return [1, 2, 3, 4].map((w, wi) => {
        const v = (row.weeks || {})[weekKey(m.year, m.month, w)] || '';
        const cls = wi === 3 ? `col-week ${groupEnd}` : 'col-week';
        const styleBg = (v || autoColorMonth) ? `style="background:${color}; color:${textColor};"` : '';
        return `<td class="${cls}" ${styleBg} data-week-cell="1" data-team="${team.id}" data-row="${row.id}" data-year="${m.year}" data-month="${m.month}" data-week="${w}"><input class="proj-row-input" type="text" data-action="week" data-team="${team.id}" data-row="${row.id}" data-year="${m.year}" data-month="${m.month}" data-week="${w}" value="${v || ''}" placeholder=""/><span class="fill-handle" data-fill-handle="1" title="드래그하여 같은 값 채우기"></span></td>`;
      }).join('');
    }).join('');

    // 총작업분량: TEAM_WORK_UNITS 매핑이 있는 팀만 표시. 내부/외주 모두 카운트.
    //   sec 단위 팀: resources × secondsPerWeek = 총 초
    //   cut 단위 팀: resources × cutsPerWeek × 3 = 총 초 (1컷=3초)
    //   최종 표기는 분/초 포맷 ("X분 Y초")
    let workDisplay = '';
    const teamUnit = TEAM_WORK_UNITS[team.id];
    if (teamUnit && resources > 0 && state.projectId) {
      const projMeta = Projects.getProjectMeta(state.projectId);
      const perWeek = projMeta[teamUnit.field] || 0;
      if (perWeek > 0) {
        const totalSec = teamUnit.unit === 'sec' ? resources * perWeek : resources * perWeek * 3;
        workDisplay = formatMinutes(totalSec);
      }
    }

    // 액션 버튼: 마지막 행에 + (행 추가), 행이 2개 이상이면 × (이 행 삭제)
    const addBtn = isLast
      ? `<button class="btn-row-add" type="button" data-action="row-add" data-team="${team.id}" title="이 역할에 행 추가">+</button>`
      : '';
    const delBtn = !onlyOne
      ? `<button class="btn-row-del" type="button" data-action="row-del" data-team="${team.id}" data-row="${row.id}" title="이 행 삭제">×</button>`
      : '';

    // 멀티 행이고 첫 번째 행이 아니면 역할 셀은 아예 그리지 않고 (첫 행의 rowspan으로 병합),
    // 첫 행이면 rowCount만큼 rowspan
    // rowspan 셀은 첫 행 <tr>에 속하므로 tr.row-last 룰이 닿지 않음 → cell-team-end 클래스로 직접 굵은 하단 보더
    const roleCell = isFirst
      ? `<td class="col-role cell-team-end" style="background:${color}; color:${textColor};" rowspan="${rowCount}">${escapeHtml(team.role)}</td>`
      : '';
    // 총비용 셀: 첫 행에만 그리고 rowCount만큼 rowspan으로 병합 + 팀 합산 표시
    const totalCell = isFirst
      ? `<td class="col-cost col-cost-total cell-team-end" rowspan="${rowCount}" title="팀 총비용 = 내부비용 + 외주비용 합산">${formatNumber(teamTotal, { zeroAsBlank: true })}</td>`
      : '';
    const trClass = ['has-color', !isFirst ? 'row-sub' : '', isLast ? 'row-last' : ''].filter(Boolean).join(' ');

    return `
      <tr class="${trClass}" data-team="${team.id}" data-row="${row.id}">
        <td class="col-pct">${pct ? pct.toFixed(1) + '%' : ''}</td>
        ${roleCell}
        <td class="col-kind">
          <select class="proj-kind-select" data-action="kind" data-team="${team.id}" data-row="${row.id}">
            <option value="내부" ${isInternal ? 'selected' : ''}>내부</option>
            <option value="외주" ${!isInternal ? 'selected' : ''}>외주</option>
          </select>
        </td>
        <td class="col-resource" title="${isInternal ? '리소스합 × 주당 제작 분량' : ''}">${workDisplay}</td>
        ${totalCell}
        <td class="col-cost" title="내부 행: 리소스합 × 단가">${formatNumber(internalCost, { zeroAsBlank: true })}</td>
        <td class="col-cost" title="외주 행: 리소스합 × 단가${showExternalItemsHere ? ' + 하단 외주 항목 합계' : ''}">${formatNumber(externalCostDisplay, { zeroAsBlank: true })}</td>
        <td class="col-actions">${delBtn}${addBtn}</td>
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

    // 프로젝트 chip 클릭 → 해당 프로젝트로 전환
    mountEl.querySelectorAll('[data-action="chip"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.projectId = btn.dataset.id;
        persistFilter();
        render();
      });
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

    // 프로젝트 메타: 총 분량 / 주당 애니메이션 / 주당 라이팅&렌더 / FX / Comp
    const totalSecEl = mountEl.querySelector('#proj-total-sec');
    if (totalSecEl) totalSecEl.addEventListener('change', () => {
      Projects.setProjectMeta(state.projectId, { totalSeconds: parseNumber(totalSecEl.value) });
      render();
    });
    const totalMinEl = mountEl.querySelector('#proj-total-min');
    if (totalMinEl) totalMinEl.addEventListener('change', () => {
      const minutes = parseFloat(String(totalMinEl.value).replace(/[^0-9.\-]/g, '')) || 0;
      Projects.setProjectMeta(state.projectId, { totalSeconds: Math.round(minutes * 60) });
      render();
    });
    const secPerWeekEl = mountEl.querySelector('#proj-sec-per-week');
    if (secPerWeekEl) secPerWeekEl.addEventListener('change', () => {
      Projects.setProjectMeta(state.projectId, { secondsPerWeek: parseNumber(secPerWeekEl.value) });
      render();
    });
    const cutsLightingEl = mountEl.querySelector('#proj-cuts-lighting');
    if (cutsLightingEl) cutsLightingEl.addEventListener('change', () => {
      Projects.setProjectMeta(state.projectId, { cutsPerWeekLighting: parseNumber(cutsLightingEl.value) });
      render();
    });
    const cutsFxEl = mountEl.querySelector('#proj-cuts-fx');
    if (cutsFxEl) cutsFxEl.addEventListener('change', () => {
      Projects.setProjectMeta(state.projectId, { cutsPerWeekFx: parseNumber(cutsFxEl.value) });
      render();
    });
    const cutsCompEl = mountEl.querySelector('#proj-cuts-comp');
    if (cutsCompEl) cutsCompEl.addEventListener('change', () => {
      Projects.setProjectMeta(state.projectId, { cutsPerWeekComp: parseNumber(cutsCompEl.value) });
      render();
    });

    // 우상단 ManWeek 단가 4종 (본부장 / PD,Dr,SUP,IPB / 그 외 / 외주)
    const rateExec = mountEl.querySelector('#rate-exec');
    const ratePremium = mountEl.querySelector('#rate-premium');
    const rateStandard = mountEl.querySelector('#rate-standard');
    const rateExternal = mountEl.querySelector('#rate-external');
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
    if (rateExternal) rateExternal.addEventListener('change', () => {
      const r = Projects.getRates();
      r.external = parseNumber(rateExternal.value);
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
        const teamId = sel.dataset.team;
        setRowField(teamId, sel.dataset.row, { kind: sel.value });
        // kind 변경 → 팀의 외주 행 구성이 바뀌므로 외주 항목 전체 재동기
        syncExternalItemsForTeamAllMonths(teamId);
        render();
      });
    });
    mountEl.querySelectorAll('[data-action="week"]').forEach((input) => {
      input.addEventListener('change', () => {
        const num = parseNumber(input.value);
        const teamId = input.dataset.team;
        const rowId = input.dataset.row;
        const year = Number(input.dataset.year);
        const month = Number(input.dataset.month);
        setWeek(teamId, rowId, year, month, Number(input.dataset.week), num);
        // 외주 행이면 그 달의 외주 항목 금액 자동 동기
        const row = ProjectData.rowsFor(state.projectId, teamId).find((r) => r.id === rowId);
        if (row && row.kind === '외주') {
          syncExternalItemFromTeam(teamId, year, month);
        }
        render();
      });
    });
    mountEl.querySelectorAll('[data-action="row-add"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!state.projectId) return;
        ProjectData.addRow(state.projectId, btn.dataset.team, '외주');
        render();
      });
    });
    mountEl.querySelectorAll('[data-action="row-del"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!state.projectId) return;
        const teamId = btn.dataset.team;
        const rowId = btn.dataset.row;
        // 삭제 전 상태 검사: 이 행이 외주 행이고 삭제 후 팀에 남는 외주 행이 없으면
        // 그 팀의 외주 항목들도 함께 삭제할지 확인
        const rowsBeforeDel = ProjectData.rowsFor(state.projectId, teamId);
        const rowToDel = rowsBeforeDel.find((r) => r.id === rowId);
        const otherExtRows = rowsBeforeDel.filter((r) => r.id !== rowId && r.kind === '외주');
        const lastExtRow = rowToDel && rowToDel.kind === '외주' && otherExtRows.length === 0;
        const teamExtItems = lastExtRow
          ? ProjectData.externalItems(state.projectId).filter((it) => it.teamId === teamId)
          : [];
        const willDeleteItems = lastExtRow && teamExtItems.length > 0;

        const confirmMsg = willDeleteItems
          ? `이 외주 행을 삭제할까요?\n팀의 외주 항목 ${teamExtItems.length}건도 함께 삭제됩니다.`
          : '이 행을 삭제할까요?';
        if (!confirm(confirmMsg)) return;

        const wasExternal = rowToDel && rowToDel.kind === '외주';
        ProjectData.removeRow(state.projectId, teamId, rowId);
        if (willDeleteItems) {
          teamExtItems.forEach((it) => ProjectData.removeExternalItem(state.projectId, it.id));
        } else if (wasExternal) {
          // 외주 행 하나만 삭제, 다른 외주 행이 남아 있으면 외주 항목 금액 재계산
          syncExternalItemsForTeamAllMonths(teamId);
        }
        render();
      });
    });

    bindDragFill();

    // 외주 항목 이벤트
    const extAddBtn = mountEl.querySelector('#ext-add');
    if (extAddBtn) extAddBtn.addEventListener('click', () => {
      ProjectData.addExternalItem(state.projectId);
      render();
    });
    mountEl.querySelectorAll('[data-action="ext-team"]').forEach((sel) => {
      sel.addEventListener('change', () => {
        // 변경 전 이전 팀 기록
        const itemId = sel.dataset.item;
        const prev = ProjectData.externalItems(state.projectId).find((x) => x.id === itemId);
        const oldTeamId = prev ? prev.teamId : null;
        ProjectData.updateExternalItem(state.projectId, itemId, { teamId: sel.value });
        // 새 팀에 외주 행 자동 생성
        ensureExternalRowForItem(itemId);
        // 이전 팀에 외주 항목이 없고 빈 외주 행만 남았다면 정리
        if (oldTeamId && oldTeamId !== sel.value) cleanupEmptyExternalRows(oldTeamId);
        render();
      });
    });
    mountEl.querySelectorAll('[data-action="ext-month"]').forEach((input) => {
      input.addEventListener('change', () => {
        const num = parseNumber(input.value);
        ProjectData.setExternalMonthly(
          state.projectId,
          input.dataset.item,
          Number(input.dataset.year),
          Number(input.dataset.month),
          num
        );
        // 값이 입력되었으면 해당 팀에 외주 행 자동 생성
        if (num > 0) ensureExternalRowForItem(input.dataset.item);
        render();
      });
    });
    mountEl.querySelectorAll('[data-action="ext-del"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!confirm('이 외주 항목을 삭제할까요?')) return;
        const itemId = btn.dataset.item;
        const item = ProjectData.externalItems(state.projectId).find((x) => x.id === itemId);
        const teamId = item ? item.teamId : null;
        ProjectData.removeExternalItem(state.projectId, itemId);
        // 해당 팀에 외주 항목이 더 없고 빈 외주 행만 남았다면 정리
        if (teamId) cleanupEmptyExternalRows(teamId);
        render();
      });
    });
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
      sourceRowId: startTd.dataset.row,
      targets: new Map(),
    };
    addDragTarget(startTd);

    document.addEventListener('mousemove', onFillMove);
    document.addEventListener('mouseup', onFillEnd, { once: true });
  }

  function addDragTarget(td) {
    if (!drag) return;
    // 같은 행(rowId)의 셀로 채우기 제한 (다른 row로 번지지 않도록)
    if (drag.sourceRowId && td.dataset.row !== drag.sourceRowId) return;
    const key = `${td.dataset.team}|${td.dataset.row}|${td.dataset.year}|${td.dataset.month}|${td.dataset.week}`;
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
    const affectedExternal = new Set(); // 외주 행이 영향받은 (teamId, year, month)
    drag.targets.forEach((td) => {
      const teamId = td.dataset.team;
      const rowId = td.dataset.row;
      const y = Number(td.dataset.year);
      const m = Number(td.dataset.month);
      const w = Number(td.dataset.week);
      if (!Array.isArray(projRows[teamId]) || projRows[teamId].length === 0) {
        projRows[teamId] = [{
          id: (rowId && !rowId.startsWith('_default_')) ? rowId : ProjectData._makeRowId(),
          kind: '내부',
          weeks: {},
          rateOverride: undefined,
        }];
      }
      const item = projRows[teamId].find((r) => r.id === rowId) || projRows[teamId][0];
      const weeks = Object.assign({}, item.weeks || {});
      const k = `${y}-${m}-${w}`;
      if (!num) delete weeks[k];
      else weeks[k] = num;
      item.weeks = weeks;
      if (item.kind === '외주') affectedExternal.add(`${teamId}|${y}|${m}`);
      touched = true;
      td.classList.remove('fill-target');
    });
    if (touched) ProjectData.saveAllRows(all);

    // 외주 행이 영향받았으면 외주 항목 동기
    affectedExternal.forEach((key) => {
      const [teamId, y, m] = key.split('|');
      syncExternalItemFromTeam(teamId, Number(y), Number(m));
    });

    drag = null;
    document.removeEventListener('mousemove', onFillMove);
    render();
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  // 초 → "X분 Y초" 포맷 (m=0이면 "Y초", s=0이면 "X분")
  function formatMinutes(seconds) {
    const totalSec = Math.round(Number(seconds) || 0);
    if (totalSec <= 0) return '';
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    if (m === 0) return `${s}초`;
    if (s === 0) return `${formatNumber(m)}분`;
    return `${formatNumber(m)}분 ${s}초`;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return { init };
})();
