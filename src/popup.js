const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

document.addEventListener('DOMContentLoaded', async () => {
  const toggle = document.getElementById('translationToggle');
  const useProblemJson = document.getElementById('useProblemJson');
  const refreshCacheBtn = document.getElementById('refreshCache');
  const clearAllCacheBtn = document.getElementById('clearAllCache');

  const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });

  // 1. 현재 탭이 LeetCode 문제 상세 페이지인지 검사
  let problemSlug = null;
  if (tab && tab.url) {
    const match = tab.url.match(/leetcode\.com\/problems\/([^/?#]+)/);
    if (match) {
      problemSlug = match[1];
      refreshCacheBtn.disabled = false; // 버튼 활성화
    }
  }

  browserAPI.storage.local.get([
    'translationEnabled',
    'useProblemJson'
  ], (result) => {
    toggle.checked = result.translationEnabled !== false;
    useProblemJson.checked = result.useProblemJson !== false;
  });

  useProblemJson.addEventListener('change', async () => {
    await browserAPI.storage.local.set({ useProblemJson: useProblemJson.checked });
    if (tab && tab.id) browserAPI.tabs.reload(tab.id);
  });

  toggle.addEventListener('change', async () => {
    const isEnabled = toggle.checked;
    await browserAPI.storage.local.set({ translationEnabled: isEnabled });
    if (tab && tab.id) browserAPI.tabs.reload(tab.id);
  });

  // 2. 현재 활성화된 문제의 캐시만 강제 갱신
  refreshCacheBtn.addEventListener('click', () => {
    if (!problemSlug) return;
    browserAPI.storage.local.get('lk_problem_cache', async (result) => {
      const cache = result.lk_problem_cache || {};
      if (problemSlug in cache) {
        delete cache[problemSlug];
        // 동반되는 힌트 및 ID 임시 캐시도 함께 정리
        Object.keys(cache).forEach(key => {
          if (key.startsWith('__id_empty_')) {
            delete cache[key];
          }
        });
        await browserAPI.storage.local.set({ lk_problem_cache: cache });
      }
      if (tab && tab.id) {
        browserAPI.tabs.reload(tab.id);
        window.close(); // 팝업 닫기
      }
    });
  });

  // 3. 전체 캐시 초기화
  clearAllCacheBtn.addEventListener('click', () => {
    const confirmClear = confirm("저장된 모든 문제의 지문 번역 캐시를 비우시겠습니까?\n(다음 접속 시 서버에서 새로 받아옵니다.)");
    if (confirmClear) {
      browserAPI.storage.local.set({ lk_problem_cache: {} }, () => {
        if (tab && tab.id) {
          browserAPI.tabs.reload(tab.id);
          window.close();
        }
      });
    }
  });

});
