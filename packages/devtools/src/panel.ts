/// <reference path="./assets.d.ts" />

import { executeCogniDevtoolsCommand } from "./bridge";
import interFontUrl from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2";
import type {
  CogniDevtoolsCommand,
  CogniDevtoolsEntry,
  CogniDevtoolsSnapshot,
  CogniDevtoolsStore,
  CogniDevtoolsTrace,
} from "./types";

export interface MountCogniDevtoolsPanelOptions {
  store: CogniDevtoolsStore;
  mode?: "embedded" | "extension";
  initialOpen?: boolean;
  onCommand?: (command: CogniDevtoolsCommand) => void;
}

export interface MountedCogniDevtoolsPanel {
  open(): void;
  close(): void;
  destroy(): void;
}

type PanelView = "overview" | "predictions" | "events";

export function mountCogniDevtoolsPanel(
  container: HTMLElement,
  options: MountCogniDevtoolsPanelOptions,
): MountedCogniDevtoolsPanel {
  const mode = options.mode ?? "embedded";
  const shadow = container.shadowRoot ?? container.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = PANEL_STYLES;
  const shell = element("section", `shell ${mode}`);
  const launcher = button("Cogni", "launcher");
  launcher.title = "Open Cogni DevTools";
  launcher.setAttribute("aria-label", "Open Cogni DevTools");
  const panel = element("section", "panel");
  panel.setAttribute("aria-label", "Cogni DevTools");

  const header = element("header", "header");
  const brand = element("div", "brand");
  const mark = element("span", "mark", "C");
  const brandText = element("div", "brand-text");
  brandText.append(
    element("strong", "title", "Cogni"),
    element("span", "subtitle", "Developer tools"),
  );
  brand.append(mark, brandText);
  const headerActions = element("div", "header-actions");
  const clearButton = button("Clear", "text-button");
  const closeButton = button("Close", "text-button close");
  headerActions.append(clearButton, closeButton);
  header.append(brand, headerActions);

  const tabs = element("nav", "tabs");
  tabs.setAttribute("aria-label", "DevTools views");
  tabs.setAttribute("role", "tablist");
  const overviewTab = button("Overview", "tab active");
  const predictionsTab = button("Predictions", "tab");
  const eventsTab = button("Events", "tab");
  for (const tab of [overviewTab, predictionsTab, eventsTab]) {
    tab.setAttribute("role", "tab");
  }
  tabs.append(overviewTab, predictionsTab, eventsTab);

  const content = element("main", "content");
  const viewHeader = element("div", "view-header");
  const viewHeading = element("div");
  const viewEyebrow = element("span", "eyebrow");
  const viewTitle = element("h1", "view-title");
  const viewDescription = element("p", "view-description");
  viewHeading.append(viewEyebrow, viewTitle, viewDescription);
  const viewCount = element("span", "view-count");
  viewHeader.append(viewHeading, viewCount);

  const statusBar = element("section", "status-bar");
  const runtimeStatus = element("div", "runtime-status");
  const environment = element("span", "status-item");
  const foreground = element("span", "status-item");
  const activeStatus = element("span", "status-stat");
  const outcomeStatus = element("span", "status-stat");
  runtimeStatus.append(environment, foreground);
  statusBar.append(runtimeStatus, activeStatus, outcomeStatus);

  const viewBody = element("div", "view-body");
  content.append(viewHeader, statusBar, viewBody);
  panel.append(header, tabs, content);
  shell.append(panel);
  if (mode === "embedded") shell.append(launcher);
  shadow.replaceChildren(style, shell);

  let view: PanelView = "overview";
  let open = mode === "extension" || (options.initialOpen ?? false);
  let snapshot = options.store.snapshot();

  function setOpen(next: boolean): void {
    open = mode === "extension" || next;
    panel.hidden = !open;
    launcher.hidden = open;
  }

  function setView(next: PanelView): void {
    view = next;
    overviewTab.classList.toggle("active", view === "overview");
    predictionsTab.classList.toggle("active", view === "predictions");
    eventsTab.classList.toggle("active", view === "events");
    for (const tab of [overviewTab, predictionsTab, eventsTab]) {
      tab.setAttribute("aria-selected", String(tab.classList.contains("active")));
    }
    renderView();
  }

  function render(next: CogniDevtoolsSnapshot): void {
    snapshot = next;
    renderStatus();
    renderView();
  }

  function renderStatus(): void {
    environment.replaceChildren(
      dot(snapshot.environmentAllowed ? "green" : "amber"),
      document.createTextNode(
        snapshot.environmentAllowed ? "Environment open" : "Environment blocked",
      ),
    );
    foreground.textContent =
      snapshot.foregroundActivity === 0
        ? "Foreground quiet"
        : `${snapshot.foregroundActivity} foreground request${
            snapshot.foregroundActivity === 1 ? "" : "s"
          }`;
    activeStatus.replaceChildren(
      element("span", "status-label", "Active predictions"),
      element("strong", "status-value", String(snapshot.summary.active)),
    );
    outcomeStatus.replaceChildren(
      element("span", "status-label", "Observed outcomes"),
      element("strong", "status-value", String(snapshot.summary.outcomes)),
    );
  }

  function setViewHeader(
    eyebrow: string,
    title: string,
    description: string,
    count: string,
  ): void {
    viewEyebrow.textContent = eyebrow;
    viewTitle.textContent = title;
    viewDescription.textContent = description;
    viewCount.textContent = count;
  }

  function renderView(): void {
    if (view === "overview") renderOverview();
    else if (view === "predictions") renderPredictions();
    else renderEvents();
  }

  function renderOverview(): void {
    const { summary } = snapshot;
    setViewHeader(
      "Runtime telemetry",
      "Prediction activity",
      "See what Cogni anticipated, what the application reused, and what it discarded.",
      `${summary.outcomes} outcome${summary.outcomes === 1 ? "" : "s"}`,
    );

    const cards = element("section", "overview-grid");
    cards.setAttribute("aria-label", "Prediction summary");
    cards.append(
      overviewMetric(
        "Prediction reuse",
        percent(summary.reuseRate),
        `${summary.reused} reused · ${summary.missed} missed`,
        summary.reuseRate,
        "blue",
      ),
      overviewMetric(
        "Loaded data",
        formatBytes(summary.totalBytes),
        `${formatBytes(summary.reusedBytes)} reused · ${formatBytes(summary.wastedBytes)} discarded`,
        summary.byteReuseRate,
        summary.wastedBytes > summary.reusedBytes ? "amber" : "green",
      ),
      overviewMetric(
        "Calibration",
        signedPercent(summary.calibrationGap),
        `${percent(summary.expectedReuseRate)} expected · ${percent(summary.reuseRate)} observed`,
        calibrationScore(summary.calibrationGap),
        calibrationTone(summary.calibrationGap),
      ),
      overviewMetric(
        "Current work",
        String(summary.active),
        `${snapshot.foregroundActivity} foreground request${snapshot.foregroundActivity === 1 ? "" : "s"}`,
        null,
        "neutral",
      ),
    );

    const recent = element("section", "recent");
    const recentHeader = element("div", "section-heading");
    recentHeader.append(
      element("div", "section-title", "Recent predictions"),
      element(
        "span",
        "section-meta",
        snapshot.traces.length === 0
          ? "No observations"
          : `${snapshot.traces.length} observed`,
      ),
    );
    recent.append(recentHeader);
    const recentRows = [...snapshot.traces].reverse().slice(0, 5);
    if (recentRows.length === 0) {
      recent.append(
        emptyState(
          "Predictions will appear here after Cogni observes a navigation signal.",
        ),
      );
    } else {
      const rows = element("div", "recent-rows");
      rows.replaceChildren(...recentRows.map(renderRecentTrace));
      recent.append(rows);
    }
    viewBody.replaceChildren(cards, recent);
  }

  function renderPredictions(): void {
    const traces = [...snapshot.traces].reverse();
    setViewHeader(
      "Prediction log",
      "Predictions",
      "Inspect every destination Cogni prepared and the outcome of that work.",
      `${traces.length} observed`,
    );
    if (traces.length === 0) {
      viewBody.replaceChildren(
        emptyState(
          "No predictions observed. Interact with the application to generate a navigation signal.",
        ),
      );
      return;
    }
    const table = element("div", "table-shell");
    table.append(predictionsTable(traces));
    viewBody.replaceChildren(table);
  }

  function highlightTrace(trace: CogniDevtoolsTrace): void {
    const command: CogniDevtoolsCommand = {
      type: "highlight",
      destination: trace.candidate.destination,
    };
    if (options.onCommand) options.onCommand(command);
    else executeCogniDevtoolsCommand(command);
  }

  function predictionsTable(traces: CogniDevtoolsTrace[]): HTMLTableElement {
    const table = element("table", "data-table");
    table.append(tableHead(["Destination", "Signal", "Confidence", "Outcome", "Work"]));
    const body = element("tbody");
    for (const trace of traces) {
      const row = element("tr", "interactive-row");
      row.tabIndex = 0;
      row.title = `Highlight ${trace.candidate.destination}`;
      row.setAttribute("role", "button");
      row.append(
        tableCell(
          destinationCell(trace.candidate.destination, trace.reason),
          "destination-cell",
        ),
        tableCell(
          stackedText(
            trace.candidate.trigger,
            trace.startMode ?? trace.candidate.policy,
          ),
        ),
        tableCell(`${Math.round(trace.candidate.probability * 100)}%`),
        tableCell(statePill(trace.state)),
        tableCell(
          stackedText(
            duration(trace.firstAt, trace.lastAt),
            trace.bytes > 0 ? formatBytes(trace.bytes) : "No payload",
          ),
        ),
      );
      const highlight = () => highlightTrace(trace);
      row.addEventListener("click", highlight);
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          highlight();
        }
      });
      body.append(row);
    }
    table.append(body);
    return table;
  }

  function renderEvents(): void {
    const entries = [...snapshot.entries].reverse();
    setViewHeader(
      "Lifecycle stream",
      "Events",
      "Follow the scheduler and coordinator events behind each prediction.",
      `${entries.length} captured`,
    );
    if (entries.length === 0) {
      viewBody.replaceChildren(emptyState("No lifecycle events observed."));
      return;
    }
    const startAt = snapshot.entries[0]?.at ?? snapshot.generatedAt;
    const table = element("div", "table-shell");
    table.append(eventsTable(entries, startAt));
    viewBody.replaceChildren(table);
  }

  function eventsTable(
    entries: CogniDevtoolsEntry[],
    startAt: number,
  ): HTMLTableElement {
    const table = element("table", "data-table events-table");
    table.append(tableHead(["Time", "Source", "Event", "Destination", "Details"]));
    const body = element("tbody");
    for (const entry of entries) {
      const details = Object.entries(entry.details)
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(" · ");
      const type = element("span", "event-label");
      type.append(dot(toneForEvent(entry.type)), humanize(entry.type));
      body.append(
        tableRow([
          `+${Math.max(0, entry.at - startAt).toFixed(0)} ms`,
          humanize(entry.source),
          type,
          entry.candidate?.destination ?? "-",
          details || "-",
        ]),
      );
    }
    table.append(body);
    return table;
  }

  launcher.addEventListener("click", () => setOpen(true));
  closeButton.addEventListener("click", () => setOpen(false));
  clearButton.addEventListener("click", () => {
    const clearable = options.store as CogniDevtoolsStore & { clear?: () => void };
    clearable.clear?.();
  });
  overviewTab.addEventListener("click", () => setView("overview"));
  predictionsTab.addEventListener("click", () => setView("predictions"));
  eventsTab.addEventListener("click", () => setView("events"));

  const unsubscribe = options.store.subscribe(render);
  setOpen(open);
  setView(view);
  render(snapshot);

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    destroy() {
      unsubscribe();
      shadow.replaceChildren();
    },
  };
}

