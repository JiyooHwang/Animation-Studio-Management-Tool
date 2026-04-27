/* eslint-disable no-unused-vars */
// localStorage 래퍼 - 페이지별 키 분리
const Store = (function () {
  const PREFIX = 'asmt.';

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn('Store.read failed', key, e);
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) {
      console.error('Store.write failed', key, e);
    }
  }

  function remove(key) {
    localStorage.removeItem(PREFIX + key);
  }

  // 깊은 경로로 set/get (예: setPath('foo.bar.baz', 1) -> {foo:{bar:{baz:1}}})
  function setIn(obj, path, value) {
    const keys = path.split('.');
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
      cur = cur[k];
    }
    cur[keys[keys.length - 1]] = value;
    return obj;
  }

  function getIn(obj, path, fallback) {
    if (!obj) return fallback;
    const keys = path.split('.');
    let cur = obj;
    for (const k of keys) {
      if (cur == null || typeof cur !== 'object') return fallback;
      cur = cur[k];
    }
    return cur === undefined ? fallback : cur;
  }

  return { read, write, remove, setIn, getIn };
})();
