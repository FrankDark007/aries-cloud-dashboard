# One deploy source

The aries.flood.doctor Worker is deployed only from this repo (FrankDark007/aries-cloud-dashboard, main).
The copy under FrankDark007/aries `cloud-dashboard/` on Aries is a mirror of it, not a source. On 10/01 a
deploy from this repo replaced the 09/30 board that had been built only in that copy; they were merged
(850ef2a) and this guard added so they cannot diverge again.

- `deploy-guard.sh` clones origin/main and refuses unless src, migrations, schema.sql, package.json and
  tsconfig.json are identical to the checkout it sits in.
- Aries: the private `wrangler.jsonc` there carries `build.command = ./deploy-guard.sh`, so even a raw
  `npx wrangler deploy` runs it first.
- `npm run deploy` runs the guard, then `wrangler deploy --config wrangler.jsonc`.

Undo on Aries: delete the `"build"` block from `/Users/ghost2/Projects/aries/cloud-dashboard/wrangler.jsonc`
(or run with `ARIES_DASHBOARD_GUARD_OFF=1`), restore the mirror with
`git -C /Users/ghost2/Projects/aries checkout 18f6ba4 -- cloud-dashboard` (the 09/30 copy, saved too at
`/Users/ghost2/Projects/aries/cloud-dashboard.pre-sync-2026-10-01.tgz`).
