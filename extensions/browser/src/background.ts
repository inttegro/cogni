import { CONTENT_PORT, tabIdFromPanelPort, type ExtensionMessage } from "./protocol";

const contentPorts = new Map<number, chrome.runtime.Port>();
const panelPorts = new Map<number, Set<chrome.runtime.Port>>();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === CONTENT_PORT) {
    const tabId = port.sender?.tab?.id;
    if (tabId === undefined) return;
    contentPorts.set(tabId, port);
    port.onMessage.addListener((message: ExtensionMessage) => {
      for (const panel of panelPorts.get(tabId) ?? []) {
        safelyPost(panel, message);
      }
    });
    port.onDisconnect.addListener(() => {
      if (contentPorts.get(tabId) === port) contentPorts.delete(tabId);
    });
    return;
  }

  const tabId = tabIdFromPanelPort(port.name);
  if (tabId === null) return;
  const panels = panelPorts.get(tabId) ?? new Set<chrome.runtime.Port>();
  panels.add(port);
  panelPorts.set(tabId, panels);
  port.onMessage.addListener((message: ExtensionMessage) => {
    const content = contentPorts.get(tabId);
    if (content) safelyPost(content, message);
  });
  port.onDisconnect.addListener(() => {
    panels.delete(port);
    if (panels.size === 0) panelPorts.delete(tabId);
  });
});

function safelyPost(port: chrome.runtime.Port, message: ExtensionMessage): void {
  try {
    port.postMessage(message);
  } catch {
    // Ports can disappear when a tab, page, or DevTools window closes.
  }
}
