---
title: Next.js
description: Add calibrated App Router prediction without bypassing Cogni's shared budget.
---

`@inttegro/cogni-next` connects Cogni to the Next.js App Router. It provides an intent-aware link,
route prediction hooks, and the React adapter under Next-specific exports. The application still
owns route policy and calibrated probability.

<Warning>
  The package exists in this workspace at version `0.0.0`, but npm publication has not been
  verified. Do not assume a public registry install is available. Use a workspace dependency or an
  explicit local link. Its peer ranges are Next.js `>=15.4.0 <17` and React `>=18.2.0 <20`.
</Warning>

The package targets the App Router through public `next/link` and `next/navigation` APIs. It does
not provide a Pages Router adapter.

## Add a predictive link

Mount one provider around links that should share a scheduler:

```tsx
"use client";

import { NextCogniProvider, PredictiveLink } from "@inttegro/cogni-next";

export function Navigation() {
  return (
    <NextCogniProvider>
      <nav>
        <PredictiveLink href="/orders" probability={0.92} horizonMs={30_000}>
          Orders
        </PredictiveLink>
      </nav>
    </NextCogniProvider>
  );
}
```

`probability` and `horizonMs` are required because the adapter cannot infer application intent or a
valid reuse window. The key defaults to `next-route:${href}`, so links to the same string deduplicate
through the shared scheduler.

`PredictiveLink` waits 120 ms for sustained hover by default. Focus, touch, primary pointer-down,
and ordinary click intent start immediately; pointer leave and blur cancel pending work. Next's
viewport prefetch is disabled with `prefetch={false}` by default so it does not run outside Cogni's
admission and accounting.

## Route cache and reuse

The default loader calls `router.prefetch(href, { onInvalidate })`. Next owns the resulting route
cache, and committed App Router navigation consumes that representation. `PredictiveLink` reports
reuse only after `onNavigate` accepts an ordinary same-context navigation. Modified, downloaded,
new-context, or prevented navigation is not attributed as reuse.

Custom pointer, focus, click, and navigation handlers run first. Calling `preventDefault()` keeps
the adapter from escalating or attributing the interaction.

The public Next prefetch API does not accept an abort signal. Cogni can cancel delayed work before
calling `router.prefetch()`, but it cannot abort Next's internal work afterward. Pass a custom
`prefetchRoute` only when the host has a tested route loader that populates the same cache consumed
by committed navigation and can honor the supplied signal.

## Observe an existing link system

Use `useNextDelegatedRouteIntent()` once in a shared shell when converting every existing link to
`PredictiveLink` is undesirable. It discovers ordinary links, including links added after mount,
and uses `router.prefetch()` by default.

```tsx
const routeIntent = useNextDelegatedRouteIntent({
  selector: "a[href], [data-resource-href]",
  probability: 0.92,
  horizonMs: 30_000,
  resolveHref: authorizeDashboardRoute,
  prefetchRoute: prefetchFullRoute,
});
```

The hook returns `markReused(href)` and `cancel(href?)`. Call `markReused` only after App Router
navigation commits and consumes the predicted route cache. Discovery removes the per-link wrapper
requirement; it does not remove the host's responsibility for route authorization, calibration,
cache identity, or reuse evidence.

## Policy-selected routes

Use `useNextRoutePrediction()` when application policy selects a likely route without a link event.
It accepts the same `href`, `probability`, `horizonMs`, and candidate fields plus schedule options.
Set `enabled: false` to stop scheduling.

For a non-link action, call `markRoutePredictionReused(scheduled)` only after the action commits to
that route and consumes the prefetched representation. The helper starts pending work, waits for a
prediction handle, and marks reuse. `onInvalidate` is forwarded from Next; the host decides whether
an invalidated route should be cancelled, replaced, or rescheduled.

`useNextRouteIntent()` exposes the link's lower-level `scheduleHover`, `runNow`, `cancel`, and
`commit` actions for custom router controls. Call `commit()` only after custom navigation has been
accepted because the hook cannot inspect that control's outcome.

## Public API

The package exports `NextCogniProvider`, `PredictiveLink`, `createNextRouteCandidate`,
`markRoutePredictionReused`, `useNextRoutePrediction`, `useNextRouteIntent`,
`useNextDelegatedRouteIntent`, their public types, and the React adapter hooks. The candidate helper
defaults `policy` to `next-route`, `destination` to `href`, and `key` to `next-route:${href}`.

See [React](/react) for provider ownership and
[Browser runtime and navigation metrics](/browser-and-navigation) for browser admission.
