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

  // 한 프로젝트(또는 본부 전체)에 대해 행들 출력 (3 fixed rows + N deposit rows + add row)
  function renderProjectBlock(label, projects, isHQ) {
    const fixedKinds = ['내부비용', '외주비용', '청구금액'];
    const monthlyByKind = {};
    fixedKinds.forEach((kind) => {
      monthlyByKind[kind] = aggregateMonthly(projects, kind, filter.year);
    });

    const blockCls = isHQ ? 'block-hq' : 'block-project';

    // 입금 데이터 결정
    let deposits = [];
    let aggregateDepositMonthly = null;
    if (isHQ) {
      // 본부: 모든 프로젝트의 입금 합계 (단일 row)
      aggregateDepositMonthly = MONTHS.map((m) =>
        SettlementData.depositSumForProjectsMonth(projects, filter.year, m)
      );
    } else {
      deposits = SettlementData.depositsFor(projects[0].id);
    }

    const totalRows = fixedKinds.length
      + (isHQ ? 1 : deposits.length + 1); // +1 for "+ 입금처 추가" row

    let html = '';

    // 3 fixed rows: 내부비용 / 외주비용 / 청구금액
    fixedKinds.forEach((kind, i) => {
      const monthly = monthlyByKind[kind];
      const total = sumArr(monthly);
      const isFirstRow = i === 0;
      const startCls = isFirstRow ? ' row-block-start' : '';
      const projectCell = isFirstRow
        ? `<td rowspan="${totalRows}" class="col-project ${blockCls}">${escapeHtml(label)}</td>`
        : '';
      const kindCls = `kind-${kindKey(kind)}`;
      const monthCells = monthly.map(
        (v) => `<td class="num">${formatNumber(Math.round(v), { zeroAsBlank: true })}</td>`
      ).join('');
      html += `
        <tr class="${blockCls}${startCls}">
          ${projectCell}
          <td class="col-kind ${kindCls}">${kind}</td>
          ${monthCells}
          <td class="num col-total">${formatNumber(Math.round(total), { zeroAsBlank: true })}</td>
        </tr>
      `;
    });

    // 입금 rows
    if (isHQ) {
      const total = sumArr(aggregateDepositMonthly);
      const monthCells = aggregateDepositMonthly.map(
        (v) => `<td class="num">${formatNumber(Math.round(v), { zeroAsBlank: true })}</td>`
      ).join('');
      html += `
        <tr class="${blockCls} row-block-end">
          <td class="col-kind kind-deposit">입금 합계</td>
          ${monthCells}
          <td class="num col-total">${formatNumber(Math.round(total), { zeroAsBlank: true })}</td>
        </tr>
      `;
    } else {
      const projectId = projects[0].id;
      // 각 입금처 row (편집 가능)
      deposits.forEach((d) => {
        const monthlyArr = MONTHS.map((m) => Number((d.monthly || {})[`${filter.year}-${m}`]) || 0);
        const totalDep = sumArr(monthlyArr);
        const monthCells = monthlyArr.map((v, mi) => {
          const month = MONTHS[mi];
          const display = v ? formatNumber(v) : '';
          return `<td class="num"><input class="dep-month-input" type="text" data-action="dep-month" data-project="${projectId}" data-id="${d.id}" data-year="${filter.year}" data-month="${month}" value="${display}" placeholder=""/></td>`;
        }).join('');
        html += `
          <tr class="${blockCls} row-deposit">
            <td class="col-kind kind-deposit">
              <span class="dep-prefix">입금:</span>
              <input class="dep-payer-input" type="text" data-action="dep-payer" data-project="${projectId}" data-id="${d.id}" value="${escapeHtml(d.payer || '')}" placeholder="입금처" />
              <button class="btn-dep-del" type="button" data-action="dep-del" data-project="${projectId}" data-id="${d.id}" title="입금처 삭제">×</button>
            </td>
            ${monthCells}
            <td class="num col-total">${formatNumber(Math.round(totalDep), { zeroAsBlank: true })}</td>
          </tr>
        `;
      });
      // "+ 입금처 추가" row - 버튼은 구분 컬럼에만 배치
      const emptyMonthCells = MONTHS.map(() => '<td class="num"></td>').join('');
      html += `
        <tr class="${blockCls} row-block-end row-deposit-add">
          <td class="col-kind kind-deposit-add">
            <button class="btn-dep-add" type="button" data-action="dep-add" data-project="${projectId}">+ 입금처 추가</button>
          </td>
          ${emptyMonthCells}
          <td class="num col-total"></td>
        </tr>
      `;
    }

    return html;
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

    // 입금처 추가
    mountEl.querySelectorAll('[data-action="dep-add"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        SettlementData.addDeposit(btn.dataset.project, '');
        render();
      });
    });

    // 입금처 삭제
    mountEl.querySelectorAll('[data-action="dep-del"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!confirm('이 입금처를 삭제할까요?')) return;
        SettlementData.removeDeposit(btn.dataset.project, btn.dataset.id);
        render();
      });
    });

    // 입금처 이름 편집 (재렌더 불필요)
    mountEl.querySelectorAll('[data-action="dep-payer"]').forEach((input) => {
      input.addEventListener('change', () => {
        SettlementData.updateDepositPayer(input.dataset.project, input.dataset.id, input.value);
      });
    });

    // 월별 입금액 편집
    mountEl.querySelectorAll('[data-action="dep-month"]').forEach((input) => {
      input.addEventListener('change', () => {
        const num = parseNumber(input.value);
        SettlementData.setDepositMonthly(
          input.dataset.project,
          input.dataset.id,
          Number(input.dataset.year),
          Number(input.dataset.month),
          num
        );
        render();
      });
    });
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
    // 본부 전체 입금 합계
    const hqDepMonthly = MONTHS.map((m) =>
      Math.round(SettlementData.depositSumForProjectsMonth(projects, filter.year, m))
    );
    lines.push(['본부 전체', '입금 합계', ...hqDepMonthly, sumArr(hqDepMonthly)].join(','));

    // 프로젝트별
    projects.forEach((p) => {
      KINDS.forEach((kind) => {
        const monthly = monthlyArrayFor(p.id, kind, filter.year).map((v) => Math.round(v));
        const total = sumArr(monthly);
        lines.push([csvCell(p.name), kind, ...monthly, total].join(','));
      });
      // 프로젝트의 입금처별 행
      const deposits = SettlementData.depositsFor(p.id);
      deposits.forEach((d) => {
        const monthly = MONTHS.map((m) => Math.round(Number((d.monthly || {})[`${filter.year}-${m}`]) || 0));
        const label = '입금: ' + (d.payer || '(미지정)');
        lines.push([csvCell(p.name), csvCell(label), ...monthly, sumArr(monthly)].join(','));
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
