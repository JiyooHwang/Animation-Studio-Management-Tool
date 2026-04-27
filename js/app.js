// 메인 앱 - 탭 라우팅
(function () {
  const PAGES = {
    personnel: { mountId: 'personnel-page', module: PersonnelPage, initialized: false },
    cost:      { mountId: 'cost-page',      module: CostPage,      initialized: false },
  };

  const STORE_TAB = 'app.activeTab.v1';

  function activate(name) {
    if (!PAGES[name]) return;

    document.querySelectorAll('.tab').forEach((b) => {
      b.classList.toggle('active', b.dataset.page === name);
    });
    document.querySelectorAll('.page').forEach((p) => {
      p.classList.toggle('active', p.id === PAGES[name].mountId);
    });

    const page = PAGES[name];
    if (!page.initialized) {
      page.module.init(document.getElementById(page.mountId));
      page.initialized = true;
    }

    Store.write(STORE_TAB, name);
  }

  function init() {
    document.querySelectorAll('.tab').forEach((btn) => {
      btn.addEventListener('click', () => activate(btn.dataset.page));
    });

    const saved = Store.read(STORE_TAB, 'personnel');
    activate(PAGES[saved] ? saved : 'personnel');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
