# 0001. Record architecture decisions

- Status: Accepted
- Date: 2026-11-14

## Context

This project is built with an AI coding assistant across many sessions. Decisions made in one
session have to be visible in the next one, or they get re-argued or silently reversed.

## Decision

Record significant decisions as lightweight ADRs in `docs/decisions/`. Open, unresolved questions
are tracked as `OD-xx` in `docs/technical-design.md` §9. Once a question is resolved it becomes
an ADR.

## Consequences

- Before changing an architectural pattern, read the relevant ADR first.
- To reverse a decision, write a new ADR that supersedes the old one. Don't edit history.
