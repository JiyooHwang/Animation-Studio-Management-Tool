/* eslint-disable no-unused-vars */
// 팀 정의 - 인원 페이지 (image 1 기준)
// premium: true → 주당단가가 PD/Sup/Dr/IPB/IPS rate 적용
const TEAMS = [
  { id: 'exec',         name: '',                          role: '부사장/본부장',          color: '#dcdcdc', exec: true },
  { id: 'global',       name: '',                          role: '글로벌 사업 개발실',     color: '#ffffff' },
  { id: 'ipBiz',        name: '',                          role: 'IP사업실',               color: '#ffffff', premium: true },
  { id: 'ipStrategy',   name: '',                          role: 'IP전략실',               color: '#ffffff', premium: true },
  { id: 'producer',     name: 'Producer실',                role: '피디 / 코디네이터',      color: '#dcdcdc', premium: true },
  { id: 'supervisor',   name: 'Supervisor실',              role: '수퍼바이저',             color: '#7ee0e0', premium: true },
  { id: 'storyDR',      name: 'Story Development팀 DR',    role: '감독 / 연출',            color: '#a4e9a4', premium: true },
  { id: 'storyStory',   name: 'Story Development팀 Story', role: '구성안 & 시나리오',      color: '#fbcfe8' },
  { id: 'storySB',      name: 'Story Development팀 SB',    role: '스토리보드 & 애니메틱',   color: '#f9a8d4' },
  { id: 'visualDev',    name: 'Visual Development팀',      role: '디자인 & 컬러키',        color: '#fcb045' },
  { id: 'modeling',     name: 'Modeling팀',                role: '모델링',                 color: '#5eead4' },
  { id: 'lookDev',      name: 'Look Development팀',        role: '룩디벨롭',               color: '#d9e021' },
  { id: 'cfx',          name: 'CFX팀',                     role: '리깅',                   color: '#fef3a3' },
  { id: 'animation',    name: 'Animation팀',               role: '애니메이션',             color: '#a78bfa' },
  { id: 'simulation',   name: 'Simulation팀',              role: 'Simulation',             color: '#15803d', textColor: '#fff' },
  { id: 'blender',      name: 'Blender팀',                 role: 'Blender',                color: '#f59e0b' },
  { id: 'fx',           name: 'FX팀',                      role: '이펙트',                 color: '#fda4af' },
  { id: 'lighting',     name: 'Lighting팀',                role: '라이팅 & 렌더',          color: '#3b82f6', textColor: '#fff' },
  { id: 'composite',    name: 'Composite팀',               role: '합성 / 모션그래픽',      color: '#fb923c' },
  { id: 'unreal',       name: 'Unreal팀',                  role: '언리얼 TA/TD',           color: '#f3c1d7' },
  { id: 'post',         name: 'POST',                      role: 'POST',                   color: '#ff00aa', textColor: '#fff' },
];

function getTeam(id) {
  return TEAMS.find((t) => t.id === id);
}

// 비용/프로젝트 페이지의 프로젝트 (default)
const DEFAULT_PROJECTS = [
  { id: 'horangi',  category: '내부제작', name: '호랑이형님' },
  { id: 'toema2',   category: '내부제작', name: '퇴마록 2' },
  { id: 'jeonja',   category: '내부제작', name: '전자오락수호대' },
  { id: 'kkokdu',   category: '내부제작', name: '꼭두' },
  { id: 'elle',     category: '내부제작', name: 'Elle' },
  { id: 'denma',    category: '내부제작', name: '덴마' },
];

