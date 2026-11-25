# @inttegro/cogni-tanstack-router

TanStack Router `PredictiveLink` integration for Cogni. Predictions execute
through `router.preloadRoute()` and count as reused only when the router begins
the matching navigation.

```tsx
<CogniProvider opaqueUserKey={session.opaqueUserKey}>
  <PredictiveLink to="/orders">Orders</PredictiveLink>
</CogniProvider>
```

The link uses Cogni's learned probability and horizon defaults. Applications
with stronger evidence can override them, along with cost and scheduling policy.
