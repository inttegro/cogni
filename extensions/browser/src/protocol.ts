import {
  COGNI_DEVTOOLS_PROTOCOL,
  type CogniDevtoolsCommand,
  type CogniDevtoolsPageMessage,
  type CogniDevtoolsSnapshot,
} from "@inttegro/cogni-devtools";

export const CONTENT_PORT = "cogni-content";
export const PANEL_PORT_PREFIX = "cogni-panel:";

export type ExtensionMessage =
  | {
      type: "snapshot";
      snapshot: CogniDevtoolsSnapshot;
    }
  | {
      type: "request_snapshot";
    }
  | {
      type: "command";
      command: CogniDevtoolsCommand;
    };

export function panelPortName(tabId: number): string {
  return `${PANEL_PORT_PREFIX}${tabId}`;
}

export function tabIdFromPanelPort(name: string): number | null {
  if (!name.startsWith(PANEL_PORT_PREFIX)) return null;
  const value = Number(name.slice(PANEL_PORT_PREFIX.length));
  return Number.isInteger(value) && value >= 0 ? value : null;
}

export function pageMessageToExtensionMessage(value: unknown): ExtensionMessage | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CogniDevtoolsPageMessage>;
  if (
    candidate.protocol !== COGNI_DEVTOOLS_PROTOCOL ||
    candidate.direction !== "cogni-to-devtools" ||
    candidate.type !== "snapshot" ||
    !candidate.snapshot ||
    candidate.snapshot.protocol !== COGNI_DEVTOOLS_PROTOCOL
  ) {
    return null;
  }
  return { type: "snapshot", snapshot: candidate.snapshot };
}

export function extensionMessageToPageMessage(
  message: ExtensionMessage,
): CogniDevtoolsPageMessage | null {
  if (message.type === "request_snapshot") {
    return {
      protocol: COGNI_DEVTOOLS_PROTOCOL,
      direction: "devtools-to-cogni",
      type: "request_snapshot",
    };
  }
  if (message.type === "command") {
    return {
      protocol: COGNI_DEVTOOLS_PROTOCOL,
      direction: "devtools-to-cogni",
      type: "command",
      command: message.command,
    };
  }
  return null;
}
