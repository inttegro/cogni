# Cogni charter

## Mission

Cogni is an open-source predictive loading system for software that should feel
immediate without doing unbounded work.

It helps an application anticipate a small set of likely next actions, begin the
safe reads those actions require, and let the application's existing router and
data cache reuse the result. Prediction is an optimization. It must never change
the meaning, authorization, or correctness of the application.

## The problem

Most applications know more about likely navigation than their loading strategy
uses. The current route, visible controls, pointer and focus intent, recent
navigation, and domain policy can all provide useful signals. Implementations
often scatter those signals across components as one-off prefetch calls. The
result is difficult to understand and easy to make wasteful: duplicate requests,
unbounded fan-out, mismatched cache keys, and speculative work that competes with
the user's current action.

Cogni gives this work one explicit system with shared budgets, priorities,
lifecycle events, and measurement.

## Product principles

1. **The current action comes first.** Predictive work must yield to navigation,
   input, rendering, and requests the user has already committed to.
2. **Prediction is read-only.** Cogni never predicts mutations, submissions,
   purchases, sends, deletes, or other side effects.
3. **Reuse is the point.** A prediction is useful only when the eventual action
   can consume the same route payload or data-cache entry. Cogni must not create
   a parallel cache that the host application cannot reuse.
4. **Work is bounded.** Every prediction runs under explicit limits for targets,
   concurrency, time, and network conditions. More predictions are not
   automatically better predictions.
5. **Intent outranks background policy.** Pointer, focus, touch, and other direct
   signals take priority over idle guesses.
6. **Failure is invisible.** A missed, cancelled, unsupported, or failed
   prediction must leave ordinary navigation correct and available.
7. **Authorization stays authoritative.** Predictive reads use the same identity,
   tenancy, permissions, and request context as the eventual user action.
8. **Measurement is part of the feature.** Cogni exposes whether work started,
   completed, was reused, expired, was cancelled, or was wasted. It does not call
   an implementation successful merely because requests were issued early.
9. **Privacy is not a prediction input by default.** Applications opt into
   signals deliberately. Cogni does not require cross-site tracking, user
   profiling, or opaque behavioral collection.
10. **Adoption is incremental.** An application can start with one route or one
    data policy and expand only after reuse and latency evidence justify it.

## Prediction quality contract

A prediction is correct only when the committed user action consumes the
predicted resource before that resource expires or is invalidated. Issuing a
request, completing a request, or warming a cache that the eventual action does
not reuse is not a correct prediction.

Every prediction policy must declare:

- the event or context that produces a candidate;
- the time horizon in which reuse is expected;
- a calibrated probability of reuse for that candidate or candidate class;
- the estimated client, network, and server cost of loading it; and
- the latency benefit expected if the prediction is correct.

Cogni schedules a candidate only when its probability clears the applicable
quality threshold and its expected benefit justifies its cost. Confidence scores
must be calibrated: candidates assigned a probability of `0.8` should be reused
approximately 80 percent of the time when observed over a meaningful sample.

The default production quality gates are:

- at least 80 percent of predictions that incur material work are reused within
  their declared horizon;
- high-cost predictions have at least a 90 percent probability of reuse before
  Cogni starts them; and
- at least 90 percent of bytes transferred for completed predictive work are
  reused, so a policy cannot hide a few large misses behind many cheap hits.

The host defines what qualifies as high cost for its runtime, including payload
size, server fan-out, provider calls, compute, and cache pressure. An adapter may
set stricter gates. Lower gates require explicit application configuration and
measured evidence that the latency benefit outweighs the additional waste.

Quality is measured separately by policy, trigger type, destination, cost class,
and relevant network condition. Direct intent and idle background predictions
must not be blended into one flattering average. A candidate enters the reuse
denominator as soon as it causes material network, server, or compute work. A
failure or expiry after that point is a miss. A candidate cancelled before doing
material work and a resource that was already cached are reported separately;
neither is counted as a hit.

When a policy falls below its gate over a statistically meaningful rolling
window, Cogni must reduce its budget, wait for stronger intent, or disable that
policy until it recovers. When there is not enough evidence, quality is unknown,
not assumed.

## Architectural boundary

The Cogni frontend owns:

- prediction candidates, priorities, and lifecycle;
- confidence gates, budgets, scheduling, deduplication, cancellation, and
  backpressure;
- resource identity and coordination with host-owned caches;
- normalized intent and environment signals;
- instrumentation contracts for lead time, completion, reuse, and waste; and
- stable extension points for policies, routers, and cache adapters.

Frontend adapters may connect that core to:

- routers and route-payload prefetching;
- client data caches and query libraries;
- browser visibility, connection, and input signals;
- the Cogni backend protocol; and
- application telemetry.

The language-neutral Cogni backend protocol owns:

- capability negotiation and protocol limits;
- opaque, server-registered resource identities and parameters;
- accepted, resolved, rejected, failed, and completed lifecycle events;
- JSON and streaming NDJSON response semantics; and
- outcome reporting needed to measure calibration and waste.

