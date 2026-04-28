/* eslint-disable no-unused-vars */
// 결산 페이지 - 재무팀 전달용
// 월별·프로젝트별로 내부비용 / 외주비용 / 청구금액을 표로 정리
// CSV 다운로드 지원
const SettlementPage = (function () {
  const STORE_FILTER = 'settlement.filter.v1';

  let mountEl = null;
  let filter = { year: 2026 };

  const KINDS = ['내부비용', '외주비용', '청구금액'];

  function init(rootEl) {
    mountEl = rootEl;
    const sf = Store.read(STORE_FILTER, null);
    if (sf) filter = Object.assign({}, filter, sf);
    render();
  }

  function persistFilter() {
    Store.write(STORE_FILTER, filter);
  }

  // 한 (project, kind, year, month) 조합의 값 반환
  function valueFor(projectId, kind, year, month) {
    if (kind === '내부비용') {
      return ProjectData.monthlyCostFor(projectId, year, month).internal;
    }
    if (kind === '외주비용') {
      return ProjectData.monthlyCostFor(projectId, year, month).external;
    }
    if (kind === '청구금액') {
      return CostData.monthlyBilling(projectId, year, month);
    }
    return 0;
  }

  function monthlyArrayFor(projectId, kind, year) {
    return MONTHS.map((m) => valueFor(projectId, kind, year, m));
  }

  function aggregateMonthly(projects, kind, year) {
    return MONTHS.map((m) => {
      let s = 0;
      projects.forEach((p) => { s += valueFor(p.id, kind, year, m); });
      return s;
    });
  }

  function sumArr(arr) {
    return arr.reduce((s, v) => s + (Number(v) || 0), 0);
  }

  function render() {
    if (!mountEl) return;
    const projects = Projects.list();

    mountEl.innerHTML = `
      <div class="topbar">
        <h1>월별 / 프로젝트별 결산</h1>
        <div class="summary"><strong>${filter.year}년</strong> · 프로젝트 ${projects.length}개 · 재무팀 전달용</div>
      </div>
      ${renderToolbar()}
      <div class="settlement-wrap">
        ${renderTable(projects)}
      </div>
    `;
    bindEvents();
  }

  function renderToolbar() {
    const yearOpts = YEARS.map(
      (y) => `<option value="${y}" ${y === filter.year ? 'selected' : ''}>${y}</option>`
    ).join('');

    return `
      <div class="settlement-toolbar">
        <label>연도</label>
        <select id="s-year">${yearOpts}</select>
        <span class="spacer" style="flex:1;"></span>
        <button class="btn" id="s-print" type="button">🖨 인쇄</button>
        <button class="btn primary" id="s-csv" type="button">⬇ CSV 다운로드</button>
      </div>
      <div class="settlement-hint">
        · 내부비용 / 외주비용은 [프로젝트] 페이지의 입력값에서 자동 계산됩니다.<br/>
        · 청구금액은 [비용] 페이지의 월별 청구 입력값에서 가져옵니다.
      </div>
    `;
  }

  function renderTable(projects) {
    const monthHeaders = MONTHS.map((m) => `<th>${m}월</th>`).join('');

    const hqRows = renderProjectBlock('본부 전체', projects, true);
    const projectBlocks = projects.map((p) => renderProjectBlock(p.name, [p], false)).join('');

    return `
      <table class="settlement-table">
        <thead>
          <tr>
            <th rowspan="2" class="col-project">프로젝트</th>
            <th rowspan="2" class="col-kind">구분</th>
            <th colspan="${MONTHS.length}" class="col-period">${filter.year}년</th>
            <th rowspan="2" class="col-total">연간 합계</th>
          </tr>
          <tr>${monthHeaders}</tr>
        </thead>
        <tbody>
          ${hqRows}
          ${projectBlocks}
        </tbody>
      </table>
    `;
  }

  // 한 프로젝트(또는 본부 전체)에 대해 3행(내부/외주/청구) 출력
  function renderProjectBlock(label, projects, isHQ) {
    const monthlyByKind = {};
    KINDS.forEach((kind) => {
      monthlyByKind[kind] = aggregateMonthly(projects, kind, filter.year);
    });

    const blockCls = isHQ ? 'block-hq' : 'block-project';

    const rows = KINDS.map((kind, i) => {
      const monthly = monthlyByKind[kind];
      const total = sumArr(monthly);
      const startCls = i === 0 ? ' row-block-start' : '';
      const endCls = i === KINDS.length - 1 ? ' row-block-end' : '';
      const projectCell = i === 0
        ? `<td rowspan="${KINDS.length}" class="col-project ${blockCls}">${escapeHtml(label)}</td>`
        : '';
      const kindCls = `kind-${kindKey(kind)}`;
      const monthCells = monthly.map(
        (v) => `<td class="num">${formatNumber(Math.round(v), { zeroAsBlank: true })}</td>`
      ).join('');
      return `
        <tr class="${blockCls}${startCls}${endCls}">
          ${projectCell}
          <td class="col-kind ${kindCls}">${kind}</td>
          ${monthCells}
          <td class="num col-total">${formatNumber(Math.round(total), { zeroAsBlank: true })}</td>
        </tr>
      `;
    }).join('');

    return rows;
  }

  function kindKey(kind) {
    if (kind === '내부비용') return 'internal';
    if (kind === '외주비용') return 'external';
    if (kind === '청구금액') return 'billing';
    return 'other';
  }

  function bindEvents() {
    const y = mountEl.querySelector('#s-year');
    if (y) y.addEventListener('change', (e) => {
      filter.year = Number(e.target.value);
      persistFilter();
      render();
    });

    const csvBtn = mountEl.querySelector('#s-csv');
    if (csvBtn) csvBtn.addEventListener('click', exportCSV);

    const printBtn = mountEl.querySelector('#s-print');
    if (printBtn) printBtn.addEventListener('click', () => window.print());
  }

  function exportCSV() {
    const projects = Projects.list();
    const lines = [];

    // 헤더
    const monthCols = MONTHS.map((m) => `${filter.year}-${String(m).padStart(2, '0')}`);
    lines.push(['프로젝트', '구분', ...monthCols, '연간 합계'].join(','));

    // 본부 전체
    KINDS.forEach((kind) => {
      const monthly = aggregateMonthly(projects, kind, filter.year).map((v) => Math.round(v));
      const total = sumArr(monthly);
      lines.push(['본부 전체', kind, ...monthly, total].join(','));
    });

    // 프로젝트별
    projects.forEach((p) => {
      KINDS.forEach((kind) => {
        const monthly = monthlyArrayFor(p.id, kind, filter.year).map((v) => Math.round(v));
        const total = sumArr(monthly);
        lines.push([csvCell(p.name), kind, ...monthly, total].join(','));
      });
    });

    // BOM (UTF-8) for Excel 한글 호환
    const csv = '﻿' + lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `결산_${filter.year}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 0);
  }

  function csvCell(s) {
    const str = String(s == null ? '' : s);
    if (/[,"\n\r]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
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
