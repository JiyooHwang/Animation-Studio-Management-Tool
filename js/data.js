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

// 프로젝트명 / 주당단가 헬퍼 (이름 사용자 편집 가능)
const Projects = {
  STORE_NAMES: 'projects.names.v1',
  STORE_RATES: 'projects.rates.v1',
  DEFAULT_RATES: { exec: 3000000, premium: 2520000, standard: 2030000 },

  getName(id) {
    const names = Store.read(this.STORE_NAMES, {});
    if (names[id]) return names[id];
    const p = DEFAULT_PROJECTS.find((x) => x.id === id);
    return p ? p.name : '';
  },

  setName(id, name) {
    const names = Store.read(this.STORE_NAMES, {});
    const trimmed = (name || '').trim();
    if (trimmed) names[id] = trimmed;
    else delete names[id];
    Store.write(this.STORE_NAMES, names);
  },

  list() {
    return DEFAULT_PROJECTS.map((p) => ({ ...p, name: this.getName(p.id) }));
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
