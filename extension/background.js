// Open the settings page on install when no PIN is configured yet.
chrome.runtime.onInstalled.addListener(async () => {
  const { pin } = await chrome.storage.local.get("pin");
  if (!pin) chrome.runtime.openOptionsPage();
});

// Lock the WhatsApp tab in the focused window. Returns false when the active
// tab is not WhatsApp Web (no content script answers).
async function lockActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) return false;
  try {
    await chrome.tabs.sendMessage(tab.id, "lock");
    return true;
  } catch {
    return false;
  }
}

// Shortcut (default Alt+Shift+L, editable at edge://extensions/shortcuts).
chrome.commands.onCommand.addListener((command) => {
  if (command === "lock") lockActiveTab();
});

// Toolbar icon: lock WhatsApp if it is the active tab, otherwise open settings.
chrome.action.onClicked.addListener(async () => {
  if (!(await lockActiveTab())) chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg === "open-options") chrome.runtime.openOptionsPage();
});
