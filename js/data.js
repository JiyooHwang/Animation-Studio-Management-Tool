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

// 비용/프로젝트 페이지의 프로젝트 (default seed)
const DEFAULT_PROJECTS = [
  { id: 'horangi',  category: '내부제작', name: '호랑이형님' },
  { id: 'toema2',   category: '내부제작', name: '퇴마록 2' },
  { id: 'jeonja',   category: '내부제작', name: '전자오락수호대' },
];

// 이전에 default로 들어있었으나 더 이상 시드하지 않는 프로젝트 id (자동 정리)
const LEGACY_REMOVED_PROJECT_IDS = ['kkokdu', 'elle', 'denma'];

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
    // 자동 정리: 더 이상 default가 아닌 legacy seed 프로젝트 제거 + 관련 데이터 정리
    const cleaned = stored.filter((p) => !LEGACY_REMOVED_PROJECT_IDS.includes(p.id));
    if (cleaned.length !== stored.length) {
      stored = cleaned;
      Store.write(this.STORE_LIST, stored);
      // 관련 데이터 cleanup (project.rows.v2, cost.v1)
      const rows = Store.read('project.rows.v2', null);
      if (rows && typeof rows === 'object') {
        let touched = false;
        LEGACY_REMOVED_PROJECT_IDS.forEach((id) => {
          if (rows[id]) { delete rows[id]; touched = true; }
        });
        if (touched) Store.write('project.rows.v2', rows);
      }
      const cost = Store.read('cost.v1', null);
      if (cost && typeof cost === 'object') {
        let touched = false;
        LEGACY_REMOVED_PROJECT_IDS.forEach((id) => {
          if (cost[id]) { delete cost[id]; touched = true; }
        });
        if (touched) Store.write('cost.v1', cost);
      }
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
//
// 데이터 모델 v2: 각 프로젝트가 팀별 1행을 고정 보유
//   { [projectId]: { [teamId]: { kind: '내부'|'외주', weeks: {key: n}, rateOverride?, externalCost? } } }
const ProjectData = {
  STORE_ROWS: 'project.rows.v2',
  STORE_ROWS_LEGACY: 'project.rows.v1',

  // 모든 프로젝트의 행 데이터 (team-id로 키된 맵)
  allRows() {
    let stored = Store.read(this.STORE_ROWS, null);
    if (stored) return stored;
    // v1(배열) → v2(team-id 맵) 마이그레이션
    const legacy = Store.read(this.STORE_ROWS_LEGACY, null);
    const out = {};
    if (legacy && typeof legacy === 'object') {
      Object.entries(legacy).forEach(([pid, rows]) => {
        const map = {};
        if (Array.isArray(rows)) {
          rows.forEach((r) => {
            if (!r || !r.teamId) return;
            if (map[r.teamId]) return; // 중복 시 첫 번째 행 유지
            map[r.teamId] = {
              kind: r.kind || '내부',
              weeks: r.weeks || {},
              rateOverride: r.rateOverride,
              externalCost: (r.kind === '외주' && r.manualCost) ? Number(r.manualCost) || 0 : 0,
            };
          });
        }
        out[pid] = map;
      });
    }
    Store.write(this.STORE_ROWS, out);
    return out;
  },

  saveAllRows(all) {
    Store.write(this.STORE_ROWS, all);
  },

  // 프로젝트의 팀별 행 조회 (없으면 default)
  rowFor(projectId, teamId) {
    const all = this.allRows();
    const projRows = all[projectId] || {};
    return projRows[teamId] || { kind: '내부', weeks: {}, rateOverride: undefined, externalCost: 0 };
  },

  // 단일 행 업데이트
  setRow(projectId, teamId, patch) {
    const all = this.allRows();
    if (!all[projectId]) all[projectId] = {};
    const cur = all[projectId][teamId] || { kind: '내부', weeks: {}, externalCost: 0 };
    all[projectId][teamId] = Object.assign({}, cur, patch);
    this.saveAllRows(all);
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
    // teamId는 row 객체에 직접 들어있지 않음 — 호출자가 알고 있어야 함
    return Projects.rateFor(row && row._teamId);
  },

  // teamId를 행에 주입한 형태로 조회 (rowRate 계산을 위해)
  withTeamId(projectId, teamId) {
    const r = this.rowFor(projectId, teamId);
    return Object.assign({ _teamId: teamId }, r);
  },

  // 내부비용 = (kind==내부일 때) resources × rate, 그 외엔 0
  rowInternalCost(projectId, teamId) {
    const r = this.withTeamId(projectId, teamId);
    if (r.kind !== '내부') return 0;
    return this.rowResources(r) * this.rowRate(r);
  },

  // 외주비용 = 그 팀의 외주 항목 월별 합계 (사용자가 추가하는 외주 행에서 derive)
  // 만약 외주 항목이 없으면 legacy externalCost(lump sum) fallback
  rowExternalCost(projectId, teamId) {
    const fromItems = this.externalSumForTeam(projectId, teamId);
    if (fromItems > 0) return fromItems;
    const r = this.rowFor(projectId, teamId);
    return Number(r.externalCost) || 0;
  },

  // === 외주 항목 (사용자가 행 추가, 팀 선택, 월별 입력) ===
  STORE_EXTERNAL: 'project.external.v1', // { [projectId]: [ {id, teamId, monthly: {YYYY-M: n}} ] }

  allExternal() {
    const data = Store.read(this.STORE_EXTERNAL, {});
    return data && typeof data === 'object' ? data : {};
  },
  externalItems(projectId) {
    const data = this.allExternal();
    return Array.isArray(data[projectId]) ? data[projectId] : [];
  },
  saveExternal(all) {
    Store.write(this.STORE_EXTERNAL, all);
  },
  addExternalItem(projectId, teamId) {
    const all = this.allExternal();
    if (!Array.isArray(all[projectId])) all[projectId] = [];
    const id = 'ext_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    all[projectId].push({
      id,
      teamId: teamId || (TEAMS[0] ? TEAMS[0].id : ''),
      monthly: {},
    });
    this.saveExternal(all);
    return id;
  },
  removeExternalItem(projectId, itemId) {
    const all = this.allExternal();
    if (!Array.isArray(all[projectId])) return;
    all[projectId] = all[projectId].filter((x) => x.id !== itemId);
    this.saveExternal(all);
  },
  updateExternalItem(projectId, itemId, patch) {
    const all = this.allExternal();
    const list = all[projectId];
    if (!Array.isArray(list)) return;
    const idx = list.findIndex((x) => x.id === itemId);
    if (idx < 0) return;
    list[idx] = Object.assign({}, list[idx], patch);
    this.saveExternal(all);
  },
  setExternalMonthly(projectId, itemId, year, month, value) {
    const all = this.allExternal();
    const list = all[projectId];
    if (!Array.isArray(list)) return;
    const item = list.find((x) => x.id === itemId);
    if (!item) return;
    const monthly = Object.assign({}, item.monthly || {});
    const k = `${year}-${month}`;
    if (!value) delete monthly[k];
    else monthly[k] = Number(value);
    item.monthly = monthly;
    this.saveExternal(all);
  },
  externalSumForTeam(projectId, teamId) {
    let s = 0;
    this.externalItems(projectId).forEach((item) => {
      if (item.teamId !== teamId) return;
      Object.values(item.monthly || {}).forEach((v) => { s += Number(v) || 0; });
    });
    return s;
  },
  externalSumForTeamMonth(projectId, teamId, year, month) {
    const k = `${year}-${month}`;
    let s = 0;
    this.externalItems(projectId).forEach((item) => {
      if (item.teamId !== teamId) return;
      s += Number((item.monthly || {})[k]) || 0;
    });
    return s;
  },
  externalSumForMonth(projectId, year, month) {
    const k = `${year}-${month}`;
    let s = 0;
    this.externalItems(projectId).forEach((item) => {
      s += Number((item.monthly || {})[k]) || 0;
    });
    return s;
  },

  // 비용 페이지에 표시할 프로젝트 별 총합
  totalsFor(projectId) {
    let internal = 0;
    let external = 0;
    TEAMS.forEach((t) => {
      internal += this.rowInternalCost(projectId, t.id);
      external += this.rowExternalCost(projectId, t.id);
    });
    return { 내부비용: internal, 외주비: external, 총비용: internal + external };
  },

  // 프로젝트의 (year, month) 월별 비용
  // - 내부비용 = (kind=='내부') ? 그 달 4주의 리소스 × 단가 : 0
  // - 외주비용 = 외주 항목의 그 달 입력값 합계 (사용자가 직접 월별로 입력)
  monthlyCostFor(projectId, year, month) {
    let internal = 0;
    TEAMS.forEach((t) => {
      const r = this.withTeamId(projectId, t.id);
      if (r.kind !== '내부') return;
      const monthRes = [1, 2, 3, 4].reduce((s, w) => {
        const k = `${year}-${month}-${w}`;
        return s + (Number((r.weeks || {})[k]) || 0);
      }, 0);
      if (monthRes <= 0) return;
      internal += monthRes * this.rowRate(r);
    });
    const external = this.externalSumForMonth(projectId, year, month);
    return { internal, external, total: internal + external };
  },

  // 인원 페이지의 (team, year, month, week) 셀 값 - projectFilter('ALL' | projectId) 적용
  headcountFor(teamId, year, month, week, projectFilter) {
    const all = this.allRows();
    const key = `${year}-${month}-${week}`;
    let s = 0;
    Object.entries(all).forEach(([pid, projRows]) => {
      if (projectFilter && projectFilter !== 'ALL' && pid !== projectFilter) return;
      if (!projRows || typeof projRows !== 'object') return;
      const row = projRows[teamId];
      if (!row) return;
      const v = (row.weeks || {})[key];
      if (v !== undefined && v !== null && v !== '') s += Number(v) || 0;
    });
    return s;
  },
};

