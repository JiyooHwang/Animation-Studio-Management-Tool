// 메인 앱 - 탭 라우팅
(function () {
  const PAGES = {
    personnel: { mountId: 'personnel-page', module: PersonnelPage },
    cost:      { mountId: 'cost-page',      module: CostPage },
    project:   { mountId: 'project-page',   module: ProjectPage },
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

    // 페이지 간 데이터 의존성(프로젝트→비용/인원)으로 매번 init하여 최신 derive 값 반영
    const page = PAGES[name];
    page.module.init(document.getElementById(page.mountId));

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
