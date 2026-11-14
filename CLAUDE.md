# CLAUDE.md

Guidance for Claude Code (and other contributors) working in this repository.

## Project overview

**Strava Cycling Heat Map** is a personal, local web app. The user uploads their original **Strava
export ZIP**. The app extracts it in the browser, keeps only activities classified as **Ride**,
parses their GPX and FIT tracks, and shows them as a heat map of how often roads are ridden. Users
filter by year, month and individual ride, and the heat map updates to match.

- **Source of truth for business requirements: `docs/BRD.md`.** Never edit it unless the user
  explicitly asks.
- Architecture: `docs/architecture.md` · Design and open decisions: `docs/technical-design.md` ·
  ADRs: `docs/decisions/` · Traceability: `docs/traceability.md`
- Current phase: **scaffold, with BRD v1.1 analysed and the decisions accepted (ADR-0004 to 0007).**
  Do not implement features until the user explicitly approves starting feature work.
  Implement one requirement at a time with `/implement-requirement`.

## Technology stack

React 19 · TypeScript (strict) · Vite 6 · Tailwind CSS 4 · Zustand 5 · deck.gl 9 · MapLibre GL JS +
OpenStreetMap tiles (ADR-0008) · fflate (ZIP/gunzip) · @garmin/fitsdk (FIT) · native `DOMParser`
(GPX) · Web Worker for imports · Vitest 4 + React Testing Library · Playwright · ESLint 9 · Prettier · npm.

## Commands

```bash
npm run dev          # start dev server
npm run build        # typecheck + production build
npm run test         # unit + integration tests (Vitest)
npm run test:e2e     # Playwright e2e (first run: npm run test:e2e:install)
npm run lint         # ESLint
npm run typecheck    # tsc -b
npm run format       # Prettier write
```

Before you call any task done, run `typecheck`, `lint` and `test` (and `build` when the change
touches config). The `/verify` command runs all of them.

## Business requirements and traceability (mandatory)

1. **Do not implement undocumented business requirements.** If a behaviour isn't in the BRD
   (or explicitly approved by the user), don't build it. Ask, or record it as an open decision
   (`OD-xx` in `docs/technical-design.md` §9).
2. **Do not resolve ambiguity by guessing.** If the BRD is unclear, stop and ask. Don't pick an
   interpretation without telling the user.
3. Every feature maps to requirement IDs in `docs/traceability.md`.
   - Code: `// Implements: BR-004` at the main entry point of the behaviour.
   - Tests: `describe('BR-004: …')`, with at least one test per acceptance criterion.
   - Update the matrix whenever you implement or change a requirement.
4. Generic technical work (tooling, refactors, utilities) needs no requirement ID, but it must
   not add user-visible behaviour.

## Architecture guidelines

- **Business logic never lives in UI components.** Filtering, normalization, heat map preparation
  and statistics are **pure functions** in `features/*/services`, `features/*/utils`, `services/gpx`
  or `utils`.
- **Map rendering is decoupled.** deck.gl / MapLibre code only _renders_ a prepared
  `HeatMapData`. It never filters or aggregates. Only `services/map`, `components/map` and
  `features/heatmap/components` may import map libraries.
- `src/components/**`: presentational and domain-agnostic. It takes props, never reads stores, and
  holds no business rules.
- `src/features/<feature>/components`: feature containers that may read stores and call services.
- Features don't reach into each other's internals. Share code via `src/types`, `src/utils` or
  `src/store`.
- Store only source state in Zustand (loaded activities, the filter). **Compute derived data**
  (filtered activities, heat map, statistics) with selectors or memoized pure functions. Never
  store copies of it.
- ESLint enforces the purity boundary (`no-restricted-imports` in `eslint.config.js`). Don't disable it.
- Hard-to-reverse decisions need an ADR in `docs/decisions/` and user approval first.

## Working rules

- **Inspect before modifying.** Read the file you are changing and its tests, check for an
  existing util, type or component before writing a new one, and follow the patterns already
  in place.
- **Avoid unnecessary dependencies.** Prefer platform APIs (e.g. `DOMParser` for GPX) and small
  local utilities. Before adding a package, justify it (what it replaces, size, maintenance)
  and ask the user. Pin compatible versions and keep `package-lock.json` committed.
- Keep changes scoped to the task. No drive-by refactors or speculative abstractions.
- The app needs no secrets (ADR-0008). Never hardcode any. Config comes from `import.meta.env` (`VITE_*`), documented in `.env.example`.
- Never commit real GPS data or Strava exports. `test-data/` is git-ignored; tests use synthetic
  `tests/fixtures/`, and test ZIPs are built in memory with fflate.
- Heavy work (unzip, parsing, segment precomputation) runs in the import Web Worker, never on the
  main thread.

## Coding standards

- TypeScript strict, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. No `any`.
  No non-null `!` without a comment explaining why it is safe.
- Use `import type` for type-only imports (enforced). Use the `@/` alias for `src/`.
- Domain objects are `readonly` and immutable. Return new objects, never mutate inputs.
- Use named exports (no default exports, except config files that require them).
- Function components with typed props interfaces. Keep each component small and single-purpose.
- Style with Tailwind utility classes. Use global CSS only for base styles and `@utility` helpers in
  `src/styles/index.css`.
- Accessibility: semantic landmarks, a label on every interactive control, colour never the only
  signal.
- Units live in names: `distanceKm`, `elevationGainM`. Months are 1–12, never
  0-based.
- Coordinates: domain objects use `{ latitude, longitude }`. Render data uses `LngLat = [lng, lat]`.
  Convert only at that boundary.

## Naming conventions

| Kind                   | Convention                                     | Example                             |
| ---------------------- | ---------------------------------------------- | ----------------------------------- |
| Components             | `PascalCase.tsx`                               | `FilterPanel.tsx`                   |
| Hooks                  | `useCamelCase.ts`                              | `useFilteredActivities.ts`          |
| Zustand stores         | `camelCaseStore.ts` → `useXStore`              | `filterStore.ts` → `useFilterStore` |
| Pure modules           | `camelCase.ts`, verb functions                 | `buildHeatMapData()`, `parseGpx()`  |
| Types / interfaces     | `PascalCase`, no `I` prefix                    | `CyclingActivity`                   |
| Constants              | `UPPER_SNAKE_CASE`                             | `EARTH_RADIUS_KM`                   |
| Folders                | `kebab-case`                                   | `strava-export/`                    |
| Unit/integration tests | `*.test.ts(x)` under `tests/` mirroring `src/` | `tests/unit/utils/geo.test.ts`      |
| E2E tests              | `*.spec.ts` in `tests/e2e`                     | `app-shell.spec.ts`                 |

## Testing requirements

- New pure logic gets unit tests covering normal, boundary and invalid inputs.
- Components with behaviour get RTL tests. Query by role or label, not by class or test ID.
- User journeys from BRD acceptance criteria get Playwright tests.
- **No fake tests.** Never write `expect(true).toBe(true)` or snapshot-only tests that verify nothing.
- Tests must be deterministic. Use synthetic fixtures, no network, and no real map or WebGL in
  unit tests.
- Fixing a bug starts with a failing test that reproduces it.