// 프로젝트 목록 / 주당단가 헬퍼 (사용자 추가/삭제/이름 편집 가능)
const Projects = {
  STORE_LIST: 'projects.list.v1',     // [ { id, category, name } ]
  STORE_RATES: 'projects.rates.v1',
  STORE_NAMES_LEGACY: 'projects.names.v1', // 마이그레이션용
  DEFAULT_RATES: { exec: 3000000, premium: 2520000, standard: 2030000 },

  list() {
    let stored = Store.read(this.STORE_LIST, null);
    if (!stored) {
      // 이전 버전(이름만 저장)에서 마이그레이션
      const legacy = Store.read(this.STORE_NAMES_LEGACY, {});
      stored = DEFAULT_PROJECTS.map((p) => ({
        ...p,
        name: legacy[p.id] || p.name,
      }));
      Store.write(this.STORE_LIST, stored);
    }
    return stored;
  },

  saveList(list) {
    Store.write(this.STORE_LIST, list);
  },

  getName(id) {
    const p = this.list().find((x) => x.id === id);
    return p ? p.name : '';
  },

  setName(id, name) {
    const list = this.list();
    const p = list.find((x) => x.id === id);
    if (!p) return;
    const trimmed = (name || '').trim();
    p.name = trimmed || p.name;
    this.saveList(list);
  },

  add(name, category) {
    const list = this.list();
    const id = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    list.push({
      id,
      category: category || '내부제작',
      name: (name || '').trim() || '신규 프로젝트',
    });
    this.saveList(list);
    return id;
  },

  remove(id) {
    const list = this.list().filter((p) => p.id !== id);
    this.saveList(list);
    // 연결된 데이터(프로젝트 행 / 비용 데이터)도 청소
    const allRows = Store.read(ProjectData.STORE_ROWS, {});
    if (allRows[id]) {
      delete allRows[id];
      Store.write(ProjectData.STORE_ROWS, allRows);
    }
    const cost = Store.read('cost.v1', {});
    if (cost[id]) {
      delete cost[id];
      Store.write('cost.v1', cost);
    }
  },

  filterOptions() {
    return [{ value: 'ALL', label: 'ALL' }].concat(
      this.list().map((p) => ({ value: p.id, label: p.name }))
    );
  },

  getRates() {
    const r = Store.read(this.STORE_RATES, null);
    return r ? Object.assign({}, this.DEFAULT_RATES, r) : Object.assign({}, this.DEFAULT_RATES);
  },

  setRates(rates) {
    Store.write(this.STORE_RATES, rates);
  },

  rateFor(teamId) {
    const t = getTeam(teamId);
    const rates = this.getRates();
    if (t && t.exec) return rates.exec;
    if (t && t.premium) return rates.premium;
    return rates.standard;
  },
};

// 프로젝트 페이지 행 데이터 + 집계 helper
// 비용 페이지(총비용/내부비용/외주비), 인원 페이지(주별 리소스합) 모두 여기서 derive
const ProjectData = {
  STORE_ROWS: 'project.rows.v1',

  allRows() {
    return Store.read(this.STORE_ROWS, {});
  },

  rows(projectId) {
    return this.allRows()[projectId] || [];
  },

  rowResources(row) {
    let s = 0;
    if (!row || !row.weeks) return 0;
    Object.values(row.weeks).forEach((v) => { s += Number(v) || 0; });
    return s;
  },

  rowRate(row) {
    if (row && row.rateOverride !== undefined && row.rateOverride !== null && row.rateOverride !== '') {
      return Number(row.rateOverride) || 0;
    }
    return Projects.rateFor(row && row.teamId);
  },

  // manualCost가 있으면 우선 사용 (외주비 항목 직접 입력 등)
  rowCost(row) {
    if (row && row.manualCost !== undefined && row.manualCost !== null && row.manualCost !== '') {
      return Number(row.manualCost) || 0;
    }
    return this.rowResources(row) * this.rowRate(row);
  },

  // 비용 페이지에 표시할 프로젝트 별 총합
  totalsFor(projectId) {
    const rows = this.rows(projectId);
    let internal = 0;
    let external = 0;
    rows.forEach((r) => {
      const c = this.rowCost(r);
      if (r.kind === '내부') internal += c;
      else if (r.kind === '외주') external += c;
    });
    return { 내부비용: internal, 외주비: external, 총비용: internal + external };
  },

  // 인원 페이지의 (team, year, month, week) 셀 값 - projectFilter('ALL' | projectId) 적용
  headcountFor(teamId, year, month, week, projectFilter) {
    const all = this.allRows();
    const key = `${year}-${month}-${week}`;
    let s = 0;
    Object.entries(all).forEach(([pid, rows]) => {
      if (projectFilter && projectFilter !== 'ALL' && pid !== projectFilter) return;
      rows.forEach((r) => {
        if (!r || r.teamId !== teamId) return;
        const v = (r.weeks || {})[key];
        if (v !== undefined && v !== null && v !== '') s += Number(v) || 0;
      });
    });
    return s;
  },
};

// 연도 옵션
const YEARS = [2024, 2025, 2026, 2027, 2028];

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// 색상 휘도에 따른 텍스트 색
function pickTextColor(hex) {
  const c = (hex || '#ffffff').replace('#', '');
  if (c.length !== 6) return '#1f1f1f';
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1f1f1f' : '#ffffff';
}

// 숫자 포매팅
function formatNumber(value, opts = {}) {
  if (value === null || value === undefined || value === '' || isNaN(value)) {
    return opts.zeroAsBlank ? '' : '0';
  }
  const num = Number(value);
  if (num === 0 && opts.zeroAsBlank) return '';
  if (opts.decimal !== undefined) return num.toFixed(opts.decimal);
  return num.toLocaleString('ko-KR');
}

function parseNumber(str) {
  if (str === null || str === undefined || str === '') return 0;
  const cleaned = String(str).replace(/[^0-9.\-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// 주차의 연중 주 번호 (월×4 + 주, 단순화)
function weekOfYear(month, week) {
  return (month - 1) * 4 + week;
}
