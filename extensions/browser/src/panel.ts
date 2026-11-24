import {
  CogniDevtoolsSnapshotStore,
  mountCogniDevtoolsPanel,
  type CogniDevtoolsCommand,
  type CogniDevtoolsSnapshot,
} from "@inttegro/cogni-devtools";

import { panelPortName, type ExtensionMessage } from "./protocol";

const root = document.getElementById("root");
if (!root) throw new TypeError("Cogni DevTools panel root is missing");

const store = new CogniDevtoolsSnapshotStore();
const port = chrome.runtime.connect({
  name: panelPortName(chrome.devtools.inspectedWindow.tabId),
});

mountCogniDevtoolsPanel(root, {
  store,
  mode: "extension",
  onCommand(command: CogniDevtoolsCommand) {
    port.postMessage({ type: "command", command } satisfies ExtensionMessage);
  },
});

port.onMessage.addListener((message: ExtensionMessage) => {
  if (message.type === "snapshot") {
    store.setSnapshot(message.snapshot as CogniDevtoolsSnapshot);
  }
});

port.postMessage({ type: "request_snapshot" } satisfies ExtensionMessage);