Each backend implementation owns:

- its resource registry and read-only handlers;
- authenticated request and tenancy resolution;
- authorization and parameter validation;
- server-side concurrency, deadlines, cache behavior, and backpressure; and
- serialization of reusable representations defined by the protocol.

The host application continues to own:

- authentication, authorization, tenancy, and request context;
- its route graph and the meaning of each destination;
- domain data access, cache keys, freshness policy, and invalidation;
- the candidates that are appropriate for a particular screen;
- every mutation and external side effect; and
- production decisions about budgets, telemetry, and rollout.

This separation is non-negotiable. Cogni can coordinate a read, but it cannot
decide that a user is allowed to make it or redefine the resource being read.

## Portability requirements

Cogni is portable across backend languages through one versioned wire contract,
not by pretending TypeScript runtime types are language-neutral. The frontend
package is implemented in TypeScript. A conforming backend may be implemented in
Go, Rust, Ruby, Node.js, or another language without importing or executing the
TypeScript package.

The versioned protocol document and shared conformance fixtures are the
canonical backend contract. Language bindings, reference servers, and framework
adapters must preserve its message and lifecycle semantics. Conformance tests
verify ordering, error behavior, streaming, authorization boundaries, and
outcomes across implementations.

The core must not import host-application code, product-specific domain
packages, Next.js, React, or a specific query library. Framework and cache
integrations belong in optional adapters built on public core contracts.

Cogni should be usable where the frontend core is valuable even when React is
not. Applications must be able to supply their own clock, scheduler, network
policy, cache adapter, transport, and telemetry sink for deterministic tests and
different frontend environments.

Adapters may provide first-class support for technologies proven by reference
integrations, including Next.js and TanStack Query. Those adapters must remain
replaceable rather than becoming hidden dependencies of the core.

## Relationship to host applications

Reference integrations can prove Cogni's behavior, but no host application
defines Cogni's architecture.

Adoption proceeds incrementally:

1. document the host's observable loading behavior and reuse guarantees;
2. identify a portable seam with parity tests on both sides;
3. move that seam into Cogni without changing host behavior;
4. adopt the published Cogni API in the host application; and
5. remove the superseded host implementation only after verification.

Product-specific route registries, policies, authenticated data functions,
query keys, server components, and domain models remain in the host application.
Public examples use generic types and must not expose private product types,
URLs, credentials, or assumptions.

There is no big-bang rewrite. Until a capability has crossed this boundary with
tests and measured parity, the host implementation remains authoritative.

## Open-source and distribution intent

Cogni is intended to be developed in public and distributed first through npm as
the independently installable `@inttegro/cogni-client`,
`@inttegro/cogni-server`, `@inttegro/cogni-react`, and
`@inttegro/cogni-next` packages, subject to registry availability and release
review. The repository should support additional packages or adapters only when
their boundaries are real and independently useful.

Published packages must provide:

- a small, typed, documented public API;
- an inspectable, versioned backend protocol and typed frontend binding;
- tree-shakable modules with no application-specific side effects;
- semantic versioning and a human-readable changelog;
- runnable examples for supported adapters;
- migration guidance for breaking changes; and
- source, package contents, provenance, and release artifacts that can be
  independently inspected.

Publication is a release decision, not a consequence of merging code. No package
is public until its API, license, security posture, documentation, package
contents, and registry provenance have been reviewed.

## Non-goals

Cogni is not:

- an autonomous agent that decides what users should do;
- a replacement for a router, query cache, CDN, or application data layer;
- a mechanism for predicting or pre-authorizing mutations;
- a reason to weaken authentication or bypass normal request handling;
- a requirement to use machine learning;
- a hidden analytics or cross-application tracking system; or
- a promise that every navigation will be instant.

## Engineering and release standard

A public Cogni capability is ready only when it has:

- deterministic tests for priority, budgets, deduplication, cancellation, and
  disposal;
- evidence that predicted work meets the correctness, calibration, and
  cost-weighted reuse gates;
- safeguards for hidden documents, constrained networks, and competing work;
- no request-context or authorization downgrade between prediction and use;
- documented behavior for errors, stale results, and unsupported runtimes;
- package-export and type checks across supported environments;
- a reference integration that exercises the public API rather than internals;
- measurements that distinguish useful lead time from speculative waste; and
- a reviewed license, dependency surface, security posture, and release process.

Benchmarks must describe their environment and workload. Local speedups, builds,
and passing tests are not evidence that a package is deployed, reused in a host
application, or faster for production users.

## Measure of success

Cogni succeeds when application teams can add a small, understandable policy and
make likely next interactions measurably faster, while keeping speculative work
bounded and ordinary navigation fully correct.

The strongest proof is not how much Cogni preloads. It is how often committed
actions reuse that work, how much latency users avoid, how little work is wasted,
and how easily another application can adopt the system without inheriting a
different host's internals.
