---
title: Current scope
description: Separate the current implementation from the adapters, production evidence, and release work that still belong to adopters.
---

The `0.1` line contains a TypeScript client, React, React Router, TanStack Router, Next.js, and Astro
adapters, a Node.js server, protocol version 1, conformance fixtures, and deterministic tests. A
package release is implementation evidence, not evidence of a host deployment or production reuse.

## Distribution

All seven `@inttegro/cogni-*` packages share one version. During the `0.x` series, minor releases may
change public APIs and include migration notes in the changelog. Confirm registry publication and
provenance independently; source manifests alone do not prove a version was published.

## Client

The client includes:

- a framework-neutral coordinator with probability gates, concurrency and queue bounds,
  deduplication, deadlines, cancellation, lifecycle events, and in-memory reuse accounting;
- an activity-aware scheduler with soft delay, idle wait, maximum defer, environment admission, and
  direct-intent escalation;
- framework-neutral intent and navigation metric primitives;
- optional browser environment and idle-runtime helpers;
- a version 1 protocol client for JSON and NDJSON; and
- an optional Chrome Prompt API allowlist ranker.

The React adapter owns provider lifecycle, browser admission, foreground activity,
component-scoped scheduling, and delegated discovery of rendered links. React Router and TanStack
Router adapters add intent-aware links over their public route-preload contracts. The Next.js
adapter adds route prediction through the public App Router contract. The Astro
adapter adds a delegated document runtime, `.astro` components, public `astro:prefetch` loading, and
ClientRouter reuse attribution. Hosts still own policy, calibration, route authorization, caches,
telemetry, and invalidation.

The coordinator's quality history is bounded and memory-only. It is useful for runtime snapshots,
not a durable analytics store or a statistical calibration service.

## Browser

The browser helper blocks hidden documents, data-saving connections, and `2g` or `slow-2g`
connections. Missing connection information does not block a visible document.

The default observer requires `document` and `navigator`. Core coordination remains usable in SSR,
workers, tests, and non-browser runtimes when the host supplies appropriate runtime and environment
signals.

The Chrome AI adapter is optional progressive enhancement. It uses only an already-available model,
supports English text input and output, ranks a bounded host allowlist, and returns `null` on
unavailability or failure. It does not assign calibrated probabilities, start predictions, or make
the static host policy optional.

## Node server

The Node.js 20+ reference server uses Fetch `Request`, `Response`, and `ReadableStream`. Its handlers
are route-independent.

The registry-backed executor supports:

- registered read-only resources and synchronous parameter validation;
- ordinary and high-cost confidence gates;
- advertised batch and horizon limits;
- bounded concurrent resolution;
- request cancellation and per-candidate deadlines;
- isolated candidate failures;
- completion-order JSON and NDJSON event delivery; and
- optional host outcome recording.

Authentication, route mounting, tenancy, domain authorization, cache policy, backpressure outside a
single executor, and telemetry persistence remain host responsibilities.

## Protocol

Version 1 defines three host-routed `POST` operations: capabilities, predictions, and outcomes. It
supports JSON resources, buffered JSON, and NDJSON. A request accepts at most 16 candidates and a
60-second horizon; implementations may advertise stricter limits.

The protocol does not reserve URLs, carry credentials, execute client-provided URLs or queries, or
define application-specific resource parameters. It does not provide Server-Sent Events,
WebSockets, binary representations, or mutation execution in version 1.

## Evidence

Tests cover client lifecycles, scheduling, browser policy, navigation metrics, Chrome AI fallback,
protocol ordering, Node execution, and client-server conformance.

They do not prove host reuse, deployment, or user-visible speed. Those claims require cache,
deployment, and runtime evidence. No production benchmark is bundled here.

## Adoption

Adoption is complete after the host connects its real router, cache, authentication, and telemetry,
then verifies behavior and measured reuse.

Product-specific adapters, rollout decisions, deployment evidence, and production measurements
belong to the host application and are not part of Cogni's public contract.

## Continue

- [Why Cogni](/why-cogni) defines the correctness and quality target.
- [Client API reference](/client-api) and [server API reference](/server-api) list current exports.
- [React](/react) documents provider and hook lifecycles.
- [React Router](/react-router) documents the Framework, Data, and Declarative Mode adapter.
- [TanStack Router](/tanstack-router) documents the preloadRoute adapter.
- [Next.js](/next) documents App Router prediction and intent-aware links.
- [Astro](/astro) documents delegated route prediction and ClientRouter reuse.
- [Backend contract](/backend-contract) defines protocol version 1.
