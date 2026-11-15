# Segment import format

Specification for the segment files accepted by the Segments section (BRD v2.0, BR-20 – BR-24,
ADR-0010). You prepare the file yourself; the application never contacts Strava.

Field names follow the Strava API, so a segment object copied from Strava can usually be uploaded
as-is. Unknown fields are ignored.

## Limits

| Limit      | Value                               |
| ---------- | ----------------------------------- |
| File size  | 20 MB                               |
| File types | `.json`, `.geojson`, `.csv` (UTF-8) |

## JSON

Either an array of segments, or an object with a `segments` array.

```json
{
  "segments": [
    {
      "id": 229781,
      "name": "Hawk Hill",
      "distance": 2684.82,
      "total_elevation_gain": 155.7,
      "average_grade": 5.7,
      "maximum_grade": 14.2,
      "elevation_high": 245.3,
      "elevation_low": 92.4,
      "city": "San Francisco",
      "state": "CA",
      "country": "United States",
      "start_latlng": [37.8331119, -122.4834356],
      "end_latlng": [37.8280722, -122.4981393],
      "map": { "polyline": "_p~iF~ps|U_ulLnnqC_mqNvxq`@" },
      "athlete_segment_stats": {
        "pr_elapsed_time": 553,
        "pr_date": "1993-04-03",
        "effort_count": 2
      },
      "efforts": [
        {
          "id": 1234556789,
          "activity_id": 3454504,
          "start_date": "2024-06-01T07:12:00Z",
          "elapsed_time": 560,
          "moving_time": 558
        },
        { "start_date": "2023-05-14T06:40:10Z", "elapsed_time": 553 }
      ]
    }
  ]
}
```

| Field                                    | Type                                     | Required | Meaning                                                 |
| ---------------------------------------- | ---------------------------------------- | -------- | ------------------------------------------------------- |
| `id`                                     | integer (or digit string)                | yes      | Strava segment ID, the unique key                       |
| `name`                                   | string                                   | yes      |                                                         |
| `distance`                               | number ≥ 0                               | no       | metres                                                  |
| `total_elevation_gain`                   | number ≥ 0                               | no       | metres                                                  |
| `average_grade`, `maximum_grade`         | number, -100 – 100                       | no       | percent                                                 |
| `elevation_high`, `elevation_low`        | number                                   | no       | metres                                                  |
| `city`, `state`, `country`               | string                                   | no       |                                                         |
| `start_latlng`, `end_latlng`             | `[latitude, longitude]`                  | no       | degrees                                                 |
| `map.polyline` or `map.summary_polyline` | string                                   | no       | encoded polyline (precision 5)                          |
| `geometry`                               | GeoJSON `LineString` / `MultiLineString` | no       | `[longitude, latitude]` positions; preferred over `map` |
| `athlete_segment_stats.pr_elapsed_time`  | integer ≥ 0                              | no       | personal best, seconds                                  |
| `athlete_segment_stats.pr_date`          | date (`YYYY-MM-DD` or ISO date-time)     | no       |                                                         |
| `athlete_segment_stats.effort_count`     | integer ≥ 0                              | no       |                                                         |
| `efforts[]`                              | array                                    | no       | see below                                               |

Effort fields: `start_date` (ISO 8601 date-time, required), `elapsed_time` (integer seconds > 0,
required), `moving_time` (integer seconds ≥ 0), `id` (effort ID), `activity_id` or `activity.id`.

## GeoJSON

A `FeatureCollection` with one `Feature` per segment. The geometry is the segment route
(`LineString` or `MultiLineString`). `properties` holds the JSON fields above; the ID can be
`properties.id`, `properties.segment_id` or the feature's own `id`.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [-122.4834, 37.8331],
          [-122.4981, 37.8281]
        ]
      },
      "properties": { "id": 229781, "name": "Hawk Hill", "distance": 2684.8 }
    }
  ]
}
```

## CSV

A header row, comma-separated, RFC 4180 quoting. The header decides the file kind.

**Segments CSV** (has a `name` column): one segment per row.

```csv
segment_id,name,distance_m,elevation_gain_m,average_grade,maximum_grade,elevation_high_m,elevation_low_m,city,state,country,start_lat,start_lng,end_lat,end_lng,polyline,pr_elapsed_time_s,pr_date,effort_count
229781,Hawk Hill,2684.8,155.7,5.7,14.2,245.3,92.4,San Francisco,CA,United States,37.8331,-122.4834,37.8281,-122.4981,,553,1993-04-03,2
```

Only `segment_id` and `name` are required; leave other cells empty when unknown.

**Efforts CSV** (has `elapsed_time_s` and no `name` column): one effort per row. Each effort must
reference a segment that is in the same file or already stored.

```csv
segment_id,start_date,elapsed_time_s,moving_time_s,effort_id,activity_id
229781,2024-06-01T07:12:00Z,560,558,1234556789,3454504
```

## Import rules

- Every record is validated first. If any record is invalid, nothing is imported and every problem
  is listed with its record and field (RULE-15).
- The import review shows each segment as **new**, **update** or **unchanged** before you confirm.
- A segment ID that is already stored is updated: fields present in the new file replace the stored
  values; fields that are absent keep their stored values (RULE-16).
- Efforts are added to the stored ones. An effort that is already stored (same effort ID, or the
  same start time and elapsed time when it has no ID) is not added again.
- A segment's personal best is its fastest effort; without efforts, the file's
  `pr_elapsed_time` is shown (RULE-17).
- Routes given as `MultiLineString` are joined into one line in order.
