# Segment catalog format

The file in which the app stores your segments (BRD v2.1 BR-23, BR-29, ADR-0011). The default
location is `data/segment-catalog.json` in the project folder; set `SEGMENT_CATALOG_PATH` to move
it. The app writes it: you upload segments with the formats in `docs/segment-import-format.md`,
and each confirmed import is saved here.

You can read, back up, or edit the file by hand **while the app is stopped**. The app checks the
whole file when it starts. If anything is wrong, it loads nothing, leaves the file untouched,
reports segment storage as unavailable, and names the problems in the server log.

## Structure

```json
{
  "format": "segment-catalog",
  "version": 1,
  "segments": [
    {
      "segmentId": "229781",
      "name": "Hawk Hill",
      "distanceM": 2684.8,
      "elevationGainM": 155.7,
      "averageGradePct": 5.7,
      "maximumGradePct": 14.2,
      "elevationHighM": 245.3,
      "elevationLowM": 92.4,
      "city": "San Francisco",
      "state": "CA",
      "country": "United States",
      "start": [37.8331, -122.4834],
      "end": [37.8281, -122.4981],
      "route": [
        [37.8331, -122.4834],
        [37.8302, -122.4901],
        [37.8281, -122.4981]
      ],
      "altitudeSamplesM": [92.4, 160.1, 245.3],
      "distanceSamplesM": [0, 1320.5, 2684.8],
      "prElapsedTimeS": 553,
      "prDate": "2024-06-01",
      "effortCount": 2,
      "sourceFile": "segments.json",
      "importedAt": "2026-11-15T10:00:00.000Z",
      "updatedAt": "2026-11-15T10:00:00.000Z",
      "efforts": [
        {
          "effortId": "1234556789",
          "activityId": "3454504",
          "startDate": "2024-06-01T07:12:00.000Z",
          "elapsedTimeS": 553,
          "movingTimeS": 551
        }
      ]
    }
  ]
}
```

The app writes one segment per line, ordered by segment ID, so changes are easy to compare.

| Field      | Meaning                                                                          |
| ---------- | -------------------------------------------------------------------------------- |
| `format`   | Always `"segment-catalog"`.                                                      |
| `version`  | Format version, `1`. A file with a newer version is refused, not overwritten.    |
| `segments` | One entry per Strava segment ID. A repeated ID makes the file invalid (RULE-14). |

## Segment entry

Every field is present. `null` means unknown.

| Field                                | Type                                    | Meaning                                                                         |
| ------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------- |
| `segmentId`                          | string of digits                        | Strava segment ID, the unique key                                               |
| `name`                               | string, 1–200 characters                |                                                                                 |
| `distanceM`, `elevationGainM`        | number ≥ 0 or null                      | metres                                                                          |
| `averageGradePct`, `maximumGradePct` | number, -100 – 100, or null             | percent                                                                         |
| `elevationHighM`, `elevationLowM`    | number, -500 – 9000, or null            | metres                                                                          |
| `city`, `state`, `country`           | string or null                          |                                                                                 |
| `start`, `end`                       | `[latitude, longitude]` or null         | degrees                                                                         |
| `route`                              | `[[latitude, longitude], …]` or null    | the route geometry in order, 2 – 100,000 points                                 |
| `altitudeSamplesM`                   | number[] or null                        | altitude in metres at each route point (BR-29)                                  |
| `distanceSamplesM`                   | number[] or null                        | distance from the start in metres at each route point, never decreasing (BR-29) |
| `prElapsedTimeS`, `prDate`           | integer seconds / `YYYY-MM-DD`, or null | personal best stated by the uploaded file                                       |
| `effortCount`                        | integer ≥ 0 or null                     | effort count stated by the uploaded file                                        |
| `sourceFile`                         | string or null                          | file of the last import that changed this segment                               |
| `importedAt`, `updatedAt`            | ISO 8601 date-time                      | first import, and last change                                                   |
| `efforts`                            | array                                   | your efforts, see below                                                         |

Samples always belong to `route`: there is exactly one value per route point (RULE-19). Uploading a
segment again with a different route replaces its samples, with none if the new file has none.
Segments migrated from SQLite have no samples (`null`) until you upload them again with samples.

**Effort:** `effortId` and `activityId` (digit string or null), `startDate` (ISO 8601 date-time,
UTC), `elapsedTimeS` (integer seconds > 0), `movingTimeS` (integer seconds ≥ 0 or null). An effort
is identified by its `effortId`, or by start time and elapsed time without one; a repeated effort
makes the file invalid (RULE-16). The personal best is computed from the efforts (RULE-17) and is
not stored.

## Removing the data

Use **Segments → Remove all** in the app: it leaves an empty catalog. Or stop the app and delete the
file. A `segments.sqlite.migrated` file next to it is the old database after migration (BR-30);
the app no longer uses it, and you can delete it too.
