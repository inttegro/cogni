# Changelog

Cogni follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). During the `0.x` series,
minor releases may contain breaking API changes. Migration notes will call those changes out.

## Unreleased

### Added

- First-class Vinext support through `@inttegro/cogni-vinext`, backed by the same public
  `next/link` and `next/navigation` contract as the Next.js adapter and verified by a standalone
  Vinext application that does not install `next`.

## [0.2.0] - 2026-11-26

### Added

- Default adaptive calibration for opaque user-device subjects in browser-owned runtimes, with time
  decay, conservative confidence, bounded adjustments, resilient IndexedDB storage, automatic
  lifecycle learning, DevTools explanations, and no raw navigation history.
- A provider-first React runtime with integration-supplied candidates and no central prediction
  registry, plus optional probability and reuse horizon overrides across router adapters.
- Embedded and browser DevTools for inspecting admission, scheduling, execution, reuse, waste, and
  adaptive calibration while developing an application.

### Changed

- Framework adapters now lead with one provider and a router-native `PredictiveLink`; Cogni supplies
  conservative probability, horizon, scheduling, browser-admission, and learning defaults.
- Package READMEs now put the shortest supported adoption path before low-level coordinator and
  custom-loader APIs.

## [0.1.0] - 2026-11-24

### Added

- A framework-neutral browser coordinator with confidence gates, shared budgets, scheduling,
  deduplication, cancellation, and reuse accounting.
- A language-neutral version 1 backend protocol with JSON and NDJSON transports and conformance
  fixtures.
- A Node.js server runtime with registered read-only resources, bounded concurrency, deadlines, and
  outcome reporting.
- React lifecycle hooks and predictive link adapters for React Router, TanStack Router, Next.js,
  and Astro.
- Standalone demos and clean-tarball build verification for every supported adapter and runtime.

### Boundaries

- Node.js is the first backend implementation; other languages can implement protocol version 1.
- Quality history is currently process-local and supplied telemetry remains host-owned.
- Predictive work is read-only. Mutations and authorization remain entirely host-owned.

[0.1.0]: https://github.com/inttegro/cogni/releases/tag/v0.1.0
[0.2.0]: https://github.com/inttegro/cogni/releases/tag/v0.2.0
