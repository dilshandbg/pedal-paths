---
paths:
  - 'tests/**'
  - 'src/**/*.ts'
  - 'src/**/*.tsx'
---

# Testing rules

- Unit and integration tests live under `tests/unit` and `tests/integration`, mirroring the `src/`
  path, and are named `*.test.ts(x)`. E2E tests live in `tests/e2e/*.spec.ts`.
- Each test asserts real behaviour. No tautologies, and no snapshot-only tests.
- Pure functions: cover the normal case, boundaries (empty input, a single point, the antimeridian,
  month 1/12, year boundaries) and invalid input.
- React components: query with `getByRole` / `getByLabelText`, and use `@testing-library/user-event`
  for interaction.
- Zustand stores: reset in `beforeEach` with `useXStore.setState(useXStore.getInitialState(), true)`.
- Fixtures: only small synthetic files in `tests/fixtures/`. Never read from `test-data/`.
- No network and no real map (MapLibre / WebGL) in Vitest. Map libraries are mocked at the adapter boundary.
