# @inttegro/cogni-react

React lifecycle adapters for [`@inttegro/cogni-client`](../client/).

```tsx
import { CogniProvider, useScheduledPrediction } from "@inttegro/cogni-react";

function App() {
  return (
    <CogniProvider opaqueUserKey={session.opaqueUserKey}>
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

`CogniProvider` owns browser environment admission, adaptive learning, and scheduler disposal.
`opaqueUserKey` identifies the authenticated account without exposing a direct identifier; Cogni
combines it with a random local browser key. Supply an existing scheduler when an application already
centralizes those concerns. The hooks do not invent candidates or reusable reads.

Applications with many ordinary links can use `useDelegatedRouteIntent` once at
the shell instead of replacing or listing every link. The hook discovers links
added after mount, delays hover, escalates focus, touch, pointer, and click, and
keeps candidate policy under host control. Call `markReused(href)` only after the
router confirms that destination committed.

Cogni follows semantic versioning. During the `0.x` series, minor releases may
change public APIs and will include migration notes in the changelog.
