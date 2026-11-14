# Strava Cycling Heat Map

A personal, local web app that turns your **original Strava export ZIP** into an interactive heat
map of your rides. It shows how often each road was ridden, filtered by year, month and individual
ride. Everything runs in your browser and your data never leaves your machine.

> **Status:** project scaffold. The app shell, tooling and architecture are in place. The features
> (ZIP import, GPX/FIT parsing, filtering, heat map, statistics) come next, driven by
> `docs/BRD.md` v1.1 and the ADRs in `docs/decisions/`.

## Tech stack

React 19 · TypeScript (strict) · Vite 6 · Tailwind CSS 4 · Zustand · MapLibre GL JS +
OpenStreetMap tiles · deck.gl · fflate · @garmin/fitsdk · Vitest + React Testing Library · Playwright · ESLint · Prettier

## Prerequisites

- **Node.js 20.19+** (22 LTS recommended; see `.nvmrc`) and npm 10+
- An internet connection for map tiles. **No API key or billing account is needed.**

## Getting started

```bash
npm install
npm run dev                         # http://localhost:5173
```

## Map tiles

The base map is MapLibre GL JS with free OpenStreetMap tiles from
[OpenFreeMap](https://openfreemap.org/). It needs no key, no account and no billing (ADR-0008).
To use a different MapLibre-compatible style, copy `.env.example` to `.env.local` and set:

```dotenv
VITE_MAP_STYLE_URL=https://example.org/your-style.json
```

Restart `npm run dev` after changing env files. Map attribution (© OpenStreetMap
contributors) stays visible on the map, as the tile licence requires.

## Scripts

| Command                    | Description                                         |
| -------------------------- | --------------------------------------------------- |
| `npm run dev`              | Start the Vite dev server                           |
| `npm run build`            | Type-check and build for production into `dist/`    |
| `npm run preview`          | Serve the production build locally                  |
| `npm run test`             | Run unit and integration tests (Vitest)             |
| `npm run test:watch`       | Run Vitest in watch mode                            |
| `npm run test:e2e:install` | Download the Playwright Chromium browser (run once) |
| `npm run test:e2e`         | Run Playwright end-to-end tests                     |
| `npm run lint`             | Lint with ESLint                                    |
| `npm run typecheck`        | Type-check with `tsc -b`                            |
| `npm run format`           | Format with Prettier                                |

## Project structure

```text
docs/          BRD (source of truth), architecture, technical design, ADRs, traceability
public/        Static assets
src/
  app/         App root, routes, providers
  components/  Presentational UI (layout, map, filters, statistics, common)
  features/    activities · filters · heatmap: feature modules (logic + containers)
  services/    strava-export (ZIP + CSV), gpx, fit, map config
  store/       Cross-feature state
  types/       Domain model
  utils/       Generic helpers
  styles/      Tailwind entry
tests/         unit · integration · e2e · fixtures (synthetic)
test-data/     Your real exports for manual testing (git-ignored)
.claude/       Claude Code rules and commands
```

See [`docs/architecture.md`](docs/architecture.md) for the layering and dependency rules.

## Loading your activity data

1. In Strava, go to **Settings → My Account → Download or delete your account → Request your
   archive**. Strava emails you a link to a ZIP file.
2. Start the app (`npm run dev`) and select that ZIP with the upload control. **Don't extract
   it.** The app reads `activities.csv` and the `activities/` GPX and FIT files directly from
   the archive.
3. Only activities classified as **Ride** are shown. Runs, swims, workouts and other types
   (including Virtual, E-Bike, Gravel and Mountain Bike rides) are excluded.
4. To switch datasets, select a different ZIP. Data is not kept after a page reload.

> The upload flow is designed (ADR-0004) but not implemented yet.

Keep your own export in `test-data/`, which is git-ignored for privacy.
