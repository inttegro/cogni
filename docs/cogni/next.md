---
title: Next.js
description: Add calibrated App Router prediction without bypassing Cogni's shared budget.
---

`@inttegro/cogni-next` connects Cogni to the Next.js App Router. It provides an intent-aware link,
route prediction hooks, and the React adapter under Next-specific exports. Cogni supplies the
ordinary policy defaults; the application still owns safe route work and may provide stronger
evidence.

<Note>
  This guide follows the `0.1` API. Its peer ranges are Next.js `>=15.4.0 <17` and React
  `>=18.2.0 <20`. Confirm the latest published version and migration notes before installing a newer
  `0.x` release.
</Note>

The package targets the App Router through public `next/link` and `next/navigation` APIs. It does
not provide a Pages Router adapter.

## Add a predictive link

Mount one provider around links that should share a scheduler:

```tsx
"use client";

import { NextCogniProvider, PredictiveLink } from "@inttegro/cogni-next";

export function Navigation() {
  return (
    <NextCogniProvider opaqueUserKey={session.opaqueUserKey}>
      <nav>
        <PredictiveLink href="/orders">Orders</PredictiveLink>
      </nav>
    </NextCogniProvider>
  );
}
```

The key defaults to `next-route:${href}`, so links to the same string deduplicate through the shared
scheduler. Cogni starts with its conservative probability and 30 second reuse horizon; the browser
runtime calibrates that prior from actual reuse and waste. Override either value when the application
has stronger evidence.

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
  resolveHref: authorizeDashboardRoute,
  prefetchRoute: prefetchFullRoute,
});
```

The hook returns `markReused(href)` and `cancel(href?)`. Call `markReused` only after App Router
navigation commits and consumes the predicted route cache. Discovery removes the per-link wrapper
requirement; it does not remove the host's responsibility for route authorization, cache identity,
or reuse evidence. Adaptive calibration runs automatically in the provider-owned scheduler.

## Policy-selected routes

Use `useNextRoutePrediction()` when application policy selects a likely route without a link event.
It accepts `href`, optional policy overrides, and schedule options. Set `enabled: false` to stop
scheduling.

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
Probability and horizon use Cogni's shared defaults unless overridden.

See [React](/cogni/react) for provider ownership and
[Browser runtime and navigation metrics](/cogni/browser-and-navigation) for browser admission.
