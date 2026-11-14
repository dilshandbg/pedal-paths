# Architecture Decision Records

Significant, hard-to-reverse technical decisions are recorded here as ADRs.

| ADR                                                | Title                                           | Status                     |
| -------------------------------------------------- | ----------------------------------------------- | -------------------------- |
| [0001](0001-record-architecture-decisions.md)      | Record architecture decisions                   | Accepted                   |
| [0002](0002-client-side-gpx-processing.md)         | Client-side processing (no backend)             | Accepted, extended by 0004 |
| [0003](0003-google-maps-and-deckgl-integration.md) | Base map + deck.gl integration                  | Superseded by 0008         |
| [0004](0004-strava-zip-ingestion-pipeline.md)      | Strava export ZIP ingestion pipeline            | Accepted                   |
| [0005](0005-filter-semantics.md)                   | Filter semantics                                | Accepted                   |
| [0006](0006-heatmap-traversal-frequency.md)        | Heat map traversal-frequency model              | Accepted                   |
| [0007](0007-activity-normalization-rules.md)       | Activity classification and normalization rules | Accepted                   |
| [0008](0008-maplibre-osm-base-map.md)              | MapLibre + OpenStreetMap base map               | Accepted                   |

## Template

Copy this into `NNNN-short-title.md`:

```markdown
# NNNN. Title

- Status: Proposed | Accepted | Superseded by NNNN
- Date: YYYY-MM-DD
- Related requirements: BR-xxx

## Context

## Decision

## Consequences
```
