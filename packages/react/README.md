# @inttegro/cogni-react

React lifecycle adapters for [`@inttegro/cogni-client`](../client/).

```tsx
import { CogniProvider, useScheduledPrediction } from "@inttegro/cogni-react";

function App() {
  return (
    <CogniProvider>
      <LikelyNextView />
    </CogniProvider>
  );
}

function LikelyNextView() {
  useScheduledPrediction(
    {
      key: "route:/orders",
      policy: "dashboard-next-route",
      trigger: "idle",
      destination: "/orders",
      probability: 0.86,
      horizonMs: 30_000,
    },
    async ({ signal }) => {
      const response = await fetch("/orders", { signal });
      return { bytes: Number(response.headers.get("content-length")) || undefined };
    },
  );

  return null;
}
```

`CogniProvider` owns browser environment admission and scheduler disposal. Supply
an existing scheduler when an application already centralizes those concerns.
The hooks do not invent probabilities or policies; the host remains responsible
for calibrated candidates and reusable reads.

Applications with many ordinary links can use `useDelegatedRouteIntent` once at
the shell instead of replacing or listing every link. The hook discovers links
added after mount, delays hover, escalates focus, touch, pointer, and click, and
keeps candidate policy under host control. Call `markReused(href)` only after the
router confirms that destination committed.

Cogni is under active extraction and this package has not been published.
