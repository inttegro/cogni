import type { CogniDevtoolsStore } from "./types";
import {
  COGNI_DEVTOOLS_PROTOCOL,
  type CogniDevtoolsCommand,
  type CogniDevtoolsPageMessage,
} from "./types";

export interface CogniDevtoolsBridgeOptions {
  target?: Window;
  highlightDurationMs?: number;
}

export function installCogniDevtoolsBridge(
  store: CogniDevtoolsStore,
  options: CogniDevtoolsBridgeOptions = {},
): () => void {
  const target = options.target ?? window;
  const postSnapshot = () => {
    const message: CogniDevtoolsPageMessage = {
      protocol: COGNI_DEVTOOLS_PROTOCOL,
      direction: "cogni-to-devtools",
      type: "snapshot",
      snapshot: store.snapshot(),
    };
    target.postMessage(message, targetOrigin(target));
  };
  const unsubscribe = store.subscribe(postSnapshot);
  const onMessage = (event: MessageEvent<unknown>) => {
    if (event.source !== target || !isDevtoolsRequest(event.data)) return;
    if (event.data.type === "request_snapshot") postSnapshot();
    if (event.data.type === "command") {
      executeCogniDevtoolsCommand(event.data.command, {
        document: target.document,
        ...(options.highlightDurationMs === undefined
          ? {}
          : { durationMs: options.highlightDurationMs }),
      });
    }
  };
  target.addEventListener("message", onMessage);
  postSnapshot();
  return () => {
    unsubscribe();
    target.removeEventListener("message", onMessage);
  };
}

export interface ExecuteCogniDevtoolsCommandOptions {
  document?: Document;
  durationMs?: number;
}

export function executeCogniDevtoolsCommand(
  command: CogniDevtoolsCommand,
  options: ExecuteCogniDevtoolsCommandOptions = {},
): number {
  if (command.type !== "highlight") return 0;
  const document = options.document ?? globalThis.document;
  if (!document) return 0;
  const targets = findPredictionTargets(document, command.destination);
  for (const target of targets) target.setAttribute("data-cogni-devtools-target", "");
  ensureHighlightStyle(document);
  const durationMs = options.durationMs ?? 1_800;
  setTimeout(() => {
    for (const target of targets) target.removeAttribute("data-cogni-devtools-target");
  }, durationMs);
  return targets.length;
}

function findPredictionTargets(document: Document, destination: string): HTMLElement[] {
  const normalizedDestination = normalizeDestination(destination, document.baseURI);
  return [
    ...document.querySelectorAll<HTMLElement>("a[href], [data-cogni-destination]"),
  ].filter((element) => {
    const value =
      element.getAttribute("data-cogni-destination") ?? element.getAttribute("href");
    return (
      value !== null &&
      normalizeDestination(value, document.baseURI) === normalizedDestination
    );
  });
}

function normalizeDestination(value: string, base: string): string {
  try {
    const url = new URL(value, base);
    return `${url.origin}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value;
  }
}

function ensureHighlightStyle(document: Document): void {
  if (document.getElementById("cogni-devtools-highlight-style")) return;
  const style = document.createElement("style");
  style.id = "cogni-devtools-highlight-style";
  style.textContent = `
    [data-cogni-devtools-target] {
      outline: 3px solid #22c55e !important;
      outline-offset: 4px !important;
      box-shadow: 0 0 0 7px rgb(34 197 94 / 20%) !important;
    }
  `;
  document.head.append(style);
}

function targetOrigin(target: Window): string {
  return target.location.origin === "null" ? "*" : target.location.origin;
}

function isDevtoolsRequest(
  value: unknown,
): value is Extract<CogniDevtoolsPageMessage, { direction: "devtools-to-cogni" }> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CogniDevtoolsPageMessage>;
  return (
    candidate.protocol === COGNI_DEVTOOLS_PROTOCOL &&
    candidate.direction === "devtools-to-cogni" &&
    (candidate.type === "request_snapshot" || candidate.type === "command")
  );
}