// 비용 페이지의 사용자 입력값(월별 매출인식/청구) 조회 헬퍼
// - 결산 페이지에서 청구금액을 derive하기 위함
const CostData = {
  STORE_KEY: 'cost.v1',

  raw() {
    return Store.read(this.STORE_KEY, {}) || {};
  },

  projectData(projectId) {
    const all = this.raw();
    return all[projectId] || null;
  },

  // kind: '매출인식' | '청구'
  monthlyValue(projectId, year, month, kind) {
    const proj = this.projectData(projectId);
    if (!proj) return 0;
    const v = Store.getIn(proj, `monthly.${year}.${month}.${kind}`, 0);
    return Number(v) || 0;
  },

  monthlyBilling(projectId, year, month) {
    return this.monthlyValue(projectId, year, month, '청구');
  },

  monthlyRecognition(projectId, year, month) {
    return this.monthlyValue(projectId, year, month, '매출인식');
  },
};

// 본부인원(roster) 헬퍼 - 인원 페이지가 팀별 가용 인원을 derive
const RosterData = {
  STORE_LIST: 'roster.list.v1',

  list() {
    const data = Store.read(this.STORE_LIST, []);
    return Array.isArray(data) ? data : [];
  },

  // 휴직 중인지 판정
  // - empType === '휴직' AND 현재 월이 leaveStart~leaveEnd 범위 안에 있음
  // - leaveStart/leaveEnd 미설정 시: 전체 기간 휴직으로 간주
  isOnLeave(person, year, month) {
    if (!person || person.empType !== '휴직') return false;
    const start = person.leaveStart;  // 'YYYY-MM'
    const end = person.leaveEnd;
    const cur = `${year}-${String(month).padStart(2, '0')}`;
    if (start && cur < start) return false;
    if (end && cur > end) return false;
    return true;
  },

  // 휴직 중이면 0, 아니면 stored monthly 값
  effectiveMonthly(person, year, month) {
    if (this.isOnLeave(person, year, month)) return 0;
    const v = (person.monthly || {})[`${year}-${month}`];
    if (v === undefined || v === null || v === '') return 0;
    return Number(v) || 0;
  },

  // 특정 팀의 (year, month) 가용 인원 수 (휴직 제외)
  countForTeamMonth(teamId, year, month) {
    let count = 0;
    this.list().forEach((p) => {
      if (p.teamId !== teamId) return;
      count += this.effectiveMonthly(p, year, month);
    });
    return count;
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
