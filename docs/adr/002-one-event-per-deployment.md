# 002 — One event per deployment

**Status:** accepted (Phase 0)

## Decision
Each deployment serves one wedding, selected by `EVENT_SLUG`. The schema keeps `event_id` on every table.

## Why
Removes routing, tenant switching and per-event admin from the first release.

## Consequences
Supporting several events later is a small change: resolve the event from the host or path instead of the env var. No schema migration is needed.
