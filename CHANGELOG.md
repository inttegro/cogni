# Changelog

Cogni follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). During the `0.x` series,
minor releases may contain breaking API changes. Migration notes will call those changes out.

## [0.1.0] - Unreleased

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
