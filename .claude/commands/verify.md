---
description: Run typecheck, lint, unit tests and build, then report results
---

Run these in order and stop at the first failure:

1. `npm run typecheck`
2. `npm run lint`
3. `npm run test`
4. `npm run build`

If `$ARGUMENTS` contains `e2e`, also run `npm run test:e2e`.

Report each step as pass or fail. For a failure, give the relevant error output and the likely
cause. Do not fix anything unless asked.
