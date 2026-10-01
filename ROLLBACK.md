# C13 rollback
Previous Worker version: `c31ed86d-b9fe-4573-819f-90c46de4bc8f`.
Run from `/Users/ghost/Projects/aries-cloud-dashboard`:

```sh
npx wrangler rollback c31ed86d-b9fe-4573-819f-90c46de4bc8f --message 'C13 rollback'
```
The additive `mission_records` table can remain. Existing tables are untouched.

## C31, 10/01/2026

Previous live Worker version: `71b15d55-3e8c-4903-a492-83d6b805b033`.

Worker rollback: `npx wrangler rollback 71b15d55-3e8c-4903-a492-83d6b805b033` from `/Users/ghost/Projects/aries-cloud-dashboard`.

No schema change. Existing JSON data and UI remain compatible.
