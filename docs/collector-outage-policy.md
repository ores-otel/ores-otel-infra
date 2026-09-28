# Collector outage policy

Application request handling must not fail solely because telemetry export is unavailable unless an operator has explicitly enabled a fail-closed telemetry mode.

## Bounded behavior

1. Export queues have explicit record and byte ceilings.
2. Queue memory is pre-budgeted; exporters MUST NOT grow unbounded buffers.
3. When a queue is full, the configured drop policy is deterministic and exposes counters.
4. Retry uses bounded exponential backoff with jitter and a maximum retry horizon.
5. Recovery MUST NOT replay an unbounded backlog burst into a newly healthy collector.
6. Disk buffering, when enabled, has a hard byte quota, file-count quota, retention TTL, and corruption handling.

## Required signals

Exporters expose queue depth, queue bytes, dropped records by reason, retry count, exporter failures, oldest queued age, recovery-drain rate, and the currently admitted policy revision.

Signals MUST remain low-cardinality and MUST NOT include payload bodies, credentials, tenant secrets, raw query text, or arbitrary exception payloads.

## Recovery

After collector recovery, drain is rate-limited independently from live traffic. Live traffic receives a reserved export budget so a backlog cannot starve current telemetry. Old records past the retention horizon are dropped with an explicit reason counter.

## Test matrix

Exercise outage and recovery at low, steady, and saturation load; verify memory/disk ceilings, drop counters, bounded replay, request-path independence, and exact policy/config identity in evidence.
