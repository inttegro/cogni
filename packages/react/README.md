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

Cogni is under active extraction and this package has not been published.
