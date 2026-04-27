/* eslint-disable no-unused-vars */
// 비용 페이지 - 프로젝트별 예산/비용/손익 + 월별 매출인식/청구
const CostPage = (function () {
  const STORE_KEY = 'cost.v1';        // 프로젝트별 비용 데이터
  const STORE_FILTER = 'cost.filter.v1';

  // 각 프로젝트가 가지는 필드
  // budget: { 예산, 지원사업, 청구가능비용 }
  // cost:   { 총비용, 내부비용, 외주비 }
  // cum25:  { 매출인식, 청구 }    -> 잔액은 계산
  // monthly: { 'YYYY': { 'M': { 매출인식, 청구 } } }

  let mountEl = null;
  let data = {};
  let filter = { year: 2026, project: 'ALL' };

  function init(rootEl) {
    mountEl = rootEl;
    data = Store.read(STORE_KEY, {});
    const savedFilter = Store.read(STORE_FILTER, null);
    if (savedFilter) filter = Object.assign(filter, savedFilter);
    render();
  }

  function getProject(id) {
    if (!data[id]) {
      data[id] = {
        budget: { 예산: 0, 지원사업: 0, 청구가능비용: 0 },
        cost: { 총비용: 0, 내부비용: 0, 외주비: 0 },
        cum25: { 매출인식: 0, 청구: 0 },
        monthly: {},
      };
    }
    return data[id];
  }

  function setField(projectId, path, value) {
    const proj = getProject(projectId);
    Store.setIn(proj, path, value);
    Store.write(STORE_KEY, data);
  }

  function getMonthly(projectId, year, month, kind) {
    const proj = getProject(projectId);
    return Store.getIn(proj, `monthly.${year}.${month}.${kind}`, 0);
  }

  function setMonthly(projectId, year, month, kind, value) {
    const proj = getProject(projectId);
    Store.setIn(proj, `monthly.${year}.${month}.${kind}`, value);
    Store.write(STORE_KEY, data);
  }

  function calcLoss(proj) {
    const profit = (proj.budget.예산 || 0) - (proj.cost.총비용 || 0);
    const rate = proj.budget.예산 ? (profit / proj.budget.예산) * 100 : 0;
    return { profit, rate };
  }

  function calcBalance(proj) {
    const salesBal = (proj.budget.예산 || 0) - (proj.cum25.매출인식 || 0);
    const billBal = (proj.budget.청구가능비용 || 0) - (proj.cum25.청구 || 0);
    return { salesBal, billBal };
  }

  function projectsToShow() {
    const all = Projects.list();
    if (filter.project === 'ALL') return all;
    return all.filter((p) => p.id === filter.project);
  }

  function updateFilter(patch) {
    filter = Object.assign({}, filter, patch);
    Store.write(STORE_FILTER, filter);
    render();
  }

  function render() {
    if (!mountEl) return;

    mountEl.innerHTML = `
      <div class="topbar">
        <h1>프로젝트 비용 관리</h1>
        <div class="summary">프로젝트 <strong>${Projects.list().length}</strong>개</div>
      </div>
      ${renderFilters()}
      <div class="cost-wrap">
        ${renderTable()}
      </div>
    `;

    bindEvents();
  }

  function renderFilters() {
    const yearOpts = YEARS.map(
      (y) => `<option value="${y}" ${y === filter.year ? 'selected' : ''}>${y}</option>`
    ).join('');
    const projOpts = Projects.filterOptions().map(
      (p) =>
        `<option value="${p.value}" ${p.value === filter.project ? 'selected' : ''}>${escapeHtml(p.label)}</option>`
    ).join('');

    return `
      <div class="filters">
        <label>연도</label>
        <select id="c-year">${yearOpts}</select>
        <label>프로젝트</label>
        <select id="c-project">${projOpts}</select>
        <span class="spacer"></span>
        <button class="btn ghost" id="c-clear">월별 초기화</button>
      </div>
    `;
  }

  function renderTable() {
    const list = projectsToShow();
    const all = Projects.list();

    // 본부 전체 합계 - 프로젝트 페이지 데이터에서 derive
    const total = { 총비용: 0, 내부비용: 0, 외주비: 0 };
    all.forEach((p) => {
      const t = ProjectData.totalsFor(p.id);
      total.총비용 += t.총비용;
      total.내부비용 += t.내부비용;
      total.외주비 += t.외주비;
    });

    const monthHeaders = MONTHS.map(
      (m) => `<th class="col-month">${m}</th>`
    ).join('');

    const monthlyTotalsByKind = (kind) => {
      return MONTHS.map((m) => {
        let s = 0;
        all.forEach((p) => {
          s += getMonthly(p.id, filter.year, m, kind);
        });
        return `<td class="value-cell">${formatNumber(s, { zeroAsBlank: true })}</td>`;
      }).join('');
    };

    const filterLabel = Projects.filterOptions().find((p) => p.value === filter.project)?.label || '';
    return `
      <table class="cost-table">
        <thead>
          <tr>
            <th colspan="3" rowspan="2" class="header-cell">Project<br/>${escapeHtml(filterLabel)}</th>
            <th colspan="3" class="header-cell"></th>
            <th colspan="2" class="header-cell">25년 누적</th>
            <th colspan="${MONTHS.length}" class="header-cell">${filter.year}년</th>
          </tr>
          <tr>
            <th class="col-class">예산</th>
            <th class="col-class">금액</th>
            <th class="col-class">손익</th>
            <th class="col-cumulative">매출인식</th>
            <th class="col-cumulative">청구</th>
            ${monthHeaders}
          </tr>
        </thead>
        <tbody>
          ${renderHQRow(total, all)}
          ${list.map((p) => renderProjectRows(p)).join('')}
        </tbody>
      </table>
    `;
  }

  function renderHQRow(total, all) {
    return `
      <tr>
        <td rowspan="3" class="col-class">본부 전체</td>
        <td rowspan="3" class="col-project"></td>
        <td class="label-cell"></td>
        <td class="value-cell"></td>
        <td class="label-pink">총비용</td>
        <td class="value-pink">${formatNumber(total.총비용, { zeroAsBlank: true })}</td>
        <td class="label-cell" colspan="2" style="text-align:center;">매출인식</td>
        ${MONTHS.map((m) => {
          let s = 0;
          all.forEach((p) => { s += getMonthly(p.id, filter.year, m, '매출인식'); });
          return `<td class="value-cell">${formatNumber(s, { zeroAsBlank: true })}</td>`;
        }).join('')}
      </tr>
      <tr>
        <td class="label-cell"></td>
        <td class="value-cell"></td>
        <td class="label-pink">내부비용</td>
        <td class="value-pink">${formatNumber(total.내부비용, { zeroAsBlank: true })}</td>
        <td class="label-cell" colspan="2" style="text-align:center;">청구</td>
        ${MONTHS.map((m) => {
          let s = 0;
          all.forEach((p) => { s += getMonthly(p.id, filter.year, m, '청구'); });
          return `<td class="value-cell">${formatNumber(s, { zeroAsBlank: true })}</td>`;
        }).join('')}
      </tr>
      <tr>
        <td class="label-cell"></td>
        <td class="value-cell"></td>
        <td class="label-pink">외주비</td>
        <td class="value-pink">${formatNumber(total.외주비, { zeroAsBlank: true })}</td>
        <td class="label-cell" colspan="2" style="text-align:center;">잔액</td>
        ${MONTHS.map((m) => {
          let recog = 0, bill = 0;
          all.forEach((p) => {
            recog += getMonthly(p.id, filter.year, m, '매출인식');
            bill += getMonthly(p.id, filter.year, m, '청구');
          });
          return `<td class="value-cell">${formatNumber(bill - recog, { zeroAsBlank: true })}</td>`;
        }).join('')}
      </tr>
    `;
  }

  function renderProjectRows(p) {
    const proj = getProject(p.id);
    // 프로젝트 페이지에서 derive
    const totals = ProjectData.totalsFor(p.id);
    proj.cost.총비용 = totals.총비용;
    proj.cost.내부비용 = totals.내부비용;
    proj.cost.외주비 = totals.외주비;
    const { profit, rate } = calcLoss(proj);
    const { salesBal, billBal } = calcBalance(proj);

    const monthsRow = (kind) =>
      MONTHS.map((m) => {
        const v = getMonthly(p.id, filter.year, m, kind);
        return `<td class="value-cell"><input class="cell-num" type="text" data-action="month" data-project="${p.id}" data-month="${m}" data-kind="${kind}" value="${v ? formatNumber(v) : ''}" placeholder="0"/></td>`;
      }).join('');

    return `
      <tr>
        <td rowspan="3" class="col-class">${escapeHtml(p.category)}</td>
        <td rowspan="3" class="col-project"><input class="proj-name-input" type="text" data-action="rename" data-project="${p.id}" value="${escapeHtml(p.name)}" /></td>
        <td class="label-cell">예산</td>
        <td class="value-yellow"><input class="cell-num" type="text" data-action="budget" data-project="${p.id}" data-field="예산" value="${proj.budget.예산 ? formatNumber(proj.budget.예산) : ''}" placeholder="0"/></td>
        <td class="label-pink">총비용</td>
        <td class="value-pink" title="프로젝트 페이지에서 자동 계산">${formatNumber(proj.cost.총비용, { zeroAsBlank: true })}</td>
        <td class="label-cell">2025년 누적</td>
        <td class="value-cell"><input class="cell-num" type="text" data-action="cum25" data-project="${p.id}" data-field="매출인식" value="${proj.cum25.매출인식 ? formatNumber(proj.cum25.매출인식) : ''}" placeholder="0"/></td>
        ${monthsRow('매출인식')}
      </tr>
      <tr>
        <td class="label-cell">지원사업</td>
        <td class="value-yellow"><input class="cell-num" type="text" data-action="budget" data-project="${p.id}" data-field="지원사업" value="${proj.budget.지원사업 ? formatNumber(proj.budget.지원사업) : ''}" placeholder="0"/></td>
        <td class="label-pink">내부비용</td>
        <td class="value-pink" title="프로젝트 페이지에서 자동 계산">${formatNumber(proj.cost.내부비용, { zeroAsBlank: true })}</td>
        <td class="label-cell">2025년 누적</td>
        <td class="value-cell"><input class="cell-num" type="text" data-action="cum25" data-project="${p.id}" data-field="청구" value="${proj.cum25.청구 ? formatNumber(proj.cum25.청구) : ''}" placeholder="0"/></td>
        ${monthsRow('청구')}
      </tr>
      <tr>
        <td class="label-cell">청구가능비용</td>
        <td class="value-yellow"><input class="cell-num" type="text" data-action="budget" data-project="${p.id}" data-field="청구가능비용" value="${proj.budget.청구가능비용 ? formatNumber(proj.budget.청구가능비용) : ''}" placeholder="0"/></td>
        <td class="label-pink">외주비</td>
        <td class="value-pink" title="프로젝트 페이지에서 자동 계산">${formatNumber(proj.cost.외주비, { zeroAsBlank: true })}</td>
        <td class="label-cell">잔액</td>
        <td class="value-cell ${salesBal < 0 ? 'red-text' : ''}">${formatNumber(salesBal, { zeroAsBlank: true })}</td>
        ${MONTHS.map((m) => {
          const recog = getMonthly(p.id, filter.year, m, '매출인식');
          const bill = getMonthly(p.id, filter.year, m, '청구');
          return `<td class="value-cell">${formatNumber(bill - recog, { zeroAsBlank: true })}</td>`;
        }).join('')}
      </tr>
      <tr>
        <td colspan="2" style="background:#fafafa;"></td>
        <td colspan="2" class="label-cell" style="text-align:center;">손익</td>
        <td colspan="2" class="value-cell ${profit < 0 ? 'red-text' : ''}">${formatNumber(profit)} <span style="color:#999;">(${rate.toFixed(2)}%)</span></td>
        <td colspan="2" class="value-cell ${billBal < 0 ? 'red-text' : ''}">잔액(청구): ${formatNumber(billBal, { zeroAsBlank: true })}</td>
        <td colspan="${MONTHS.length}"></td>
      </tr>
    `;
  }

  function bindEvents() {
    const y = mountEl.querySelector('#c-year');
    const p = mountEl.querySelector('#c-project');
    if (y) y.addEventListener('change', (e) => updateFilter({ year: Number(e.target.value) }));
    if (p) p.addEventListener('change', (e) => updateFilter({ project: e.target.value }));
    const clr = mountEl.querySelector('#c-clear');
    if (clr) clr.addEventListener('click', () => {
      if (!confirm(`${filter.year}년 월별 데이터를 모두 지울까요? (예산/누적은 유지됨)`)) return;
      Object.values(data).forEach((proj) => {
        if (proj.monthly && proj.monthly[filter.year]) delete proj.monthly[filter.year];
      });
      Store.write(STORE_KEY, data);
      render();
    });

    mountEl.querySelectorAll('input.cell-num').forEach((input) => {
      input.addEventListener('change', () => {
        const action = input.dataset.action;
        const projectId = input.dataset.project;
        const num = parseNumber(input.value);
        if (action === 'budget') {
          setField(projectId, `budget.${input.dataset.field}`, num);
        } else if (action === 'cost') {
          setField(projectId, `cost.${input.dataset.field}`, num);
        } else if (action === 'cum25') {
          setField(projectId, `cum25.${input.dataset.field}`, num);
        } else if (action === 'month') {
          setMonthly(projectId, filter.year, Number(input.dataset.month), input.dataset.kind, num);
        }
        render();
      });
    });

    // 프로젝트 이름 편집
    mountEl.querySelectorAll('input.proj-name-input').forEach((input) => {
      input.addEventListener('change', () => {
        Projects.setName(input.dataset.project, input.value);
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