function emptyState(label: string): HTMLElement {
  return element("div", "empty", label);
}

function overviewMetric(
  label: string,
  value: string,
  detail: string,
  progress: number | null,
  tone: "blue" | "green" | "amber" | "neutral",
): HTMLElement {
  const card = element("article", `overview-card ${tone}`);
  const heading = element("div", "card-heading");
  heading.append(
    element("span", "card-label", label),
    element("strong", "card-value", value),
  );
  card.append(heading, element("div", "card-detail", detail));
  if (progress !== null) {
    const track = element("div", "progress-track");
    const fill = element("span", "progress-fill");
    fill.style.width = `${Math.round(clamp(progress) * 100)}%`;
    track.append(fill);
    card.append(track);
  }
  return card;
}

function renderRecentTrace(trace: CogniDevtoolsTrace): HTMLElement {
  const row = element("div", "recent-row");
  row.append(
    dot(stateTone(trace.state)),
    element("span", "recent-destination", trace.candidate.destination),
    element(
      "span",
      "recent-confidence",
      `${Math.round(trace.candidate.probability * 100)}%`,
    ),
    statePill(trace.state),
  );
  return row;
}

function tableHead(labels: string[]): HTMLTableSectionElement {
  const head = element("thead");
  const row = element("tr");
  row.replaceChildren(...labels.map((label) => element("th", "", label)));
  head.append(row);
  return head;
}

