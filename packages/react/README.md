# @inttegro/cogni-react

General-purpose React lifecycle adapters for [`@inttegro/cogni-client`](../client/).
Cogni can schedule any reusable work: cached data, code, media, computed results, or
routes. It does not require URL paths.

```sh
npm install @inttegro/cogni-react
```

## Start with Cogni's defaults

Mount one provider near the root of the application, then use the integration
for the application's router. Router adapters submit work through the provider's
shared runtime; custom caches register beside the component that owns them. The
application does not maintain a central list of predictions or paths.

```tsx
import { CogniProvider } from "@inttegro/cogni-react";
import { PredictiveLink } from "@inttegro/cogni-react-router";

function App() {
  return (
    <CogniProvider opaqueUserKey={session.opaqueUserKey}>
      <Navigation />
    </CogniProvider>
  );
}

function Navigation() {
  return (
    <nav>
      <PredictiveLink to="/orders">Orders</PredictiveLink>
    </nav>
  );
}
```

This is the primary adoption path. `CogniProvider` owns browser admission,
shared budgets, adaptive learning, and scheduler disposal. The router adapter
discovers actual intent, performs cache-aware loading, and attributes reuse at
the committed-navigation boundary. Cogni supplies the ordinary probability,
reuse horizon, and scheduling policy. No prediction registry is required.

## Route loading

Routes are one optional use case. Prefer the adapter for the application's
router so route identity, preloading, navigation, and reuse attribution stay
connected:

```tsx
import { PredictiveLink } from "@inttegro/cogni-react-router";

<PredictiveLink to="/orders">Orders</PredictiveLink>;
```

The matching adapters are:

- React Router: `@inttegro/cogni-react-router`
- TanStack Router: `@inttegro/cogni-tanstack-router`
- Next.js: `@inttegro/cogni-next`

Applications with many ordinary links can instead call
`useDelegatedRouteIntent` once at the shell. It discovers eligible links added
after mount, delays hover, escalates focus, touch, pointer, and click, and keeps
candidate policy under host control. No separately maintained route list is
required. Call `markReused(href)` only after the router confirms that the
destination committed. Route candidates use the same probability and horizon
defaults unless the host has stronger evidence and overrides them.

## Custom reusable work

Only custom data, code, media, or computed work needs explicit registration.
Keep that registration beside the cache or component that knows how the result
is reused:

```tsx
import { useCogniPrediction } from "@inttegro/cogni-react";

function Dashboard() {
  const recentOrders = useCogniPrediction({
    key: "query:recent-orders",
    load: ({ signal }) => preloadRecentOrders({ signal }),
  });

  return (
    <DashboardLayout
      onOpenRecentOrders={() => {
        void recentOrders.markReused();
      }}
    />
  );
}
```

The key is a stable cache-work identity, not necessarily a URL. Cogni uses its
default policy unless the integration has stronger evidence and overrides it.
Use `useScheduledPrediction` only when the application already owns a complete
candidate and needs the low-level scheduling contract.

## Provider ownership

`CogniProvider` owns browser environment admission, adaptive learning, and scheduler disposal by
default. `opaqueUserKey` identifies the authenticated account without exposing a direct identifier;
Cogni combines it with a local browser key. Supply an existing scheduler when the application already
centralizes those concerns. A supplied scheduler must remain stable and is never disposed by the
provider.

Cogni follows semantic versioning. During the `0.x` series, minor releases may
change public APIs and will include migration notes in the changelog.
