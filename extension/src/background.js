const LOGGING_MENU_ID = 'enable-logging';

chrome.runtime.onInstalled.addListener(async () => {
  const { loggingEnabled } = await chrome.storage.local.get({ loggingEnabled: false });
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: LOGGING_MENU_ID,
    title: 'Enable logging',
    type: 'checkbox',
    contexts: ['action'],
    checked: loggingEnabled === true,
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== LOGGING_MENU_ID) return;
  await chrome.storage.local.set({ loggingEnabled: info.checked === true });
});
