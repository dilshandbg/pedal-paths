# test-data

Put **your own** Strava export ZIP here for local manual testing. This is the file you get from
Strava → Settings → My Account → "Download or delete your account" → "Request your archive".
In the app you select the ZIP with the upload control. There's no need to extract it.

> **Privacy:** GPS tracks show where you live, work and train. `.gitignore` excludes
> `*.zip`, `*.gpx`, `*.fit`, `*.tcx`, `*.gz` and `*.csv` under this folder, so real data is never
> committed. Don't weaken those rules.

## Where test data goes

| Location         | Contents                                        | Committed |
| ---------------- | ----------------------------------------------- | --------- |
| `test-data/`     | Your real Strava export ZIP, for manual testing | No        |
| `tests/fixtures` | Small hand-written synthetic GPX/FIT/CSV files  | Yes       |

Automated tests must only use `tests/fixtures/`, never files from this folder. Test ZIP archives
are built in memory from the fixtures, so tests stay reproducible on any machine.
