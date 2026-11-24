import {
  COGNI_DEVTOOLS_PROTOCOL,
  emptyCogniDevtoolsSnapshot,
} from "@inttegro/cogni-devtools";
import { describe, expect, it } from "vitest";

import {
  extensionMessageToPageMessage,
  pageMessageToExtensionMessage,
  panelPortName,
  tabIdFromPanelPort,
} from "../src/protocol";

describe("browser extension protocol", () => {
  it("routes panels by inspected tab", () => {
    expect(panelPortName(42)).toBe("cogni-panel:42");
    expect(tabIdFromPanelPort("cogni-panel:42")).toBe(42);
    expect(tabIdFromPanelPort("cogni-panel:nope")).toBeNull();
  });

  it("accepts only Cogni snapshots from the inspected page", () => {
    const snapshot = emptyCogniDevtoolsSnapshot();
    expect(
      pageMessageToExtensionMessage({
        protocol: COGNI_DEVTOOLS_PROTOCOL,
        direction: "cogni-to-devtools",
        type: "snapshot",
        snapshot,
      }),
    ).toEqual({ type: "snapshot", snapshot });
    expect(pageMessageToExtensionMessage({ type: "snapshot" })).toBeNull();
  });

  it("turns extension commands into page bridge messages", () => {
    expect(
      extensionMessageToPageMessage({
        type: "command",
        command: { type: "highlight", destination: "/orders" },
      }),
    ).toMatchObject({
      protocol: COGNI_DEVTOOLS_PROTOCOL,
      direction: "devtools-to-cogni",
      type: "command",
    });
  });
});
