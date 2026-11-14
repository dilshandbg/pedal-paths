---
paths:
  - 'src/**/*.ts'
  - 'src/**/*.tsx'
---

# Architecture rules for `src/`

- Pure-logic folders (`src/types`, `src/utils`, `src/services/gpx`, `src/features/*/services`,
  `src/features/*/utils`, `src/features/*/types`) must not import React, deck.gl, MapLibre or
  any `components` module. ESLint enforces this. Fix the design rather than disabling the rule.
- Components render. They don't compute. If a component needs filtering, aggregation or geometry,
  put it in a pure function and call that function.
- `src/components/**` never reads Zustand stores. Pass data in through props from a
  `features/*/components` container.
- Derived data (filtered activities, `HeatMapData`, statistics) is computed from source state and
  never stored.
- Only `services/map`, `components/map` and `features/heatmap/components` touch map APIs.
- Before you create a file, check whether a module for that responsibility already exists
  (`docs/architecture.md` §3).
