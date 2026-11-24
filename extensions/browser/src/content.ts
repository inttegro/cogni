import {
  CONTENT_PORT,
  extensionMessageToPageMessage,
  pageMessageToExtensionMessage,
  type ExtensionMessage,
} from "./protocol";

const port = chrome.runtime.connect({ name: CONTENT_PORT });

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (event.source !== window) return;
  const message = pageMessageToExtensionMessage(event.data);
  if (message) port.postMessage(message);
});

port.onMessage.addListener((message: ExtensionMessage) => {
  const pageMessage = extensionMessageToPageMessage(message);
  if (pageMessage) window.postMessage(pageMessage, targetOrigin());
});

function targetOrigin(): string {
  return window.location.origin === "null" ? "*" : window.location.origin;
}
