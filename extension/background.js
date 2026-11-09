// Open the settings page on install when no PIN is configured yet.
chrome.runtime.onInstalled.addListener(async () => {
  const { pin } = await chrome.storage.local.get("pin");
  if (!pin) chrome.runtime.openOptionsPage();
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.runtime.onMessage.addListener((msg) => {
  if (msg === "open-options") chrome.runtime.openOptionsPage();
});
