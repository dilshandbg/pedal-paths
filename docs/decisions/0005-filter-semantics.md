# 0005. Filter semantics

- Status: Accepted
- Date: 2026-11-14
- Related requirements: BR-07–BR-11, BR-14, BR-15, AC-06–AC-10, AC-13, AC-14, RULE-08, RULE-09, UX-05–UX-07
- Resolves: OD-02, OD-15, OD-20

## Decision

**Year and month: opt-in, where empty means unrestricted (RULE-09).**

- Initially no year or month is selected, so every Ride is included (AC-06).
- Selecting values narrows that dimension to them. Deselecting a value removes its rides (AC-07,
  AC-08). Deselecting the last value returns the dimension to unrestricted.
- Years and months combine as a **Cartesian AND**. `{2022, 2023} × {Nov}` matches November 2022
  and November 2023 (AC-10).
- The year options are the years present in the loaded data.

**Individual rides: opt-out (exclusion list).**

- All rides start included. Deselecting a ride adds it to `excludedActivityIds`, which removes its
  contribution (AC-09). Reselecting it restores the contribution.
- The ride list shows only the rides that match the current year/month filters.
- Ride exclusion **only narrows**. A ride outside the selected year/month never appears.

**Matching:**

```text
matches(a) = (years  = ∅ or a.year  ∈ years)
         and (months = ∅ or a.month ∈ months)
         and a.activityId ∉ excludedActivityIds
```

This is a pure function in `features/filters/utils`. The filtered set, the heat map data, the
activity count (BR-14, AC-13) and the statistics are all derived from it and never stored.

**Reset (BR-15, AC-14)** clears years, months and exclusions, so all eligible Rides are shown.

**Persistence:** filters live in memory for the session. Loading a new ZIP resets them (BR-16).
Exclusions refer to activity IDs from the previous dataset, so keeping them would be meaningless.

## Consequences

- There's no separate "select all" and "clear" for years and months. "All" is the unrestricted
  state, shown in the UI as "All years" / "All months".
- The active-filters display (UX-06) lists the selected years, the selected months, and the number
  of excluded rides.
