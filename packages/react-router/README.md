# @inttegro/cogni-react-router

React Router `PredictiveLink` integration for Cogni.

```sh
npm install @inttegro/cogni-react @inttegro/cogni-react-router
```

Framework Mode works with React Router's route prefetch resources. Data and
Declarative Mode applications provide their own cache-aware `prefetchRoute`
callback.

```tsx
import { CogniProvider } from "@inttegro/cogni-react";
import { PredictiveLink } from "@inttegro/cogni-react-router";

<CogniProvider opaqueUserKey={session.opaqueUserKey}>
  <PredictiveLink to="/orders">Orders</PredictiveLink>
</CogniProvider>;
```

The link uses Cogni's learned probability and horizon defaults. Applications
with stronger evidence can override them, along with cost and scheduling policy.
