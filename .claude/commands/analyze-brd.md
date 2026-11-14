---
description: Analyse docs/BRD.md and populate the traceability matrix and open decisions
---

1. Read `docs/BRD.md` in full. If it is missing, stop and ask the user for it.
2. Pull out, citing the BRD section for each one:
   - business requirements (BR)
   - acceptance criteria (AC), linked to their BR
   - business rules (RULE)
   - non-functional requirements (NFR)
3. List ambiguities, contradictions and unresolved decisions. Merge them with the existing
   `OD-xx` list in `docs/technical-design.md` §9: close the ones the BRD answers and add new ones.
4. Validate the proposed domain model in `src/types` against the BRD and list any changes needed.
   Don't apply them.
5. Fill in `docs/traceability.md` (Status = Not started).
6. Do not modify `docs/BRD.md`. Do not invent requirements. Present a summary and questions to the
   user, and wait for approval before implementing anything.
