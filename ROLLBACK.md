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

C31 activity freshness follow-up, 10/01/2026: previous deployed version `62528e77-8d80-4600-b07f-82cb17a4e1a`. Roll back this follow-up with `npx wrangler rollback 62528e77-8d80-4600-b07f-82cb17a4e1a`. No schema change.

## C33, 10/01/2026

Previous live Worker version: `8fd6600b-427e-4967-8218-fa766889ca00`.

Worker rollback: `npx wrangler rollback 8fd6600b-427e-4967-8218-fa766889ca00` from `/Users/ghost/Projects/aries-cloud-dashboard`.

Schema undo, after Worker rollback: `DROP TABLE IF EXISTS mission_answers;`
Apply only to the new table. Existing Mission records remain untouched.

## C34, 10/01/2026

Previous live Worker version: `ccbc5a43-7b77-4672-9c49-d4e2fbd8679d`.

Worker rollback: `npx wrangler rollback ccbc5a43-7b77-4672-9c49-d4e2fbd8679d` from `/Users/ghost/Projects/aries-cloud-dashboard`.

Schema undo, only after Worker rollback: `ALTER TABLE mission_answers DROP COLUMN received_by;`
The additive column may safely remain after rollback. Answer rows and receipt times remain untouched.
Hook undo: restore the settings backup named in the C34 handoff.

## C42, 10/01/2026

Previous live Worker version: `2aca3eba-74c1-4721-8771-180af8dce379`.
Rollback: `npx wrangler rollback 2aca3eba-74c1-4721-8771-180af8dce379`.
No schema, route, Access, cron or secret changes.
