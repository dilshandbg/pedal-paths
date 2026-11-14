---
paths:
  - 'src/**'
  - 'tests/**'
  - 'docs/**'
---

# BRD traceability rules

- `docs/BRD.md` is read-only unless the user explicitly asks for a change to it.
- Before you implement any user-visible behaviour, find the BRD requirement it fulfils and its ID
  in `docs/traceability.md`. If there isn't one, **stop and ask**. Don't invent requirements,
  defaults, limits or business rules.
- If the BRD is ambiguous, add or update an `OD-xx` entry in `docs/technical-design.md` §9 and ask
  the user. Don't silently choose an interpretation.
- Annotate the code (`// Implements: BR-xxx`) and the tests (`describe('BR-xxx: …')`), then update
  the Status / Implementation / Tests columns of the traceability matrix in the same change.
