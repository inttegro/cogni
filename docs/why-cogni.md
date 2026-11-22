---
title: Why reuse matters
description: See why finishing a request early is not enough, and how Cogni turns anticipation into measurable reuse.
---

Intent may provide enough warning to finish a small read. Prefetching everything, however, spends
bandwidth, backend capacity, memory, and cache space on guesses.

Cogni asks: **which reads are likely enough to deserve work, and how will we know they helped?**

## Successful request, failed prediction

A `200` can still save no time if the user goes elsewhere, the key differs, or the data expires.

The defining rule is simple: **a prediction is correct only when the committed action consumes the
predicted representation before it expires or is invalidated.** Completion proves that work
happened. Reuse proves that it mattered.

The loader must populate the foreground cache, and the host must mark reuse only when committed work
consumes that entry. Cogni coordinates the attempt; the host owns cache identity and freshness.

## Confidence controls spending

Probability is permission to spend. Every candidate declares a calibrated `probability`, a
`horizonMs`, and a cost class. The default gates are:

| Cost       | Minimum probability |
| ---------- | ------------------: |
| `low`      |                 0.8 |
| `standard` |                 0.8 |
| `high`     |                 0.9 |

Calibration makes `0.8` testable: comparable candidates should be reused about 80 percent of the
time. Lower thresholds require evidence; high-cost gates cannot be lower than ordinary gates.

## Count and byte reuse

Suppose nine tiny predictions are reused and one 5 MB prediction is wasted. Count-based reuse says
90 percent; the network tells another story. Cogni therefore tracks:

- **reuse rate** divides reused material predictions by all material predictions;
- **byte reuse rate** divides bytes from reused predictions by bytes from all material predictions.

The charter targets 80 percent material reuse and 90 percent byte reuse, with a 90 percent gate for
high-cost work.

The coordinator's `quality()` snapshot separates material outcomes from work that never began:

- `reused`, `missed`, `failed`, and cancellation after work begins contribute to the material
  denominator;
- cancellation before material work and expiry without work are reported separately;
- rejected candidates are reported without being counted as successful predictions; and
- `reuseRate` or `byteReuseRate` is `null` when there is no corresponding evidence.

Filter by `policy`, `trigger`, `destination`, or `cost` so strong signals do not hide weak ones.

## Prediction stays optional

Ordinary navigation proceeds when prediction fails. Cogni coordinates reads only; host identity,
tenancy, and authorization still apply.

## Production evidence

Evaluate a policy with:

- reuse rate and byte reuse rate;
- prefetch lead time and whether work settled before navigation;
- committed navigation duration;
- request volume, server work, and cache pressure; and
- failure, expiry, and cancellation counts.

Package tests prove protocol behavior, not production speed. Production evidence begins after the
host connects its cache and records outcomes.

## Continue

- [How Cogni works](/how-cogni-works) explains the complete prediction and evidence loop.
- [Architecture](/architecture) maps the client, backend, cache, and host trust boundaries.
- [Candidates and reuse](/candidates-and-reuse) shows the candidate lifecycle and accounting API.
- [Current boundaries](/current-boundaries) records the current package and integration limits.
