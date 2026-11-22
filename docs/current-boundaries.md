---
title: Current scope
description: Separate the current implementation from the adapters, production evidence, and release work that still belong to adopters.
---

The repository contains a TypeScript client, React and Next.js adapters, a Node.js server, protocol
version 1, conformance fixtures, and deterministic tests. This is a development surface, not yet a
public release or production rollout.

## Distribution

All four `@inttegro/cogni-*` workspace packages remain unpublished at version `0.0.0`. Their APIs
may change before the first release.

Use workspace dependencies or explicit local links for development.

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

The unpublished React adapter owns provider lifecycle, browser admission, foreground activity, and
component-scoped scheduling. The unpublished Next.js adapter adds route prediction and
intent-aware links through the public App Router contract. Hosts still connect their loaders,
caches, telemetry, invalidation, and any version-specific full-route prefetch behavior.

There is no published router or TanStack Query adapter.

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
- [React and Next.js](/react-and-next) documents the framework adapters.
- [Backend contract](/backend-contract) defines protocol version 1.
