const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

document.addEventListener('DOMContentLoaded', async () => {
  const toggle = document.getElementById('translationToggle');
  const useProblemJson = document.getElementById('useProblemJson');

  const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });

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
});
