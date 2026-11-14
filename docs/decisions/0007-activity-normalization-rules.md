# 0007. Activity classification and normalization rules

- Status: Accepted
- Date: 2026-11-14
- Related requirements: BR-03, BR-04, BR-13, BR-14, RULE-03, RULE-04, RULE-07, DATA-03, DATA-05, UX-08
- Resolves: OD-05, OD-06, OD-07, OD-09, OD-10, OD-12, OD-14, OD-17, OD-19, OD-21

## Decision

**Classification (BR-03, BR-04, RULE-03).**

- Use the `Activity Type` column of `activities.csv` inside the ZIP. This is the export's
  activity classification metadata.
- Include **only `Activity Type` = `Ride`**, as the BRD states. Everything else is excluded,
  including Virtual Ride, E-Bike Ride, Gravel Ride and Mountain Bike Ride. (Virtual rides would
  also plot fictional coordinates.)
- The allow-list is a single constant (`RIDE_ACTIVITY_TYPES = ['Ride']`), so adding more types
  later is a one-line, tested change.

**Identity:** `activityId` = the `Activity ID` column (Strava's own ID). It is unique and stable
across re-exports.

**Date and time zone:**

- `activityDate` is stored as UTC ISO 8601.
- The start time is taken from the CSV `Activity Date`, falling back to the first track timestamp.
- `year` and `month` are derived in the **browser's local time zone**. This is a personal app, so
  the browser zone is normally the rider's home zone.

**Metrics:**

- `distanceKm` and `elevationGainM` come from Strava's values in `activities.csv`, so they match
  what the user sees on Strava.
- If a value is missing or non-numeric, fall back to computing it from the track: distance with a
  haversine sum, elevation with gain from smoothed elevation. If that isn't possible either, the
  field is `null`, and the UI shows "—" (BR-13 "when available").

**Units:** metric (km, m).

**Incomplete activities (RULE-07, DATA-05):**

| Condition                            | Result                                                              |
| ------------------------------------ | ------------------------------------------------------------------- |
| No GPS file, unreadable or malformed | Skipped, `ImportIssue` reported                                     |
| Fewer than 2 valid track points      | Skipped (`no-usable-gps`), reported                                 |
| No determinable date                 | Skipped (`missing-date`): it cannot take part in year/month filters |
| Missing name                         | Kept; display name "Untitled ride"                                  |

**Summary statistics (UX-08):** computed for the filtered Ride set only (RULE-04):

- activity count (BR-14)
- total distance
- total elevation gain

**Platform:**

- Desktop browsers, latest Chrome, Edge and Firefox. Playwright runs Chromium.
- "Mobile application support" (out of scope) means no native app. The responsive web layout stays.
- **Visualization modes** (BRD §9) are deferred. They are not part of the initial release (OD-18).
- **App name:** the header stays "Strava Cycling Heat Map", as the project brief specified.
