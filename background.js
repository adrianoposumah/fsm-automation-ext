chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("app.html");
  const ada = await chrome.tabs.query({ url });
  if (ada.length) {
    await chrome.tabs.update(ada[0].id, { active: true });
    await chrome.windows.update(ada[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
});