function tableRow(values: Array<string | HTMLElement>): HTMLTableRowElement {
  const row = element("tr");
  row.replaceChildren(...values.map((value) => tableCell(value)));
  return row;
}

function tableCell(
  content: string | HTMLElement,
  className = "",
): HTMLTableCellElement {
  const cell = element("td", className);
  cell.append(content);
  return cell;
}

function stackedText(primary: string, secondary: string): HTMLElement {
  const stack = element("span", "cell-stack");
  stack.append(
    element("span", "cell-primary", primary),
    element("span", "cell-secondary", secondary),
  );
  return stack;
}

function destinationCell(destination: string, reason?: string): HTMLElement {
  return stackedText(destination, reason ?? "Click to highlight on page");
}

function statePill(state: CogniDevtoolsTrace["state"]): HTMLElement {
  return element("span", `state ${stateTone(state)}`, humanize(state));
}

function calibrationScore(gap: number | null): number | null {
  if (gap === null) return null;
  return 1 - Math.min(1, Math.abs(gap));
}

function calibrationTone(gap: number | null): "green" | "amber" | "neutral" {
  if (gap === null) return "neutral";
  return Math.abs(gap) <= 0.1 ? "green" : "amber";
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function dot(tone: string): HTMLElement {
  return element("span", `dot ${tone}`);
}

function button(label: string, className: string): HTMLButtonElement {
  const result = document.createElement("button");
  result.type = "button";
  result.className = className;
  result.textContent = label;
  return result;
}

function element<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  className = "",
  text?: string,
): HTMLElementTagNameMap[Tag] {
  const result = document.createElement(tag);
  result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

function stateTone(state: CogniDevtoolsTrace["state"]): string {
  if (state === "reused") return "green";
  if (["missed", "failed", "rejected"].includes(state)) return "red";
  if (["cancelled", "expired"].includes(state)) return "muted";
  if (state === "waiting_for_reuse") return "amber";
  return "blue";
}

function toneForEvent(type: CogniDevtoolsEntry["type"]): string {
  if (type === "reused") return "green";
  if (["missed", "failed", "rejected"].includes(type)) return "red";
  if (["cancelled", "expired", "schedule_cancelled"].includes(type)) return "muted";
  if (type === "loaded") return "amber";
  return "blue";
}

function humanize(value: string): string {
  return value.replaceAll("_", " ");
}

function duration(start: number, end: number): string {
  return `${Math.max(0, end - start).toFixed(0)} ms`;
}

function percent(value: number | null): string {
  return value === null ? "-" : `${Math.round(value * 100)}%`;
}

function signedPercent(value: number | null): string {
  if (value === null) return "-";
  const percentage = Math.round(value * 100);
  return `${percentage > 0 ? "+" : ""}${percentage}%`;
}

function formatBytes(value: number): string {
  if (value < 1_000) return `${value} B`;
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1)} kB`;
  return `${(value / 1_000_000).toFixed(1)} MB`;
}

const PANEL_STYLES = `
  @font-face {
    font-family: "Inter";
    font-style: normal;
    font-weight: 100 900;
    font-display: swap;
    src: url("${interFontUrl}") format("woff2-variations");
  }
  :host {
    color-scheme: light;
    --cogni-bg: #f5f6f7;
    --cogni-surface: #ffffff;
    --cogni-surface-subtle: #fafafa;
    --cogni-surface-hover: #f2f4f7;
    --cogni-border: #e1e4e8;
    --cogni-border-strong: #d3d7dc;
    --cogni-text: #25282d;
    --cogni-muted: #69707a;
    --cogni-faint: #9299a2;
    --cogni-green: #0b9f6e;
    --cogni-green-soft: #eaf8f2;
    --cogni-blue: #356ee8;
    --cogni-blue-soft: #eef3ff;
    --cogni-amber: #c47b12;
    --cogni-amber-soft: #fff7e8;
    --cogni-red: #d4495d;
    --cogni-red-soft: #fff0f2;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 13px;
    font-weight: 400;
    letter-spacing: 0;
  }
  * { box-sizing: border-box; }
  button { font: inherit; font-weight: 400; letter-spacing: 0; }
  strong, b, h1, h2, h3, th { font-weight: 500; }
  .shell.embedded { position: fixed; inset: auto 16px 16px auto; z-index: 2147483646; }
  .shell.extension { width: 100%; min-height: 100vh; background: var(--cogni-bg); }
  .launcher {
    min-width: 46px; height: 36px; border: 1px solid var(--cogni-border-strong); border-radius: 7px;
    padding: 0 11px; background: var(--cogni-surface); color: var(--cogni-text); cursor: pointer;
    box-shadow: 0 10px 30px rgb(16 24 40 / 14%); transition: transform 140ms cubic-bezier(0.23, 1, 0.32, 1), box-shadow 140ms ease;
  }
  .launcher:hover { box-shadow: 0 12px 34px rgb(16 24 40 / 18%); }
  .launcher:active { transform: scale(.97); }
  .panel {
    width: 640px; max-width: calc(100vw - 24px); height: min(560px, calc(100vh - 32px));
    overflow: hidden; border: 1px solid var(--cogni-border); border-radius: 8px;
    background: var(--cogni-bg); color: var(--cogni-text); box-shadow: 0 22px 70px rgb(16 24 40 / 22%);
  }
  .extension .panel { width: 100%; max-width: none; height: 100vh; border: 0; border-radius: 0; box-shadow: none; }
  .header { height: 46px; display: flex; align-items: center; justify-content: space-between; padding: 0 16px; border-bottom: 1px solid var(--cogni-border); background: var(--cogni-surface); }
  .brand { display: flex; align-items: center; gap: 8px; }
  .mark { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 6px; background: var(--cogni-blue-soft); color: var(--cogni-blue); font-weight: 500; }
  .brand-text { display: flex; align-items: baseline; gap: 7px; }
  .title, .subtitle { display: block; }
  .title { font-size: 14px; font-weight: 500; }
  .subtitle { color: var(--cogni-muted); font-size: 11px; }
  .header-actions { display: flex; gap: 3px; }
  .text-button { border: 1px solid transparent; border-radius: 6px; padding: 5px 7px; background: transparent; color: var(--cogni-muted); cursor: pointer; transition: background 130ms ease, border-color 130ms ease, transform 130ms cubic-bezier(0.23, 1, 0.32, 1); }
  .text-button:hover { border-color: var(--cogni-border); background: var(--cogni-surface-hover); color: var(--cogni-text); }
  .text-button:active, .tab:active { transform: scale(.97); }
  .extension .close { display: none; }
  .tabs { display: flex; gap: 20px; height: 39px; padding: 0 16px; border-bottom: 1px solid var(--cogni-border); background: var(--cogni-surface); }
  .tab { position: relative; border: 0; background: transparent; color: var(--cogni-muted); cursor: pointer; transition: color 130ms ease, transform 130ms cubic-bezier(0.23, 1, 0.32, 1); }
  .tab:hover, .tab.active { color: var(--cogni-text); }
  .tab.active::after { content: ""; position: absolute; inset: auto 0 -1px; height: 2px; background: var(--cogni-blue); }
  .content { height: calc(100% - 85px); overflow: auto; overscroll-behavior: contain; padding: 18px 20px 24px; }
  .view-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; max-width: 1040px; margin: 0 auto 13px; }
  .eyebrow { display: block; margin-bottom: 4px; color: var(--cogni-blue); font-size: 9px; font-weight: 500; text-transform: uppercase; }
  .view-title { margin: 0; font-size: 18px; line-height: 1.2; }
  .view-description { margin: 3px 0 0; color: var(--cogni-muted); font-size: 11px; line-height: 1.45; }
  .view-count { flex: 0 0 auto; color: var(--cogni-muted); font-size: 11px; }
  .status-bar { display: grid; grid-template-columns: minmax(0, 1.65fr) repeat(2, minmax(104px, .6fr)); gap: 0; max-width: 1040px; min-height: 58px; margin: 0 auto 10px; border: 1px solid var(--cogni-border); border-radius: 7px; background: var(--cogni-surface); }
  .runtime-status { display: flex; flex-wrap: wrap; align-content: center; gap: 6px 14px; min-width: 0; padding: 10px 12px; }
  .status-item { display: inline-flex; align-items: center; gap: 6px; color: var(--cogni-muted); font-size: 10px; }
  .status-stat { display: flex; flex-direction: column; justify-content: center; gap: 3px; min-width: 0; padding: 10px 12px; border-left: 1px solid var(--cogni-border); }
  .status-label { overflow: hidden; color: var(--cogni-muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  .status-value { font-size: 14px; }
  .dot { flex: 0 0 auto; width: 7px; height: 7px; border-radius: 50%; background: var(--cogni-faint); }
  .dot.green { background: var(--cogni-green); }
  .dot.blue { background: var(--cogni-blue); }
  .dot.amber { background: var(--cogni-amber); }
  .dot.red { background: var(--cogni-red); }
  .view-body { max-width: 1040px; margin: 0 auto; }
  .overview-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .overview-card { min-height: 96px; padding: 12px; border: 1px solid var(--cogni-border); border-radius: 7px; background: var(--cogni-surface); }
  .card-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .card-label { color: var(--cogni-muted); font-size: 10px; }
  .card-value { flex: 0 0 auto; font-size: 18px; line-height: 1; }
  .card-detail { margin-top: 17px; overflow: hidden; color: var(--cogni-muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  .progress-track { height: 3px; margin-top: 10px; overflow: hidden; border-radius: 2px; background: #eceff2; }
  .progress-fill { display: block; height: 100%; min-width: 2px; border-radius: inherit; background: var(--cogni-blue); }
  .overview-card.green .progress-fill { background: var(--cogni-green); }
  .overview-card.amber .progress-fill { background: var(--cogni-amber); }
  .recent { margin-top: 8px; border: 1px solid var(--cogni-border); border-radius: 7px; background: var(--cogni-surface); }
  .section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 38px; padding: 0 12px; border-bottom: 1px solid var(--cogni-border); }
  .section-title { font-weight: 500; }
  .section-meta { color: var(--cogni-muted); font-size: 11px; }
  .recent-row { display: grid; grid-template-columns: 8px minmax(0, 1fr) 48px auto; gap: 9px; align-items: center; min-height: 36px; padding: 6px 12px; border-bottom: 1px solid var(--cogni-border); }
  .recent-row:last-child { border-bottom: 0; }
  .recent-destination { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .recent-confidence { color: var(--cogni-muted); text-align: right; }
  .table-shell { overflow: auto; border: 1px solid var(--cogni-border); border-radius: 7px; background: var(--cogni-surface); }
  .data-table { width: 100%; min-width: 650px; border-collapse: collapse; }
  .data-table th { padding: 8px 10px; border-bottom: 1px solid var(--cogni-border); background: var(--cogni-surface-subtle); color: var(--cogni-muted); font-size: 9px; text-align: left; white-space: nowrap; }
  .data-table td { max-width: 240px; padding: 9px 10px; border-bottom: 1px solid var(--cogni-border); vertical-align: middle; }
  .data-table tr:last-child td { border-bottom: 0; }
  .interactive-row { cursor: pointer; outline: none; transition: background 120ms ease; }
  .interactive-row:hover, .interactive-row:focus-visible { background: var(--cogni-surface-hover); }
  .interactive-row:focus-visible { box-shadow: inset 3px 0 0 var(--cogni-blue); }
  .destination-cell { min-width: 190px; }
  .cell-stack { display: block; min-width: 0; }
  .cell-primary, .cell-secondary { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cell-primary { color: var(--cogni-text); }
  .cell-secondary { margin-top: 4px; color: var(--cogni-muted); font-size: 10px; }
  .event-label { display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; }
  .state { display: inline-flex; align-items: center; border-radius: 999px; padding: 3px 7px; background: var(--cogni-surface-hover); color: var(--cogni-muted); font-size: 10px; white-space: nowrap; }
  .state.green { background: var(--cogni-green-soft); color: var(--cogni-green); }
  .state.blue { background: var(--cogni-blue-soft); color: var(--cogni-blue); }
  .state.amber { background: var(--cogni-amber-soft); color: var(--cogni-amber); }
  .state.red { background: var(--cogni-red-soft); color: var(--cogni-red); }
  .empty { display: grid; min-height: 108px; padding: 20px; place-items: center; color: var(--cogni-muted); line-height: 1.5; text-align: center; }
  [hidden] { display: none !important; }
  @media (min-width: 900px) {
    .extension .content { padding: 24px 32px 32px; }
    .extension .overview-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .extension .overview-card { min-height: 106px; }
  }
  @media (max-width: 620px) {
    .shell.embedded { inset: auto 8px 8px; }
    .panel { width: calc(100vw - 16px); height: min(560px, calc(100vh - 16px)); }
    .header { padding: 0 14px; }
    .brand-text { display: block; }
    .subtitle { margin-top: 1px; font-size: 10px; }
    .tabs { gap: 18px; padding: 0 14px; }
    .content { padding: 15px 12px 20px; }
    .view-header { align-items: flex-start; }
    .view-count { padding-top: 16px; }
    .status-bar { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .runtime-status { grid-column: 1 / -1; border-bottom: 1px solid var(--cogni-border); }
    .status-stat:first-of-type { border-left: 0; }
    .overview-grid { grid-template-columns: 1fr; }
    .overview-card { min-height: 90px; }
    .recent-confidence { display: none; }
    .recent-row { grid-template-columns: 8px minmax(0, 1fr) auto; }
  }
`;
