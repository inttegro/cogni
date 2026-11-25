---
title: See Cogni work
description: Follow every prediction from intent through scheduling, execution, and proven reuse.
---

Predictive loading begins before the user asks for a page. Ordinary network tools can show that a
request ran, but not why Cogni admitted it, what delayed it, or whether the foreground path consumed
the result.

Cogni DevTools joins those decisions into one trace. You can see which destination Cogni considered,
which trigger created the prediction, how much work it performed, and whether that work became reuse
or waste.

## Embedded panel

Install the DevTools package beside your Cogni client integration.

```bash
npm install @inttegro/cogni-devtools
```

In React, place the panel inside `CogniProvider`. Keep it behind your development flag so it never
ships to production.

```tsx
import { CogniDevtools } from "@inttegro/cogni-devtools/react";
import { CogniProvider } from "@inttegro/cogni-react";

export function Root() {
  return (
    <CogniProvider opaqueUserKey={session.opaqueUserKey}>
      <App />
      {import.meta.env.DEV ? <CogniDevtools /> : null}
    </CogniProvider>
  );
}
```

The panel records bounded metadata, not response payloads. It shows:

- the trigger, destination, confidence, cost, and estimated bytes for each prediction;
- admission, scheduling, cancellation, execution, and terminal events in order;
- actual bytes and material work reported by the loader;
- predicted reuse, observed reuse, waste, and the calibration gap between them.

Use **Overview** to judge reuse and calibration health, **Predictions** to inspect each destination
and outcome, and **Events** to follow the scheduler and coordinator lifecycle in order. The embedded
panel and the Chromium and Firefox panels use the same views and telemetry.

## Browser panel

The browser extension adds a **Cogni** panel to browser DevTools. Your application only needs the
connector, which records the same lifecycle events and exposes a sanitized snapshot to the local
extension.

```tsx
import { CogniDevtoolsConnector } from "@inttegro/cogni-devtools/react";

export function DevelopmentTools() {
  return import.meta.env.DEV ? <CogniDevtoolsConnector /> : null;
}
```

For framework-neutral clients, create and dispose a session with the scheduler you already use.

```typescript
import { createCogniDevtools } from "@inttegro/cogni-devtools";

const devtools = createCogniDevtools(scheduler);

if (import.meta.hot) {
  import.meta.hot.dispose(() => devtools.dispose());
}
```

### Chromium

Build the repository, open `chrome://extensions`, enable developer mode, and load
`extensions/browser/dist/chromium` as an unpacked extension. Open the page's DevTools and choose the
**Cogni** panel.

### Firefox

Build the repository, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**,
and select `extensions/browser/dist/firefox/manifest.json`. Open the page's developer tools and
choose the **Cogni** panel.

## Safari status

Safari support is not validated yet. Apple provides a
[Safari Web Extension converter](https://developer.apple.com/safari/extensions/), but a usable
release still requires Xcode conversion, signing, packaging, and browser-level testing.

## Read the result

A completed request is not automatically a successful prediction. The useful outcome is reuse: the
foreground path found the predicted result and avoided duplicate work. A missed prediction is work
that completed but expired without reuse; its bytes count as waste.

Expected reuse and observed reuse answer a second question: is your model calibrated? A positive gap
means Cogni predicted more reuse than the application proved. A negative gap means the model was too
conservative. Use that signal to tune candidate probabilities and policies instead of maximizing the
number of requests Cogni starts.
