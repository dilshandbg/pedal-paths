---
description: Implement one BRD requirement end-to-end with traceability (usage - /implement-requirement BR-004)
---

Implement requirement `$ARGUMENTS`:

1. Find it in `docs/traceability.md` and read the corresponding BRD section. If it is missing,
   ambiguous or blocked by an open `OD-xx`, stop and ask.
2. Read the existing code in the affected modules and their tests before you change anything.
3. Put the business logic in pure functions (services/utils) and write unit tests first, one or
   more per acceptance criterion, named `describe('$ARGUMENTS: …')`.
4. Wire the UI through a feature container. Keep presentational components prop-driven.
5. Add `// Implements: $ARGUMENTS` at the main entry point.
6. Update `docs/traceability.md` (Status, Implementation, Tests).
7. Run `/verify` and report the results.
