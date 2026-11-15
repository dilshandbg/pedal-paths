# Segment catalog format

The file in which the app stores your segments (BRD v2.1 BR-23, BR-29, ADR-0011). The default
location is `data/segment-catalog.json` in the project folder; set `SEGMENT_CATALOG_PATH` to move
it. The app loads it when it starts. You add segments with the upload in the Segments tab (formats:
`docs/segment-import-format.md`), and each confirmed upload is saved here. Uploading a segment
again updates its entry; the Strava segment ID is the unique key.

## Structure

```json
{
  "version": 1,
  "segments": [
    {
      "id": "35710081",
      "name": "Segment 35710081",
      "distanceKm": 0.685,
      "elevationMinM": 508.8,
      "elevationMaxM": 527.8,
      "start": { "lat": 7.293365, "lng": 80.633318 },
      "end": { "lat": 7.298987, "lng": 80.635056 },
      "route": {
        "latlng": [
          [7.293365, 80.633318],
          [7.294, 80.6335]
        ],
        "altitude": [508.8, 510.2],
        "distance": [0, 15.5]
      }
    }
  ]
}
```

The route arrays are illustrative; the app stores every route point and sample it was given. It
writes one segment per line, ordered by ID, so changes are easy to compare.

| Field            | Type                                  | Meaning                                                           |
| ---------------- | ------------------------------------- | ----------------------------------------------------------------- |
| `version`        | `1`                                   | Format version. A newer version is refused, never overwritten.    |
| `segments`       | array                                 | One entry per segment ID (RULE-14).                               |
| `id`             | string of digits (a number is read)   | Strava segment ID, the unique key. Required.                      |
| `name`           | string, up to 200 characters          | Missing → `Segment <id>`.                                         |
| `distanceKm`     | number ≥ 0 or null                    | kilometres, kept to the millimetre                                |
| `elevationMinM`  | number, -500 – 9000, or null          | lowest elevation, metres                                          |
| `elevationMaxM`  | number, -500 – 9000, or null          | highest elevation, metres                                         |
| `start`, `end`   | `{ "lat", "lng" }` or null            | degrees                                                           |
| `route`          | object or null                        | the segment's route; null when unknown                            |
| `route.latlng`   | `[[lat, lng], …]`, 2 – 100,000 points | GPS coordinates in order                                          |
| `route.altitude` | number[] or null                      | altitude in metres at each point (BR-29)                          |
| `route.distance` | number[] or null                      | distance from the start in metres at each point, never decreasing |

Samples belong to `route.latlng`: exactly one value per point (RULE-19). Uploading a segment again
with a different route replaces its samples, with none if the new file has none.

### Additional fields

The app also writes these after the fields above, so that nothing you uploaded is lost (BR-23,
BR-25). All are optional when you write a catalog yourself:

| Field                                | Meaning                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| `elevationGainM`                     | metres                                                             |
| `averageGradePct`, `maximumGradePct` | percent, -100 – 100                                                |
| `city`, `state`, `country`           | text                                                               |
| `prElapsedTimeS`, `prDate`           | personal best stated by the uploaded file (seconds, `YYYY-MM-DD`)  |
| `effortCount`                        | effort count stated by the uploaded file                           |
| `sourceFile`                         | file of the last upload that changed the segment                   |
| `importedAt`, `updatedAt`            | ISO 8601 date-times; missing → the time the catalog was loaded     |
| `efforts`                            | `[{ effortId, activityId, startDate, elapsedTimeS, movingTimeS }]` |

An effort needs `startDate` (ISO 8601 with a time zone) and `elapsedTimeS` (whole seconds > 0). It
is identified by `effortId`, or by start time and elapsed time without one (RULE-16). The personal
best is computed from the efforts (RULE-17) and is not stored.

## Missing or malformed data

The app checks the whole file when it starts:

- **Not a catalog** (not JSON, not an object, `segments` not a list, or a newer `version`): nothing
  is loaded and the file is not changed. The Segments tab reports storage as unavailable and the
  server log says why. The ride heat map keeps working.
- **Problems inside entries:** the rest still loads. A field with an invalid value is treated as
  unknown (an invalid route also drops its samples). An entry without a valid `id`, a repeated
  `id` (the first is kept) and an invalid effort are skipped. Each is listed in the server log.
  Before the app first saves a change, it copies the original file to
  `segment-catalog.json.<date-time>.bak`, so what was skipped can still be recovered.
- A missing `version` is read as `1`; missing optional fields are simply unknown.

Edit the file only while the app is stopped. The app keeps the catalog in memory while it runs, so
its next change overwrites edits made in the meantime.

## Migration from SQLite

Segments stored in the SQLite database of version 2.0 (`data/segments.sqlite`) are copied into
the catalog the first time the app starts without a catalog file (BR-30). Every coordinate and
detail is kept; the database had no altitude or distance samples, so `route.altitude` and
`route.distance` are null until you upload those segments again with streams. After a successful,
verified copy the database is renamed to `segments.sqlite.migrated`, which the app no longer uses.

## Removing the data

Use **Segments → Remove all** in the app: it leaves an empty catalog. Or stop the app and delete the
file, any `.bak` copies, and `segments.sqlite.migrated`.
