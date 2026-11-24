# @inttegro/cogni-devtools

Observe Cogni scheduling, admission, execution, and reuse while developing an application.

```bash
npm install @inttegro/cogni-devtools
```

Import the embedded React panel inside `CogniProvider`:

```tsx
import { CogniDevtools } from "@inttegro/cogni-devtools/react";

export function DevelopmentTools() {
  return import.meta.env.DEV ? <CogniDevtools /> : null;
}
```

The browser extension uses the same recorder. Render `CogniDevtoolsConnector` instead when you want
the Cogni panel inside Chromium or Firefox DevTools:

```tsx
import { CogniDevtoolsConnector } from "@inttegro/cogni-devtools/react";

export function DevelopmentTools() {
  return import.meta.env.DEV ? <CogniDevtoolsConnector /> : null;
}
```

The main entry point also exports the framework-neutral recorder, panel, bridge, and session APIs.
See the [Cogni DevTools guide](https://github.com/inttegro/cogni/blob/master/docs/devtools.md) for
setup and interpretation.

The package records metadata only. It never records predicted resource payloads.
