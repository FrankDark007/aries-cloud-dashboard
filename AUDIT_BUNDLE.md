# AUDIT_BUNDLE: aries-cloud-dashboard

Single-file dump of `FrankDark007/aries-cloud-dashboard` for an outside auditor. Live URL: `https://aries.flood.doctor/` (behind Cloudflare Access, so not browsable without a login).

Commit audited: `caef84d` on `main`. Tracked files: 61.

## Contents

1. Directory tree
2. Architecture and data flow
3. Live D1 schema
4. Live D1 diagnostics (aggregate, redacted)
5. Source code (full, unedited)

## 1. Directory tree

```text
aries-cloud-dashboard/
├── migrations/
│   ├── 0001-parity.sql
│   ├── 0002-reopen.sql
│   ├── 0003-threads.sql
│   ├── 0004-feedback.sql
│   ├── 0005-activity.sql
│   ├── 0006-nudge.sql
│   ├── 0007-team.sql
│   ├── 0008-prep-urgent.sql
│   ├── 0010_mission.sql
│   ├── 0011_mission_answers.sql
│   ├── 0012_mission_answers_by.sql
│   └── 0013_command_delivery.sql
├── src/
│   ├── board-ui-state.js
│   ├── board-ui-upgrades.js
│   ├── card-data.js
│   ├── card-ui.js
│   ├── claim-groups.js
│   ├── command-queue.js
│   ├── env.d.ts
│   ├── index.js
│   ├── mission-state.js
│   ├── mission-ui.js
│   ├── mission.js
│   └── ui.js
├── test/
│   ├── activity.test.js
│   ├── audit.test.js
│   ├── auth.test.js
│   ├── board-ui-state.test.js
│   ├── c34-live-harness.mjs
│   ├── card-completion.test.js
│   ├── card-data.test.js
│   ├── cards.test.js
│   ├── claim-groups.test.js
│   ├── command-delivery.test.js
│   ├── commands.test.js
│   ├── domains.test.js
│   ├── fake-d1.js
│   ├── feedback.test.js
│   ├── mission-answers.test.js
│   ├── mission-freshness.test.js
│   ├── mission-order.test.js
│   ├── mission-upgrades.test.js
│   ├── mission.test.js
│   ├── parity.test.js
│   ├── snapshot.test.js
│   ├── sqlite-d1.js
│   ├── team.test.js
│   ├── todos.test.js
│   ├── ui.test.js
│   └── upgrades-api.test.js
├── .gitignore
├── DEPLOY-SOURCE.md
├── README.md
├── ROLLBACK.md
├── deploy-guard.sh
├── package-lock.json
├── package.json
├── schema.sql
├── tsconfig.json
├── worker-configuration.d.ts
└── wrangler.template.jsonc
```


## 2. Architecture and data flow

**Labels:** [verified] = read in this repo or observed live. [inferred] = from file headers or docstrings in other repos, not read in full.

### 2.0 Live deployment vs the code in this bundle (read first)

- [verified] The source below is `main` at the commit named at the top. It is **ahead of what runs live**.
- [verified] The last Worker deployment (`wrangler deployments list`) was 10/04/2026 22:06 ET. Four commits landed on `main` on 10/11/2026 after it: evidence-aware card metadata and claim grouping, Mission counts and freshness, command-delivery tracking with concurrency guards, and board triage with bulk workflows.
- [verified] The live D1 database lacks migration `0013_command_delivery.sql` (the live `command_queue` has no `received_at`, `lease_token`, `lease_expires_at`, `attempts`, `next_attempt_at`, or `error_code` columns). Section 3 shows the live schema as it is today. The repo `schema.sql` and migration 0013 show the next one.
- [inferred] So the running site matches `main` before those four commits. Treat `src/command-queue.js`, `src/claim-groups.js`, `src/card-data.js`, `src/board-ui-state.js`, `src/board-ui-upgrades.js`, and the `POST /api/commands/:id/retry` route as not yet live.

### 2.1 What this repository is, and is not

- [verified] This repo is one Cloudflare Worker (`src/index.js`, vanilla JS, no React, no build step) plus a D1 database. It serves two hosts: `aries.flood.doctor` (human UI) and `aries-publish.flood.doctor` (machine sync).
- [verified] **This repo contains no mailbox, Gmail, Email Worker, or n8n code.** It never reads a mailbox. It stores and serves what a separate publisher pushes to it.
- [verified] The only scheduled code in the Worker is a cron every 5 minutes (`*/5 * * * *`) that runs `checkServices(env,'cron')`, a service health check. It creates no tasks.
- [verified] Cloudflare Access protects `aries.flood.doctor`. The Worker also requires an exact `Cf-Access-Authenticated-User-Email` match against `ALLOWED_EMAILS`.
- [verified] The machine host accepts `Authorization: Bearer $PUBLISHER_TOKEN` (a Wrangler secret). `GET /healthz` is the only public route.
- [verified] The live D1 database is named `aries-ops-dashboard`. The committed `wrangler.template.jsonc` uses the placeholder name `aries-cloud-dashboard` and a zero UUID. The real values live in an untracked `wrangler.jsonc`.

### 2.2 Where mailbox ingestion and task creation actually live

Both live outside this repo, on the Mac mini "mini2" (host name for the machine that runs Aries). [inferred from file headers]

| Stage | Code | Repo |
|---|---|---|
| Read Gmail with a service account (SA) using domain-wide delegation (DWD, the Google setting that lets one service account read staff mailboxes) | `bin/triage_gmail.py`, `bin/sa_gmail.py`, `bin/sa_mailbox.py` | `FrankDark007/aries` |
| Poll and classify inboxes, commit a classification record per run | `bin/inbox-watch.sh`, `bin/inbox-classify.py`, `bin/inbox_commit.py` | `FrankDark007/aries` |
| Build triage cards and board rows | `bin/triage_cards.py`, `bin/board.py`, `bin/board_team.py`, `bin/card-brief.py` | `FrankDark007/aries` |
| Publish board, threads, worklist to this Worker and pull queued teammate commands | `bin/cloud_dashboard_sync.py` (848 lines) | `FrankDark007/aries` |
| Publish the To-Do catalogue, append operations, pull D1 state | `scripts/fd-todos-d1.py` (640 lines), `scripts/fd-team-todo-sync.sh` | `FrankDark007/fd-internal-apps` |

Mailboxes seen in live data: the To-Do catalogue tags each item with `sourceAccount` of `business` (58 items) or `aries` (25 items). No other ingestion path (Email Workers, n8n, Gmail push) appears in this repo.

### 2.3 Data flow

```text
Gmail mailboxes --(service account + DWD)--> Aries on mini2 (classify, build cards)
     |                                              |
     |                                  cloud_dashboard_sync.py / fd-todos-d1.py
     |                                              | HTTPS + Bearer PUBLISHER_TOKEN
     v                                              v
                          aries-publish.flood.doctor  (Worker, sync routes)
                                              |
                                          D1: aries-ops-dashboard
                                              ^
                          aries.flood.doctor (Worker, UI + /api/*)  <-- Cloudflare Access --  staff browsers
```

Sync routes on the machine host [verified in `src/index.js`]:

| Route | Effect |
|---|---|
| `POST /api/sync/snapshot` | Replace the single board snapshot row (max 1,000 items, 1.8 MB, no duplicate ids, no `kind: personal`). |
| `POST /api/sync/worklist` | Replace the single worklist snapshot row. |
| `POST /api/sync/threads` | Delete and re-insert all `board_threads` rows. |
| `POST /api/sync/team` | Update `team_users` and log to `team_changes`. |
| `POST /api/sync/todos/catalogue` | Replace the single To-Do catalogue row. Rejects an empty replacement and duplicate ids. |
| `POST /api/sync/todos/operations` | Append To-Do operations. `INSERT OR IGNORE` on unique `event_id`. |
| `GET /api/sync/todos/state?after=N` | Return the catalogue plus operations with `sequence > N`. |
| `GET /api/sync/commands` | Return queued board commands (at-least-once until acknowledged). |
| `POST /api/sync/commands/:id/ack` | Mark a command `applied` or `failed`. One time only. |

Browser routes on the UI host: `POST /api/commands/:id/retry` (main only), `/`, `/card?id=`, `/api/card`, `/api/card/done`, `/api/board`, `/api/action`, `/api/todos`, `/api/todo/action`, `/api/worklist`, `/api/thread`, `/activity`, `/api/activity`, `/api/team`, `/mission` and `/api/mission*`.

### 2.4 How tasks are created, updated, deduplicated, and closed

There are two task systems. Both treat the mini2 publisher as the author of rows.

**Board (email-derived cards)**
- [verified] Created: only by a snapshot publish. The Worker holds one JSON blob. It cannot create a card by itself.
- [verified] Deduplicated: a publish with a duplicate `id` is rejected whole. There is no title or content dedupe in the Worker. Dedupe is the publisher's job.
- [verified] Updated: by the next snapshot (the whole blob is replaced), or by a command a teammate queues (`done, reopen, note, assign, snooze, reorder, delete, useful, not_useful, nudge, prep, urgent`).
- [verified] Closed: a teammate presses Done. The Worker inserts a `command_queue` row in state `queued`. Aries pulls it, applies it to its local board, and acknowledges it (`applied` or `failed`). The UI folds queued and recently acknowledged commands over the snapshot so the card looks closed at once.
- [verified] `/card?id=N` shows a confirm page. Only a same-origin POST with `{id, revision}` closes the card. A changed revision forces a new review. Repeat POSTs are idempotent.

**To-Do v2**
- [verified] Created: a catalogue publish from Aries (ids match `task-[0-9a-f]{14}`), or an `add` operation from a browser.
- [verified] Deduplicated: duplicate ids in one catalogue are rejected. Operations dedupe on unique `event_id` (`INSERT OR IGNORE`). The `todo_operations` log is append-only.
- [verified] Updated and closed: operations (`toggle, assign, add, edit, attach, detach, snooze, archive, delete`) are replayed over the current catalogue in `sequence` order. A task is "closed" when replay leaves it toggled done. A catalogue refresh can drop the item entirely.
- [verified] The Worker never deletes operation rows. Closed items leave the catalogue when the publisher stops emitting them.

## 3. Live D1 schema (from the live database, `sqlite_master`)

```sql
CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('board', 'todo')),
  operation TEXT NOT NULL,
  item_id TEXT NOT NULL,
  value TEXT,
  title TEXT,
  ip TEXT,
  country TEXT,
  user_agent TEXT
);

CREATE TABLE board_snapshot (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  snapshot_json TEXT NOT NULL,
  published_at TEXT NOT NULL
);

CREATE TABLE board_threads (
  item_id INTEGER PRIMARY KEY CHECK (item_id > 0),
  thread_json TEXT NOT NULL,
  published_at TEXT NOT NULL
);

CREATE TABLE "command_queue" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation TEXT NOT NULL CHECK (
    operation IN ('done', 'reopen', 'note', 'assign', 'snooze', 'reorder', 'delete',
                  'useful', 'not_useful', 'nudge', 'prep', 'urgent')
  ),
  item_id INTEGER NOT NULL CHECK (item_id > 0),
  note TEXT,
  value TEXT,
  actor_email TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'applied', 'failed')),
  created_at TEXT NOT NULL,
  acked_at TEXT,
  ack_detail TEXT,
  CHECK (
    (operation = 'note' AND length(trim(note)) BETWEEN 1 AND 2000)
    OR
    (operation <> 'note' AND note IS NULL)
  ),
  CHECK (
    (operation IN ('assign', 'snooze', 'reorder', 'nudge', 'prep', 'urgent') AND value IS NOT NULL AND length(value) <= 240)
    OR
    (operation IN ('done', 'reopen', 'note', 'delete', 'useful', 'not_useful') AND value IS NULL)
  )
);

CREATE TABLE mission_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('choice','text')),
  choice TEXT,
  text TEXT,
  created TEXT NOT NULL,
  author TEXT NOT NULL,
  received TEXT,
  request_id TEXT, received_by TEXT,
  UNIQUE(author,request_id)
);

CREATE TABLE mission_records (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated TEXT NOT NULL, PRIMARY KEY(kind,id));

CREATE TABLE team_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  user_key TEXT NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT
);

CREATE TABLE team_users (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  past_emails TEXT NOT NULL DEFAULT '[]',
  position INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE todo_catalogue (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  catalogue_json TEXT NOT NULL,
  published_at TEXT NOT NULL
);

CREATE TABLE todo_operations (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  item_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (
    operation IN ('toggle', 'assign', 'add', 'edit', 'attach', 'detach', 'snooze', 'archive', 'delete')
  ),
  payload_json TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  client_ts TEXT NOT NULL,
  server_ts TEXT NOT NULL
);

CREATE TABLE worklist_snapshot (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  worklist_json TEXT NOT NULL,
  published_at TEXT NOT NULL
);

CREATE INDEX activity_log_actor_idx ON activity_log (actor_email, at);
CREATE INDEX activity_log_at_idx ON activity_log (at);
CREATE INDEX command_queue_pending_idx ON command_queue (state, id);
CREATE UNIQUE INDEX mission_answer_choice ON mission_answers(card_id,author) WHERE kind='choice';
CREATE INDEX mission_answer_unseen ON mission_answers(received,id);
CREATE INDEX todo_operations_item_idx
  ON todo_operations (item_id, sequence);
```

Migrations in `migrations/` and the baseline `schema.sql` are included in section 5.

## 4. Live D1 diagnostics (aggregate only, collected 10/15/2026 22:31 ET)

All numbers come from read-only queries against the live database. Client names, email text, addresses, phone numbers, and claim numbers are removed.

### 4.1 Row counts

| Table | Rows |
|---|---|
| activity_log | 1,015 |
| command_queue | 876 |
| mission_records | 279 |
| todo_operations | 237 |
| board_threads | 46 |
| mission_answers | 6 |
| team_users | 6 |
| team_changes | 3 |
| board_snapshot, todo_catalogue, worklist_snapshot | 1 each (single-row blobs) |

### 4.2 Board snapshot (191 items, JSON blob in `board_snapshot.snapshot_json`)

| Cut | Result |
|---|---|
| status | open 187, snoozed 4, done 0 |
| kind | other 101, handoff 51, fyi 21, billing 7, claim 4, adjuster 3, lead 2, followup 2 |
| assignee | none 106, office 28, steve 18, katherine 17, mark 14, frank 6, shayan 1, aries 1 |
| open items by last update | 2 to 7 days: 103. 8 to 30 days: 84. Over 30 days: 0 |
| open and past due date | 3 |
| duplicate titles | 0 groups |
| priority | 191 distinct-ish integers, 90 to 658 (a rank, not a bucket) |

### 4.3 To-Do catalogue (83 items in `todo_catalogue.catalogue_json`)

| Cut | Result |
|---|---|
| sourceAccount | business 58, aries 25 |
| actionType | needs_reply 32, payment_followup 17, team_action 14, needs_review 13, needs_correction 6, needs_invoice 1 |
| assignee | none 29, steve 17, katherine 16, mark 14, frank 5, shayan 1, aries 1 |
| section (client names removed) | 63 distinct sections. "Unidentified matter" 15 items. 62 named-client sections hold 68 items. 6 sections hold 2 items |
| items with a due date | 3 (1 overdue) |
| `date` age | within 1 day: 5. 2 to 7 days: 33. 8 to 30 days: 43. Over 30 days: 2 |
| items with `sourceMessageId` | 83 of 83 |
| items with more than one upstream id | 2 |
| exact duplicates (same `sourceMessageId`, or same normalized text plus client) | 0 groups |
| near duplicates | Present. The same person appears under more than one section spelling (surname only, first and last name, "A and B Surname"). The Worker cannot catch these because it never inspects text. |

### 4.4 To-Do operations log (237 rows, first 2026-08-24, last 2026-10-15)

| Cut | Result |
|---|---|
| operation | toggle 147, assign 71, add 15, delete 4 |
| actor | Frank 125, Mark 85, Steve 21, Dom 6 |
| distinct items touched | 110 |
| items toggled 2 or more times | 45 (worst case 8 toggles) |
| operations whose item is absent from the current catalogue | 225 of 237 rows, across 105 items |

The last row is the main stale-state pattern: the catalogue is replaced on each publish, so finished items disappear while their operations stay in the log forever.

### 4.5 Board command queue (876 rows)

| Cut | Result |
|---|---|
| state | applied 870, failed 6, queued 0 |
| applied by operation | done 565, assign 144, note 104, nudge 21, snooze 11, urgent 7, prep 7, delete 6, useful 3, reopen 2 |
| failed | not_useful 4, useful 1, note 1. All six carry the ack detail "local teammate command failed" |
| queued longer than 1 day | 0 |
| same item and operation queued more than once | 132 groups (worst case 5 repeats) |

### 4.6 Other tables

- `activity_log` by source and operation: board/done 556, board/assign 142, board/note 104, todo/toggle 100, todo/assign 41, board/nudge 21, board/snooze 11, board/prep 7, board/urgent 7, board/delete 6, todo/add 6, todo/delete 4, board/not_useful 4, board/useful 4, board/reopen 2.
- `mission_records` by kind: task 224, decision 39, machine 6, project 5, service 4, spend 1.
- `mission_answers`: choice 2, text 4. All received.
- `board_threads`: 46 rows. `worklist_snapshot`: one object with key `items`.

### 4.7 Sample row structures (values redacted, lengths kept)

To-Do catalogue item:

```json
{
  "id": "task-<redacted>",
  "text": "<redacted string, 35 chars>",
  "seedDone": false,
  "details": "<redacted string, 174 chars>",
  "client": "<redacted string, 16 chars>",
  "actionType": "needs_reply",
  "notificationDate": "2026-10-04",
  "date": "2026-10-04",
  "sourceUrl": "<redacted string, 78 chars>",
  "sourceMessageId": "<redacted string, 16 chars>",
  "sourceAccount": "aries",
  "assignee": "frank",
  "section": "<redacted string, 16 chars>",
  "sourceRevision": 4185,
  "upstreamIds": [
    "<redacted string, 4 chars>"
  ],
  "urgent": true,
  "sourceUpdatedAt": "2026-10-08T08:49:08+00:00"
}
```

Board snapshot item (note lists truncated to 2 entries):

```json
{
  "id": 3968,
  "title": "<redacted string, 52 chars>",
  "summary": "<redacted string, 157 chars>",
  "assignee": "mark",
  "status": "open",
  "kind": "handoff",
  "note": "<redacted string, 270 chars>",
  "updated": "2026-10-15",
  "source_url": "<redacted string, 84 chars>",
  "created": "<redacted string, 10 chars>",
  "priority": 230,
  "notes": [
    {
      "at": "<redacted string, 25 chars>",
      "by": "<redacted string, 24 chars>",
      "text": "<redacted string, 33 chars>"
    },
    {
      "at": "<redacted string, 25 chars>",
      "by": "<redacted string, 18 chars>",
      "text": "<redacted string, 79 chars>"
    },
    "...(9 items)"
  ],
  "brief": {
    "title": "<redacted string, 50 chars>",
    "needs": "<redacted string, 177 chars>",
    "next_step": "<redacted string, 117 chars>",
    "waiting_on": "<redacted string, 28 chars>",
    "client": "<redacted string, 31 chars>",
    "claim": "<redacted string, 11 chars>",
    "amount": "<redacted string, 10 chars>",
    "deadline_note": "<redacted string, 0 chars>",
    "phone": "<redacted string, 25 chars>",
    "action": "<redacted string, 5 chars>",
    "owner_hint": "<redacted string, 4 chars>",
    "waiting_since": "<redacted string, 10 chars>",
    "deadline": "<redacted string, 0 chars>",
    "counsel_only": false,
    "last_ours": {
      "by": "<redacted string, 6 chars>",
      "at": "<redacted string, 20 chars>",
      "what": "<redacted string, 82 chars>"
    },
    "last_theirs": {
      "by": "<redacted string, 42 chars>",
      "at": "<redacted string, 20 chars>",
      "what": "<redacted string, 77 chars>"
    },
    "messages": 2,
    "generated_at": "<redacted string, 20 chars>"
  },
  "prep": {
    "status": "ready",
    "at": "<redacted string, 25 chars>",
    "finished_at": "<redacted string, 25 chars>",
    "for": "<redacted string, 4 chars>"
  },
  "aries_task": {
    "status": "failed",
    "at": "<redacted string, 25 chars>",
    "finished_at": "<redacted string, 24 chars>"
  }
}
```

Newest `toggle` operation payload:

```json
{
  "done": true,
  "sourceRevision": 4124,
  "item": {
    "id": "task-<redacted>",
    "text": "<redacted string, 47 chars>",
    "details": "<redacted string, 138 chars>",
    "client": "<redacted string, 19 chars>",
    "actionType": "needs_review",
    "notificationDate": "2026-10-01",
    "sourceUrl": "<redacted string, 78 chars>",
    "due": null,
    "assignee": "mark",
    "attachments": [],
    "sourceRevision": 4124,
    "historyVisible": true
  }
}
```

## 5. Source code

Included below, unedited: every file from `git ls-files` except two. Excluded: `package-lock.json` (dependency lock) and `worker-configuration.d.ts` (types generated by `wrangler types`). Run `npm install` and `npx wrangler types --config=wrangler.template.jsonc` to rebuild them.


### `package.json`

```json
{
  "name": "aries-cloud-dashboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "test": "node --test test/*.test.js",
    "types": "wrangler types --config wrangler.template.jsonc",
    "typecheck": "tsc --noEmit",
    "check": "npm test && npm run typecheck",
    "deploy": "./deploy-guard.sh && wrangler deploy --config wrangler.jsonc"
  },
  "devDependencies": {
    "typescript": "^5.9.2",
    "wrangler": "^4.33.0"
  }
}
```


### `wrangler.template.jsonc`

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "aries-cloud-dashboard",
  "main": "src/index.js",
  "compatibility_date": "2026-08-24",
  "compatibility_flags": ["nodejs_compat"],
  "workers_dev": false,
  "preview_urls": false,
  "routes": [
    {
      "pattern": "aries.flood.doctor",
      "custom_domain": true
    },
    {
      "pattern": "aries-publish.flood.doctor",
      "custom_domain": true
    }
  ],
  "vars": {
    "ALLOWED_EMAILS": "REPLACE_WITH_EXACT_COMMA_SEPARATED_EMAILS",
    "STALE_AFTER_SECONDS": "300"
  },
  "secrets": {
    "required": ["PUBLISHER_TOKEN"]
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "aries-cloud-dashboard",
      "database_id": "00000000-0000-0000-0000-000000000000"
    }
  ],
  "services": [{"binding":"SELF","service":"aries-cloud-dashboard"},{"binding":"ENGINE","service":"flooddoctor-engine-cloud"}],
  "triggers": { "crons": ["*/5 * * * *"] },
  "observability": {
    "enabled": true,
    "logs": {
      "enabled": true,
      "head_sampling_rate": 1
    },
    "traces": {
      "enabled": true,
      "head_sampling_rate": 0.05
    }
  }
}
```


### `tsconfig.json`

```json
{
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "lib": ["ES2023", "WebWorker"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "skipLibCheck": true,
    "strict": true,
    "target": "ES2023"
  },
  "include": ["worker-configuration.d.ts", "src/**/*.js", "src/env.d.ts"]
}
```


### `schema.sql`

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS board_snapshot (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  snapshot_json TEXT NOT NULL,
  published_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS command_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation TEXT NOT NULL CHECK (
    operation IN ('done', 'reopen', 'note', 'assign', 'snooze', 'reorder', 'delete',
                  'useful', 'not_useful', 'nudge', 'prep', 'urgent')
  ),
  item_id INTEGER NOT NULL CHECK (item_id > 0),
  note TEXT,
  -- The single argument of a parameterised operation: who to assign to, the date to
  -- snooze until, the new position. Kept separate from note so the note length rule
  -- below stays exactly what it was.
  value TEXT,
  actor_email TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'applied', 'failed')),
  created_at TEXT NOT NULL,
  acked_at TEXT,
  ack_detail TEXT,
  received_at TEXT,
  lease_token TEXT,
  lease_expires_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TEXT,
  error_code TEXT,
  CHECK (
    (operation = 'note' AND length(trim(note)) BETWEEN 1 AND 2000)
    OR
    (operation <> 'note' AND note IS NULL)
  ),
  CHECK (
    (operation IN ('assign', 'snooze', 'reorder', 'nudge', 'prep', 'urgent') AND value IS NOT NULL AND length(value) <= 240)
    OR
    (operation IN ('done', 'reopen', 'note', 'delete', 'useful', 'not_useful') AND value IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS command_queue_pending_idx
  ON command_queue (state, id);

CREATE INDEX IF NOT EXISTS command_queue_lease_idx
  ON command_queue (state, lease_expires_at);

CREATE TABLE IF NOT EXISTS todo_catalogue (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  catalogue_json TEXT NOT NULL,
  published_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS todo_operations (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  item_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (
    operation IN ('toggle', 'assign', 'add', 'edit', 'attach', 'detach', 'snooze', 'archive', 'delete')
  ),
  payload_json TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  client_ts TEXT NOT NULL,
  server_ts TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS todo_operations_item_idx
  ON todo_operations (item_id, sequence);

-- Aries' own working list (todos.md), published read-only so staff can see the whole
-- backlog rather than only the curated attention queue. Personal rows are filtered on
-- Aries before publishing and refused again here.
CREATE TABLE IF NOT EXISTS worklist_snapshot (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  worklist_json TEXT NOT NULL,
  published_at TEXT NOT NULL
);

-- The source email conversation behind a board row. Published by Aries with the domain
-- service account so any authenticated teammate can read the chain, not just whoever owns
-- the mailbox it lives in. Read-only; replaced wholesale on each publish.
CREATE TABLE IF NOT EXISTS board_threads (
  item_id INTEGER PRIMARY KEY CHECK (item_id > 0),
  thread_json TEXT NOT NULL,
  published_at TEXT NOT NULL
);

-- Owner-only audit trail (migration 0005): who changed what, from which address.
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('board', 'todo')),
  operation TEXT NOT NULL,
  item_id TEXT NOT NULL,
  value TEXT,
  title TEXT,
  ip TEXT,
  country TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS activity_log_at_idx ON activity_log (at);
CREATE INDEX IF NOT EXISTS activity_log_actor_idx ON activity_log (actor_email, at);

-- The people on the board (migration 0007), edited from the owner-only User settings tab. Frank, 09/29/2026:
-- "if i want to change mark's name to Mike, I dont have a way to do that right now. If mark
-- changes his email address, I want to be able to update it."
-- `key` is what cards are assigned to and never changes, so a rename keeps every card a person
-- owns. past_emails keeps each address a person used before, newest first, so what they did
-- under an old address still shows their name.
CREATE TABLE IF NOT EXISTS team_users (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  past_emails TEXT NOT NULL DEFAULT '[]',
  position INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

-- Every add and every edit: who changed which person, which field, from what, to what.
CREATE TABLE IF NOT EXISTS team_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  user_key TEXT NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT
);
```


### `migrations/0001-parity.sql`

```sql
-- Widen the teammate command queue from (done, note) to the full set the local board has,
-- and add the read-only full working list. SQLite cannot widen a CHECK in place, so the
-- queue is rebuilt; existing rows are carried across so applied history is not lost.
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS command_queue_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation TEXT NOT NULL CHECK (
    operation IN ('done', 'note', 'assign', 'snooze', 'reorder', 'delete')
  ),
  item_id INTEGER NOT NULL CHECK (item_id > 0),
  note TEXT,
  value TEXT,
  actor_email TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'applied', 'failed')),
  created_at TEXT NOT NULL,
  acked_at TEXT,
  ack_detail TEXT,
  CHECK (
    (operation = 'note' AND length(trim(note)) BETWEEN 1 AND 2000)
    OR
    (operation <> 'note' AND note IS NULL)
  ),
  CHECK (
    (operation IN ('assign', 'snooze', 'reorder') AND value IS NOT NULL AND length(value) <= 240)
    OR
    (operation IN ('done', 'note', 'delete') AND value IS NULL)
  )
);

INSERT INTO command_queue_new (id, operation, item_id, note, value, actor_email, state, created_at, acked_at, ack_detail)
SELECT id, operation, item_id, note, NULL, actor_email, state, created_at, acked_at, ack_detail
FROM command_queue;

DROP TABLE command_queue;
ALTER TABLE command_queue_new RENAME TO command_queue;

CREATE INDEX IF NOT EXISTS command_queue_pending_idx ON command_queue (state, id);

CREATE TABLE IF NOT EXISTS worklist_snapshot (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  worklist_json TEXT NOT NULL,
  published_at TEXT NOT NULL
);

PRAGMA foreign_keys = ON;
```


### `migrations/0002-reopen.sql`

```sql
-- Bring back a card that was checked off by mistake. SQLite cannot widen a CHECK in place,
-- so the queue is rebuilt again; existing rows are carried across.
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS command_queue_v3 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation TEXT NOT NULL CHECK (
    operation IN ('done', 'reopen', 'note', 'assign', 'snooze', 'reorder', 'delete')
  ),
  item_id INTEGER NOT NULL CHECK (item_id > 0),
  note TEXT,
  value TEXT,
  actor_email TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'applied', 'failed')),
  created_at TEXT NOT NULL,
  acked_at TEXT,
  ack_detail TEXT,
  CHECK (
    (operation = 'note' AND length(trim(note)) BETWEEN 1 AND 2000)
    OR
    (operation <> 'note' AND note IS NULL)
  ),
  CHECK (
    (operation IN ('assign', 'snooze', 'reorder') AND value IS NOT NULL AND length(value) <= 240)
    OR
    (operation IN ('done', 'reopen', 'note', 'delete') AND value IS NULL)
  )
);

INSERT INTO command_queue_v3 (id, operation, item_id, note, value, actor_email, state, created_at, acked_at, ack_detail)
SELECT id, operation, item_id, note, value, actor_email, state, created_at, acked_at, ack_detail
FROM command_queue;

DROP TABLE command_queue;
ALTER TABLE command_queue_v3 RENAME TO command_queue;

CREATE INDEX IF NOT EXISTS command_queue_pending_idx ON command_queue (state, id);

PRAGMA foreign_keys = ON;
```


### `migrations/0003-threads.sql`

```sql
CREATE TABLE IF NOT EXISTS board_threads (
  item_id INTEGER PRIMARY KEY CHECK (item_id > 0),
  thread_json TEXT NOT NULL,
  published_at TEXT NOT NULL
);
```


### `migrations/0004-feedback.sql`

```sql
-- Thumbs up / thumbs down on a card, so the team can tell Aries which emails deserve to become
-- tasks and which ones should stop appearing. Neither carries an argument: the card identifies
-- the sender, and the sender is what actually gets learned.
-- SQLite cannot widen a CHECK in place, so the queue is rebuilt; existing rows carry across.
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS command_queue_v4 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation TEXT NOT NULL CHECK (
    operation IN ('done', 'reopen', 'note', 'assign', 'snooze', 'reorder', 'delete',
                  'useful', 'not_useful')
  ),
  item_id INTEGER NOT NULL CHECK (item_id > 0),
  note TEXT,
  value TEXT,
  actor_email TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'applied', 'failed')),
  created_at TEXT NOT NULL,
  acked_at TEXT,
  ack_detail TEXT,
  CHECK (
    (operation = 'note' AND length(trim(note)) BETWEEN 1 AND 2000)
    OR
    (operation <> 'note' AND note IS NULL)
  ),
  CHECK (
    (operation IN ('assign', 'snooze', 'reorder') AND value IS NOT NULL AND length(value) <= 240)
    OR
    (operation IN ('done', 'reopen', 'note', 'delete', 'useful', 'not_useful') AND value IS NULL)
  )
);

INSERT INTO command_queue_v4 (id, operation, item_id, note, value, actor_email, state, created_at, acked_at, ack_detail)
SELECT id, operation, item_id, note, value, actor_email, state, created_at, acked_at, ack_detail
FROM command_queue;

DROP TABLE command_queue;
ALTER TABLE command_queue_v4 RENAME TO command_queue;

CREATE INDEX IF NOT EXISTS command_queue_pending_idx ON command_queue (state, id);

PRAGMA foreign_keys = ON;
```


### `migrations/0005-activity.sql`

```sql
-- Owner-only audit trail: every change a person makes on the board or the To-Do list,
-- with where it came from. On 09/29/2026 483 cards were closed in eight minutes under one
-- login and nothing recorded the address, so there was no way to tell who was at the keys.
-- A separate table rather than new columns on command_queue: the queue is rebuilt whenever
-- its CHECK widens (0004), and an audit row must outlive that.
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('board', 'todo')),
  operation TEXT NOT NULL,
  item_id TEXT NOT NULL,
  value TEXT,
  title TEXT,
  ip TEXT,
  country TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS activity_log_at_idx ON activity_log (at);
CREATE INDEX IF NOT EXISTS activity_log_actor_idx ON activity_log (actor_email, at);

-- History that predates this table: who and what are known, the address never was.
INSERT INTO activity_log (at, actor_email, source, operation, item_id, value)
SELECT created_at, actor_email, 'board', operation, CAST(item_id AS TEXT), COALESCE(note, value)
FROM command_queue
WHERE NOT EXISTS (SELECT 1 FROM activity_log);

INSERT INTO activity_log (at, actor_email, source, operation, item_id, value)
SELECT server_ts, actor_email, 'todo', operation, item_id, substr(payload_json, 1, 300)
FROM todo_operations
WHERE NOT EXISTS (SELECT 1 FROM activity_log WHERE source = 'todo');
```


### `migrations/0006-nudge.sql`

```sql
-- The Nudge button: "someone is asking for an update" to a card's owner. It carries the owner's
-- name as its value (what the card history says), so it joins the value-bearing operations.
-- SQLite cannot widen a CHECK in place, so the queue is rebuilt as in 0004; every row carries
-- across with its id, so AUTOINCREMENT continues where it was.
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS command_queue_v6 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation TEXT NOT NULL CHECK (
    operation IN ('done', 'reopen', 'note', 'assign', 'snooze', 'reorder', 'delete',
                  'useful', 'not_useful', 'nudge')
  ),
  item_id INTEGER NOT NULL CHECK (item_id > 0),
  note TEXT,
  value TEXT,
  actor_email TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'applied', 'failed')),
  created_at TEXT NOT NULL,
  acked_at TEXT,
  ack_detail TEXT,
  CHECK (
    (operation = 'note' AND length(trim(note)) BETWEEN 1 AND 2000)
    OR
    (operation <> 'note' AND note IS NULL)
  ),
  CHECK (
    (operation IN ('assign', 'snooze', 'reorder', 'nudge') AND value IS NOT NULL AND length(value) <= 240)
    OR
    (operation IN ('done', 'reopen', 'note', 'delete', 'useful', 'not_useful') AND value IS NULL)
  )
);

INSERT INTO command_queue_v6 (id, operation, item_id, note, value, actor_email, state, created_at, acked_at, ack_detail)
SELECT id, operation, item_id, note, value, actor_email, state, created_at, acked_at, ack_detail
FROM command_queue;

DROP TABLE command_queue;
ALTER TABLE command_queue_v6 RENAME TO command_queue;

CREATE INDEX IF NOT EXISTS command_queue_pending_idx ON command_queue (state, id);

PRAGMA foreign_keys = ON;
```


### `migrations/0007-team.sql`

```sql
-- The people on the board, edited from the owner-only User settings tab. Frank, 09/29/2026:
-- "if i want to change mark's name to Mike, I dont have a way to do that right now. If mark
-- changes his email address, I want to be able to update it."
-- `key` is what cards are assigned to and never changes, so a rename keeps every card a person
-- owns. past_emails keeps each address a person used before, newest first, so what they did
-- under an old address still shows their name.
CREATE TABLE IF NOT EXISTS team_users (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  past_emails TEXT NOT NULL DEFAULT '[]',
  position INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

-- Every add and every edit: who changed which person, which field, from what, to what.
CREATE TABLE IF NOT EXISTS team_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  user_key TEXT NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT
);

-- Today's roster, exactly as the Worker, the UI and Aries hardcoded it before this table.
INSERT OR IGNORE INTO team_users (key, name, email, past_emails, position, updated_at, updated_by) VALUES
  ('frank', 'Frank', 'frankd@flooddoctorva.com', '[]', 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'seed'),
  ('mark', 'Mark', 'mark@flood.doctor', '[]', 2, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'seed'),
  ('dom', 'Dom', 'dom@flood.doctor', '[]', 3, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'seed'),
  ('steve', 'Steve', 'steve@restorationdoctors.com', '[]', 4, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'seed'),
  ('shayan', 'Shayan', 'shyon@restorationdoctors.com', '[]', 5, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'seed'),
  ('katherine', 'Katherine', 'katherine@restorationdoctors.com', '[]', 6, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'seed');
```


### `migrations/0008-prep-urgent.sql`

```sql
-- Two board actions, one rebuild.
-- Aries prep: the card stays with its teammate owner and Aries does the prep work for them.
-- Frank, 09/29/2026: "i want to be able to assign a task to a teamate, and also assign it to aries
-- so that aries can do some prep work for that teamate." Its value is the owner's key (who the
-- prep is for), so it joins the value-bearing operations. SQLite cannot widen a CHECK in place,
-- so the queue is rebuilt as in 0006; every row carries across with its id.
-- Urgent: Frank, 09/29/2026: "createn an urgent button where I can mark a card Urgent and it
-- appears at the top and it nudges the teamates that must do something asap". Its value is
-- 'on' or 'off'.
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS command_queue_v8 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation TEXT NOT NULL CHECK (
    operation IN ('done', 'reopen', 'note', 'assign', 'snooze', 'reorder', 'delete',
                  'useful', 'not_useful', 'nudge', 'prep', 'urgent')
  ),
  item_id INTEGER NOT NULL CHECK (item_id > 0),
  note TEXT,
  value TEXT,
  actor_email TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'applied', 'failed')),
  created_at TEXT NOT NULL,
  acked_at TEXT,
  ack_detail TEXT,
  CHECK (
    (operation = 'note' AND length(trim(note)) BETWEEN 1 AND 2000)
    OR
    (operation <> 'note' AND note IS NULL)
  ),
  CHECK (
    (operation IN ('assign', 'snooze', 'reorder', 'nudge', 'prep', 'urgent') AND value IS NOT NULL AND length(value) <= 240)
    OR
    (operation IN ('done', 'reopen', 'note', 'delete', 'useful', 'not_useful') AND value IS NULL)
  )
);

INSERT INTO command_queue_v8 (id, operation, item_id, note, value, actor_email, state, created_at, acked_at, ack_detail)
SELECT id, operation, item_id, note, value, actor_email, state, created_at, acked_at, ack_detail
FROM command_queue;

DROP TABLE command_queue;
ALTER TABLE command_queue_v8 RENAME TO command_queue;

CREATE INDEX IF NOT EXISTS command_queue_pending_idx ON command_queue (state, id);

PRAGMA foreign_keys = ON;
```


### `migrations/0010_mission.sql`

```sql
CREATE TABLE IF NOT EXISTS mission_records (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated TEXT NOT NULL, PRIMARY KEY(kind,id));
```


### `migrations/0011_mission_answers.sql`

```sql
CREATE TABLE IF NOT EXISTS mission_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('choice','text')),
  choice TEXT,
  text TEXT,
  created TEXT NOT NULL,
  author TEXT NOT NULL,
  received TEXT,
  request_id TEXT,
  UNIQUE(author,request_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS mission_answer_choice ON mission_answers(card_id,author) WHERE kind='choice';
CREATE INDEX IF NOT EXISTS mission_answer_unseen ON mission_answers(received,id);
```


### `migrations/0012_mission_answers_by.sql`

```sql
ALTER TABLE mission_answers ADD COLUMN received_by TEXT;
```


### `migrations/0013_command_delivery.sql`

```sql
-- Additive delivery tracking. Existing publishers can continue GET + ACK unchanged.
ALTER TABLE command_queue ADD COLUMN received_at TEXT;
ALTER TABLE command_queue ADD COLUMN lease_token TEXT;
ALTER TABLE command_queue ADD COLUMN lease_expires_at TEXT;
ALTER TABLE command_queue ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0);
ALTER TABLE command_queue ADD COLUMN next_attempt_at TEXT;
ALTER TABLE command_queue ADD COLUMN error_code TEXT;
CREATE INDEX IF NOT EXISTS command_queue_lease_idx ON command_queue(state, lease_expires_at);
```


### `src/board-ui-state.js`

```js
/** @param {any} item @param {number} [now] */
export function cardExceptions(item, now = Date.now()) {
  const issues = [];
  const prep = item.prep || {};
  const stopped = ['failed', 'stopped', 'cancelled', 'timeout', 'timed_out', 'interrupted'];
  if (stopped.includes(prep.status)) issues.push({ code: 'prep_failed', message: prep.error || prep.detail || 'Preparation did not finish.', recovery: 'Review the preparation note, then request preparation again.' });
  const task = item.aries_task || {};
  if (stopped.includes(task.status)) issues.push({ code: 'aries_failed', message: task.error || task.detail || 'The delegated Aries task did not finish.', recovery: 'Open the task history and resolve the failure before delegating again.' });
  for (const [kind, work] of [['prep', prep], ['aries', task]]) {
    const started = Date.parse(work.at || work.started_at || '');
    if (['queued', 'running'].includes(work.status) && Number.isFinite(started) && now - started > 3 * 3600000) issues.push({ code: kind + '_stuck', message: (kind === 'prep' ? 'Preparation' : 'The delegated Aries task') + ' has been waiting or running for more than three hours.', recovery: 'Review the task history and runner health before requesting another action.' });
  }
  const receipt = item.command_receipt || {};
  if (receipt.state === 'failed') issues.push({ code: 'command_failed', message: receipt.detail || 'A command failed.', recovery: 'Review the failure and retry the same command.' });
  const queued = Date.parse(receipt.received_at || receipt.created_at || '');
  if (['queued', 'received', 'processing'].includes(receipt.state) && Number.isFinite(queued) && now - queued > 30 * 60000) issues.push({ code: 'command_stuck', message: 'This command has waited more than 30 minutes.', recovery: 'Check runner health before requesting another action.' });
  const evidence = item.evidence_at || item.source_updated_at || item.updated_at || item.updated || (item.brief || {}).updated_at;
  const at = Date.parse(evidence || '');
  if (!Number.isFinite(at)) issues.push({ code: 'evidence_unknown', message: 'Source evidence time is unavailable.', recovery: 'Open the source email and verify the next action.' });
  else if (now - at > 7 * 86400000) issues.push({ code: 'evidence_stale', message: 'Source evidence is more than seven days old.', recovery: 'Check the source before acting on this summary.' });
  if (['close', 'looks_done'].includes((item.brief || {}).action) || (item.brief || {}).looks_done || item.looks_done) issues.push({ code: 'looks_done', message: 'This card may already be complete.', recovery: 'Verify the evidence before marking it done.' });
  for (const issue of (item.quality || {}).issues || []) issues.push({ code: issue.code, message: issue.message, recovery: 'Compare the summary with the source and add a correction note.' });
  return issues;
}

/** @param {any} item @param {any} filters @param {string} today */
export function matchesBoardFilters(item, filters, today) {
  const brief = item.brief || {};
  const identity = item.identity || {};
  const lower = (/** @type {any} */ value) => String(value || '').toLowerCase();
  const contains = (/** @type {any} */ value, /** @type {any} */ query) => lower(value).includes(lower(query).trim());
  const status = item.status || 'open';
  const owner = lower((item.responsibility || {}).owner || item.assignee);
  const text = [item.id, item.title, item.summary, brief.client, brief.claim, brief.needs, brief.next_step, item.claim_label, identity.claim_id, identity.client_id, identity.invoice_id, owner].join(' ');
  if (filters.query && !contains(text, filters.query)) return false;
  if (filters.owner && (filters.owner === 'unassigned' ? Boolean(owner) : owner !== lower(filters.owner))) return false;
  if (filters.client && !contains([brief.client, item.claim_label, identity.client_id].join(' '), filters.client)) return false;
  if (filters.claim && !contains([brief.claim, identity.claim_id, identity.invoice_id].join(' '), filters.claim)) return false;
  const urgent = Boolean(item.urgent) || lower(item.priority) === 'urgent';
  if (filters.urgency === 'urgent' && !urgent) return false;
  if (filters.urgency === 'normal' && urgent) return false;
  if (filters.status && status !== filters.status) return false;
  const due = /^\d{4}-\d{2}-\d{2}/.test(String(item.due || '')) ? String(item.due).slice(0, 10) : '';
  if (filters.due === 'overdue' && (!due || due >= today)) return false;
  if (filters.due === 'today' && due !== today) return false;
  if (filters.due === 'undated' && due) return false;
  if (filters.due === 'upcoming' && (!due || due <= today)) return false;
  return true;
}

/** @param {any} receipt */
export function commandReceiptText(receipt) {
  if (!receipt) return 'No recent command';
  const states = /** @type {Record<string,string>} */ ({ queued: 'Queued for Aries', received: 'Received by Aries', processing: 'Processing', applied: 'Applied by Aries', failed: 'Failed' });
  return (states[receipt.state] || 'Status unknown') + (receipt.operation ? ' · ' + receipt.operation : '') + (receipt.state === 'failed' && receipt.detail ? ': ' + receipt.detail : '');
}

/** Build a frozen, reviewable plan. It never mutates cards. @param {any[]} items @param {Set<string>} selected @param {string} operation @param {string} value */
export function bulkActionPlan(items, selected, operation, value) {
  if (!['assign', 'snooze', 'duplicate-review'].includes(operation)) throw new Error('This bulk action is not supported.');
  if (operation === 'snooze' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Choose a snooze date.');
  return items.filter(item => selected.has(String(item.id)) && item.status !== 'done').map(item => ({
    id: item.id, title: item.title || '', operation, value,
    before: { assignee: item.assignee || '', due: item.due || '', status: item.status || 'open' },
    payload: {
      ...(operation === 'duplicate-review' ? { id: item.id, operation: 'note', note: 'Duplicate review requested. Compare related cards and source evidence before changing or closing any card.' } : { id: item.id, operation, value }),
      expected: { command_id: item.command_receipt?.id || 0, assignee: item.assignee || '', due: item.due || '', status: item.status || 'open' },
    },
  }));
}

/** An inverse is valid only after this exact command was applied and its effect still holds. @param {any} entry @param {any} item @param {any} receipt */
export function bulkUndoPayload(entry, item, receipt) {
  if (!item || !receipt || receipt.state !== 'applied' || String(receipt.id) !== String(entry.command_id)) return null;
  if (item.command_receipt && Number(item.command_receipt.id) > Number(entry.command_id)) return null;
  const expected = { command_id: receipt.id, assignee: item.assignee || '', due: item.due || '', status: item.status || 'open' };
  if (entry.operation === 'assign' && (item.assignee || '') === entry.value) return { id: item.id, operation: 'assign', value: entry.before.assignee, expected };
  if (entry.operation === 'snooze' && item.status === 'snoozed' && item.due === entry.value && entry.before.status === 'snoozed' && /^\d{4}-\d{2}-\d{2}$/.test(entry.before.due || '')) return { id: item.id, operation: 'snooze', value: entry.before.due, expected };
  return null;
}

/** Preserve object identity so event handlers never retain an obsolete snapshot. @param {any[]} current @param {any[]} incoming */
export function reconcileBoardItems(current, incoming) {
  const byId = new Map(current.map(item => [String(item.id), item]));
  return incoming.map(next => {
    const item = byId.get(String(next.id));
    if (!item) return next;
    for (const key of Object.keys(item)) if (!(key in next)) delete item[key];
    Object.assign(item, next);
    return item;
  });
}
```


### `src/board-ui-upgrades.js`

```js
import { cardExceptions, matchesBoardFilters, commandReceiptText, bulkActionPlan, bulkUndoPayload, reconcileBoardItems } from './board-ui-state.js'

export const BOARD_UPGRADE_CSS = `
    .summary-strip { padding: 12px 18px; margin-bottom: 16px; }
    .metric-value { font-size: 25px; }
    .board-controls { display: grid; gap: 10px; margin-bottom: 16px; padding: 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
    .board-filters { display: grid; grid-template-columns: minmax(180px, 2fr) repeat(3, minmax(120px, 1fr)); gap: 10px; }
    .board-filters label, .bulk-fields label { display: grid; gap: 4px; min-width: 0; color: var(--muted); font-size: 12px; font-weight: 700; }
    .board-filters input, .board-filters select, .owner-select, .bulk-fields input, .bulk-fields select { min-width: 0; width: 100%; min-height: 44px; padding: 8px 10px; border: 1px solid #bbc1ca; border-radius: 8px; background: white; color: var(--ink); font: inherit; }
    .board-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .board-tools button, .detail-actions button { min-height: 44px; }
    .compact-table-wrap { overflow-x:auto; max-width:100%; border:1px solid var(--line); border-radius:12px; background:white; }
    .compact-table { width:100%; border-collapse:collapse; min-width:720px; font-size:13px; }
    .compact-table caption { padding:12px; text-align:left; color:var(--muted); }
    .compact-table th,.compact-table td { padding:10px 12px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }
    .compact-table th { font-size:12px; color:var(--muted); }
    .compact-table .table-task { min-width:200px; max-width:440px; overflow-wrap:anywhere; }
    .compact-table input { width:20px; height:20px; margin:12px; }
    .compact-table button { min-height:44px; }
    .scope-count { margin: 0; color: var(--muted); font-size: 13px; }
    .card-select { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; font-size: 12px; }
    .card-select input { width: 18px; height: 18px; }
    .receipt, .exception-summary { margin: 7px 0; padding: 7px 9px; border-radius: 6px; font-size: 12px; overflow-wrap: anywhere; }
    .receipt { background: #edf3fc; color: #294f80; }
    .receipt[data-state="failed"], .exception-summary { background: #fff5e6; color: #835515; }
    .receipt[data-state="applied"] { background: var(--green-soft); color: #245b40; }
    .board[data-density="compact"] { display: block; }
    .board[data-density="compact"] .claim-card { margin-bottom: 8px; padding: 10px; }
    .board[data-density="compact"] .claim-head { display: flex; flex-wrap: wrap; gap: 5px 14px; align-items: baseline; }
    .board[data-density="compact"] .claim-head h3 { font-size: 15px; }
    .board[data-density="compact"] .card { margin-bottom: 6px; min-height: 0; padding: 10px 14px; box-shadow: none; }
    .board[data-density="compact"] .card[data-collapsed="true"] { display: grid; grid-template-columns: minmax(150px,.8fr) minmax(180px,2fr) minmax(130px,1fr); gap: 0 16px; align-items: start; }
    .board[data-density="compact"] .card[data-collapsed="true"] .card-top { grid-row: 1 / 4; }
    .board[data-density="compact"] .card[data-collapsed="true"] h3 { margin: 6px 0; }
    .board[data-density="compact"] .card[data-collapsed="true"] .card-owner-line { grid-column: 3; grid-row: 1 / 3; }
    .board[data-density="compact"] .card[data-collapsed="true"] :is(.facts,.card-peek) { grid-column: 2; }
    .board[data-density="compact"] .card[data-collapsed="true"] :is(.receipt,.exception-summary) { grid-column: 2 / 4; }
    #detail-dialog { width: min(900px, calc(100% - 24px)); max-height: 90vh; }
    #detail-content { display: grid; gap: 14px; }
    .detail-section { border-top: 1px solid var(--line); padding-top: 12px; min-width: 0; }
    .detail-section h3 { margin: 0 0 8px; font-size: 15px; }
    .detail-section p, .detail-section li { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.5; }
    .detail-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .detail-section a { overflow-wrap: anywhere; }
    .bulk-fields { display: grid; gap: 10px; margin: 12px 0; }
    #bulk-preview { max-height: 35vh; overflow: auto; padding-left: 22px; }
    .focus-target { outline: 3px solid var(--blue); outline-offset: 4px; }
    @media(max-width:680px) { .board-filters { grid-template-columns: repeat(2,minmax(0,1fr)); } .board-filters label:first-child { grid-column:1 / -1; } .board[data-density="compact"] .card[data-collapsed="true"] { display:block; } .todo-toolbar { flex-wrap:wrap; } .owner-row { align-items:stretch; } }
`

export const BOARD_UPGRADE_CONTROLS = `
        <div class="board-controls" aria-label="Board filters and triage">
          <div class="board-filters">
            <label>Search cards<input id="board-search" type="search" placeholder="Task, client, claim or card number" autocomplete="off"></label>
            <label>Owner<select id="board-owner"><option value="">All owners</option><option value="unassigned">Unassigned</option></select></label>
            <label>Client<input id="board-client" type="search" placeholder="Client name or ID"></label>
            <label>Claim or invoice<input id="board-claim" type="search" placeholder="Number or ID"></label>
            <label>Urgency<select id="board-urgency"><option value="">Any urgency</option><option value="urgent">Urgent</option><option value="normal">Normal</option></select></label>
            <label>Due<select id="board-due"><option value="">Any date</option><option value="overdue">Overdue</option><option value="today">Today</option><option value="upcoming">Upcoming</option><option value="undated">No date</option></select></label>
            <label>Status<select id="board-status"><option value="">Active board</option><option value="open">Open</option><option value="snoozed">Snoozed</option><option value="done">Done</option></select></label>
            <label>Layout<select id="board-density"><option value="cards">Cards</option><option value="compact">Compact table</option></select></label>
          </div>
          <div class="board-tools"><button id="board-clear" class="refresh-button" type="button">Clear filters</button><button id="select-visible" class="refresh-button" type="button">Select shown</button><button id="clear-selected" class="refresh-button" type="button">Clear selection</button><button id="bulk-open" class="refresh-button" type="button" disabled>Review bulk action (0)</button><button id="bulk-undo" class="refresh-button" type="button" hidden>Review undo</button></div>
          <p id="board-scope" class="scope-count" aria-live="polite"></p>
          <p id="bulk-status" class="scope-count" aria-live="polite"></p>
        </div>
`

export const BOARD_UPGRADE_DIALOGS = `
  <dialog id="detail-dialog" aria-labelledby="detail-title"><div class="dialog-body"><h2 id="detail-title">Card details</h2><p id="detail-meta"></p><div id="detail-content"></div><div class="dialog-actions"><button id="detail-close" class="dialog-action" type="button">Close details</button></div></div></dialog>
  <dialog id="bulk-dialog" aria-labelledby="bulk-title"><div class="dialog-body"><h2 id="bulk-title">Review bulk action</h2><p>Only the listed cards will change. Each command keeps its own receipt.</p><div class="bulk-fields"><label>Action<select id="bulk-operation"><option value="assign">Assign owner</option><option value="snooze">Snooze</option><option value="duplicate-review">Request duplicate review</option></select></label><label id="bulk-owner-label">New owner<select id="bulk-owner"></select></label><label id="bulk-date-label" hidden>Return date<input id="bulk-date" type="date"></label></div><ol id="bulk-preview"></ol><p id="bulk-help"></p><div class="dialog-actions"><button id="bulk-cancel" class="dialog-action" type="button">Cancel</button><button id="bulk-confirm" class="dialog-action primary" type="button">Queue these changes</button></div></div></dialog>
`

export const BOARD_UPGRADE_SCRIPT = [cardExceptions, matchesBoardFilters, commandReceiptText, bulkActionPlan, bulkUndoPayload, reconcileBoardItems].map(fn => fn.toString()).join('\n') + String.raw`
    const filters = { query:'', owner:'', client:'', claim:'', urgency:'', due:'', status:'' };
    const selectedCards = new Set();
    const cardNodes = new Map();
    const groupNodes = new Map();
    let currentReceipts = [];
    let bulkPlan = [];
    let bulkLast = [];
    let bulkUndoMode = false;
    let detailId = null;
    let detailGeneration = 0;
    let deepLinkHandled = false;
    const detailDialog = document.querySelector('#detail-dialog');
    const bulkDialog = document.querySelector('#bulk-dialog');
    function boardScope(item) {
      if (filters.status) return (item.status || 'open') === filters.status;
      return onBoard(item);
    }
    function filteredBoardItem(item) {
      return matchesBoardFilters(item, filters, todayIso()) && (activeView !== 'exceptions' || cardExceptions(item).length > 0);
    }
    function visibleBoardItems() { return boardItems.filter(boardScope).filter(inView).filter(filteredBoardItem); }
    function reconcileChildren(parent, nodes) {
      const wanted = new Set(nodes);
      nodes.forEach(function (node, index) { if (parent.children[index] !== node) parent.insertBefore(node, parent.children[index] || null); });
      Array.from(parent.children).forEach(function (node) { if (!wanted.has(node)) node.remove(); });
    }
    let compactTable = null;
    const compactRows = new Map();
    function renderCompactTable(items) {
      if(!compactTable){compactTable=document.createElement('div');compactTable.className='compact-table-wrap';compactTable.setAttribute('role','region');compactTable.setAttribute('aria-label','Compact card table, scroll horizontally for more columns');compactTable.tabIndex=0;const table=document.createElement('table');table.className='compact-table';const caption=document.createElement('caption');caption.textContent='Curated operational cards. Open details for source evidence and actions.';const head=document.createElement('thead');const row=document.createElement('tr');['Select','Card and next action','Owner / next actor','Due / status','Latest command','Details'].forEach(function(text){const th=document.createElement('th');th.scope='col';th.textContent=text;row.append(th);});head.append(row);table.append(caption,head,document.createElement('tbody'));compactTable.append(table);}
      const rows=items.map(function(item){let row=compactRows.get(String(item.id));if(!row){row=document.createElement('tr');row.dataset.id=String(item.id);for(let n=0;n<6;n++)row.append(document.createElement('td'));row.children[1].className='table-task';const select=document.createElement('input');select.type='checkbox';select.setAttribute('aria-label','Select card #'+item.id);select.addEventListener('change',function(){if(select.checked)selectedCards.add(String(item.id));else selectedCards.delete(String(item.id));updateUpgradeChrome();});row.children[0].append(select);const open=document.createElement('button');open.type='button';open.className='card-action';open.textContent='Open #'+item.id;open.addEventListener('click',function(){openCardDetail(item.id);});row.children[5].append(open);compactRows.set(String(item.id),row);}row.children[0].querySelector('input').checked=selectedCards.has(String(item.id));row.children[1].textContent='#'+item.id+' · '+cardTitle(item)+' — '+((item.brief||{}).next_step||item.summary||'Next action unknown');row.children[2].textContent=nameOf((item.responsibility||{}).owner||item.assignee)||'Unassigned';if((item.responsibility||{}).next_actor)row.children[2].textContent+=' / '+item.responsibility.next_actor;row.children[3].textContent=(item.due?formatDue(item.due):'No date')+' · '+(item.status||'open')+(item.pending?' (requested)':'');row.children[4].textContent=commandReceiptText(item.command_receipt);return row;});reconcileChildren(compactTable.querySelector('tbody'),rows);return compactTable;
    }
    function rememberFocus() {
      const focused = document.activeElement;
      const start = focused && typeof focused.selectionStart === 'number' ? focused.selectionStart : null;
      const end = focused && typeof focused.selectionEnd === 'number' ? focused.selectionEnd : null;
      const x = window.scrollX, y = window.scrollY;
      return function () {
        if (focused && focused.isConnected && document.activeElement !== focused) { focused.focus({preventScroll:true}); if (start !== null && typeof focused.setSelectionRange === 'function') focused.setSelectionRange(start,end); }
        if (window.scrollX !== x || window.scrollY !== y) window.scrollTo(x,y);
      };
    }
    function receiptFor(entry) { if(!entry.command_id)return null;const receipt=currentReceipts.find(function (receipt) { return String(receipt.id) === String(entry.command_id); }) || (boardItems.find(function (item) { return item.id === entry.id; }) || {}).command_receipt;return receipt && String(receipt.id)===String(entry.command_id)?receipt:null; }
    function updateUpgradeChrome() {
      const shown = visibleBoardItems();
      document.querySelector('#board-scope').textContent = shown.length + ' cards shown of ' + boardItems.length + ' published cards. ' + (activeView === 'exceptions' ? 'Exceptions require source or runner review.' : 'Board is the curated operational collection. To-Do and Full list have separate scopes.');
      const bulkButton = document.querySelector('#bulk-open');
      bulkButton.textContent = 'Review bulk action (' + selectedCards.size + ')';
      bulkButton.disabled = !selectedCards.size;
      const applied = bulkLast.filter(function (entry) { return (receiptFor(entry) || {}).state === 'applied'; }).length;
      const failed = bulkLast.filter(function (entry) { return (receiptFor(entry) || {}).state === 'failed' || entry.error; }).length;
      if (bulkLast.length) document.querySelector('#bulk-status').textContent = 'Last bulk action: ' + applied + ' applied, ' + failed + ' failed, ' + (bulkLast.length-applied-failed) + ' awaiting confirmation.' + bulkLast.filter(function(entry){return entry.error;}).map(function(entry){return ' #'+entry.id+': '+entry.error;}).join('') + (bulkLast.some(function(entry){return entry.operation==='snooze' && (entry.before.status!=='snoozed' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.before.due||''));}) ? ' Undo is unavailable for new snoozes because the previous due date cannot be restored.' : '');
      document.querySelector('#bulk-undo').hidden = !bulkLast.some(function (entry) { return bulkUndoPayload(entry,boardItems.find(function (item) { return item.id===entry.id; }),receiptFor(entry)); });
      document.querySelector('#show-exceptions').textContent = 'Exceptions (' + boardItems.filter(onBoard).filter(function(item){return cardExceptions(item).length;}).length + ')';
      const ownerSelect = document.querySelector('#board-owner');
      const signature = JSON.stringify(teamList);
      if (ownerSelect.dataset.team !== signature) {
        ownerSelect.dataset.team=signature;
        const previous=ownerSelect.value;
        ownerSelect.replaceChildren(new Option('All owners',''),new Option('Unassigned','unassigned'));
        teamList.concat([{key:'aries',name:'Aries'}]).forEach(function(person){ownerSelect.append(new Option(person.name,person.key));});
        ownerSelect.value=previous;
      }
    }
    function decorateCard(card,item) {
      let tools=card.querySelector('.card-selection');
      if(!tools){
        tools=document.createElement('div');tools.className='card-selection board-tools';
        const label=document.createElement('label');label.className='card-select';
        const check=document.createElement('input');check.type='checkbox';check.setAttribute('aria-label','Select card #'+item.id);
        check.addEventListener('change',function(){if(check.checked)selectedCards.add(String(item.id));else selectedCards.delete(String(item.id));updateUpgradeChrome();});
        label.append(check,document.createTextNode('Select'));
        const detail=document.createElement('button');detail.type='button';detail.className='card-action';detail.textContent='Open details';detail.addEventListener('click',function(){openCardDetail(item.id);});
        tools.append(label,detail);card.append(tools);
        const receipt=document.createElement('p');receipt.className='receipt';receipt.setAttribute('aria-live','polite');card.append(receipt);
        const exception=document.createElement('p');exception.className='exception-summary';card.append(exception);
      }
      tools.querySelector('input').checked=selectedCards.has(String(item.id));
      const receipt=card.querySelector('.receipt');receipt.hidden=!item.command_receipt;receipt.dataset.state=(item.command_receipt||{}).state||'';receipt.textContent=commandReceiptText(item.command_receipt)+(item.pending?' · Requested values; awaiting application.':'');
      const issues=cardExceptions(item);const notice=card.querySelector('.exception-summary');notice.hidden=!issues.length;notice.textContent=issues.length?'Review: '+issues[0].message+(issues.length>1?' (+'+(issues.length-1)+' more)':''):'';
      if(item.responsibility){const role=item.responsibility;card.querySelector('.card-owner-line').textContent='Owner: '+(role.owner?nameOf(role.owner):'Unassigned')+' · Next actor: '+(role.next_actor||'Unknown')+' · Waiting on: '+(role.waiting_on||'Unknown');}
      const facts=card.querySelector('.facts');
      facts.querySelectorAll('[data-financial]').forEach(function(node){node.remove();});
      if(item.financials && item.financials.length){
        const legacy=facts.querySelectorAll('span');if(legacy.length>2)legacy[2].remove();
        item.financials.forEach(function(fact){const amount=document.createElement('span');amount.dataset.financial='true';amount.textContent=fact.type+': '+new Intl.NumberFormat('en-US',{style:'currency',currency:fact.currency}).format(fact.amount_minor/100);amount.title='Source: '+fact.source+(fact.date?' · '+fact.date:'');facts.append(amount);});
      } else if(item.financials){const legacy=facts.querySelectorAll('span');if(legacy.length>2){if(!legacy[2].textContent.endsWith(' (unverified)'))legacy[2].textContent+=' (unverified)';}}
    }
    function detailSection(title,lines){const section=document.createElement('section');section.className='detail-section';const heading=document.createElement('h3');heading.textContent=title;section.append(heading);lines.forEach(function(line){const p=document.createElement('p');p.textContent=line;section.append(p);});return section;}
    function safeDocumentUrl(value){if(!value)return null;try{const url=new URL(value,location.origin);return ['https:','http:'].includes(url.protocol)?url.href:null;}catch(error){return null;}}
    async function openCardDetail(id){
      const item=boardItems.find(function(row){return String(row.id)===String(id);});if(!item)return;
      detailId=item.id;const generation=++detailGeneration;
      document.querySelector('#detail-title').textContent='#'+item.id+' · '+cardTitle(item);
      document.querySelector('#detail-meta').textContent='Owner: '+nameOf((item.responsibility||{}).owner||item.assignee)+' · '+commandReceiptText(item.command_receipt)+(item.pending?' · Requested values; awaiting application.':'');
      const content=document.querySelector('#detail-content');content.replaceChildren();
      const brief=item.brief||{};const roles=item.responsibility||{};
      const next=detailSection('Next action',[brief.next_step||brief.needs||item.summary||'No next action supplied.','Next actor: '+(roles.next_actor||'Unknown')+' · Waiting on: '+(roles.waiting_on||brief.waiting_on||'Unknown')]);
      const actions=document.createElement('div');actions.className='detail-actions';
      const note=document.createElement('button');note.type='button';note.className='card-action';note.textContent='Add correction or note';note.addEventListener('click',function(){noteItem=item;noteHost=cardNodes.get(String(item.id))||null;document.querySelector('#note-target').textContent='#'+item.id+' · '+cardTitle(item);noteText.value='';detailDialog.close();noteDialog.showModal();noteText.focus();});actions.append(note);
      if(item.command_receipt && item.command_receipt.state==='failed'){const retry=document.createElement('button');retry.type='button';retry.className='card-action';retry.textContent='Retry failed command';retry.addEventListener('click',async function(){if(!window.confirm('Retry this failed '+item.command_receipt.operation+' command for card #'+item.id+'?'))return;retry.disabled=true;try{const response=await fetch('/api/commands/'+item.command_receipt.id+'/retry',{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({confirm:true})});const result=await response.json();if(!response.ok)throw new Error((result.error||'Retry failed')+(result.next_attempt_at?' Retry after '+formatTime(result.next_attempt_at):''));showToast('Retry queued. Wait for its receipt.',false);await loadBoard();openCardDetail(item.id);}catch(error){showToast(error.message,true);retry.disabled=false;}});actions.append(retry);}
      next.append(actions);content.append(next);
      const issues=cardExceptions(item);if(issues.length)content.append(detailSection('Exceptions and recovery',issues.map(function(issue){return issue.message+' '+issue.recovery;})));
      const identity=item.identity||{};content.append(detailSection('Identity and grouping',[['Claim',identity.claim_id],['Client',identity.client_id],['Invoice',identity.invoice_id]].map(function(pair){return pair[0]+': '+(pair[1]||'Unknown');}).concat((item.grouping||{}).reasons||[])));
      const financials=item.financials||[];content.append(detailSection('Financial facts',financials.length?financials.map(function(fact){return fact.type+': '+new Intl.NumberFormat('en-US',{style:'currency',currency:fact.currency}).format(fact.amount_minor/100)+' · '+fact.source+' · '+(fact.date||'Date unknown');}):['No verified financial facts supplied. Legacy amount text: '+(brief.amount||'Unknown')]));
      const relationships=item.relationships||{};const related=[];if(relationships.duplicate_of)related.push('Confirmed duplicate of #'+relationships.duplicate_of);if(relationships.superseded_by)related.push('Superseded by #'+relationships.superseded_by);(relationships.supersedes||[]).forEach(function(value){related.push('Supersedes #'+value);});(relationships.suggestions||[]).forEach(function(value){related.push('Review suggestion, card #'+value.card_id+': '+value.reason);});if(related.length)content.append(detailSection('Related cards',related));
      const prep=item.prep||{};content.append(detailSection('Prepared output',[prep.output||prep.result||prep.detail||'Preparation output is recorded in the notes below.','Preparation state: '+(prep.status||'No state supplied')]));
      content.append(detailSection('Notes',(item.notes||[]).length?item.notes.map(function(note){return (typeof note==='string'?note:note.text||'')+(note.by?' · '+note.by:'')+(note.at?' · '+formatTime(note.at):'')+(note.pending?' · Pending application':'');}):[item.note||'No notes supplied.']));
      const attachments=detailSection('Attachments',[]);const files=(item.attachments||[]).concat(prep.attachments||[]);if(!files.length)attachments.append(document.createTextNode('No attachments supplied. Check the source conversation for original documents.'));files.forEach(function(file){const p=document.createElement('p');const url=safeDocumentUrl(file.url||file.href||'');if(url){const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=file.name||file.filename||'Open document';p.append(link);}else p.textContent=file.name||file.filename||'Attachment location unavailable';attachments.append(p);});content.append(attachments);
      content.append(detailSection('History',(item.history||[]).length?item.history.map(function(entry){return formatTime(entry.at)+' · '+(entry.who||'')+' '+(entry.what||'');}):['No history supplied.']));
      const email=detailSection('Source email',[threadIds.has(item.id)?'Loading source conversation…':'No source conversation has been published for this card.']);content.append(email);
      if(!detailDialog.open)detailDialog.showModal();
      if(!threadIds.has(item.id))return;
      try{const response=await fetch('/api/thread?id='+encodeURIComponent(item.id),{headers:{accept:'application/json'},cache:'no-store'});const payload=await response.json();if(!response.ok)throw new Error(payload.error||'Email unavailable');if(generation!==detailGeneration||!detailDialog.open)return;email.querySelector('p').remove();(payload.messages||[]).forEach(function(message){email.append(detailSection([message.from,message.date].filter(Boolean).join(' · '),[message.body||'(No message text)',message.truncated?'Message shortened. Open the original mailbox for the rest.':'']));});}catch(error){if(generation===detailGeneration)email.querySelector('p').textContent=error.message;}
    }
    function refreshBulkPreview(){
      const operation=document.querySelector('#bulk-operation').value;const value=operation==='snooze'?document.querySelector('#bulk-date').value:document.querySelector('#bulk-owner').value;
      document.querySelector('#bulk-owner-label').hidden=operation!=='assign';document.querySelector('#bulk-date-label').hidden=operation!=='snooze';
      const list=document.querySelector('#bulk-preview');list.replaceChildren();
      try{bulkPlan=bulkUndoMode?bulkLast.filter(function(entry){return bulkUndoPayload(entry,boardItems.find(function(item){return item.id===entry.id;}),receiptFor(entry));}).map(function(entry){return Object.assign({},entry,{payload:bulkUndoPayload(entry,boardItems.find(function(item){return item.id===entry.id;}),receiptFor(entry))});}):bulkActionPlan(boardItems,selectedCards,operation,value);bulkPlan.forEach(function(entry){const row=document.createElement('li');row.textContent='#'+entry.id+' · '+entry.title+' → '+entry.payload.operation+(entry.payload.value?' '+entry.payload.value:'');list.append(row);});document.querySelector('#bulk-help').textContent=bulkUndoMode?'Only applied commands whose current value still matches are eligible. Undo is a new command.':operation==='duplicate-review'?'Adds a review note to each card. It does not merge, close or delete any card.':operation==='snooze'?'Review every affected card. Undo is available only when restoring a previous valid snooze date, after Aries confirms application.':'Review every affected card. Undo becomes available after Aries confirms application.';document.querySelector('#bulk-confirm').disabled=!bulkPlan.length;}catch(error){bulkPlan=[];document.querySelector('#bulk-help').textContent=error.message;document.querySelector('#bulk-confirm').disabled=true;}
    }
    function openBulk(undo){bulkUndoMode=undo;document.querySelector('#bulk-title').textContent=undo?'Review undo':'Review bulk action';document.querySelector('.bulk-fields').hidden=undo;document.querySelector('#bulk-confirm').textContent=undo?'Queue these reversals':'Queue these changes';const owner=document.querySelector('#bulk-owner');owner.replaceChildren(new Option('Unassigned',''));teamList.forEach(function(person){owner.append(new Option(person.name,person.key));});document.querySelector('#bulk-date').value=defaultSnoozeDate();refreshBulkPreview();bulkDialog.showModal();}
    document.querySelector('#bulk-confirm').addEventListener('click',async function(){
      const button=this;button.disabled=true;const plan=bulkPlan.slice();const isUndo=bulkUndoMode;bulkDialog.close();const results=[];
      for(const entry of plan){try{const item=boardItems.find(function(row){return row.id===entry.id;});if(!item)throw new Error('Card no longer available');if(isUndo&&!bulkUndoPayload(entry,item,receiptFor(entry)))throw new Error('The card changed. Undo skipped.');const command=await postAction(entry.payload);results.push(Object.assign({},entry,{command_id:command.id}));selectedCards.delete(String(entry.id));}catch(error){results.push(Object.assign({},entry,{error:error.message}));}}
      bulkLast=isUndo?[]:results;document.querySelector('#bulk-status').textContent=results.filter(function(entry){return entry.command_id;}).length+' commands queued. '+results.filter(function(entry){return entry.error;}).map(function(entry){return '#'+entry.id+': '+entry.error;}).join(' ');showToast(results.some(function(entry){return entry.command_id;})?'Bulk request queued. Check the per-card receipts for completion.':'No commands were queued. Review the errors.',!results.some(function(entry){return entry.command_id;}));await loadBoard();button.disabled=false;
    });
    document.querySelector('#bulk-open').addEventListener('click',function(){openBulk(false);});document.querySelector('#bulk-undo').addEventListener('click',function(){openBulk(true);});document.querySelector('#bulk-cancel').addEventListener('click',function(){bulkDialog.close();});
    ['bulk-operation','bulk-owner','bulk-date'].forEach(function(id){document.querySelector('#'+id).addEventListener('change',refreshBulkPreview);});
    document.querySelector('#select-visible').addEventListener('click',function(){visibleBoardItems().filter(function(item){return item.status!=='done';}).forEach(function(item){selectedCards.add(String(item.id));});render(boardItems);});
    document.querySelector('#clear-selected').addEventListener('click',function(){selectedCards.clear();render(boardItems);});
    const filterFields={query:'board-search',owner:'board-owner',client:'board-client',claim:'board-claim',urgency:'board-urgency',due:'board-due',status:'board-status'};
    Object.keys(filterFields).forEach(function(key){document.querySelector('#'+filterFields[key]).addEventListener('input',function(){filters[key]=this.value;render(boardItems);});});
    document.querySelector('#board-clear').addEventListener('click',function(){Object.keys(filterFields).forEach(function(key){filters[key]='';document.querySelector('#'+filterFields[key]).value='';});render(boardItems);});
    document.querySelector('#board-density').addEventListener('change',function(){board.dataset.density=this.value;render(boardItems);try{localStorage.setItem('aries-board-density',this.value);}catch(error){};});
    try{const density=localStorage.getItem('aries-board-density');if(density==='compact'){board.dataset.density=density;document.querySelector('#board-density').value=density;}}catch(error){}
    document.querySelector('#show-exceptions').addEventListener('click',function(){switchView('exceptions');});
    document.querySelector('#detail-close').addEventListener('click',function(){detailDialog.close();});detailDialog.addEventListener('close',function(){detailId=null;++detailGeneration;});
    function handleBoardLink(){if(deepLinkHandled)return;const params=new URLSearchParams(location.search);if(params.get('view')==='todos')return;const id=params.get('card');if(id){const item=boardItems.find(function(row){return String(row.id)===id;});deepLinkHandled=true;if(item)openCardDetail(item.id);else showToast('This card is not in the published board.',true);}}
    function handleTodoLink(){if(deepLinkHandled)return;const id=new URLSearchParams(location.search).get('task');if(!id)return;const row=Array.from(todoList.querySelectorAll('[data-task-id]')).find(function(node){return node.dataset.taskId===id;});deepLinkHandled=true;if(row){row.classList.add('focus-target');row.tabIndex=-1;row.focus();row.scrollIntoView({block:'center'});}else showToast('This task is not in the published To-Do catalogue.',true);}
`
```


### `src/card-data.js`

```js
/**
 * Read-only metadata at the publisher boundary. These fields describe evidence, never
 * decide whether a claim was paid or silently replace a task's original brief.
 */

/** @param {unknown} value @returns {Record<string, any>} */
function record(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {} }
/** @param {unknown} value @param {number} [max] @returns {string|null} */
function text(value, max = 240) {
  return typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : null
}
/** @param {unknown} value */
export function canonicalIdentity(value) {
  const written = text(value, 160)
  return written ? written.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '') || null : null
}
/** @param {unknown} value @returns {number|null} */
function cardId(value) { return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null }
/** @param {unknown} value */
function isoDate(value) {
  const written = text(value, 40)
  if (!written || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(written) || !Number.isFinite(Date.parse(written))) return null
  return new Date(written).toISOString().slice(0, 10) === written.slice(0, 10) ? written : null
}

const MONEY_TYPES = new Set(['invoice_total', 'estimate_total', 'outstanding_balance', 'payment_issued',
  'payment_received', 'contractor_paid', 'claimed_cumulative_payment', 'credit', 'refund'])
const ID_FIELDS = ['claim_id', 'client_id', 'invoice_id']
const SUBJECT_STOP = new Set(['re', 'fw', 'fwd', 'the', 'and', 'for', 'from', 'with', 'your', 'this', 'that',
  'please', 'reply', 'send', 'sent', 'email', 'update', 'follow', 'followup', 'needs', 'need', 'about', 'regarding',
  'task', 'action', 'required', 'request', 'requested'])
/** @param {string} value */
function subjectWords(value) {
  return new Set(value.toLowerCase().match(/[a-z0-9]{3,}/g)?.filter(word => !SUBJECT_STOP.has(word)) || [])
}

/**
 * Normalise only structured publisher facts. All legacy card properties remain with
 * the caller. Issues survive a publish/read round trip because the raw email evidence
 * may intentionally not be stored in the public snapshot.
 * @param {unknown} value
 */
export function curateCardMetadata(value) {
  const source = record(value)
  const brief = record(source.brief)
  const upstreamIdentity = record(source.identity)
  const evidence = record(source.source_context || source.evidence)
  const evidenceIdentity = record(evidence.identity)
  const summaryIdentity = record(brief.identity)
  /** @type {Array<{code:string,message:string}>} */
  const issues = []
  /** @param {string} code @param {string} message */
  const issue = (code, message) => {
    if (!issues.some(entry => entry.code === code && entry.message === message) && issues.length < 40) issues.push({ code, message })
  }
  for (const existing of Array.isArray(source.quality?.issues) ? source.quality.issues.slice(0, 40) : []) {
    const code = text(existing?.code, 80)
    const message = text(existing?.message, 400)
    if (code && message) issue(code, message)
  }

  /** @type {Record<string, string|null>} */
  const identity = {}
  for (const field of ID_FIELDS) {
    const candidates = [upstreamIdentity[field], source[field], evidenceIdentity[field], summaryIdentity[field], brief[field]]
      .map(value => text(value, 160)).filter(value => value !== null)
    identity[field] = candidates[0] || null
    if (new Set(candidates.map(canonicalIdentity)).size > 1) issue(`conflicting_${field}`, `The source and summary contain different ${field.replace('_', ' ')} values. Review the original evidence.`)
  }
  const sourceClient = text(evidence.client, 240)
  const summaryClient = text(brief.client, 240)
  if (sourceClient && summaryClient && canonicalIdentity(sourceClient) !== canonicalIdentity(summaryClient)) {
    issue('client_mismatch', 'The source client and summary client differ. Confirm the identity before acting.')
  }
  const sourceClaim = text(evidence.claim, 160)
  const summaryClaim = text(brief.claim, 160)
  if (sourceClaim && summaryClaim && canonicalIdentity(sourceClaim) !== canonicalIdentity(summaryClaim)) {
    issue('claim_mismatch', 'The source claim and summary claim differ. Confirm the claim number before acting.')
  }
  const subject = text(source.email_subject || source.source_subject || evidence.subject || source.email?.subject, 500)
  const title = text(source.title, 500)
  if (subject && title) {
    const left = subjectWords(subject)
    const right = subjectWords(title)
    if (left.size >= 2 && right.size >= 2 && ![...left].some(word => right.has(word))) {
      issue('title_subject_mismatch', 'The title and source email subject share no identifying words. Review them for a possible summary mismatch.')
    }
  }

  const suppliedResponsibility = record(source.responsibility)
  const suppliedProvenance = record(suppliedResponsibility.provenance)
  const nextPrefix = text(brief.next_step, 500)?.match(/^([A-Za-z][A-Za-z .'-]{0,60}):\s+\S/)
  const hasCardOwner = Object.hasOwn(source, 'assignee') || Object.hasOwn(source, 'owner')
  const ownerFromCard = Object.hasOwn(source, 'assignee') ? text(source.assignee) : text(source.owner)
  const owner = hasCardOwner ? ownerFromCard : text(suppliedResponsibility.owner)
  const nextActor = text(suppliedResponsibility.next_actor) || text(brief.next_actor) || (nextPrefix ? nextPrefix[1].trim() : null)
  const waitingOn = text(suppliedResponsibility.waiting_on) || text(brief.waiting_on)
  const responsibility = {
    owner,
    next_actor: nextActor,
    waiting_on: waitingOn,
    provenance: {
      owner: ownerFromCard ? (text(source.assignee) ? 'card.assignee' : 'card.owner') : owner ? text(suppliedProvenance.owner) || 'publisher.responsibility' : null,
      next_actor: nextActor ? text(suppliedProvenance.next_actor) || (text(suppliedResponsibility.next_actor) ? 'publisher.responsibility' : text(brief.next_actor) ? 'brief.next_actor' : 'brief.next_step_prefix') : null,
      waiting_on: waitingOn ? text(suppliedProvenance.waiting_on) || (text(suppliedResponsibility.waiting_on) ? 'publisher.responsibility' : 'brief.waiting_on') : null,
    },
  }

  /** @type {Array<{amount_minor:number,currency:string,type:string,source:string,date:string|null}>} */
  const financials = []
  const suppliedMoney = source.financials ?? brief.financials
  if (suppliedMoney !== undefined && !Array.isArray(suppliedMoney)) issue('invalid_financials', 'Structured financial evidence must be a list.')
  for (const raw of Array.isArray(suppliedMoney) ? suppliedMoney.slice(0, 30) : []) {
    const entry = record(raw)
    const type = text(entry.type, 60)
    const currency = text(entry.currency, 3)?.toUpperCase()
    const evidenceSource = text(entry.source, 500)
    if (!Number.isSafeInteger(entry.amount_minor) || !type || !MONEY_TYPES.has(type) || !currency || !/^[A-Z]{3}$/.test(currency) || !evidenceSource) {
      issue('invalid_financial_entry', 'A financial entry lacks a valid minor-unit amount, type, currency or evidence source. No total has been inferred.')
      continue
    }
    const date = isoDate(entry.date)
    if (entry.date != null && !date) issue('invalid_financial_date', 'A financial evidence date is invalid and needs review.')
    financials.push({ amount_minor: entry.amount_minor, currency, type, source: evidenceSource, date })
  }

  const rawRelationships = record(source.relationships)
  const ownId = cardId(source.id)
  if (rawRelationships.supersedes != null && !Array.isArray(rawRelationships.supersedes)) issue('invalid_relationship', 'The supersedes relationship must be a list of card references.')
  if (rawRelationships.suggestions != null && !Array.isArray(rawRelationships.suggestions)) issue('invalid_relationship', 'Relationship suggestions must be a list and require review.')
  /** @param {unknown} value */
  const relatedId = value => {
    const id = cardId(value)
    if (value != null && (id === null || id === ownId)) {
      issue('invalid_relationship', 'A relationship has an invalid card reference or points to this same card.')
      return null
    }
    return id
  }
  const supersedes = [...new Set((Array.isArray(rawRelationships.supersedes) ? rawRelationships.supersedes.slice(0, 100) : []).map(relatedId).filter(id => id !== null))]
  const relationships = {
    supersedes,
    superseded_by: relatedId(rawRelationships.superseded_by),
    duplicate_of: relatedId(rawRelationships.duplicate_of),
    suggestions: (Array.isArray(rawRelationships.suggestions) ? rawRelationships.suggestions.slice(0, 30) : []).flatMap(raw => {
      const suggestion = record(raw)
      const id = relatedId(suggestion.card_id)
      const reason = text(suggestion.reason, 400)
      return id && reason && ['duplicate', 'supersedes'].includes(suggestion.type) ? [{ type: String(suggestion.type), card_id: id, reason }] : []
    }),
  }
  if (relationships.superseded_by && supersedes.includes(relationships.superseded_by)) issue('relationship_cycle', 'Two cards cannot supersede each other. Review the relationship history.')
  const evidencePresent = ID_FIELDS.some(field => identity[field]) || Boolean(sourceClient || sourceClaim || subject) || financials.length > 0
  return {
    identity,
    quality: { status: issues.length ? 'review' : evidencePresent ? 'clear' : 'unverified', issues },
    responsibility,
    financials,
    relationships,
  }
}

/**
 * Enrich copies after pending-command overlays so responsibility follows the current
 * owner. Relationship cycles are warnings only, never an instruction to hide history.
 * @param {Array<Record<string, any>>} items
 * @returns {Array<Record<string, any> & ReturnType<typeof curateCardMetadata>>}
 */
export function enrichBoardItems(items) {
  const enriched = items.map(item => /** @type {Record<string, any> & ReturnType<typeof curateCardMetadata>} */ ({ ...item, ...curateCardMetadata(item) }))
  const byId = new Map(enriched.map(item => [item.id, item]))
  /** @type {Map<number,Set<number>>} */
  const links = new Map(enriched.map(item => [item.id, new Set([item.relationships.superseded_by, item.relationships.duplicate_of].filter(id => id !== null))]))
  for (const item of enriched) for (const previous of item.relationships.supersedes) links.get(previous)?.add(item.id)
  for (const item of enriched) {
    const visited = new Set()
    const pending = [...(links.get(item.id) || [])]
    let cycle = false
    while (pending.length) {
      const linked = pending.pop()
      if (linked === item.id) { cycle = true; break }
      if (linked === undefined || visited.has(linked) || !byId.has(linked)) continue
      visited.add(linked)
      pending.push(...(links.get(linked) || []))
    }
    if (cycle) {
      if (!item.quality.issues.some(issue => issue.code === 'relationship_cycle')) item.quality.issues.push({ code: 'relationship_cycle', message: 'The card relationships contain a cycle. Review the history before consolidating.' })
      item.quality.status = 'review'
    }
  }
  return enriched
}
```


### `src/card-ui.js`

```js
// The email carries only a board id. Authentication and the explicit POST confirm intent.
export const CARD_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Aries · Confirm card completion</title>
<style>
:root{font-family:system-ui,sans-serif;color:#17191f;background:#f4f5f7;color-scheme:light}
*{box-sizing:border-box}body{margin:0;padding:24px}main{max-width:620px;margin:6vh auto;background:white;border:1px solid #dfe2e7;border-radius:18px;padding:28px;box-shadow:0 14px 36px #181d2614}
a{color:#1967d2}h1{font-size:25px;line-height:1.3;overflow-wrap:anywhere}.eyebrow{color:#69707d;font-size:14px}p{line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}#state{font-weight:650}#notice{color:#555}button,.back{display:inline-block;padding:12px 18px;border-radius:10px;font:inherit;font-weight:650}button{background:#1967d2;color:white;border:0;cursor:pointer}button:disabled{opacity:.6;cursor:wait}.back{margin:8px 0;text-decoration:none}#refresh{background:#edf3fc;color:#1967d2}#message{min-height:26px}button:focus-visible,a:focus-visible{outline:3px solid #9bbdf5;outline-offset:3px}[hidden]{display:none!important}
</style></head><body><main aria-busy="true" id="card">
<div class="eyebrow">ARIES · OPERATIONS BOARD <span id="number"></span></div>
<h1 id="title">Loading card…</h1><p id="summary" hidden></p><p id="state" aria-live="polite"></p>
<p id="notice">Opening this link does not change the card. Review it, then confirm when the work is finished.</p>
<p id="message" role="status" aria-live="polite"></p>
<button id="confirm" type="button" hidden>Confirm mark done</button>
<button id="refresh" type="button" hidden>Refresh card</button>
<a class="back" href="/">Back to board</a>
</main><script>
(function () {
  'use strict';
  const idText = new URLSearchParams(location.search).get('id') || '';
  const id = /^[1-9][0-9]*$/.test(idText) ? Number(idText) : 0;
  const card = document.querySelector('#card');
  const title = document.querySelector('#title');
  const summary = document.querySelector('#summary');
  const state = document.querySelector('#state');
  const message = document.querySelector('#message');
  const confirm = document.querySelector('#confirm');
  const refresh = document.querySelector('#refresh');
  let revision = null;
  let saving = false;
  let generation = 0;
  function render(data) {
    title.textContent = data.item.title;
    document.querySelector('#number').textContent = '#' + data.item.id;
    summary.textContent = data.item.summary || '';
    summary.hidden = !data.item.summary;
    revision = data.revision || null;
    state.textContent = data.state === 'done' ? 'Done' : data.state === 'deleted' ? 'Removed' : 'Open';
    confirm.hidden = data.state !== 'open';
    confirm.disabled = false;
    refresh.hidden = false;
    if (data.state === 'done') message.textContent = 'This card is already marked done.';
    else if (data.state === 'deleted') message.textContent = 'This card was removed. Nothing was changed.';
  }
  async function readResponse(response) {
    const type = response.headers.get('content-type') || '';
    if (response.redirected || !type.includes('application/json')) throw new Error('Your sign-in may have expired. Reload this page to sign in again; nothing was changed by opening the link.');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Card request failed (' + response.status + ').');
    return data;
  }
  async function load() {
    const current = ++generation;
    confirm.hidden = true;
    refresh.hidden = true;
    revision = null;
    card.setAttribute('aria-busy', 'true');
    message.textContent = '';
    try {
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error('This card link is invalid. Open the board to find the right card.');
      const response = await fetch('/api/card?id=' + id, {credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
      const data = await readResponse(response);
      if (current === generation) render(data);
    } catch (error) {
      if (current !== generation) return;
      title.textContent = 'Card unavailable';
      state.textContent = '';
      message.textContent = error.message || 'Could not load this card. Try again.';
      refresh.hidden = false;
    } finally { if (current === generation) card.setAttribute('aria-busy', 'false'); }
  }
  confirm.addEventListener('click', async function () {
    if (saving || !revision) return;
    saving = true;
    confirm.disabled = true;
    refresh.disabled = true;
    message.textContent = 'Saving…';
    try {
      const response = await fetch('/api/card/done', {method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({id:id,revision:revision})});
      const data = await readResponse(response);
      render(data);
      message.textContent = data.existing ? 'This card is already marked done.' : 'Marked done on the board. Saved for Aries to sync.';
    } catch (error) {
      // A lost response may have saved successfully. Re-read before offering another POST.
      confirm.hidden = true;
      revision = null;
      message.textContent = (error.message || 'Could not confirm the result.') + ' Refresh the card to check its current state.';
      refresh.hidden = false;
    } finally { saving = false; confirm.disabled = false; refresh.disabled = false; }
  });
  refresh.addEventListener('click', load);
  // Back/Forward must check current state rather than revive a cached confirmation.
  window.addEventListener('pageshow', function (event) { if (event.persisted) load(); });
  load();
}());
</script></body></html>`
```


### `src/claim-groups.js`

```js
// Frank, 10/04/2026: "the same customer / claim is currently being assigned several cards.
// consolidate the cards and list all open tasks for that claim under the same card."
// Aries opens a card per email thread, so one claim collects a card for every thread about
// it. The board groups open cards by the client and the claim or invoice number in the brief
// Aries writes for each card. Grouping is only a view: every card keeps its own id, owner and
// actions, and nothing here changes what Aries published.

/** @typedef {{tokens: string[], first: string, last: string}} Person */
/** @typedef {{people: Person[], org: string, rollup: boolean}} Client */
import { canonicalIdentity, curateCardMetadata } from './card-data.js'

/** @typedef {{key: string, label: string, reason:string, reasons:string[], conflicts:Array<{card_id:number,field:string,message:string}>}} ClaimGroup */

// Never a client: us, the carriers, Aries' own placeholders. A card "for USAA" is about many
// claims at once, and grouping on it would pile unrelated claims into one card.
const NOT_A_CLIENT = new Set([
  'flood doctor', 'restoration doctor', 'va water damage', 'va water damage llc', 'galaxy construction',
  'usaa', 'allstate', 'travelers', 'state farm', 'chubb', 'erie', 'liberty mutual', 'nationwide',
  'sedgwick', 'frontline', 'auto owners', 'stripe', 'internal', 'unknown', 'unidentified matter',
  'multiple clients', 'various', 'none', 'n a', 'tbd',
])
const ORG_WORDS = /\b(condominium|condo|association|hoa|llc|inc|corp|corporation|company|insurance|law|office|group|management|properties|apartments|church|school|bank)\b/
const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'commander', 'cdr', 'capt', 'captain', 'col', 'colonel', 'lt', 'sgt', 'rev', 'hon', 'jr', 'sr', 'ii', 'iii'])
const NICKNAMES = new Map([
  ['tom', 'thomas'], ['tommy', 'thomas'], ['mike', 'michael'], ['bob', 'robert'], ['bobby', 'robert'],
  ['rob', 'robert'], ['bill', 'william'], ['will', 'william'], ['jim', 'james'], ['jen', 'jennifer'],
  ['jenny', 'jennifer'], ['liz', 'elizabeth'], ['beth', 'elizabeth'], ['dave', 'david'], ['dan', 'daniel'],
  ['steve', 'steven'], ['kate', 'katherine'], ['katie', 'katherine'], ['sue', 'susan'], ['joe', 'joseph'],
  ['nick', 'nicholas'], ['matt', 'matthew'], ['tony', 'anthony'], ['andy', 'andrew'], ['rick', 'richard'],
  ['ben', 'benjamin'], ['sam', 'samuel'], ['pat', 'patrick'], ['chuck', 'charles'], ['charlie', 'charles'],
  ['ed', 'edward'], ['greg', 'gregory'], ['jeff', 'jeffrey'], ['jon', 'jonathan'], ['annie', 'anne'],
])

/** @param {string} first */
function canonicalFirst(first) {
  return NICKNAMES.get(first) || first
}

/**
 * Two first names that can be the same person: equal, a nickname, an initial, or one the
 * start of the other ("chris" and "christopher").
 * @param {string} left
 * @param {string} right
 */
function sameFirst(left, right) {
  const a = canonicalFirst(left)
  const b = canonicalFirst(right)
  if (a === b) return true
  if (a.length === 1 || b.length === 1) return a[0] === b[0]
  return Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a))
}

/** @param {string} text */
function plain(text) {
  return text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/**
 * One name as written, "Robert Badgett" or "Badgett, Robert" or "West-Crews".
 * @param {string} raw
 * @returns {Person|null}
 */
function person(raw) {
  const words = raw.replace(/['’.]/g, '').split(/\s+/).filter((word) => word && !TITLES.has(word))
  if (!words.length) return null
  if (words.length === 1) {
    // A surname alone. A hyphenated one keeps both halves so it can match "Aidan West Crews".
    const tokens = words[0].split('-').filter(Boolean)
    return tokens.length && tokens.join('').length >= 2 ? { tokens, first: '', last: tokens[tokens.length - 1] } : null
  }
  const tokens = words.flatMap((word) => word.split('-')).filter(Boolean)
  const last = tokens[tokens.length - 1]
  // "Adrian W": an initial cannot anchor a surname match.
  if (last.length < 2) return null
  return { tokens, first: tokens[0], last }
}

/**
 * The people a brief's client line names. More than two means a roll-up card ("Mechanic's
 * liens recorded: Gray + 7 VA files"), which must not pull every one of those claims together.
 * @param {unknown} value
 * @param {Set<string>} staff
 * @returns {Client|null}
 */
export function parseClient(value, staff = new Set()) {
  if (typeof value !== 'string') return null
  const text = plain(value).replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text || /\d/.test(text)) return null
  const flat = text.replace(/[^a-z]+/g, ' ').trim()
  if (!flat || NOT_A_CLIENT.has(flat) || staff.has(flat)) return null
  if (ORG_WORDS.test(flat)) return { people: [], org: flat, rollup: false }

  /** @type {string[]} */
  const parts = []
  for (const chunk of text.split(/\s*(?:&|\+|\/|;|\band\b)\s*/)) {
    if (!chunk) continue
    const pieces = chunk.split(/\s*,\s*/).filter(Boolean)
    // "Pickering, Linda" is one person written surname first; "Gray, Morera, Musser" is three.
    if (pieces.length === 2 && !pieces[0].includes(' ') && pieces[1].split(' ').length <= 2) {
      parts.push(`${pieces[1]} ${pieces[0]}`)
    } else {
      parts.push(...pieces)
    }
  }
  /** @type {Person[]} */
  let people = parts.map(person).filter((entry) => entry !== null)
  // "Robert and Elizabeth Badgett": a lone first name takes the surname that closes the list.
  const closing = people[people.length - 1]
  if (people.length > 1 && closing && closing.first) {
    people = people.map((entry) => entry.first || entry === closing ? entry : {
      tokens: [...entry.tokens, closing.last], first: entry.tokens[0], last: closing.last,
    })
  }
  people = people.filter((entry) => entry.first || !staff.has(entry.tokens.join(' ')))
  if (!people.length) return null
  return { people, org: '', rollup: people.length > 2 }
}

/**
 * The claim and invoice numbers in a brief's claim line, as bare digits and letters, so
 * "USAA 021792489-801" and "021792489801" agree. Short ones are left out: four digits are
 * as likely a street number as a claim.
 * @param {unknown} value
 * @returns {string[]}
 */
export function claimNumbers(value) {
  if (typeof value !== 'string') return []
  const found = plain(value).match(/[a-z0-9_-]*\d[a-z0-9_-]*/g) || []
  return [...new Set(found
    .map((token) => token.replace(/[^a-z0-9]/g, ''))
    .filter((token) => token.length >= 5 && (token.match(/\d/g) || []).length >= 4))]
}

/** @param {Person} whole @param {Person} tail */
function endsWith(whole, tail) {
  if (tail.tokens.length > whole.tokens.length) return false
  const offset = whole.tokens.length - tail.tokens.length
  return tail.tokens.every((token, index) => whole.tokens[offset + index] === token)
}

/**
 * Groups open cards that belong to the same claim. Returns a group for every card that shares
 * its claim with at least one other open card; a card alone on its claim gets none.
 * @param {Array<Record<string, any>>} items
 * @param {{staff?: Iterable<string>}} [options]
 * @returns {Map<number, ClaimGroup>}
 */
export function claimGroups(items, options = {}) {
  return claimGroupDetails(items, options).groups
}

/**
 * Exposes attempted grouping conflicts even for cards left on their own. A name match
 * cannot bridge two different explicit identities through a third, unidentified card.
 * @param {Array<Record<string, any>>} items
 * @param {{staff?: Iterable<string>}} [options]
 */
export function claimGroupDetails(items, options = {}) {
  const staff = new Set([...(options.staff || [])].map((name) => plain(String(name)).trim()).filter(Boolean))
  const open = items.filter((item) => item && item.status !== 'done' && Number.isSafeInteger(item.id)).sort((a, b) => a.id - b.id)
  const metadata = new Map(open.map(item => [item.id, curateCardMetadata(item)]))
  const components = new Map(open.map(item => [item.id, {
    ids: new Map(['claim_id', 'client_id', 'invoice_id'].map(field => {
      const id = canonicalIdentity(metadata.get(item.id)?.identity[field])
      return [field, new Set(id ? [id] : [])]
    })),
    contradictory: Boolean(metadata.get(item.id)?.quality.issues.some(issue => issue.code.startsWith('conflicting_'))),
  }]))
  /** @type {Map<number, Array<{card_id:number,field:string,message:string}>>} */
  const conflicts = new Map()
  /** @type {Map<number, Set<string>>} */
  const reasons = new Map(open.map(item => [item.id, new Set()]))
  /** @type {Map<number, number>} */
  const parent = new Map(open.map((item) => [item.id, item.id]))
  /** @param {number} id @returns {number} */
  const find = (id) => {
    let root = id
    while (parent.get(root) !== root) root = /** @type {number} */ (parent.get(root))
    parent.set(id, root)
    return root
  }
  /** @param {number} root @param {string} field */
  const values = (root, field) => components.get(root)?.ids.get(field) || new Set()
  /** @param {number} left @param {number} right @param {string} reason */
  const join = (left, right, reason) => {
    const a = find(left)
    const b = find(right)
    if (a === b) return
    for (const field of ['claim_id', 'client_id', 'invoice_id']) {
      // Multiple invoices can legitimately belong to one explicit claim.
      if (field === 'invoice_id' && [...values(a, 'claim_id')].some(id => values(b, 'claim_id').has(id))) continue
      const av = values(a, field)
      const bv = values(b, field)
      if (av.size && bv.size && new Set([...av, ...bv]).size > 1) {
        for (const [id, other] of [[left, right], [right, left]]) {
          const entries = conflicts.get(id) || []
          if (!entries.some(entry => entry.card_id === other && entry.field === field)) entries.push({ card_id: other, field, message: `Not grouped: conflicting ${field.replace('_', ' ')} values.` })
          conflicts.set(id, entries)
        }
        return
      }
    }
    // A contradictory card must not spread its uncertain identity into another group.
    if (components.get(a)?.contradictory || components.get(b)?.contradictory) return
    const kept = Math.min(a, b)
    const removed = Math.max(a, b)
    for (const field of ['claim_id', 'client_id', 'invoice_id']) for (const id of values(removed, field)) values(kept, field).add(id)
    parent.set(removed, kept)
    reasons.get(left)?.add(reason)
    reasons.get(right)?.add(reason)
  }

  /** @type {Map<number, Client|null>} */
  const clients = new Map()
  /** @type {Map<string, number[]>} */
  const byNumber = new Map()
  /** @type {Map<string, number[]>} */
  const byOrg = new Map()
  /** @type {Map<string, Array<{id: number, who: Person}>>} */
  const named = new Map()
  /** @type {Array<{id: number, who: Person}>} */
  const surnameOnly = []
  /** @type {Map<string, number[]>} */
  const byIdentity = new Map()

  for (const item of open) {
    const brief = item.brief && typeof item.brief === 'object' ? item.brief : {}
    for (const field of ['claim_id', 'invoice_id', 'client_id']) {
      const id = canonicalIdentity(metadata.get(item.id)?.identity[field])
      if (id) byIdentity.set(`${field}:${id}`, [...(byIdentity.get(`${field}:${id}`) || []), item.id])
    }
    for (const number of claimNumbers(brief.claim)) {
      byNumber.set(number, [...(byNumber.get(number) || []), item.id])
    }
    const client = parseClient(brief.client, staff)
    clients.set(item.id, client)
    if (!client || client.rollup) continue
    if (client.org) byOrg.set(client.org, [...(byOrg.get(client.org) || []), item.id])
    for (const who of client.people) {
      if (who.first) named.set(who.last, [...(named.get(who.last) || []), { id: item.id, who }])
      else surnameOnly.push({ id: item.id, who })
    }
  }

  for (const [identity, ids] of byIdentity) {
    for (let i = 0; i < ids.length; i += 1) for (const id of ids.slice(i + 1)) join(ids[i], id, `Matching explicit ${identity.split(':')[0].replace('_', ' ')}`)
  }
  for (const ids of byNumber.values()) {
    for (let i = 0; i < ids.length; i += 1) for (const id of ids.slice(i + 1)) join(ids[i], id, 'Matching claim or invoice number in the brief')
  }
  for (const ids of byOrg.values()) {
    for (let i = 0; i < ids.length; i += 1) for (const id of ids.slice(i + 1)) join(ids[i], id, 'Matching organisation name, identity not confirmed')
  }
  for (const entries of named.values()) {
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        if (sameFirst(entries[i].who.first, entries[j].who.first)) join(entries[i].id, entries[j].id, 'Matching client name, identity not confirmed')
      }
    }
  }
  // A surname alone joins the full names it ends, but only when they are all one person.
  // "Brown" next to Naa Brown and Sarah Brown could be either, so it stays on its own.
  /** @type {Map<string, number[]>} */
  const loneSurnames = new Map()
  for (const { id, who } of surnameOnly) {
    const matches = (named.get(who.last) || []).filter((entry) => endsWith(entry.who, who))
    const onePerson = matches.every((left) => matches.every((right) => sameFirst(left.who.first, right.who.first)))
    if (!onePerson) continue
    for (const match of matches) join(id, match.id, 'Unambiguous client surname, identity not confirmed')
    const key = who.tokens.join(' ')
    loneSurnames.set(key, [...(loneSurnames.get(key) || []), id])
  }
  for (const ids of loneSurnames.values()) {
    for (let i = 0; i < ids.length; i += 1) for (const id of ids.slice(i + 1)) join(ids[i], id, 'Matching client surname, identity not confirmed')
  }

  /** @type {Map<number, Array<Record<string, any>>>} */
  const members = new Map()
  for (const item of open) {
    const root = find(item.id)
    members.set(root, [...(members.get(root) || []), item])
  }
  /** @type {Map<number, ClaimGroup>} */
  const groups = new Map()
  for (const [root, group] of members) {
    if (group.length < 2) continue
    let key = ''
    for (const field of ['claim_id', 'invoice_id', 'client_id']) {
      const ids = values(root, field)
      if (ids.size === 1) { key = `${field}:${[...ids][0]}`; break }
    }
    if (!key) {
      const numbers = [...new Set(group.flatMap(item => claimNumbers(item.brief?.claim)))].sort()
      const names = group.flatMap(item => {
        const client = clients.get(item.id)
        return client?.org ? [client.org] : (client?.people || []).map(who => `${who.last}:${canonicalFirst(who.first)}`)
      }).sort()
      key = numbers.length ? `claim-number:${numbers[0]}` : names.length ? `client-name:${names[0]}` : `claim-${root}`
    }
    const groupReasons = [...new Set(group.flatMap(item => [...(reasons.get(item.id) || [])]))]
    const entry = { key, label: groupLabel(group, clients), reason: groupReasons[0] || 'Shared identity', reasons: groupReasons,
      conflicts: group.flatMap(item => conflicts.get(item.id) || []) }
    for (const item of group) groups.set(item.id, entry)
  }
  return { groups, conflicts }
}

/**
 * The name on the claim card: the client line most cards use, then the one naming the most
 * people, then the shortest. A claim held together only by its number is called by it.
 * @param {Array<Record<string, any>>} group
 * @param {Map<number, Client|null>} clients
 */
function groupLabel(group, clients) {
  /** @type {Map<string, {count: number, people: number}>} */
  const names = new Map()
  for (const item of group) {
    const client = clients.get(item.id)
    if (!client || client.rollup) continue
    const written = String(item.brief.client).replace(/\s+/g, ' ').trim()
    const seen = names.get(written) || { count: 0, people: client.people.filter((who) => who.first).length }
    seen.count += 1
    names.set(written, seen)
  }
  const ranked = [...names.entries()].sort((left, right) =>
    (right[1].count - left[1].count) || (right[1].people - left[1].people) || (left[0].length - right[0].length))
  if (ranked.length) return ranked[0][0]
  const claim = group.map((item) => item.brief && item.brief.claim).find((value) => typeof value === 'string' && value.trim())
  if (!claim) return 'Same claim'
  return /^(invoice|claim)\b/i.test(claim.trim()) ? claim.trim() : `Claim ${claim.trim()}`
}
```


### `src/command-queue.js`

```js
// Durable delivery metadata complements the existing command ID and terminal state.
// Legacy GET consumers report receipt. POST consumers additionally use a fenced lease.
const MAX_ATTEMPTS = 5
const LEASE_SECONDS = 300

/** @param {any} row @param {number} [now] */
export function commandReceipt(row, now = Date.now()) {
  const expired = row.state === 'queued' && row.lease_expires_at && Date.parse(row.lease_expires_at) <= now
  const state = expired ? 'failed' : row.state !== 'queued' ? row.state : row.lease_token ? 'processing' : row.received_at ? 'received' : 'queued'
  const age = Math.max(0, now - Date.parse(row.created_at))
  return { id: row.id, item_id: row.item_id, operation: row.operation, state,
    created_at: row.created_at, received_at: row.received_at || null, acked_at: row.acked_at || null,
    attempts: row.attempts || 0, lease_expires_at: row.lease_expires_at || null,
    next_attempt_at: row.next_attempt_at || null,
    error_code: expired ? 'lease_expired' : row.error_code || null,
    detail: expired ? 'Processing lease expired. Check the source before retrying.' : row.ack_detail || null,
    stuck: ['queued', 'received', 'processing'].includes(state) && age > LEASE_SECONDS * 1000,
    dead_letter: state === 'failed', retry_allowed: state === 'failed' && (row.attempts || 0) < MAX_ATTEMPTS }
}

/** @param {D1Database} db @param {string} [now] */
export async function expireLeases(db, now = new Date().toISOString()) {
  // Timeout is terminal, not an automatic replay of a potentially external side effect.
  await db.prepare(`UPDATE command_queue SET state = 'failed', error_code = 'lease_expired',
    ack_detail = 'Processing lease expired. Check the source before retrying.', acked_at = ?
    WHERE state = 'queued' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?`).bind(now, now).run()
}

/** @param {D1Database} db */
export async function commandReceipts(db) {
  await expireLeases(db)
  const rows = await db.prepare(`SELECT * FROM command_queue ORDER BY id DESC LIMIT 1000`).all()
  return rows.results.map(row => commandReceipt(row))
}

/** @param {D1Database} db @param {number} limit */
export async function receiveCommands(db, limit) {
  await expireLeases(db)
  const now = new Date().toISOString()
  const expires = new Date(Date.now() + LEASE_SECONDS * 1000).toISOString()
  const rows = await db.prepare(`UPDATE command_queue SET received_at = ?, lease_expires_at = ?, attempts = attempts + 1
    WHERE id IN (SELECT id FROM command_queue WHERE state = 'queued' AND lease_token IS NULL
      AND received_at IS NULL AND attempts < ? AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
      ORDER BY id ASC LIMIT ?) AND state = 'queued' AND received_at IS NULL RETURNING *`
  ).bind(now, expires, MAX_ATTEMPTS, now, limit).all()
  return rows.results.map(row => ({ id: row.id, operation: row.operation, item_id: row.item_id,
    note: row.note, value: row.value, actor_email: row.actor_email, created_at: row.created_at }))
}

/** @param {D1Database} db @param {number} limit @param {number} seconds */
export async function claimCommands(db, limit, seconds = LEASE_SECONDS) {
  await expireLeases(db)
  const now = new Date().toISOString(), expires = new Date(Date.now() + seconds * 1000).toISOString()
  const token = crypto.randomUUID()
  // Selection and update are a single SQLite statement. Concurrent workers cannot claim the same row.
  const rows = await db.prepare(`UPDATE command_queue SET lease_token = ?, lease_expires_at = ?,
    received_at = ?, attempts = attempts + 1
    WHERE id IN (SELECT id FROM command_queue WHERE state = 'queued' AND lease_token IS NULL
      AND received_at IS NULL AND attempts < ? AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
      ORDER BY id ASC LIMIT ?) AND state = 'queued' AND lease_token IS NULL RETURNING *`
  ).bind(token, expires, now, MAX_ATTEMPTS, now, limit).all()
  return rows.results.map(row => ({ id: row.id, operation: row.operation, item_id: row.item_id,
    note: row.note, value: row.value, actor_email: row.actor_email, created_at: row.created_at,
    lease_token: token, lease_expires_at: expires, attempt: row.attempts, idempotency_key: 'command-' + row.id }))
}

/** @param {D1Database} db @param {number} id @param {string} status @param {string|null} detail @param {unknown} token */
export async function acknowledgeDelivery(db, id, status, detail, token) {
  await expireLeases(db)
  const row = await db.prepare('SELECT * FROM command_queue WHERE id = ?').bind(id).first()
  if (!row || row.state !== 'queued') return { error: 'Command not found', status: 404 }
  if (row.lease_token && row.lease_token !== token) return { error: 'Processing lease does not match', status: 409 }
  const now = new Date().toISOString()
  const retryAt = status === 'failed' ? new Date(Date.now() + Math.min(3600, 30 * 2 ** Math.max(0, Number(row.attempts || 1) - 1)) * 1000).toISOString() : null
  const result = await db.prepare(`UPDATE command_queue SET state = ?, ack_detail = ?, acked_at = ?,
    error_code = ?, next_attempt_at = ? WHERE id = ? AND state = 'queued'
    AND (lease_token IS NULL OR lease_token = ?)`).bind(status, detail, now, status === 'failed' ? 'consumer_failed' : null, retryAt, id, token || null).run()
  if (result.meta.changes !== 1) return { error: 'Command changed before acknowledgement', status: 409 }
  return { ok: true, id, status, acked_at: now }
}

/** @param {D1Database} db @param {number} id */
export async function retryCommand(db, id) {
  await expireLeases(db)
  const row = await db.prepare('SELECT * FROM command_queue WHERE id = ?').bind(id).first()
  if (!row) return { error: 'Command not found', status: 404 }
  if (row.state !== 'failed') return { error: 'Only failed commands can be retried', status: 409 }
  if (Number(row.attempts || 0) >= MAX_ATTEMPTS) return { error: 'Retry limit reached. Resolve this command at its source.', status: 409 }
  const now = new Date().toISOString()
  if (row.next_attempt_at && String(row.next_attempt_at) > now) return { error: 'Retry is backing off', status: 429, next_attempt_at: row.next_attempt_at }
  const result = await db.prepare(`UPDATE command_queue SET state = 'queued', received_at = NULL,
    lease_token = NULL, lease_expires_at = NULL, error_code = NULL, acked_at = NULL, ack_detail = NULL,
    next_attempt_at = NULL WHERE id = ? AND state = 'failed' AND attempts < ?`).bind(id, MAX_ATTEMPTS).run()
  if (result.meta.changes !== 1) return { error: 'Command changed before retry', status: 409 }
  return { ok: true, receipt: commandReceipt({ ...row, state: 'queued', received_at: null, lease_token: null,
    lease_expires_at: null, error_code: null, acked_at: null, ack_detail: null, next_attempt_at: null }) }
}
```


### `src/env.d.ts`

```ts
// Optional deployed settings extend the generated template bindings.
interface Env {
  ALLOWED_EMAIL_DOMAINS?: string
  ACTIVITY_OWNER_EMAILS?: string
  MISSION_TOKEN?: string
}
```


### `src/index.js`

```js
import { APP_HTML } from './ui.js'
import { CARD_HTML } from './card-ui.js'
import { missionRequest, checkServices } from './mission.js'
import { claimGroupDetails } from './claim-groups.js'
import { curateCardMetadata, enrichBoardItems } from './card-data.js'
import { commandReceipt, commandReceipts, receiveCommands, claimCommands, acknowledgeDelivery, retryCommand } from './command-queue.js'

/**
 * @typedef {object} BoardItem
 * @property {number} id
 * @property {string} title
 * @property {string} [summary]
 * @property {string} [assignee]
 * @property {number|string} [priority]
 * @property {string} [status]
 * @property {string} [due]
 * @property {string} [kind]
 * @property {string} [note]
 * @property {string} [updated]
 */
/** @typedef {{items: BoardItem[]}} BoardSnapshot */
/** @typedef {{snapshot_json: string, published_at: string}} SnapshotRow */
/** @typedef {Record<string, unknown>} JsonObject */
/** @typedef {{items: JsonObject[]}} TodoCatalogue */
/** @typedef {{catalogue_json: string, published_at: string}} TodoCatalogueRow */
/** @typedef {{id: number, operation: string, item_id: number, actor_email: string, created_at: string, state: string, acked_at: string|null}} CompletionCommand */
/** @typedef {{key: string, name: string, email: string, past_emails: string[]}} TeamMember */

const UI_HOST = 'aries.flood.doctor'
const SYNC_HOST = 'aries-publish.flood.doctor'
const UI_PATHS = new Set(['/', '/card', '/api/card', '/api/card/done', '/api/board', '/api/action', '/api/todos', '/api/todo/action', '/api/worklist', '/api/thread'])
// Served only to ACTIVITY_OWNER_EMAILS; every other identity gets the same 404 as a path
// that does not exist, so staff never learn the log is there.
const ACTIVITY_PATHS = new Set(['/activity', '/api/activity'])
// The User settings tab reads and writes the roster here, under the same owner-only rule.
const TEAM_PATH = '/api/team'
const ACTIVITY_LIMIT = 1000
// More than this many of one action by one person inside the window is flagged as a burst.
const BURST_COUNT = 20
const BURST_WINDOW_MS = 10 * 60 * 1000
const SYNC_PATH = /^\/api\/sync\/(?:snapshot|worklist|threads|team|commands(?:\/\d+\/ack)?|todos\/(?:catalogue|operations|state))$/
const MAX_ITEMS = 1000
const MAX_SNAPSHOT_BYTES = 1_800_000
const MAX_TODO_BYTES = 1_800_000
const MAX_OPERATION_BATCH = 100
const MAX_OPERATION_BYTES = 512_000
const TASK_ID_PATTERN = /^task-[0-9a-f]{14}$/
const EVENT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/
const TODO_STRING_LIMITS = Object.freeze({
  text: 1000,
  details: 4000,
  client: 240,
  actionType: 120,
  notificationDate: 80,
  date: 80,
  due: 80,
  sourceUrl: 2048,
  sourceMessageId: 240,
  sourceAccount: 240,
  assignee: 160,
  who: 160,
  section: 160,
})
const TODO_EDIT_FIELDS = new Set([...Object.keys(TODO_STRING_LIMITS), 'sourceRevision', 'upstreamIds'])
const TODO_OPERATIONS = new Set(['toggle', 'assign', 'add', 'edit', 'attach', 'detach', 'snooze', 'archive', 'delete'])
const TODO_SNAPSHOT_FIELDS = new Set([
  'id', 'text', 'details', 'client', 'actionType', 'notificationDate', 'sourceUrl',
  'due', 'assignee', 'attachments', 'sourceRevision', 'historyVisible',
])
// The people on the board. Frank, 09/29/2026: "if i want to change mark's name to Mike, I dont
// have a way to do that right now. If mark changes his email address, I want to be able to
// update it." They live in D1 (team_users, migration 0007) and Frank edits them on the User
// settings tab. A person's key is what cards are assigned to and never changes, so renaming
// Mark keeps every card he owns. This list is only the fallback while the table is empty.
const DEFAULT_TEAM = Object.freeze([
  { key: 'frank', name: 'Frank', email: 'frankd@flooddoctorva.com' },
  { key: 'mark', name: 'Mark', email: 'mark@flood.doctor' },
  { key: 'steve', name: 'Steve', email: 'steve@restorationdoctors.com' },
  { key: 'shayan', name: 'Shayan', email: 'shyon@restorationdoctors.com' },
  { key: 'katherine', name: 'Katherine', email: 'katherine@restorationdoctors.com' },
])
// Aries only emails company addresses, and Access only signs in these three domains, so a
// person's address has to be on one of them.
const TEAM_DOMAINS = Object.freeze(['flood.doctor', 'flooddoctorva.com', 'restorationdoctors.com'])
// Keys a new person never gets: Aries itself, and mailboxes Aries already knows by these names
// (team.json on Aries keys Shayan as "shyon").
const RESERVED_KEYS = Object.freeze(['aries', 'shyon', 'office', 'admin', 'info', 'billing', 'personal'])
const TEAM_KEY = /^[a-z][a-z0-9]{1,23}$/
const TEAM_EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/
const TEAM_NAME = /^\p{L}[\p{L}\p{M} .'-]*$/u
const TEAM_NAME_LIMIT = 40
const TEAM_EMAIL_LIMIT = 120
const MAX_TEAM = 30
const MAX_PAST_EMAILS = 10
// Frank signs in with an address that is not his company one.
const SIGN_IN_ALIASES = Object.freeze({ 'darakhshan.farough@gmail.com': 'frank' })
// Who may change the To-Do list, by key, so a changed email keeps working.
const TODO_ACTOR_KEYS = Object.freeze(['frank', 'mark'])
// Mailboxes that show up in card history but are not people on the roster.
const OTHER_NAMES = Object.freeze({
  'aries@flood.doctor': 'Aries',
  'info@restorationdoctors.com': 'Office',
  'dave@flooddoctorva.com': 'Dave',
})
const STRING_LIMITS = Object.freeze({
  title: 240,
  summary: 2000,
  assignee: 120,
  status: 80,
  due: 80,
  kind: 80,
  note: 2000,
  updated: 120,
  // The Gmail permalink for the message a row came from. Read-only: the UI opens it,
  // the worker never fetches it.
  source_url: 2048,
  snoozed_until: 80,
  // The day the card was opened (YYYY-MM-DD), so a card can say how long it has been waiting.
  created: 40,
  // When someone marked the card urgent (ISO time); absent when it is not urgent.
  urgent: 40,
})
// The per-card brief Aries writes from the card's email thread (bin/card-brief.py): what the
// task needs, who is waiting, what to do next. Frank, 09/29/2026: "I never know what each task
// needs or who was last to work on that task or what I should do about it." The shape is frozen
// in docs/requirements-2026-09-29-better-cards.md; Aries validates the same limits before it
// publishes.
const BRIEF_STRING_LIMITS = Object.freeze({
  // A short title Aries writes from the thread ("Malik: Travelers final determination, $40,859"),
  // because a third of the cards were titled with a raw email subject. Optional: '' until the
  // card's brief is next written, and the board cleans the subject meanwhile.
  title: 100,
  needs: 400,
  next_step: 300,
  waiting_on: 160,
  client: 160,
  claim: 80,
  amount: 40,
  deadline_note: 160,
  phone: 40,
})
const BRIEF_ACTIONS = Object.freeze(['reply', 'call', 'invoice', 'payment', 'review', 'decide', 'wait', 'file', 'close'])
// A brief's owner_hint is a roster key or '' (checked against the roster when it is curated).
const DEFAULT_BRIEF_OWNERS = new Set([...DEFAULT_TEAM.map((member) => member.key), ''])
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
// What Aries is doing on a card, from bin/assign_notify.py and the owner-task queue: the prep
// for its owner (`prep`), or the card itself when Aries owns it (`aries_task`).
const TASK_STATES = Object.freeze(['queued', 'running', 'ready', 'failed', 'timed_out', 'interrupted', 'cancelled'])
// The same, as the To-Do catalogue carries it for a task made from a card.
const TODO_ARIES_PREP = Object.freeze(['queued', 'running', 'ready', 'failed'])
const HISTORY_DAYS = 120
const HISTORY_PER_CARD = 10
const MAX_NOTES = 20
// `useful` / `not_useful` are the thumbs on a card. They change nothing about the task; they
// are how the team tells Aries whether an email of that shape should have become a card at
// all, so the next inbox sweep stops repeating a mistake. Neither takes an argument -- the
// card already identifies the sender, and the sender is what gets learned.
// `nudge` asks the card's owner for an update: Aries emails them and copies whoever asked.
// Its value is the owner's name at the time, which is what the card history shows.
// `prep` keeps the card with its teammate and has Aries do the prep work for them (Frank,
// 09/29/2026: "assign a task to a teamate, and also assign it to aries so that aries can do some
// prep work for that teamate"). Its value is the teammate the prep is for; migration 0008.
// `urgent` ('on' or 'off') flags a card: it goes to the top and Aries emails whoever must act
// (Frank, 09/29/2026: "it appears at the top and it nudges the teamates that must do something
// asap"). Migration 0008 too.
const BOARD_OPERATIONS = Object.freeze([
  'done', 'reopen', 'note', 'assign', 'snooze', 'reorder', 'delete', 'useful', 'not_useful', 'nudge', 'prep',
  'urgent',
])
const MAX_WORKLIST_ITEMS = 1000
const MAX_THREADS = 60
const MAX_THREAD_MESSAGES = 20
const THREAD_STRING_LIMITS = Object.freeze({ from: 300, to: 300, date: 300, subject: 300, body: 4000 })
const WORKLIST_STRING_LIMITS = Object.freeze({
  text: 2000,
  who: 160,
  due: 80,
  section: 160,
})

/**
 * @param {unknown} body
 * @param {number} [status]
 * @param {Record<string, string>} [headers]
 * @returns {Response}
 */
function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      ...headers,
    },
  })
}

function notFound() {
  return new Response('Not found', {
    status: 404,
    headers: { 'cache-control': 'no-store' },
  })
}

function appHtml(html = APP_HTML) {
  return new Response(html, {
    status: 200,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
    },
  })
}

function forbidden() {
  return json({ error: 'Forbidden' }, 403)
}

function unauthorized() {
  return json({ error: 'Unauthorized' }, 401, {
    'www-authenticate': 'Bearer',
  })
}

/** @param {string} message */
function badRequest(message) {
  return json({ error: message }, 400)
}

/** @param {string} allowed */
function methodNotAllowed(allowed) {
  return json({ error: 'Method not allowed' }, 405, { allow: allowed })
}

function unsupportedMediaType() {
  return json({ error: 'Content-Type must be application/json' }, 415)
}

/** @param {string} [message] */
function missing(message = 'Not found') {
  return json({ error: message }, 404)
}

/**
 * @param {Request} request
 * @param {Env} env
 * @returns {string|null}
 */
function allowedEmail(request, env) {
  const email = request.headers.get('Cf-Access-Authenticated-User-Email')
  if (!email) return null
  // Staff are admitted by company domain; ALLOWED_EMAILS remains for individuals outside
  // one (Frank's own gmail). Access is the gate that proves the identity — this is the
  // worker's independent second check, so it must accept exactly the same population.
  const domains = typeof env.ALLOWED_EMAIL_DOMAINS === 'string'
    ? env.ALLOWED_EMAIL_DOMAINS.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)
    : []
  if (domains.length) {
    const at = email.lastIndexOf('@')
    const domain = at === -1 ? '' : email.slice(at + 1).toLowerCase()
    if (domain && domains.includes(domain)) return email
  }
  if (typeof env.ALLOWED_EMAILS !== 'string') return null
  const allowed = env.ALLOWED_EMAILS.split(',').map((value) => value.trim())
  return allowed.includes(email) ? email : null
}

/**
 * @param {Request} request
 * @param {Env} env
 * @returns {boolean}
 */
function isActivityOwner(request, env) {
  const email = (request.headers.get('Cf-Access-Authenticated-User-Email') || '').trim().toLowerCase()
  if (!email || typeof env.ACTIVITY_OWNER_EMAILS !== 'string') return false
  return env.ACTIVITY_OWNER_EMAILS.split(',').map((value) => value.trim().toLowerCase()).includes(email)
}

/**
 * Where a write came from. Access puts the real client address in CF-Connecting-IP.
 * @param {Request} request
 */
function requestOrigin(request) {
  const cf = /** @type {{country?: string}|undefined} */ (/** @type {any} */ (request).cf)
  return {
    ip: request.headers.get('CF-Connecting-IP') || null,
    country: cf && typeof cf.country === 'string' ? cf.country : null,
    userAgent: (request.headers.get('User-Agent') || '').slice(0, 300) || null,
  }
}

/**
 * One audit row. The card title is resolved inside D1 from the published board or To-Do
 * catalogue, so the worker never parses a 1.8 MB snapshot per click.
 * @param {Env} env
 * @param {Request} request
 * @param {{at: string, actorEmail: string, source: 'board'|'todo', operation: string, itemId: string, value: string|null}} entry
 * @param {boolean} [guardPreviousInsert]
 */
function activityStatement(env, request, entry, guardPreviousInsert = false) {
  const origin = requestOrigin(request)
  return env.DB.prepare(`
    INSERT INTO activity_log (
      at, actor_email, source, operation, item_id, value, title, ip, country, user_agent
    ) SELECT ?, ?, ?, ?, ?, ?, COALESCE(
      (SELECT json_extract(j.value, '$.title')
         FROM board_snapshot b, json_each(b.snapshot_json, '$.items') j
        WHERE ? = 'board' AND CAST(json_extract(j.value, '$.id') AS TEXT) = ? LIMIT 1),
      (SELECT json_extract(j.value, '$.text')
         FROM todo_catalogue c, json_each(c.catalogue_json, '$.items') j
        WHERE ? = 'todo' AND json_extract(j.value, '$.id') = ? LIMIT 1)
    ), ?, ?, ? WHERE ? = 1 OR changes() = 1
  `).bind(
    entry.at, entry.actorEmail, entry.source, entry.operation, entry.itemId, entry.value,
    entry.source, entry.itemId, entry.source, entry.itemId,
    origin.ip, origin.country, origin.userAgent,
    guardPreviousInsert ? 0 : 1,
  )
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {Promise<boolean>}
 */
async function constantTimeEqual(left, right) {
  const encoder = new TextEncoder()
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ])
  const leftBytes = new Uint8Array(leftHash)
  const rightBytes = new Uint8Array(rightHash)
  let difference = 0
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index]
  }
  return difference === 0
}

/**
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<boolean>}
 */
async function validPublisher(request, env) {
  const authorization = request.headers.get('authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token || typeof env.PUBLISHER_TOKEN !== 'string' || !env.PUBLISHER_TOKEN) {
    return false
  }
  return constantTimeEqual(token, env.PUBLISHER_TOKEN)
}

/**
 * @param {Request} request
 * @returns {Promise<unknown>}
 */
async function readJson(request) {
  try {
    return await request.json()
  } catch {
    return null
  }
}

/** @param {Request} request */
function hasJsonContentType(request) {
  const contentType = request.headers.get('content-type') || ''
  return contentType.split(';', 1)[0].trim().toLowerCase() === 'application/json'
}

/**
 * @param {unknown} item
 * @returns {BoardItem|null}
 */
/**
 * A card's note history. Refused outright rather than trimmed: a publisher that starts sending
 * something unexpected here should fail loudly, not have it quietly reshaped on the way in.
 * @param {unknown} value
 * @returns {Array<{at: string, by: string, text: string}>|null}
 */
function curateNotes(value) {
  if (!Array.isArray(value) || value.length > MAX_NOTES) return null
  const notes = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
    const source = /** @type {Record<string, unknown>} */ (entry)
    const text = typeof source.text === 'string' ? source.text : ''
    const at = typeof source.at === 'string' ? source.at : ''
    // An unattributed note is expected -- rows written before notes had authors carry one --
    // so an empty author is valid and the UI says so plainly rather than inventing a name.
    const by = source.by === undefined || source.by === null ? '' : source.by
    if (typeof by !== 'string') return null
    if (!text.trim() || text.length > STRING_LIMITS.note) return null
    if (at.length > 80 || by.length > 160) return null
    notes.push({ at, by, text })
  }
  return notes
}

/**
 * One email event inside a brief: who wrote the latest message on one side of the thread.
 * @param {unknown} value
 * @returns {{by: string, at: string, what: string}|null|undefined} undefined when invalid
 */
function curateBriefEmail(value) {
  if (value === null || value === undefined) return null
  if (!isObject(value)) return undefined
  const source = /** @type {Record<string, unknown>} */ (value)
  const by = boundedString(source.by, 160, false)
  const what = boundedString(source.what ?? '', 200)
  if (by === null || what === null || !validTimestamp(source.at)) return undefined
  return { by, at: /** @type {string} */ (source.at), what }
}

/**
 * The brief on one card. Returns null for anything off-contract: the card then shows without
 * its brief, and the publisher is told how many were dropped, instead of one bad brief
 * rejecting the whole board and leaving everybody looking at a stale snapshot.
 * @param {unknown} value
 * @param {Set<string>} owners roster keys plus '' for no hint
 */
function curateBrief(value, owners) {
  if (!isObject(value)) return null
  const source = /** @type {Record<string, unknown>} */ (value)
  /** @type {Record<string, unknown>} */
  const brief = {}
  for (const [field, limit] of Object.entries(BRIEF_STRING_LIMITS)) {
    const text = boundedString(source[field] ?? '', limit)
    if (text === null) return null
    brief[field] = text
  }
  if (!brief.title) delete brief.title
  if (!BRIEF_ACTIONS.includes(/** @type {string} */ (source.action))) return null
  brief.action = source.action
  const owner = source.owner_hint ?? ''
  if (typeof owner !== 'string' || !owners.has(owner)) return null
  brief.owner_hint = owner
  for (const field of ['waiting_since', 'deadline']) {
    const day = source[field] ?? ''
    if (typeof day !== 'string' || (day && (!ISO_DAY.test(day) || !Number.isFinite(Date.parse(day))))) return null
    brief[field] = day
  }
  if (typeof (source.counsel_only ?? false) !== 'boolean') return null
  brief.counsel_only = source.counsel_only === true
  for (const field of ['last_ours', 'last_theirs']) {
    const email = curateBriefEmail(source[field])
    if (email === undefined) return null
    brief[field] = email
  }
  const messages = source.messages ?? 0
  if (!Number.isSafeInteger(messages) || /** @type {number} */ (messages) < 0 || /** @type {number} */ (messages) > 500) return null
  brief.messages = messages
  if (!validTimestamp(source.generated_at)) return null
  brief.generated_at = source.generated_at
  return brief
}

/**
 * One Aries task on a card. Null when off-contract, which drops only this field.
 * @param {unknown} value
 * @param {Set<string>} owners
 */
function curateTaskState(value, owners) {
  if (!isObject(value)) return null
  const source = /** @type {Record<string, unknown>} */ (value)
  if (!TASK_STATES.includes(/** @type {string} */ (source.status)) || !validTimestamp(source.at)) return null
  /** @type {Record<string, unknown>} */
  const state = { status: source.status, at: source.at }
  if (source.finished_at !== undefined && source.finished_at !== null) {
    if (!validTimestamp(source.finished_at)) return null
    state.finished_at = source.finished_at
  }
  if (source.for !== undefined && source.for !== null) {
    if (typeof source.for !== 'string' || !owners.has(source.for)) return null
    state.for = source.for
  }
  for (const field of ['output', 'result', 'detail', 'error']) {
    if (typeof source[field] === 'string') state[field] = source[field].slice(0, 6000)
  }
  const attachments = boardAttachments(source.attachments)
  if (attachments.length) state.attachments = attachments
  return state
}

/** Only explicit document links cross the publisher boundary. @param {unknown} value */
function boardAttachments(value) {
  /** @type {{name:string,url:string}[]} */
  const result = []
  if (!Array.isArray(value)) return result
  for (const entry of value.slice(0, 20)) {
    if (!entry || typeof entry !== 'object') continue
    const name = entry.name || entry.filename
    const raw = entry.url || entry.href
    if (typeof name !== 'string' || typeof raw !== 'string' || raw.length > 2048) continue
    try {
      const url = new URL(raw)
      if (url.protocol === 'https:' && !url.username && !url.password) result.push({name:name.slice(0,240),url:url.href})
    } catch { /* Invalid attachment links are omitted. */ }
  }
  return result
}

/**
 * @param {unknown} item
 * @param {{briefsDropped: number}} [tally]
 * @param {Set<string>} [owners] roster keys a brief may hint, plus ''
 */
function curateItem(item, tally, owners = DEFAULT_BRIEF_OWNERS) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const source = /** @type {Record<string, unknown>} */ (item)
  if (!Number.isSafeInteger(source.id) || /** @type {number} */ (source.id) <= 0) return null
  if (typeof source.title !== 'string') return null
  const title = source.title.trim()
  if (!title || title.length > STRING_LIMITS.title) return null
  if (typeof source.kind === 'string' && source.kind.trim().toLowerCase() === 'personal') return null

  /** @type {Record<string, any>} */
  const curated = { id: /** @type {number} */ (source.id), title }
  for (const [field, limit] of Object.entries(STRING_LIMITS)) {
    if (field === 'title' || source[field] === undefined || source[field] === null) continue
    if (typeof source[field] !== 'string' || source[field].length > limit) return null
    curated[field] = source[field]
  }
  if (source.priority !== undefined && source.priority !== null) {
    const validNumber = typeof source.priority === 'number' && Number.isFinite(source.priority)
    const validString = typeof source.priority === 'string' && source.priority.length <= 64
    if (!validNumber && !validString) return null
    curated.priority = /** @type {number|string} */ (source.priority)
  }
  // The note history. A card used to carry one note string that each new note overwrote, with
  // no author and no time, so it could say something without saying who said it. Three
  // surfaces write to this board, which makes an unattributed note close to useless.
  if (source.notes !== undefined && source.notes !== null) {
    const notes = curateNotes(source.notes)
    if (!notes) return null
    if (notes.length) curated.notes = notes
  }
  if (source.brief !== undefined && source.brief !== null) {
    const brief = curateBrief(source.brief, owners)
    if (brief) /** @type {Record<string, unknown>} */ (curated).brief = brief
    else if (tally) tally.briefsDropped += 1
  }
  for (const field of ['prep', 'aries_task']) {
    if (source[field] === undefined || source[field] === null) continue
    const state = curateTaskState(source[field], owners)
    if (state) /** @type {Record<string, unknown>} */ (curated)[field] = state
  }
  Object.assign(curated, curateCardMetadata(source))
  const attachments = boardAttachments(source.attachments)
  if (attachments.length) curated.attachments = attachments
  return /** @type {BoardItem} */ (curated)
}

/**
 * @param {unknown} payload
 * @param {{briefsDropped: number}} [tally]
 * @param {Set<string>} [owners] roster keys a brief may hint, plus ''
 * @returns {BoardSnapshot|null}
 */
function curateSnapshot(payload, tally, owners = DEFAULT_BRIEF_OWNERS) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const source = /** @type {Record<string, unknown>} */ (payload)
  if (!Array.isArray(source.items) || source.items.length > MAX_ITEMS) return null
  /** @type {BoardItem[]} */
  const items = []
  const ids = new Set()
  for (const item of source.items) {
    const curated = curateItem(item, tally, owners)
    if (!curated || ids.has(curated.id)) return null
    ids.add(curated.id)
    items.push(curated)
  }
  return { items }
}

/** @param {unknown} value */
function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * @param {JsonObject} value
 * @param {string[]} keys
 */
function hasExactKeys(value, keys) {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

/** @param {unknown} value */
function validTimestamp(value) {
  return typeof value === 'string' && value.length <= 80 && Number.isFinite(Date.parse(value))
}

/**
 * @param {unknown} value
 * @param {number} limit
 * @param {boolean} [allowEmpty]
 */
function boundedString(value, limit, allowEmpty = true) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if ((!allowEmpty && !trimmed) || trimmed.length > limit) return null
  return trimmed
}

/** @param {unknown} value */
function curateUpstreamIds(value) {
  if (!Array.isArray(value) || value.length > 50) return null
  /** @type {string[]} */
  const curated = []
  const seen = new Set()
  for (const item of value) {
    const id = boundedString(item, 240, false)
    if (id === null || seen.has(id)) return null
    seen.add(id)
    curated.push(id)
  }
  return curated
}

/**
 * @param {unknown} item
 * @returns {JsonObject|null}
 */
function curateTodoItem(item) {
  if (!isObject(item)) return null
  const source = /** @type {JsonObject} */ (item)
  if (typeof source.id !== 'string' || !TASK_ID_PATTERN.test(source.id)) return null
  const text = boundedString(source.text, TODO_STRING_LIMITS.text, false)
  if (text === null || typeof source.seedDone !== 'boolean') return null

  const privateMarker = source.personal === true || source.private === true
    || ['kind', 'scope', 'visibility', 'category'].some((field) => {
      const value = source[field]
      return typeof value === 'string' && ['personal', 'private'].includes(value.trim().toLowerCase())
    })
  if (privateMarker) return null

  /** @type {JsonObject} */
  const curated = { id: source.id, text, seedDone: source.seedDone }
  for (const [field, limit] of Object.entries(TODO_STRING_LIMITS)) {
    if (field === 'text' || source[field] === undefined || source[field] === null) continue
    const value = boundedString(source[field], limit)
    if (value === null) return null
    curated[field] = value
  }
  if (source.sourceRevision !== undefined && source.sourceRevision !== null) {
    const revisionIsNumber = typeof source.sourceRevision === 'number' && Number.isSafeInteger(source.sourceRevision)
    const revisionIsString = boundedString(source.sourceRevision, 240, false) !== null
    if (!revisionIsNumber && !revisionIsString) return null
    curated.sourceRevision = revisionIsNumber
      ? source.sourceRevision
      : /** @type {string} */ (source.sourceRevision).trim()
  }
  if (source.upstreamIds !== undefined && source.upstreamIds !== null) {
    const upstreamIds = curateUpstreamIds(source.upstreamIds)
    if (!upstreamIds) return null
    curated.upstreamIds = upstreamIds
  }
  // Carried from the card the task was made from: urgent sorts it to the top, and ariesPrep says
  // what Aries is doing for its owner. Anything else in either field is ignored, not refused.
  if (source.urgent === true) curated.urgent = true
  if (typeof source.ariesPrep === 'string' && TODO_ARIES_PREP.includes(source.ariesPrep)) curated.ariesPrep = source.ariesPrep
  if (curated.ariesPrep && typeof source.ariesPrepFor === 'string' && /^[a-z][a-z0-9_-]{0,39}$/.test(source.ariesPrepFor)) {
    curated.ariesPrepFor = source.ariesPrepFor
  }
  // The newest change to any source card: a To-Do check-off or owner older than it has been
  // overtaken by the board, and the board wins (replayTodos).
  if (validTimestamp(source.sourceUpdatedAt)) curated.sourceUpdatedAt = source.sourceUpdatedAt
  return curated
}

/**
 * @param {unknown} payload
 * @param {boolean} [allowEmpty]
 * @returns {TodoCatalogue|null}
 */
function curateTodoCatalogue(payload, allowEmpty = false) {
  if (!isObject(payload)) return null
  const source = /** @type {JsonObject} */ (payload)
  if (!hasExactKeys(source, ['items'])) return null
  if (!Array.isArray(source.items) || (!allowEmpty && source.items.length === 0) || source.items.length > MAX_ITEMS) return null
  /** @type {JsonObject[]} */
  const items = []
  const ids = new Set()
  for (const item of source.items) {
    const curated = curateTodoItem(item)
    const id = curated?.id
    if (!curated || typeof id !== 'string' || ids.has(id)) return null
    ids.add(id)
    items.push(curated)
  }
  return { items }
}

/**
 * @param {JsonObject} changes
 * @returns {JsonObject|null}
 */
function curateEditChanges(changes) {
  const keys = Object.keys(changes)
  if (!keys.length || keys.some((key) => !TODO_EDIT_FIELDS.has(key))) return null
  /** @type {JsonObject} */
  const curated = {}
  for (const key of keys) {
    if (key === 'upstreamIds') {
      const ids = curateUpstreamIds(changes[key])
      if (!ids) return null
      curated[key] = ids
    } else if (key === 'sourceRevision') {
      const value = changes[key]
      const isNumber = typeof value === 'number' && Number.isSafeInteger(value)
      const isString = boundedString(value, 240, false) !== null
      if (!isNumber && !isString) return null
      curated[key] = isNumber ? value : /** @type {string} */ (value).trim()
    } else {
      const limit = /** @type {Record<string, number>} */ (TODO_STRING_LIMITS)[key]
      const value = boundedString(changes[key], limit, key !== 'text')
      if (value === null) return null
      curated[key] = value
    }
  }
  return curated
}

/** @param {unknown} value */
function curateAttachment(value) {
  if (!isObject(value)) return null
  const source = /** @type {JsonObject} */ (value)
  const allowed = new Set(['id', 'kind', 'name', 'url', 'storageName', 'size', 'mime', 'sha256', 'addedBy', 'addedAt'])
  if (Object.keys(source).some((key) => !allowed.has(key))) return null
  const id = boundedString(source.id, 160, false)
  const name = boundedString(source.name, 500, false)
  if (id === null || name === null || !/^[A-Za-z0-9._-]+$/.test(id)) return null
  if (source.kind === 'link') {
    const url = boundedString(source.url, 2048, false)
    try {
      if (url === null || new URL(url).protocol !== 'https:') return null
    } catch {
      return null
    }
    return { id, kind: 'link', name, url }
  }
  if (source.kind !== 'file') return null
  const storageName = boundedString(source.storageName, 80, false)
  const mime = boundedString(source.mime, 240, false)
  const sha256 = boundedString(source.sha256, 64, false)
  const size = source.size
  if (storageName === null || !/^todo-[0-9a-f]{32}$/.test(storageName)
      || mime === null || sha256 === null || !/^[0-9a-f]{64}$/.test(sha256)
      || !Number.isSafeInteger(size) || /** @type {number} */ (size) < 0
      || /** @type {number} */ (size) > 20 * 1024 * 1024) return null
  /** @type {JsonObject} */
  const curated = { id, kind: 'file', name, storageName, size, mime, sha256 }
  if (source.addedBy !== undefined && source.addedBy !== null) {
    const addedBy = boundedString(source.addedBy, 160, false)
    if (addedBy === null) return null
    curated.addedBy = addedBy
  }
  if (source.addedAt !== undefined && source.addedAt !== null) {
    if (typeof source.addedAt !== 'number' || !Number.isFinite(source.addedAt) || source.addedAt < 0) return null
    curated.addedAt = source.addedAt
  }
  return curated
}

/** @param {unknown} value @param {number} limit */
function curateAttachments(value, limit) {
  if (!Array.isArray(value) || value.length === 0 || value.length > limit) return null
  const attachments = value.map(curateAttachment)
  if (attachments.some((attachment) => !attachment)) return null
  const ids = attachments.map((attachment) => attachment?.id)
  return ids.length === new Set(ids).size ? /** @type {JsonObject[]} */ (attachments) : null
}

/** @param {unknown} value @param {string} itemId */
function curateToggleSnapshot(value, itemId) {
  if (!isObject(value)) return null
  const source = /** @type {JsonObject} */ (value)
  if (Object.keys(source).some((key) => !TODO_SNAPSHOT_FIELDS.has(key)) || source.id !== itemId) return null
  const text = boundedString(source.text, TODO_STRING_LIMITS.text, false)
  if (text === null) return null
  /** @type {JsonObject} */
  const snapshot = { id: itemId, text }
  for (const field of ['details', 'client', 'actionType', 'notificationDate', 'sourceUrl', 'due', 'assignee']) {
    const value = source[field]
    if (value === undefined) continue
    if (value === null) {
      snapshot[field] = null
      continue
    }
    const limit = /** @type {Record<string, number>} */ (TODO_STRING_LIMITS)[field]
    const bounded = boundedString(value, limit)
    if (bounded === null) return null
    snapshot[field] = bounded
  }
  if (source.attachments !== undefined) {
    if (!Array.isArray(source.attachments) || source.attachments.length > 6) return null
    if (source.attachments.length === 0) snapshot.attachments = []
    else {
      const attachments = curateAttachments(source.attachments, 6)
      if (!attachments) return null
      snapshot.attachments = attachments
    }
  }
  if (source.sourceRevision !== undefined && source.sourceRevision !== null) {
    const isNumber = typeof source.sourceRevision === 'number' && Number.isSafeInteger(source.sourceRevision)
    const isString = boundedString(source.sourceRevision, 240, false) !== null
    if (!isNumber && !isString) return null
    snapshot.sourceRevision = isNumber ? source.sourceRevision : /** @type {string} */ (source.sourceRevision).trim()
  }
  if (source.historyVisible !== undefined) {
    if (typeof source.historyVisible !== 'boolean') return null
    snapshot.historyVisible = source.historyVisible
  }
  return snapshot
}

/**
 * @param {string} operation
 * @param {unknown} payload
 * @param {string} itemId
 * @returns {JsonObject|null}
 */
function curateOperationPayload(operation, payload, itemId) {
  if (!isObject(payload)) return null
  const source = /** @type {JsonObject} */ (payload)
  if (operation === 'toggle') {
    const allowed = new Set(['done', 'sourceRevision', 'item'])
    if (Object.keys(source).some((key) => !allowed.has(key)) || typeof source.done !== 'boolean') return null
    /** @type {JsonObject} */
    const curated = { done: source.done }
    if (source.sourceRevision !== undefined && source.sourceRevision !== null) {
      const isNumber = typeof source.sourceRevision === 'number' && Number.isSafeInteger(source.sourceRevision)
      const isString = boundedString(source.sourceRevision, 240, false) !== null
      if (!isNumber && !isString) return null
      curated.sourceRevision = isNumber ? source.sourceRevision : /** @type {string} */ (source.sourceRevision).trim()
    }
    if (source.item !== undefined) {
      const snapshot = curateToggleSnapshot(source.item, itemId)
      if (!snapshot) return null
      curated.item = snapshot
    }
    return curated
  }
  if (operation === 'assign') {
    const assignee = boundedString(source.assignee, TODO_STRING_LIMITS.assignee)
    return hasExactKeys(source, ['assignee']) && assignee !== null ? { assignee } : null
  }
  if (operation === 'add') {
    const item = curateTodoItem(source.item)
    return hasExactKeys(source, ['item']) && item?.id === itemId ? { item } : null
  }
  if (operation === 'edit') {
    const changes = isObject(source.changes) ? curateEditChanges(/** @type {JsonObject} */ (source.changes)) : null
    return hasExactKeys(source, ['changes']) && changes ? { changes } : null
  }
  if (operation === 'attach') {
    const attachments = hasExactKeys(source, ['attachments']) ? curateAttachments(source.attachments, 6) : null
    return attachments ? { attachments } : null
  }
  if (operation === 'detach') {
    if (!hasExactKeys(source, ['attachmentIds']) || !Array.isArray(source.attachmentIds)
        || source.attachmentIds.length === 0 || source.attachmentIds.length > 12) return null
    const attachmentIds = source.attachmentIds.map((value) => boundedString(value, 160, false))
    if (attachmentIds.some((value) => value === null) || attachmentIds.length !== new Set(attachmentIds).size) return null
    return { attachmentIds }
  }
  if (operation === 'snooze') {
    return hasExactKeys(source, ['until']) && validTimestamp(source.until) ? { until: source.until } : null
  }
  if (operation === 'archive') {
    return hasExactKeys(source, ['archived']) && typeof source.archived === 'boolean' ? { archived: source.archived } : null
  }
  if (operation === 'delete') return hasExactKeys(source, []) ? {} : null
  return null
}

/**
 * @param {unknown} value
 * @param {{email: string, name: string}|null} actor
 * @returns {JsonObject|null}
 */
function curateOperation(value, actor = null) {
  if (!isObject(value)) return null
  const source = /** @type {JsonObject} */ (value)
  const keys = actor
    ? ['event_id', 'item_id', 'operation', 'payload', 'client_ts']
    : ['event_id', 'item_id', 'operation', 'payload', 'actor_email', 'actor_name', 'client_ts']
  if (!hasExactKeys(source, keys)) return null
  if (typeof source.event_id !== 'string' || !EVENT_ID_PATTERN.test(source.event_id)) return null
  if (typeof source.item_id !== 'string' || !TASK_ID_PATTERN.test(source.item_id)) return null
  if (typeof source.operation !== 'string' || !TODO_OPERATIONS.has(source.operation)) return null
  if (!validTimestamp(source.client_ts)) return null
  const payload = curateOperationPayload(source.operation, source.payload, source.item_id)
  if (!payload) return null

  const actorEmail = actor ? actor.email : boundedString(source.actor_email, 254, false)
  const actorName = actor ? actor.name : boundedString(source.actor_name, 120, false)
  if (actorEmail === null || actorName === null || !actorEmail.includes('@')) return null
  return {
    event_id: source.event_id,
    item_id: source.item_id,
    operation: source.operation,
    payload,
    actor_email: actorEmail,
    actor_name: actorName,
    client_ts: source.client_ts,
  }
}

/** @param {Env} env */
function staleAfterSeconds(env) {
  const parsed = Number.parseInt(env.STALE_AFTER_SECONDS || '', 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 300
}

/**
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<Response>}
 */
async function publishSnapshot(request, env) {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  if (!hasJsonContentType(request)) return unsupportedMediaType()
  const tally = { briefsDropped: 0 }
  const snapshot = curateSnapshot(await readJson(request), tally, briefOwners(await loadTeam(env)))
  if (!snapshot) return badRequest('Invalid snapshot')
  const snapshotJson = JSON.stringify(snapshot)
  if (new TextEncoder().encode(snapshotJson).byteLength > MAX_SNAPSHOT_BYTES) {
    return badRequest('Snapshot too large')
  }
  const publishedAt = new Date().toISOString()
  await env.DB.prepare(`
    INSERT INTO board_snapshot (singleton_id, snapshot_json, published_at)
    VALUES (1, ?, ?)
    ON CONFLICT(singleton_id) DO UPDATE SET
      snapshot_json = excluded.snapshot_json,
      published_at = excluded.published_at
  `).bind(snapshotJson, publishedAt).run()
  return json({
    ok: true,
    published_at: publishedAt,
    item_count: snapshot.items.length,
    briefs_dropped: tally.briefsDropped,
  })
}

/**
 * The source email conversation behind a board row. Published by Aries because only the
 * domain service account can read every mailbox; the point is that a teammate can read a
 * thread that lives in someone else's inbox and decide whether to take the work.
 * @param {unknown} payload
 * @returns {{threads: JsonObject[]}|null}
 */
function curateThreads(payload) {
  if (!isObject(payload)) return null
  const source = /** @type {Record<string, unknown>} */ (payload)
  if (!Array.isArray(source.threads) || source.threads.length > MAX_THREADS) return null
  /** @type {JsonObject[]} */
  const threads = []
  const seen = new Set()
  for (const raw of source.threads) {
    if (!isObject(raw)) return null
    const thread = /** @type {Record<string, unknown>} */ (raw)
    if (!Number.isSafeInteger(thread.item_id) || /** @type {number} */ (thread.item_id) <= 0) return null
    if (seen.has(thread.item_id)) return null
    if (!Array.isArray(thread.messages) || !thread.messages.length) return null
    if (thread.messages.length > MAX_THREAD_MESSAGES) return null
    /** @type {JsonObject[]} */
    const messages = []
    for (const rawMessage of thread.messages) {
      if (!isObject(rawMessage)) return null
      const message = /** @type {Record<string, unknown>} */ (rawMessage)
      /** @type {JsonObject} */
      const curated = {}
      for (const [field, limit] of Object.entries(THREAD_STRING_LIMITS)) {
        const value = message[field]
        if (value === undefined || value === null) continue
        if (typeof value !== 'string' || value.length > limit) return null
        curated[field] = value
      }
      curated.truncated = message.truncated === true
      messages.push(curated)
    }
    const subject = typeof thread.subject === 'string' ? thread.subject.slice(0, THREAD_STRING_LIMITS.subject) : ''
    const mailbox = typeof thread.mailbox === 'string' ? thread.mailbox.slice(0, 240) : ''
    seen.add(thread.item_id)
    threads.push({ item_id: thread.item_id, subject, mailbox, messages })
  }
  return { threads }
}

/**
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<Response>}
 */
async function publishThreads(request, env) {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  if (!hasJsonContentType(request)) return unsupportedMediaType()
  const curated = curateThreads(await readJson(request))
  if (!curated) return badRequest('Invalid threads')
  const publishedAt = new Date().toISOString()
  // Replaced wholesale: a row that leaves the board must not leave its email behind.
  const statements = [env.DB.prepare('DELETE FROM board_threads')]
  for (const thread of curated.threads) {
    statements.push(env.DB.prepare(`
      INSERT INTO board_threads (item_id, thread_json, published_at) VALUES (?, ?, ?)
    `).bind(thread.item_id, JSON.stringify(thread), publishedAt))
  }
  await env.DB.batch(statements)
  return json({ ok: true, published_at: publishedAt, thread_count: curated.threads.length })
}

/**
 * @param {Request} request
 * @param {Env} env
 * @param {URL} url
 * @returns {Promise<Response>}
 */
async function getThread(request, env, url) {
  if (request.method !== 'GET') return methodNotAllowed('GET')
  const raw = url.searchParams.get('id')
  if (!raw || !/^\d+$/.test(raw)) return badRequest('Invalid item id')
  const itemId = Number(raw)
  if (!Number.isSafeInteger(itemId) || itemId <= 0) return badRequest('Invalid item id')
  const row = await env.DB.prepare(`
    SELECT thread_json, published_at FROM board_threads WHERE item_id = ?
  `).bind(itemId).first()
  if (!row) return json({ error: 'No source email for this item' }, 404)
  let thread
  try {
    thread = JSON.parse(/** @type {string} */ (row.thread_json))
  } catch {
    return json({ error: 'Thread unavailable' }, 503)
  }
  return json({ ...thread, published_at: row.published_at })
}

/**
 * Aries' raw working list. Read-only on the web: rows carry no actions, so the only thing
 * that can go wrong is showing something private — which is why a personal row is refused
 * here as well as being filtered on Aries.
 * @param {unknown} payload
 * @returns {{items: JsonObject[]}|null}
 */
function curateWorklist(payload) {
  if (!isObject(payload)) return null
  const source = /** @type {Record<string, unknown>} */ (payload)
  if (!Array.isArray(source.items) || source.items.length > MAX_WORKLIST_ITEMS) return null
  /** @type {JsonObject[]} */
  const items = []
  const ids = new Set()
  for (const raw of source.items) {
    if (!isObject(raw)) return null
    const item = /** @type {Record<string, unknown>} */ (raw)
    if (!Number.isSafeInteger(item.id) || /** @type {number} */ (item.id) < 0) return null
    if (ids.has(item.id)) return null
    if (item.personal === true) return null
    if (typeof item.text !== 'string') return null
    const text = item.text.trim()
    if (!text || text.length > WORKLIST_STRING_LIMITS.text) return null
    /** @type {JsonObject} */
    const curated = { id: /** @type {number} */ (item.id), text, done: item.done === true }
    for (const [field, limit] of Object.entries(WORKLIST_STRING_LIMITS)) {
      if (field === 'text' || item[field] === undefined || item[field] === null) continue
      if (typeof item[field] !== 'string' || item[field].length > limit) return null
      curated[field] = item[field]
    }
    ids.add(item.id)
    items.push(curated)
  }
  return { items }
}

/**
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<Response>}
 */
async function publishWorklist(request, env) {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  if (!hasJsonContentType(request)) return unsupportedMediaType()
  const worklist = curateWorklist(await readJson(request))
  if (!worklist) return badRequest('Invalid worklist')
  const worklistJson = JSON.stringify(worklist)
  if (new TextEncoder().encode(worklistJson).byteLength > MAX_SNAPSHOT_BYTES) {
    return badRequest('Worklist too large')
  }
  const publishedAt = new Date().toISOString()
  await env.DB.prepare(`
    INSERT INTO worklist_snapshot (singleton_id, worklist_json, published_at)
    VALUES (1, ?, ?)
    ON CONFLICT(singleton_id) DO UPDATE SET
      worklist_json = excluded.worklist_json,
      published_at = excluded.published_at
  `).bind(worklistJson, publishedAt).run()
  return json({ ok: true, published_at: publishedAt, item_count: worklist.items.length })
}

/**
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<Response>}
 */
async function getWorklist(request, env) {
  if (request.method !== 'GET') return methodNotAllowed('GET')
  const row = await env.DB.prepare(`
    SELECT worklist_json, published_at
    FROM worklist_snapshot
    WHERE singleton_id = 1
  `).first()
  const threshold = staleAfterSeconds(env)
  if (!row) {
    return json({
      items: [],
      published_at: null,
      stale: { is_stale: true, age_seconds: null, after_seconds: threshold },
    })
  }
  /** @type {{items: JsonObject[]}|null} */
  let worklist = null
  try {
    worklist = curateWorklist(JSON.parse(/** @type {string} */ (row.worklist_json)))
  } catch {
    return json({ error: 'Worklist unavailable' }, 503)
  }
  if (!worklist) return json({ error: 'Worklist unavailable' }, 503)
  const publishedMillis = Date.parse(/** @type {string} */ (row.published_at))
  const ageSeconds = Number.isFinite(publishedMillis)
    ? Math.max(0, Math.floor((Date.now() - publishedMillis) / 1000))
    : null
  return json({
    items: worklist.items,
    published_at: row.published_at,
    stale: {
      is_stale: ageSeconds === null || ageSeconds > threshold,
      age_seconds: ageSeconds,
      after_seconds: threshold,
    },
  })
}

/**
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<Response>}
 */
async function publishTodoCatalogue(request, env) {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  if (!hasJsonContentType(request)) return unsupportedMediaType()
  const catalogue = curateTodoCatalogue(await readJson(request))
  if (!catalogue) return badRequest('Invalid todo catalogue')
  const catalogueJson = JSON.stringify(catalogue)
  if (new TextEncoder().encode(catalogueJson).byteLength > MAX_TODO_BYTES) {
    return badRequest('Todo catalogue too large')
  }
  const publishedAt = new Date().toISOString()
  await env.DB.prepare(`
    INSERT INTO todo_catalogue (singleton_id, catalogue_json, published_at)
    VALUES (1, ?, ?)
    ON CONFLICT(singleton_id) DO UPDATE SET
      catalogue_json = excluded.catalogue_json,
      published_at = excluded.published_at
  `).bind(catalogueJson, publishedAt).run()
  return json({ ok: true, published_at: publishedAt, item_count: catalogue.items.length })
}

/**
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<Response>}
 */
/**
 * Overlay still-queued teammate commands onto the last published snapshot.
 *
 * The queue is the authority for anything clicked since that publish: Aries has not seen it
 * yet, so the snapshot still describes the old state. Without this, a card checked off
 * seconds ago came back fully lit on the very next poll and Done read as a broken button.
 * Applied in id order, so the last write wins.
 *
 * @param {any[]} items
 * @param {any[]} commands
 * @returns {any[]}
 */
function applyPendingCommands(items, commands) {
  if (!commands.length) return items
  const byId = new Map()
  const order = []
  for (const item of items) {
    const copy = { ...item }
    byId.set(copy.id, copy)
    order.push(copy.id)
  }
  const dropped = new Set()
  for (const command of commands) {
    const item = byId.get(command.item_id)
    if (!item) continue
    if (command.operation === 'done') {
      item.status = 'done'
      item.pending = command.state !== 'applied'
    } else if (command.operation === 'reopen') {
      item.status = 'open'
      item.pending = command.state !== 'applied'
    } else if (command.operation === 'delete' || command.operation === 'not_useful') {
      if (command.state === 'applied') dropped.add(command.item_id)
      else item.pending = true
    } else if (command.operation === 'assign') {
      item.assignee = command.value || ''
      item.pending = command.state !== 'applied'
    } else if (command.operation === 'snooze') {
      item.due = command.value || item.due
      item.status = 'snoozed'
      item.pending = command.state !== 'applied'
    } else if (command.operation === 'urgent') {
      if (command.value === 'on') item.urgent = command.created_at
      else delete item.urgent
      item.pending = command.state !== 'applied'
    } else if (command.operation === 'note' && command.note) {
      const notes = Array.isArray(item.notes) ? item.notes.slice() : []
      notes.push({
        text: command.note,
        by: command.actor_email || '',
        at: command.created_at || '',
        pending: command.state !== 'applied',
      })
      item.notes = notes
      item.note = command.note
      item.pending = command.state !== 'applied'
    }
  }
  return order.filter((id) => !dropped.has(id)).map((id) => byId.get(id))
}

/**
 * The roster, in board order. DEFAULT_TEAM stands in only while the table is empty.
 * @param {Env} env
 * @returns {Promise<TeamMember[]>}
 */
async function loadTeam(env) {
  const rows = await env.DB.prepare(`
    SELECT key, name, email, past_emails
    FROM team_users
    ORDER BY position, key
  `).all()
  /** @type {TeamMember[]} */
  const team = []
  for (const row of rows.results || []) {
    /** @type {unknown} */
    let past = []
    try {
      past = JSON.parse(String(row.past_emails || '[]'))
    } catch {
      past = []
    }
    team.push({
      key: String(row.key),
      name: String(row.name),
      email: String(row.email),
      past_emails: Array.isArray(past) ? past.filter((value) => typeof value === 'string') : [],
    })
  }
  return team.length ? team : DEFAULT_TEAM.map((member) => ({ ...member, past_emails: [] }))
}

/** @param {TeamMember[]} team */
function briefOwners(team) {
  return new Set([...team.map((member) => member.key), ''])
}

/**
 * Every name the board knows, by roster key and by address. Old addresses first, so an
 * address that moved to someone else names its current owner.
 * @param {TeamMember[]} team
 * @returns {Map<string, string>}
 */
function teamNames(team) {
  /** @type {Map<string, string>} */
  const names = new Map(Object.entries(OTHER_NAMES))
  for (const member of team) {
    for (const address of member.past_emails) names.set(address, member.name)
  }
  for (const member of team) {
    names.set(member.key, member.name)
    names.set(member.email, member.name)
  }
  for (const [address, key] of Object.entries(SIGN_IN_ALIASES)) {
    const member = team.find((candidate) => candidate.key === key)
    if (member) names.set(address, member.name)
  }
  return names
}

/**
 * The roster entry a signed-in address belongs to: its current address, then an old one.
 * @param {TeamMember[]} team
 * @param {string} email
 */
function memberFor(team, email) {
  const address = String(email || '').trim().toLowerCase()
  const aliased = /** @type {Record<string, string>} */ (SIGN_IN_ALIASES)[address]
  if (aliased) return team.find((member) => member.key === aliased) || null
  return team.find((member) => member.email === address)
    || team.find((member) => member.past_emails.includes(address))
    || null
}

/**
 * A key for a new person, from their name: first name, then first and last, then numbered.
 * @param {string} name
 * @param {TeamMember[]} team
 */
function newTeamKey(name, team) {
  const taken = new Set([...team.map((member) => member.key), ...RESERVED_KEYS])
  const words = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter(Boolean)
  /** @param {string} value */
  const clean = (value) => value.replace(/^[^a-z]+/, '').slice(0, 24)
  const candidates = [clean(words[0] || ''), clean(words.slice(0, 2).join('')), clean(words.join(''))]
  for (const candidate of candidates) {
    if (TEAM_KEY.test(candidate) && !taken.has(candidate)) return candidate
  }
  const base = (candidates.find((candidate) => TEAM_KEY.test(candidate)) || 'user').slice(0, 21)
  for (let number = 2; number < 1000; number += 1) {
    if (!taken.has(`${base}${number}`)) return `${base}${number}`
  }
  return null
}

/**
 * @param {string} value an address or a roster key
 * @param {Map<string, string>} names from teamNames()
 */
function personName(value, names) {
  const address = String(value || '').trim().toLowerCase()
  if (!address) return ''
  const known = names.get(address)
  if (known) return known
  const local = address.split('@')[0]
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : address
}

/** @param {string} value */
function shortDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '')
  return match ? `${Number(match[2])}/${Number(match[3])}` : value
}

/**
 * What a board action says in a card's history, in words.
 * @param {string} operation
 * @param {string|null} value
 * @param {Map<string, string>} names
 */
function describeOperation(operation, value, names) {
  switch (operation) {
    case 'done': return 'marked it done'
    case 'reopen': return 'reopened it'
    case 'assign': return value ? `assigned it to ${personName(value, names)}` : 'cleared the owner'
    case 'snooze': return value ? `snoozed it to ${shortDay(value)}` : 'snoozed it'
    case 'delete': return 'deleted it'
    case 'reorder': return 'moved it'
    case 'useful': return 'said it was worth a card'
    case 'not_useful': return 'said it is not a task'
    case 'nudge': return value ? `asked ${personName(value, names)} for an update` : 'asked for an update'
    case 'prep': return value ? `asked Aries to prep it for ${personName(value, names)}` : 'asked Aries to prep it'
    case 'urgent': return value === 'off' ? 'cleared urgent' : 'marked it urgent'
    default: return operation
  }
}

/**
 * A card's recent history, newest first: board actions from the audit trail, the card's notes
 * (which include notes written on Aries itself), and the latest email on each side of the
 * thread from the brief. "Who was last to work on that task" is the newest entry from our side.
 * @param {any} item
 * @param {any[]} actions audit rows for this card, any order
 * @param {Map<string, string>} names from teamNames()
 */
function cardHistory(item, actions, names) {
  /** @type {Array<{at: string, who: string, what: string, ours: boolean, kind: string}>} */
  const events = []
  for (const row of actions) {
    // Notes are already on the card, with their author, including ones still in the queue.
    if (row.operation === 'note') continue
    events.push({
      at: row.at,
      who: personName(row.actor_email, names),
      what: describeOperation(row.operation, row.value, names),
      ours: true,
      kind: 'action',
    })
  }
  for (const note of Array.isArray(item.notes) ? item.notes : []) {
    if (!note.at) continue
    events.push({
      at: note.at,
      who: personName(note.by, names) || 'Someone',
      what: `wrote: ${note.text}`.slice(0, 240),
      ours: true,
      kind: 'note',
    })
  }
  const brief = item.brief
  if (brief && brief.last_ours) {
    events.push({ at: brief.last_ours.at, who: brief.last_ours.by, what: brief.last_ours.what || 'sent an email', ours: true, kind: 'email' })
  }
  if (brief && brief.last_theirs) {
    events.push({ at: brief.last_theirs.at, who: brief.last_theirs.by, what: brief.last_theirs.what || 'sent an email', ours: false, kind: 'email' })
  }
  return events
    .filter((event) => Number.isFinite(Date.parse(event.at)))
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))
    .slice(0, HISTORY_PER_CARD)
}

/** @param {Request} request @param {Env} env */
async function getBoard(request, env) {
  if (request.method !== 'GET') return methodNotAllowed('GET')
  const row = /** @type {SnapshotRow|null} */ (await env.DB.prepare(`
    SELECT snapshot_json, published_at
    FROM board_snapshot
    WHERE singleton_id = 1
  `).first())
  const threshold = staleAfterSeconds(env)
  if (!row) {
    return json({
      items: [],
      published_at: null,
      stale: { is_stale: true, age_seconds: null, after_seconds: threshold },
    })
  }

  const team = await loadTeam(env)
  /** @type {BoardSnapshot|null} */
  let snapshot = null
  try {
    snapshot = curateSnapshot(JSON.parse(row.snapshot_json), undefined, briefOwners(team))
  } catch {
    return json({ error: 'Snapshot unavailable' }, 503)
  }
  if (!snapshot) return json({ error: 'Snapshot unavailable' }, 503)
  const names = teamNames(team)
  const viewer = memberFor(team, request.headers.get('Cf-Access-Authenticated-User-Email') || '')
  const publishedMillis = Date.parse(row.published_at)
  const ageSeconds = Number.isFinite(publishedMillis)
    ? Math.max(0, Math.floor((Date.now() - publishedMillis) / 1000))
    : null
  // Which items actually have a readable email chain. Not every card does: some were never
  // made from an email, and for others the mailbox could not be resolved so nothing was
  // rendered. Without this the UI offered "Open email" on every card and a third of them
  // answered "No source email for this item" -- a button that exists only to apologise.
  const threadRows = await env.DB.prepare("SELECT item_id, json_extract(thread_json, '$.subject') AS source_subject FROM board_threads").all()
  const threadIds = (threadRows.results || []).map((entry) => entry.item_id)
  const subjects = new Map((threadRows.results || []).map(entry => [entry.item_id, entry.source_subject]))

  // Keep a checked-off card checked off while Aries catches up, including the short
  // interval between acknowledgement and the next snapshot. A newer snapshot wins.
  // Everything a teammate has clicked since the last publish is still sitting in the queue.
  // It has to be folded in here, or the board answers every poll with the pre-click state.
  const receipts = await commandReceipts(env.DB)
  const pendingRows = await env.DB.prepare(`
    SELECT operation, item_id, note, value, actor_email, created_at, state
    FROM command_queue
    WHERE state = 'queued' OR (state = 'applied' AND acked_at > ?)
    ORDER BY id
  `).bind(row.published_at).all()
  const items = enrichBoardItems(applyPendingCommands(snapshot.items, pendingRows.results || []).map(item => ({ ...item, source_subject: subjects.get(item.id) || null })))
  for (const item of items) delete item.source_subject
  const latestReceipts = new Map()
  for (const receipt of receipts) if (!latestReceipts.has(receipt.item_id)) latestReceipts.set(receipt.item_id, receipt)
  for (const item of items) item.command_receipt = latestReceipts.get(item.id) || null

  // Board actions from the audit trail, grouped per card, for each card's history.
  const since = new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString()
  const actionRows = await env.DB.prepare(`
    SELECT item_id, at, actor_email, operation, value
    FROM activity_log
    WHERE source = 'board' AND at >= ?
    ORDER BY at DESC
    LIMIT 5000
  `).bind(since).all()
  /** @type {Map<string, any[]>} */
  const actionsByCard = new Map()
  for (const row of actionRows.results || []) {
    const key = String(row.item_id)
    if (!actionsByCard.has(key)) actionsByCard.set(key, [])
    actionsByCard.get(key)?.push(row)
  }
  for (const item of items) {
    if (item.status === 'done') continue
    const history = cardHistory(item, actionsByCard.get(String(item.id)) || [], names)
    if (history.length) item.history = history
  }

  // Cards for the same client or claim number, so the board can show them as one claim card.
  const { groups, conflicts } = claimGroupDetails(items, { staff: team.flatMap((member) => [member.key, member.name]) })
  for (const item of items) {
    item.group_conflicts = conflicts.get(item.id) || []
    const group = groups.get(item.id)
    if (!group) continue
    item.claim_group = group.key
    item.claim_label = group.label
    item.grouping = group
  }

  return json({
    items,
    thread_ids: threadIds,
    command_receipts: receipts,
    activity: isActivityOwner(request, env),
    // Names only: the owner chips and every "Nudge Mark" label read from this.
    team: team.map((member) => ({ key: member.key, name: member.name })),
    // Who is signed in, as a roster key, so the My cards tab can show only their cards.
    me: viewer ? { key: viewer.key, name: viewer.name } : null,
    published_at: row.published_at,
    stale: {
      is_stale: ageSeconds === null || ageSeconds > threshold,
      age_seconds: ageSeconds,
      after_seconds: threshold,
    },
  })
}

/** @param {Env} env @param {string} publishedAt */
async function completionCommands(env, publishedAt) {
  const result = await env.DB.prepare(`
    SELECT id, operation, item_id, actor_email, created_at, state, acked_at
    FROM command_queue
    WHERE operation IN ('done', 'reopen', 'delete')
      AND (state = 'queued' OR (state = 'applied' AND acked_at > ?))
    ORDER BY id
  `).bind(publishedAt).all()
  return /** @type {CompletionCommand[]} */ (result.results || [])
}

/** @param {BoardItem[]} items @param {CompletionCommand[]} commands */
function applyCompletionCommands(items, commands) {
  const effective = new Map(items.map((item) => [item.id, { ...item }]))
  for (const command of commands) {
    const item = effective.get(Number(command.item_id))
    if (!item) continue
    if (command.operation === 'delete') effective.delete(item.id)
    else if (command.operation === 'done') item.status = 'done'
    else if (command.operation === 'reopen') item.status = 'open'
  }
  return [...effective.values()]
}

/** @param {Env} env @param {number} id */
async function completionCard(env, id) {
  const row = /** @type {SnapshotRow|null} */ (await env.DB.prepare(`
    SELECT snapshot_json, published_at FROM board_snapshot WHERE singleton_id = 1
  `).first())
  if (!row) return null
  const snapshot = curateSnapshot(JSON.parse(row.snapshot_json))
  if (!snapshot) throw new Error('Snapshot unavailable')
  const original = snapshot.items.find((item) => item.id === id)
  if (!original) return null
  const commands = await completionCommands(env, row.published_at)
  const item = applyCompletionCommands([original], commands)[0]
  const latest = await env.DB.prepare(`
    SELECT id FROM command_queue
    WHERE item_id = ? AND operation IN ('done', 'reopen', 'delete') AND state <> 'failed'
    ORDER BY id DESC LIMIT 1
  `).bind(id).first()
  const lastCommandId = Number(latest?.id || 0)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(original)))
  const revision = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('') + ':' + lastCommandId
  return { item: item || original, state: !item ? 'deleted' : item.status === 'done' ? 'done' : 'open', revision, lastCommandId, snapshotJson: row.snapshot_json }
}

/** @param {Request} request @param {Env} env @param {string} actorEmail */
async function cardRequest(request, env, actorEmail) {
  const url = new URL(request.url)
  const write = url.pathname === '/api/card/done'
  if (request.method !== (write ? 'POST' : 'GET')) return methodNotAllowed(write ? 'POST' : 'GET')
  let id
  let revision
  if (write) {
    if (request.headers.get('origin') !== url.origin) return forbidden()
    if (!hasJsonContentType(request)) return unsupportedMediaType()
    const body = await readJson(request)
    if (!isObject(body)) return badRequest('Invalid card confirmation')
    const action = /** @type {JsonObject} */ (body)
    if (!hasExactKeys(action, ['id', 'revision']) || typeof action.revision !== 'string' || !action.revision.trim() || action.revision.length > 100) return badRequest('Invalid card confirmation')
    id = action.id
    revision = action.revision
  } else {
    const value = url.searchParams.get('id') || ''
    if (!/^[1-9]\d*$/.test(value)) return badRequest('Invalid card id')
    id = Number(value)
  }
  if (!Number.isSafeInteger(id) || /** @type {number} */ (id) <= 0) return badRequest('Invalid card id')
  let card
  try { card = await completionCard(env, /** @type {number} */ (id)) }
  catch { return json({ error: 'Card unavailable. Try again shortly.' }, 503) }
  if (!card) return missing('This card is no longer on the board. Nothing was changed.')
  const view = { item: card.item, state: card.state, revision: card.revision }
  if (!write) return json(view)
  if (card.state === 'deleted') return json({ error: 'This card was removed. Nothing was changed.', ...view }, 410)
  if (card.state === 'done') return json({ ok: true, existing: true, ...view })
  if (revision !== card.revision) return json({ error: 'This card changed. Review it again before marking it done.', ...view }, 409)

  const createdAt = new Date().toISOString()
  // One atomic compare-and-insert: scanner GETs never reach here, simultaneous
  // confirmations cannot enqueue duplicates, and a newer card/state is never closed
  // from an older confirmation. No token or authority is carried in the email URL.
  const inserted = await env.DB.prepare(`
    INSERT INTO command_queue (operation, item_id, note, value, actor_email, state, created_at)
    SELECT 'done', ?, NULL, NULL, ?, 'queued', ?
    WHERE EXISTS (SELECT 1 FROM board_snapshot WHERE singleton_id = 1 AND snapshot_json = ?)
      AND COALESCE((SELECT MAX(id) FROM command_queue
        WHERE item_id = ? AND operation IN ('done', 'reopen', 'delete') AND state <> 'failed'), 0) = ?
  `).bind(id, actorEmail, createdAt, card.snapshotJson, id, card.lastCommandId).run()
  if (inserted.meta.changes !== 1) {
    const current = await completionCard(env, /** @type {number} */ (id))
    if (current?.state === 'done') return json({ ok: true, existing: true, item: current.item, state: current.state, revision: current.revision })
    return json({ error: 'This card changed. Refresh and review it before marking it done.' }, 409)
  }
  const command = { id: inserted.meta.last_row_id, operation: 'done', item_id: id, actor_email: actorEmail, created_at: createdAt }
  return json({ ok: true, saved: true, existing: false, item: { ...card.item, status: 'done' }, state: 'done', command }, 202)
}

/**
 * @param {Env} env
 * @returns {Promise<{catalogue: TodoCatalogue, publishedAt: string|null}|null>}
 */
async function readTodoCatalogue(env) {
  const row = /** @type {TodoCatalogueRow|null} */ (await env.DB.prepare(`
    SELECT catalogue_json, published_at
    FROM todo_catalogue
    WHERE singleton_id = 1
  `).first())
  if (!row) return { catalogue: { items: [] }, publishedAt: null }
  try {
    const catalogue = curateTodoCatalogue(JSON.parse(row.catalogue_json), true)
    return catalogue ? { catalogue, publishedAt: row.published_at } : null
  } catch {
    return null
  }
}

/**
 * @param {unknown} value
 * @returns {JsonObject|null}
 */
function operationFromRow(value) {
  if (!isObject(value)) return null
  const row = /** @type {JsonObject} */ (value)
  if (!Number.isSafeInteger(row.sequence) || /** @type {number} */ (row.sequence) <= 0) return null
  let payload
  try {
    payload = typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload
  } catch {
    return null
  }
  const operation = curateOperation({
    event_id: row.event_id,
    item_id: row.item_id,
    operation: row.operation,
    payload,
    actor_email: row.actor_email,
    actor_name: row.actor_name,
    client_ts: row.client_ts,
  })
  if (!operation || typeof row.server_ts !== 'string') return null
  return { sequence: row.sequence, ...operation, server_ts: row.server_ts }
}

/**
 * @param {Env} env
 * @param {number} after
 * @returns {Promise<JsonObject[]|null>}
 */
async function readTodoOperations(env, after) {
  const rows = await env.DB.prepare(`
    SELECT sequence, event_id, item_id, operation, payload_json,
           actor_email, actor_name, client_ts, server_ts
    FROM todo_operations
    WHERE sequence > ?
    ORDER BY sequence ASC
  `).bind(after).all()
  const operations = rows.results.map(operationFromRow)
  return operations.every(Boolean) ? /** @type {JsonObject[]} */ (operations) : null
}

/** @param {Env} env */
async function latestTodoSequence(env) {
  const row = await env.DB.prepare(`
    SELECT COALESCE(MAX(sequence), 0) AS latest_sequence
    FROM todo_operations
  `).first()
  return row && Number.isSafeInteger(row.latest_sequence) ? Number(row.latest_sequence) : 0
}

/**
 * @param {TodoCatalogue} catalogue
 * @param {JsonObject[]} operations
 */
function replayTodos(catalogue, operations) {
  /** @type {Map<string, JsonObject>} */
  const items = new Map()
  for (const item of catalogue.items) {
    items.set(/** @type {string} */ (item.id), {
      ...item,
      done: item.seedDone,
      attachments: [],
      snoozedUntil: null,
      archived: false,
    })
  }
  for (const operation of operations) {
    const itemId = /** @type {string} */ (operation.item_id)
    const verb = operation.operation
    const payload = /** @type {JsonObject} */ (operation.payload)
    if (verb === 'add') {
      const item = /** @type {JsonObject} */ (payload.item)
      if (!items.has(itemId)) {
        items.set(itemId, { ...item, done: item.seedDone, attachments: [], snoozedUntil: null, archived: false })
      }
      continue
    }
    let item = items.get(itemId)
    if (!item && verb === 'toggle' && payload.done === true && isObject(payload.item)) {
      const snapshot = /** @type {JsonObject} */ (payload.item)
      item = {
        ...snapshot,
        done: false,
        attachments: Array.isArray(snapshot.attachments) ? snapshot.attachments : [],
        snoozedUntil: null,
        archived: false,
      }
      items.set(itemId, item)
    }
    if (!item) continue
    // The board changed the card after this To-Do check-off or owner change, so the catalogue
    // already carries the card's newer state. Replaying the older operation would put back what
    // the board has since changed: an old "Shayan" masking a later hand-off to Katherine.
    if ((verb === 'toggle' || verb === 'assign') && typeof item.sourceUpdatedAt === 'string'
        && Date.parse(item.sourceUpdatedAt) > Date.parse(String(operation.server_ts || ''))) continue
    if (verb === 'toggle') {
      const currentRevision = Number(item.sourceRevision)
      const eventRevision = Number(payload.sourceRevision)
      if (!(payload.done === true && Number.isFinite(currentRevision) && Number.isFinite(eventRevision)
          && eventRevision < currentRevision)) item.done = payload.done
      if (payload.done === false) item.archived = false
    }
    if (verb === 'assign') item.assignee = payload.assignee
    if (verb === 'edit') Object.assign(item, payload.changes)
    if (verb === 'attach') {
      const attachments = /** @type {JsonObject[]} */ (item.attachments)
      const additions = /** @type {JsonObject[]} */ (payload.attachments)
      const additionIds = new Set(additions.map((value) => value.id))
      item.attachments = [...attachments.filter((value) => !additionIds.has(value.id)), ...additions]
    }
    if (verb === 'detach') {
      const removed = new Set(/** @type {string[]} */ (payload.attachmentIds))
      item.attachments = /** @type {JsonObject[]} */ (item.attachments)
        .filter((value) => !removed.has(/** @type {string} */ (value.id)))
    }
    if (verb === 'snooze') item.snoozedUntil = payload.until
    if (verb === 'archive') item.archived = payload.archived
    if (verb === 'delete') item.archived = true
  }
  return [...items.values()]
}

/**
 * @param {Request} request
 * @param {Env} env
 */
async function getTodos(request, env) {
  if (request.method !== 'GET') return methodNotAllowed('GET')
  const stored = await readTodoCatalogue(env)
  if (!stored) return json({ error: 'Todo catalogue unavailable' }, 503)
  const operations = await readTodoOperations(env, 0)
  if (!operations) return json({ error: 'Todo operations unavailable' }, 503)
  const sequence = operations.length
    ? Number(operations[operations.length - 1]?.sequence)
    : await latestTodoSequence(env)
  const threshold = staleAfterSeconds(env)
  const publishedMillis = stored.publishedAt ? Date.parse(stored.publishedAt) : NaN
  const ageSeconds = Number.isFinite(publishedMillis)
    ? Math.max(0, Math.floor((Date.now() - publishedMillis) / 1000))
    : null
  return json({
    items: replayTodos(stored.catalogue, /** @type {JsonObject[]} */ (operations)),
    published_at: stored.publishedAt,
    sequence,
    stale: {
      is_stale: ageSeconds === null || ageSeconds > threshold,
      age_seconds: ageSeconds,
      after_seconds: threshold,
    },
  })
}

/**
 * @param {Request} request
 * @param {Env} env
 * @param {string} actorEmail
 * @returns {Promise<Response>}
 */
async function queueAction(request, env, actorEmail) {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  if (!hasJsonContentType(request)) return unsupportedMediaType()
  const payload = await readJson(request)
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return badRequest('Invalid action')
  }
  const action = /** @type {Record<string, unknown>} */ (payload)
  if (typeof action.operation !== 'string' || !BOARD_OPERATIONS.includes(action.operation)) {
    return badRequest('Unsupported operation')
  }
  if (!Number.isSafeInteger(action.id) || /** @type {number} */ (action.id) <= 0) {
    return badRequest('Invalid item id')
  }

  // `note` carries the free text of a note; `value` carries the single argument of every
  // other parameterised operation (who to assign to, the date to snooze until, the new
  // position). Keeping them apart means the note CHECK constraint stays exactly as it was.
  let note = null
  let value = null
  if (action.operation === 'note') {
    if (typeof action.note !== 'string') return badRequest('Note is required')
    note = action.note.trim()
    if (!note || note.length > STRING_LIMITS.note) return badRequest('Invalid note')
  } else if (action.operation === 'assign') {
    if (typeof action.value !== 'string') return badRequest('Assignee is required')
    value = action.value.trim().toLowerCase()
    // An empty assignee is how the UI clears an owner. Aries takes a card itself.
    const assignees = (await loadTeam(env)).map((member) => member.key).concat(['aries'])
    if (value && !assignees.includes(value)) return badRequest('Unknown assignee')
  } else if (action.operation === 'urgent') {
    if (action.value !== 'on' && action.value !== 'off') return badRequest('Urgent is on or off')
    value = action.value
  } else if (action.operation === 'prep') {
    if (typeof action.value !== 'string') return badRequest('Prep needs the teammate it is for')
    value = action.value.trim().toLowerCase()
    const teammates = (await loadTeam(env)).map((member) => member.key)
    if (!value || !teammates.includes(value)) return badRequest('Prep needs a teammate who owns the card')
  } else if (action.operation === 'nudge') {
    if (typeof action.value !== 'string') return badRequest('Nudge needs the owner')
    value = action.value.trim().toLowerCase()
    const teammates = (await loadTeam(env)).map((member) => member.key)
    if (!value || !teammates.includes(value)) return badRequest('Nudge needs a teammate who owns the card')
  } else if (action.operation === 'snooze') {
    if (typeof action.value !== 'string') return badRequest('A snooze date is required')
    value = action.value.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value))) {
      return badRequest('Snooze must be an ISO date')
    }
  } else if (action.operation === 'reorder') {
    if (!Number.isSafeInteger(action.value) || /** @type {number} */ (action.value) <= 0) {
      return badRequest('Invalid position')
    }
    value = String(action.value)
  }

  /** @type {{command_id:number,assignee:string,due:string,status:string}|null} */
  let expected = null
  let generation = null
  let deliveryState = ''
  if (action.expected !== undefined) {
    const candidate = /** @type {any} */ (action.expected)
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)
      || !Number.isSafeInteger(candidate.command_id) || candidate.command_id < 0
      || !['assignee', 'due', 'status'].every(key => typeof candidate[key] === 'string')) {
      return badRequest('Invalid expected card state')
    }
    expected = candidate
    const boardResponse = await getBoard(new Request(request.url, { headers: request.headers }), env)
    if (!boardResponse.ok) return boardResponse
    const board = /** @type {any} */ (await boardResponse.json())
    const current = board.items.find((/** @type {any} */ item) => item.id === action.id)
    if (!current || (current.command_receipt?.id || 0) !== candidate.command_id
      || (current.assignee || '') !== candidate.assignee || (current.due || '') !== candidate.due
      || (current.status || 'open') !== candidate.status) {
      return json({ error: 'Card changed since this preview. Refresh and review it again.' }, 409)
    }
    generation = board.published_at
    deliveryState = current.command_receipt?.state || ''
  }
  const createdAt = new Date().toISOString()
  // The command and its audit row land together or not at all. A guarded insert also
  // fences changes arriving between the preview check and this transaction.
  const insertStatement = expected ? env.DB.prepare(`
    INSERT INTO command_queue (operation, item_id, note, value, actor_email, state, created_at)
    SELECT ?, ?, ?, ?, ?, 'queued', ?
    WHERE COALESCE((SELECT MAX(id) FROM command_queue WHERE item_id = ?), 0) = ?
      AND (SELECT published_at FROM board_snapshot WHERE singleton_id = 1) = ?
      AND COALESCE((SELECT CASE
        WHEN state != 'queued' THEN state
        WHEN lease_token IS NOT NULL THEN 'processing'
        WHEN received_at IS NOT NULL THEN 'received'
        ELSE 'queued' END FROM command_queue WHERE id = ?), '') = ?
  `).bind(action.operation, action.id, note, value, actorEmail, createdAt, action.id, expected.command_id, generation, expected.command_id, deliveryState)
    : env.DB.prepare(`
      INSERT INTO command_queue (operation, item_id, note, value, actor_email, state, created_at)
      VALUES (?, ?, ?, ?, ?, 'queued', ?)
    `).bind(action.operation, action.id, note, value, actorEmail, createdAt)

  const [inserted] = await env.DB.batch([
    insertStatement,
    activityStatement(env, request, {
      at: createdAt,
      actorEmail,
      source: 'board',
      operation: String(action.operation),
      itemId: String(action.id),
      value: note ?? value,
    }, Boolean(expected)),
  ])
  if (!inserted.meta.changes) return json({ error: 'Card changed since this preview. Refresh and review it again.' }, 409)
  const command = {
    id: inserted.meta.last_row_id,
    operation: action.operation,
    item_id: action.id,
    note,
    value,
    actor_email: actorEmail,
    created_at: createdAt,
  }
  return json({ ok: true, command, receipt: commandReceipt({ ...command, state: 'queued' }) }, 202)
}

/**
 * @param {Env} env
 * @param {JsonObject} operation
 * @returns {Promise<{accepted: boolean, operation: JsonObject}>}
 */
async function insertTodoOperation(env, operation) {
  const serverTs = new Date().toISOString()
  const inserted = await env.DB.prepare(`
    INSERT OR IGNORE INTO todo_operations (
      event_id, item_id, operation, payload_json,
      actor_email, actor_name, client_ts, server_ts
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    operation.event_id,
    operation.item_id,
    operation.operation,
    JSON.stringify(operation.payload),
    operation.actor_email,
    operation.actor_name,
    operation.client_ts,
    serverTs,
  ).run()
  const row = await env.DB.prepare(`
    SELECT sequence, event_id, item_id, operation, payload_json,
           actor_email, actor_name, client_ts, server_ts
    FROM todo_operations
    WHERE event_id = ?
  `).bind(operation.event_id).first()
  const stored = operationFromRow(row)
  if (!stored) throw new Error('Stored todo operation unavailable')
  return { accepted: inserted.meta.changes === 1, operation: stored }
}

/**
 * Frank, 09/30/2026, from the To-Do audit: a task checked off or handed on in the To-Do list
 * stayed open, or with its old owner, on the board card it came from, so the two lists
 * disagreed. A To-Do task made from board cards (upstreamIds) now queues the same change for
 * those cards, which Aries applies like any board click. Tasks added by hand have no cards.
 * @param {Env} env
 * @param {JsonObject} operation a stored, newly accepted To-Do operation
 * @returns {Promise<D1PreparedStatement[]>}
 */
async function boardCommandsForTodo(env, operation) {
  const verb = operation.operation
  const payload = /** @type {JsonObject} */ (operation.payload || {})
  /** @type {string|null} */
  let boardOperation = null
  /** @type {string|null} */
  let value = null
  if (verb === 'toggle') {
    boardOperation = payload.done === true ? 'done' : 'reopen'
  } else if (verb === 'assign') {
    const team = await loadTeam(env)
    const wanted = String(payload.assignee || '').trim().toLowerCase()
    // The desktop app sends a name ("Steve"), the board a roster key ("steve").
    const member = team.find((person) => person.key === wanted || person.name.toLowerCase() === wanted)
    value = member ? member.key : wanted
    if (value && value !== 'aries' && !member) return []
    boardOperation = 'assign'
  } else {
    return []
  }
  const stored = await readTodoCatalogue(env)
  const item = stored?.catalogue.items.find((entry) => entry.id === operation.item_id)
  const upstream = Array.isArray(item?.upstreamIds) ? /** @type {unknown[]} */ (item.upstreamIds) : []
  const cardIds = [...new Set(upstream.map((id) => {
    const match = /^(?:board:)?(\d+)$/.exec(String(id))
    return match ? Number(match[1]) : 0
  }).filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 20)
  const createdAt = new Date().toISOString()
  return cardIds.map((id) => env.DB.prepare(`
    INSERT INTO command_queue (
      operation, item_id, note, value, actor_email, state, created_at
    ) VALUES (?, ?, ?, ?, ?, 'queued', ?)
  `).bind(boardOperation, id, null, value, String(operation.actor_email), createdAt))
}

/**
 * @param {Env} env
 * @param {JsonObject} operation
 */
async function queueBoardCommandsForTodo(env, operation) {
  const statements = await boardCommandsForTodo(env, operation)
  if (statements.length) await env.DB.batch(statements)
}

/**
 * @param {Request} request
 * @param {Env} env
 * @param {string} actorEmail
 * @returns {Promise<Response>}
 */
async function saveTodoAction(request, env, actorEmail) {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  if (!hasJsonContentType(request)) return unsupportedMediaType()
  const member = memberFor(await loadTeam(env), actorEmail)
  const actorName = member && TODO_ACTOR_KEYS.includes(member.key) ? member.name : null
  if (!actorName) return forbidden()
  const operation = curateOperation(await readJson(request), { email: actorEmail, name: actorName })
  if (!operation) return badRequest('Invalid todo action')
  const saved = await insertTodoOperation(env, operation)
  if (saved.accepted) {
    await activityStatement(env, request, {
      at: String(saved.operation.server_ts || new Date().toISOString()),
      actorEmail,
      source: 'todo',
      operation: String(operation.operation),
      itemId: String(operation.item_id),
      value: JSON.stringify(operation.payload ?? null).slice(0, 300),
    }).run()
    await queueBoardCommandsForTodo(env, saved.operation)
  }
  return json({ ok: true, accepted: saved.accepted, existing: !saved.accepted, operation: saved.operation }, 202)
}

/**
 * @param {Request} request
 * @param {Env} env
 */
async function publishTodoOperations(request, env) {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  if (!hasJsonContentType(request)) return unsupportedMediaType()
  const body = await readJson(request)
  if (!isObject(body)) return badRequest('Invalid todo operations')
  const source = /** @type {JsonObject} */ (body)
  if (!hasExactKeys(source, ['operations']) || !Array.isArray(source.operations)
      || source.operations.length === 0 || source.operations.length > MAX_OPERATION_BATCH) {
    return badRequest('Invalid todo operations')
  }
  const operations = source.operations.map((value) => curateOperation(value))
  if (operations.some((value) => !value)) return badRequest('Invalid todo operation')
  const operationJson = JSON.stringify(operations)
  if (new TextEncoder().encode(operationJson).byteLength > MAX_OPERATION_BYTES) {
    return badRequest('Todo operations too large')
  }

  let accepted = 0
  let existing = 0
  for (const operation of operations) {
    const saved = await insertTodoOperation(env, /** @type {JsonObject} */ (operation))
    if (saved.accepted) {
      accepted += 1
      await queueBoardCommandsForTodo(env, saved.operation)
    } else existing += 1
  }
  return json({ ok: true, accepted, existing, last_sequence: await latestTodoSequence(env) })
}

/** @param {URL} url */
function commandLimit(url) {
  const raw = url.searchParams.get('limit')
  if (raw === null) return 50
  if (!/^\d+$/.test(raw)) return null
  const limit = Number(raw)
  return Number.isSafeInteger(limit) && limit >= 1 && limit <= 100 ? limit : null
}

/**
 * @param {Request} request
 * @param {Env} env
 * @param {URL} url
 * @returns {Promise<Response>}
 */
async function listCommands(request, env, url) {
  if (request.method === 'POST') {
    if (!hasJsonContentType(request)) return unsupportedMediaType()
    const body = /** @type {JsonObject|null} */ (await readJson(request))
    if (!body || !isObject(body)) return badRequest('Invalid lease request')
    const limit = body.limit ?? 50, seconds = body.lease_seconds ?? 300
    if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1 || limit > 100 || typeof seconds !== 'number' || !Number.isSafeInteger(seconds) || seconds < 30 || seconds > 900) return badRequest('Invalid lease limit or duration')
    const commands = await claimCommands(env.DB, limit, seconds)
    return json({ commands, count: commands.length })
  }
  if (request.method !== 'GET') return methodNotAllowed('GET, POST')
  const limit = commandLimit(url)
  if (limit === null) return badRequest('Invalid limit')
  const commands = await receiveCommands(env.DB, limit)
  return json({ commands, count: commands.length })
}

/**
 * @param {Request} request
 * @param {Env} env
 * @param {URL} url
 * @returns {Promise<Response>}
 */
async function getTodoState(request, env, url) {
  if (request.method !== 'GET') return methodNotAllowed('GET')
  const rawAfter = url.searchParams.get('after')
  if (rawAfter !== null && !/^\d+$/.test(rawAfter)) return badRequest('Invalid after sequence')
  const after = rawAfter === null ? 0 : Number(rawAfter)
  if (!Number.isSafeInteger(after) || after < 0) return badRequest('Invalid after sequence')
  const stored = await readTodoCatalogue(env)
  if (!stored) return json({ error: 'Todo catalogue unavailable' }, 503)
  const operations = await readTodoOperations(env, after)
  if (!operations) return json({ error: 'Todo operations unavailable' }, 503)
  return json({
    catalogue: stored.catalogue,
    catalogue_published_at: stored.publishedAt,
    operations,
    latest_sequence: await latestTodoSequence(env),
  })
}

/**
 * @param {Request} request
 * @param {Env} env
 * @param {number} commandId
 * @returns {Promise<Response>}
 */
async function acknowledgeCommand(request, env, commandId) {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  if (!hasJsonContentType(request)) return unsupportedMediaType()
  const payload = await readJson(request)
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return badRequest('Invalid acknowledgement')
  }
  const acknowledgement = /** @type {Record<string, unknown>} */ (payload)
  if (acknowledgement.status !== 'applied' && acknowledgement.status !== 'failed') {
    return badRequest('Invalid acknowledgement')
  }
  let detail = null
  if (acknowledgement.detail !== undefined && acknowledgement.detail !== null) {
    if (typeof acknowledgement.detail !== 'string') return badRequest('Invalid detail')
    detail = acknowledgement.detail.trim()
    if (detail.length > 2000) return badRequest('Invalid detail')
  }
  const result = await acknowledgeDelivery(env.DB, commandId, acknowledgement.status, detail, acknowledgement.lease_token)
  return json(result, result.error ? Number(result.status) : 200)
}

/**
 * @param {Env} env
 * @param {URL} url
 */
async function readActivity(env, url) {
  const who = (url.searchParams.get('who') || '').trim().toLowerCase().slice(0, 254)
  const op = (url.searchParams.get('op') || '').trim().slice(0, 40)
  const rows = await env.DB.prepare(`
    SELECT id, at, actor_email, source, operation, item_id, value, title, ip, country, user_agent
    FROM activity_log
    WHERE (? = '' OR lower(actor_email) = ?) AND (? = '' OR operation = ?)
    ORDER BY at DESC, id DESC
    LIMIT ?
  `).bind(who, who, op, op, ACTIVITY_LIMIT).all()
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const recent = await env.DB.prepare(`
    SELECT at, actor_email, operation
    FROM activity_log
    WHERE at >= ?
    ORDER BY at
  `).bind(since).all()
  const choices = await env.DB.prepare(`
    SELECT DISTINCT actor_email, operation FROM activity_log
  `).all()

  /** @type {Map<string, {who: string, op: string, count: number, burst: {count: number, from: string, to: string}|null}>} */
  const summary = new Map()
  /** @type {Map<string, number[]>} */
  const times = new Map()
  for (const row of recent.results || []) {
    const key = `${row.actor_email}\u0000${row.operation}`
    if (!summary.has(key)) summary.set(key, { who: String(row.actor_email), op: String(row.operation), count: 0, burst: null })
    const entry = /** @type {NonNullable<ReturnType<typeof summary.get>>} */ (summary.get(key))
    entry.count += 1
    const list = times.get(key) || []
    list.push(Date.parse(String(row.at)))
    times.set(key, list)
  }
  // Largest count of one action by one person inside any BURST_WINDOW_MS stretch.
  for (const [key, list] of times) {
    let start = 0
    let best = { count: 0, from: 0, to: 0 }
    for (let end = 0; end < list.length; end += 1) {
      while (list[end] - list[start] > BURST_WINDOW_MS) start += 1
      if (end - start + 1 > best.count) best = { count: end - start + 1, from: list[start], to: list[end] }
    }
    const entry = summary.get(key)
    if (entry && best.count > BURST_COUNT) {
      entry.burst = { count: best.count, from: new Date(best.from).toISOString(), to: new Date(best.to).toISOString() }
    }
  }
  const people = [...new Set((choices.results || []).map((row) => String(row.actor_email)))].sort()
  const operations = [...new Set((choices.results || []).map((row) => String(row.operation)))].sort()
  return {
    filter: { who, op },
    summary: [...summary.values()].sort((a, b) => b.count - a.count),
    people,
    operations,
    rows: rows.results || [],
  }
}

/** @param {Env} env @param {URL} url */
async function activityJson(env, url) {
  return json(await readActivity(env, url))
}

/** @param {unknown} value */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch
  ))
}

const ACTIVITY_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit',
})

/** @param {unknown} value */
function activityTime(value) {
  const millis = Date.parse(String(value))
  return Number.isFinite(millis) ? ACTIVITY_TIME.format(millis).replace(',', '') : String(value ?? '')
}

/** @param {unknown} value */
function shortAgent(value) {
  const ua = String(value || '')
  if (!ua) return ''
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac'
    : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : ''
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : ua.slice(0, 40)
  return [browser, os].filter(Boolean).join(' · ')
}

/** @param {Env} env @param {URL} url */
async function activityPage(env, url) {
  const data = await readActivity(env, url)
  const option = (/** @type {string} */ value, /** @type {string} */ current) =>
    `<option value="${escapeHtml(value)}"${value === current ? ' selected' : ''}>${escapeHtml(value || 'Everyone')}</option>`
  const summaryRows = data.summary.map((entry) => `
      <tr class="${entry.burst ? 'burst' : ''}">
        <td>${escapeHtml(entry.who)}</td><td>${escapeHtml(entry.op)}</td><td class="num">${entry.count}</td>
        <td>${entry.burst ? `${entry.burst.count} in 10 min · ${escapeHtml(activityTime(entry.burst.from))} – ${escapeHtml(activityTime(entry.burst.to))}` : ''}</td>
      </tr>`).join('')
  const rows = data.rows.map((row) => `
      <tr class="op-${escapeHtml(row.operation)}">
        <td class="nowrap">${escapeHtml(activityTime(row.at))}</td>
        <td>${escapeHtml(row.actor_email)}</td>
        <td><span class="op">${escapeHtml(row.operation)}</span></td>
        <td><span class="id">#${escapeHtml(row.item_id)}</span> ${escapeHtml(row.title || '')}</td>
        <td class="value">${escapeHtml(row.value || '')}</td>
        <td class="nowrap">${escapeHtml(row.ip || '—')}${row.country ? ` <span class="muted">${escapeHtml(row.country)}</span>` : ''}</td>
        <td class="muted" title="${escapeHtml(row.user_agent || '')}">${escapeHtml(shortAgent(row.user_agent))}</td>
      </tr>`).join('')
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Aries Activity</title>
<style>
  :root { --ink:#17191f; --muted:#69707d; --paper:#f4f5f7; --card:#fff; --line:#dfe2e7; --warn:#fff1e6; --warn-ink:#9a3b00; }
  @media (prefers-color-scheme: dark) { :root { --ink:#e8eaee; --muted:#9aa1ad; --paper:#14161b; --card:#1d2027; --line:#30343d; --warn:#3a2414; --warn-ink:#ffb27a; } }
  * { box-sizing: border-box; }
  body { margin:0; padding:16px; background:var(--paper); color:var(--ink); font:14px/1.45 system-ui,-apple-system,sans-serif; }
  h1 { margin:0 0 4px; font-size:22px; } h2 { margin:24px 0 8px; font-size:16px; }
  p.lead { margin:0 0 16px; color:var(--muted); }
  a { color:inherit; }
  form { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin:0 0 12px; }
  select, button { font:inherit; padding:6px 10px; border:1px solid var(--line); border-radius:8px; background:var(--card); color:var(--ink); }
  .wrap { overflow-x:auto; background:var(--card); border:1px solid var(--line); border-radius:12px; }
  table { border-collapse:collapse; width:100%; }
  th, td { text-align:left; padding:7px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); position:sticky; top:0; background:var(--card); }
  .num { text-align:right; font-variant-numeric:tabular-nums; }
  .nowrap { white-space:nowrap; } .muted { color:var(--muted); }
  .id { color:var(--muted); font-variant-numeric:tabular-nums; }
  .value { max-width:260px; overflow-wrap:anywhere; color:var(--muted); }
  .op { font-weight:700; }
  tr.op-done .op, tr.op-delete .op, tr.op-archive .op { color:var(--warn-ink); }
  tr.burst td { background:var(--warn); color:var(--warn-ink); font-weight:600; }
</style></head><body>
<h1>Activity log</h1>
<p class="lead">Every change made on the board and To-Do list, newest first. Only you can see this page. <a href="/">Back to board</a></p>
<h2>Last 24 hours</h2>
<div class="wrap"><table>
  <thead><tr><th>Who</th><th>Action</th><th class="num">Count</th><th>Burst (over ${BURST_COUNT} in 10 min)</th></tr></thead>
  <tbody>${summaryRows || '<tr><td colspan="4" class="muted">No activity in the last 24 hours.</td></tr>'}</tbody>
</table></div>
<h2>All actions</h2>
<form method="get" action="/activity">
  <select name="who" aria-label="Person">${option('', data.filter.who)}${data.people.map((p) => option(p.toLowerCase(), data.filter.who)).join('')}</select>
  <select name="op" aria-label="Action"><option value="">All actions</option>${data.operations.map((o) => option(o, data.filter.op)).join('')}</select>
  <button type="submit">Filter</button>
  <span class="muted">${data.rows.length}${data.rows.length === ACTIVITY_LIMIT ? '+ (latest ' + ACTIVITY_LIMIT + ')' : ''} actions</span>
</form>
<div class="wrap"><table>
  <thead><tr><th>When (Eastern)</th><th>Who</th><th>Action</th><th>Card</th><th>Detail</th><th>IP</th><th>Device</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="7" class="muted">Nothing recorded yet.</td></tr>'}</tbody>
</table></div>
<p class="muted">IP and device are recorded from 09/29/2026 on; older rows show only who and what.</p>
</body></html>`
  return new Response(html, {
    status: 200,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
    },
  })
}

/** @param {TeamMember[]} team */
function teamPayload(team) {
  return {
    team: team.map((member) => ({
      key: member.key,
      name: member.name,
      email: member.email,
      past_emails: member.past_emails,
    })),
    domains: TEAM_DOMAINS,
  }
}

/**
 * Add a person, or change a person's name or email. Owner only. `key` present means edit.
 * @param {Request} request
 * @param {Env} env
 * @param {string} actorEmail
 */
async function saveTeamMember(request, env, actorEmail) {
  if (!hasJsonContentType(request)) return unsupportedMediaType()
  const body = await readJson(request)
  if (!isObject(body)) return badRequest('Invalid user')
  const source = /** @type {Record<string, unknown>} */ (body)
  const name = typeof source.name === 'string' ? source.name.trim().replace(/\s+/g, ' ') : ''
  const email = typeof source.email === 'string' ? source.email.trim().toLowerCase() : ''
  if (!name || name.length > TEAM_NAME_LIMIT || !TEAM_NAME.test(name)) {
    return badRequest('Enter a name: letters, spaces, apostrophes or hyphens, up to 40 characters.')
  }
  if (!TEAM_EMAIL.test(email) || email.length > TEAM_EMAIL_LIMIT) return badRequest('Enter a full email address.')
  if (!TEAM_DOMAINS.includes(email.slice(email.lastIndexOf('@') + 1))) {
    return badRequest('Use a company address: @flood.doctor, @flooddoctorva.com or @restorationdoctors.com. Aries only emails company addresses, and only those can sign in.')
  }
  if (email === 'aries@flood.doctor') return badRequest('That is the address Aries sends from.')

  const team = await loadTeam(env)
  const at = new Date().toISOString()
  const isAdd = source.key === undefined || source.key === null || source.key === ''
  const key = isAdd ? newTeamKey(name, team) : String(source.key)
  const member = isAdd ? null : team.find((candidate) => candidate.key === key)
  if (!isAdd && !member) return missing('That user is not on the list.')
  const holder = team.find((candidate) => candidate.email === email && candidate.key !== key)
  if (holder) return json({ error: `${holder.name} already uses ${email}.` }, 409)

  /** @param {string} field @param {string|null} before @param {string} after */
  const change = (field, before, after) => env.DB.prepare(`
    INSERT INTO team_changes (at, actor_email, user_key, field, old_value, new_value)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(at, actorEmail, key, field, before, after)

  if (!member) {
    if (team.length >= MAX_TEAM) return badRequest(`The list holds at most ${MAX_TEAM} people.`)
    if (!key) return badRequest('Could not make an id from that name. Try adding a last name.')
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO team_users (key, name, email, past_emails, position, updated_at, updated_by)
        VALUES (?, ?, ?, '[]', (SELECT COALESCE(MAX(position), 0) + 1 FROM team_users), ?, ?)
      `).bind(key, name, email, at, actorEmail),
      change('added', null, `${name} <${email}>`),
    ])
    return json({ ok: true, key, ...teamPayload(await loadTeam(env)) }, 201)
  }

  if (member.name === name && member.email === email) {
    return json({ ok: true, key, changed: false, ...teamPayload(team) })
  }
  // The address a person leaves stays theirs in history: newest first, and never the new one.
  const past = member.email === email
    ? member.past_emails.filter((address) => address !== email)
    : [member.email, ...member.past_emails.filter((address) => address !== member.email && address !== email)]
  const statements = [
    env.DB.prepare(`
      UPDATE team_users
      SET name = ?, email = ?, past_emails = ?, updated_at = ?, updated_by = ?
      WHERE key = ?
    `).bind(name, email, JSON.stringify(past.slice(0, MAX_PAST_EMAILS)), at, actorEmail, key),
  ]
  if (member.name !== name) statements.push(change('name', member.name, name))
  if (member.email !== email) statements.push(change('email', member.email, email))
  const [updated] = await env.DB.batch(statements)
  if (!updated.meta.changes) return json({ error: 'The user list is not set up yet.' }, 409)
  return json({ ok: true, key, changed: true, ...teamPayload(await loadTeam(env)) })
}

/** @param {Env} env */
async function operationalHealth(env) {
  const now = Date.now(), threshold = staleAfterSeconds(env)
  const definitions = [ ['board', 'board_snapshot'], ['todos', 'todo_catalogue'], ['full_list', 'worklist_snapshot'] ]
  const sources = await Promise.all(definitions.map(async ([name, table]) => {
    const row = await env.DB.prepare(`SELECT published_at FROM ${table} WHERE singleton_id = 1`).first()
    const at = row && typeof row.published_at === 'string' ? row.published_at : null
    const time = at ? Date.parse(at) : NaN
    const age = Number.isFinite(time) ? Math.max(0, (now - time) / 1000) : null
    return { name, status: age === null || time > now + 60000 ? 'unknown' : age > threshold ? 'stale' : 'current', last_evidence_at: at, age_seconds: age, after_seconds: threshold }
  }))
  await commandReceipts(env.DB)
  const counts = await env.DB.prepare(`SELECT
    COALESCE(SUM(state = 'queued'),0) AS pending,
    COALESCE(SUM(state = 'failed'),0) AS failed,
    COALESCE(SUM(state = 'queued' AND created_at < ?),0) AS stuck FROM command_queue`
  ).bind(new Date(now - 300000).toISOString()).first()
  const queue = { pending: Number(counts?.pending || 0), failed: Number(counts?.failed || 0), stuck: Number(counts?.stuck || 0) }
  return { status: sources.every(s => s.status === 'current') && !queue.failed && !queue.stuck ? 'healthy' : 'degraded',
    checked_at: new Date(now).toISOString(), sources, queue }
}

/**
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<Response>}
 */
export async function handleRequest(request, env) {
  const url = new URL(request.url)
  const host = url.hostname

  if (['/mission', '/api/mission', '/api/mission/push', '/api/mission/answer', '/api/mission/answers'].includes(url.pathname)) return missionRequest(request, env, allowedEmail(request, env) || false)

  if (host !== UI_HOST && host !== SYNC_HOST) return notFound()
  if (url.pathname === '/healthz' && request.method === 'GET') {
    const missionAuth = env.MISSION_TOKEN && await constantTimeEqual(request.headers.get('authorization') || '', 'Bearer ' + env.MISSION_TOKEN)
    if (allowedEmail(request, env) || await validPublisher(request, env) || missionAuth) return json({ ok: true, operational: await operationalHealth(env) })
    return json({ ok: true })
  }

  if (host === UI_HOST) {
    if (ACTIVITY_PATHS.has(url.pathname)) {
      if (!isActivityOwner(request, env) || !allowedEmail(request, env)) return notFound()
      if (request.method !== 'GET') return methodNotAllowed('GET')
      return url.pathname === '/activity' ? activityPage(env, url) : activityJson(env, url)
    }
    if (url.pathname === TEAM_PATH) {
      const ownerEmail = isActivityOwner(request, env) ? allowedEmail(request, env) : null
      if (!ownerEmail) return notFound()
      if (request.method === 'GET') return json(teamPayload(await loadTeam(env)))
      if (request.method === 'POST') return saveTeamMember(request, env, ownerEmail)
      return methodNotAllowed('GET, POST')
    }
    const retryMatch = url.pathname.match(/^\/api\/commands\/(\d+)\/retry$/)
    if (!UI_PATHS.has(url.pathname) && !retryMatch) return notFound()
    const actorEmail = allowedEmail(request, env)
    if (!actorEmail) return forbidden()
    if (retryMatch) {
      if (request.method !== 'POST') return methodNotAllowed('POST')
      if (!hasJsonContentType(request)) return unsupportedMediaType()
      const body = /** @type {JsonObject|null} */ (await readJson(request))
      if (!body || !isObject(body) || body.confirm !== true) return badRequest('Confirm source was checked before retrying')
      const id = Number(retryMatch[1])
      if (!Number.isSafeInteger(id) || id <= 0) return badRequest('Invalid command id')
      const result = await retryCommand(env.DB, id)
      if (result.ok) await activityStatement(env, request, {at: new Date().toISOString(), actorEmail, source:'board',operation:'retry',itemId:String(result.receipt.item_id),value:String(id)}).run()
      return json(result, result.error ? Number(result.status) : 202)
    }
    if (url.pathname === '/') {
      if (request.method !== 'GET') return methodNotAllowed('GET')
      return appHtml()
    }
    if (url.pathname === '/card') {
      if (request.method !== 'GET') return methodNotAllowed('GET')
      return appHtml(CARD_HTML)
    }
    if (url.pathname === '/api/card' || url.pathname === '/api/card/done') return cardRequest(request, env, actorEmail)
    if (url.pathname === '/api/board') return getBoard(request, env)
    if (url.pathname === '/api/action') return queueAction(request, env, actorEmail)
    if (url.pathname === '/api/todos') return getTodos(request, env)
    if (url.pathname === '/api/worklist') return getWorklist(request, env)
    if (url.pathname === '/api/thread') return getThread(request, env, url)
    if (url.pathname === '/api/todo/action') return saveTodoAction(request, env, actorEmail)
    return notFound()
  }

  if (!SYNC_PATH.test(url.pathname)) return notFound()
  if (!(await validPublisher(request, env))) return unauthorized()
  if (url.pathname === '/api/sync/snapshot') return publishSnapshot(request, env)
  if (url.pathname === '/api/sync/worklist') return publishWorklist(request, env)
  if (url.pathname === '/api/sync/threads') return publishThreads(request, env)
  // Aries keeps its own copy of the roster, so its emails go to the address Frank set here.
  if (url.pathname === '/api/sync/team') {
    if (request.method !== 'GET') return methodNotAllowed('GET')
    return json(teamPayload(await loadTeam(env)))
  }
  if (url.pathname === '/api/sync/commands') return listCommands(request, env, url)
  if (url.pathname === '/api/sync/todos/catalogue') return publishTodoCatalogue(request, env)
  if (url.pathname === '/api/sync/todos/operations') return publishTodoOperations(request, env)
  if (url.pathname === '/api/sync/todos/state') return getTodoState(request, env, url)
  const ackMatch = url.pathname.match(/^\/api\/sync\/commands\/(\d+)\/ack$/)
  if (ackMatch) {
    const commandId = Number(ackMatch[1])
    if (!Number.isSafeInteger(commandId) || commandId <= 0) return badRequest('Invalid command id')
    return acknowledgeCommand(request, env, commandId)
  }
  return notFound()
}

/** @type {ExportedHandler<Env>} */
const worker = {
  async scheduled(event, env, ctx) { ctx.waitUntil(checkServices(env,'cron')) },
  async fetch(request, env) {
    return handleRequest(request, env)
  },
}

export default worker
```


### `src/mission-state.js`

```js
/** @param {string|string[]|unknown} value */
export function parseOptions(value) {
  const parts = (Array.isArray(value) ? value : typeof value === 'string' ? [value] : [])
    .flatMap(item => typeof item === 'string' ? item.split(/[,;\n]|\s+or\s+/i) : [])
  return parts.map(item => ({label:item.replace(/\s*\(recommended\)\s*$/i,'').trim(),recommended:/\(recommended\)\s*$/i.test(item)}))
    .filter(item => item.label).sort((a,b) => Number(b.recommended)-Number(a.recommended))
}
/** Silence means stale evidence, not a proven failure. @param {any} record */
export function taskFailure(record) {
  const d = record.data || {}
  if (d.status === 'failed') return true
  if (d.status !== 'stopped') return false
  const cause = String(d.failure_cause || d.error || '')
  if (cause.trim()) return true
  const step = String(d.step || '')
  if (/^\s*(?:rc|exit(?: code)?)\s*[=: ]\s*0\s*$/i.test(step)) return false
  return /\b(?:rc|exit(?: code)?)\s*[=: ]\s*[1-9]\d*\b|^(?:failed|failure|error)\b/i.test(step)
}

/** Missing, invalid and future evidence is unknown, never current.
 * @param {any} timestamp @param {number} limitMinutes @param {number} [now] */
export function evidenceFreshness(timestamp, limitMinutes, now=Date.now()) {
  const time=typeof timestamp==='string' && timestamp.trim() ? Date.parse(timestamp) : NaN
  if (!Number.isFinite(time) || time>now+300000) return {status:'missing',at:null,minutes:null}
  const minutes=Math.max(0,Math.floor((now-time)/60000))
  return {status:minutes>limitMinutes?'stale':'current',at:timestamp,minutes}
}

/** Use producer evidence, never a backfill's upload time. @param {any} record @param {number} [now] */
export function taskState(record, now=Date.now()) {
  const d=record.data || {}, failure=taskFailure(record)
  const candidates=[d.activity_updated,d.source_updated].filter(t=>evidenceFreshness(t,40,now).at)
  const explicitSource=d.origin==='backfill' || (d.status_source && !/cli|recorder/i.test(d.status_source))
  const at=candidates.sort((a,b)=>Date.parse(b)-Date.parse(a))[0] || (!explicitSource?record.updated:null)
  const evidence=evidenceFreshness(at,40,now)
  const state=failure?'failed':d.status==='closed'?'done':['running','waiting','done','stopped'].includes(d.status)?d.status:'unknown'
  return {state,failure,evidence}
}

/** @param {any[]} tasks */
export function taskCounts(tasks) {
  /** @type {Record<string,number>} */
  const counts={running:0,waiting:0,done:0,stopped:0,failed:0,unknown:0,stale:0,missing:0}
  for (const task of tasks) {
    const state=task.state
    if (Object.prototype.hasOwnProperty.call(counts,state)) counts[state]++
    if (task.evidence.status==='stale') counts.stale++
    if (task.evidence.status==='missing') counts.missing++
  }
  return counts
}

/** Summaries separate source evidence from successful API polling. @param {any[]} records @param {number} [now] */
export function sourceFreshness(records, now=Date.now()) {
  const groups=new Map()
  for (const record of records) {
    if (!['task','machine','service','spend'].includes(record.kind)) continue
    const d=record.data || {}, name=record.kind==='task'?'Tasks · '+(d.status_source||d.origin||'direct updates'):record.kind==='machine'?'Machine observations':record.kind==='service'?'Service checks':'Spend'
    const evidence=record.kind==='task'?taskState(record,now).evidence:evidenceFreshness(record.updated,record.kind==='machine'?5:record.kind==='service'?10:20,now)
    if (!groups.has(name)) groups.set(name,{name,total:0,current:0,stale:0,missing:0,latest:null,oldest:null})
    const group=groups.get(name)
    group.total++;group[evidence.status]++
    if (evidence.at) {
      if (!group.latest || Date.parse(evidence.at)>Date.parse(group.latest)) group.latest=evidence.at
      if (!group.oldest || Date.parse(evidence.at)<Date.parse(group.oldest)) group.oldest=evidence.at
    }
  }
  return [...groups.values()]
}

/** Current work and queue evidence are distinct from rolling utilization. @param {any} record @param {number} [now] */
export function machineTelemetry(record, now=Date.now()) {
  const d=record.data || {}, observation=evidenceFreshness(record.updated,5,now)
  const heartbeat=evidenceFreshness(d.runner_heartbeat||d.runner_updated,5,now)
  const state=observation.status!=='current'?observation.status:d.reachable===false?'offline':d.reachable===true?'online':'unknown'
  const rawJob=d.current_job??d.currentJob, job=typeof rawJob==='string'&&rawJob.trim()?rawJob.trim():null
  const rawQueue=d.queue_depth??d.queueDepth
  const queue=typeof rawQueue==='number'&&Number.isSafeInteger(rawQueue)&&rawQueue>=0?rawQueue:null
  return {state,observation,heartbeat,job,queue,jobCurrent:!!job&&observation.status==='current'&&heartbeat.status==='current',queueCurrent:queue!==null&&observation.status==='current'&&heartbeat.status==='current'}
}

/** @param {any} record @param {number} [now] */
export function serviceState(record, now=Date.now()) {
  const d=record.data || {}, evidence=evidenceFreshness(record.updated,10,now)
  const availability=d.availability || (d.status==='up'?'available':d.status==='waiting'?'gated':d.status==='down'?'unavailable':'unknown')
  const op=d.operational || {}, checked=evidenceFreshness(op.checked_at,10,now)
  const operational=evidence.status==='current'&&checked.status==='current'&&['healthy','degraded'].includes(op.status)?op.status:'unknown'
  return {evidence,availability:evidence.status==='current'?availability:'unknown',operational}
}
```


### `src/mission-ui.js`

```js
import { parseOptions, taskFailure, evidenceFreshness, taskState, taskCounts, sourceFreshness, machineTelemetry, serviceState } from './mission-state.js'
export const MISSION_HTML = String.raw`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mission Control</title><style>
:root{color-scheme:light;--bg:#eef3f9;--card:#fff;--ink:#14202e;--muted:#566474;--line:#d3dce7;--blue:#1565c0;--blue-soft:#d9e8fb;--green:#1b6b2f;--green-soft:#dff3e1;--amber:#8a4b00;--amber-soft:#fdeccd;--red:#a8201a;--red-soft:#fbe0de;--bar:#e3e9f1}
:root[data-theme=dark]{color-scheme:dark;--bg:#0c141d;--card:#15212e;--ink:#eaf1f8;--muted:#9fb0c1;--line:#2b3c4e;--blue:#7ab4f5;--blue-soft:#17304d;--green:#72d58a;--green-soft:#163a22;--amber:#ffc66d;--amber-soft:#40300f;--red:#ff9b94;--red-soft:#4a1b19;--bar:#2a3b4d}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){color-scheme:dark;--bg:#0c141d;--card:#15212e;--ink:#eaf1f8;--muted:#9fb0c1;--line:#2b3c4e;--blue:#7ab4f5;--blue-soft:#17304d;--green:#72d58a;--green-soft:#163a22;--amber:#ffc66d;--amber-soft:#40300f;--red:#ff9b94;--red-soft:#4a1b19;--bar:#2a3b4d}}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
a{color:var(--blue)}button,summary,a.tile{cursor:pointer}:focus-visible{outline:3px solid var(--blue);outline-offset:2px}
#wrap{container-type:inline-size;max-width:1280px;margin:0 auto;padding:14px 16px 56px}
.top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:4px 0 14px}.top h1{font-size:1.5rem;margin:0;flex:1 1 auto;letter-spacing:-.01em}
.top .sub{width:100%;margin:0;color:var(--muted);font-size:.9rem}.top .sub.bad{color:var(--red);font-weight:700}
.btn{font:inherit;font-weight:600;min-height:44px;padding:0 16px;border-radius:22px;border:1px solid var(--line);background:var(--card);color:var(--ink);display:inline-flex;align-items:center;justify-content:center;text-decoration:none}
.btn.primary{background:var(--blue);border-color:var(--blue);color:#fff}:root[data-theme=dark] .btn.primary{color:#07182b}
.strip{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;position:sticky;top:0;z-index:5;background:var(--bg);padding:8px 0 10px}
a.tile{display:block;text-decoration:none;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:14px;padding:10px 14px;min-height:64px}
a.tile b{display:block;font-size:1.9rem;line-height:1.1;font-variant-numeric:tabular-nums}a.tile span{font-size:.9rem;color:var(--muted)}
a.tile.hot{background:var(--red-soft);border-color:var(--red)}a.tile.hot b,a.tile.hot span{color:var(--red)}a.tile.ask{background:var(--blue-soft);border-color:var(--blue)}a.tile.ask b{color:var(--blue)}a.tile.ok b{color:var(--green)}
section{margin-top:26px;scroll-margin-top:130px}h2{font-size:1.2rem;margin:0 0 10px;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}h2 small{font-weight:400;color:var(--muted);font-size:.9rem}
.pills{display:flex;flex-wrap:wrap;gap:8px}.pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 14px;font-weight:600;font-size:.9rem;border:1px solid transparent;min-height:36px}
.ok{background:var(--green-soft);color:var(--green)}.warn{background:var(--amber-soft);color:var(--amber)}.bad{background:var(--red-soft);color:var(--red)}.idle{background:var(--bar);color:var(--muted)}
.cols{display:grid;gap:12px;grid-template-columns:1fr}
.ask-card{background:var(--card);border:1px solid var(--line);border-left:6px solid var(--blue);border-radius:14px;padding:16px}
.ask-card .q{font-size:1.1rem;font-weight:600;margin:0 0 8px;overflow-wrap:anywhere}.ask-card .since{color:var(--muted);font-size:.85rem;margin:0 0 10px}
.opts{margin:0 0 12px;padding:0;list-style:none;display:grid;gap:6px}.opts li{min-width:0}.option{width:100%;min-height:48px;text-align:left;justify-content:space-between;gap:8px;border-radius:10px;background:var(--blue-soft);white-space:normal;overflow-wrap:anywhere;padding:10px 12px}.option[aria-pressed=true]{border:2px solid var(--blue);font-weight:800}.option:active,.send:active{filter:brightness(.88)}button:disabled{cursor:default;opacity:.65}.recommended{font-size:.75rem;border:1px solid currentColor;border-radius:8px;padding:2px 6px;flex-shrink:0}.instructions{margin-top:12px}.instructions label{display:block;font-weight:600;margin-bottom:6px}.instructions textarea{display:block;width:100%;min-height:76px;font:16px/1.45 system-ui;background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:10px;resize:vertical;overflow-y:hidden}.instructions .send{margin-top:8px}.answer-status{font-size:.85rem;color:var(--muted);margin:8px 0;overflow-wrap:anywhere}.session-tag{font: .8rem ui-monospace,monospace;background:var(--bar);padding:2px 5px;border-radius:4px;overflow-wrap:anywhere}.answer-status .warn{display:inline-block;padding:6px 8px;border-radius:6px}.answer-status.error{color:var(--red)}.body .instructions{max-width:620px}
.proj{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px 14px;margin-bottom:14px}
.proj>header{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:baseline;margin-bottom:6px}.proj h3{margin:0;font-size:1.05rem}.proj .counts{color:var(--muted);font-size:.85rem}
.proj .goal{margin:0 0 6px;color:var(--muted);font-size:.9rem}
details.task{border-top:1px solid var(--line)}details.task:first-of-type{border-top:0}
details.task>summary{list-style:none;display:grid;grid-template-columns:auto 1fr;gap:2px 10px;padding:10px 0;min-height:48px}details.task>summary::-webkit-details-marker{display:none}
.mk{font-size:1.15rem;line-height:1.4;grid-row:1/4}.tt{font-weight:600;overflow-wrap:anywhere}.tt .id{font-weight:400;font-size:.78rem;color:var(--muted);margin-left:6px}
.meta{font-size:.85rem;color:var(--muted)}.meta .w{font-weight:700}.meta .w.bad,.meta .w.warn{background:none}.meta .w.bad{color:var(--red)}.meta .w.warn{color:var(--amber)}.meta .w.ok{color:var(--green);background:none}
.step{font-size:.9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.task.stuck>summary{background:var(--red-soft);border-radius:10px;padding:10px;margin:2px 0}
.body{padding:2px 0 12px 34px;font-size:.92rem;overflow-wrap:anywhere}.body p{margin:4px 0}.body .path{color:var(--muted);font-size:.8rem}
.mach{display:grid;gap:12px;grid-template-columns:1fr}
.m{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px}.m.off{border:2px solid var(--red);background:var(--red-soft)}
.m{min-width:0}.m h3{flex-wrap:wrap;overflow-wrap:anywhere;margin:0;font-size:1.05rem;display:flex;gap:8px;align-items:center}.m .heard{font-size:.85rem;color:var(--muted);margin:2px 0 10px}.m.off .heard{color:var(--red);font-weight:700}
.bar{display:grid;grid-template-columns:minmax(0,120px) minmax(0,1fr) 44px;gap:8px;align-items:center;font-size:.85rem;margin:5px 0}.bar i{display:block;height:10px;border-radius:5px;background:var(--bar);overflow:hidden}.bar i b{display:block;height:100%;background:var(--blue);border-radius:5px}.bar i b.hi{background:var(--amber)}.bar em{font-style:normal;text-align:right;font-variant-numeric:tabular-nums}
.m .doing{overflow-wrap:anywhere;font-size:.88rem;margin:8px 0 0}.m details summary{font-size:.85rem;color:var(--blue);padding:8px 0;min-height:40px;display:flex;align-items:center}.m details p{font-size:.85rem;color:var(--muted);margin:2px 0;overflow-wrap:anywhere}
.more{margin-top:8px}.empty{background:var(--card);border:1px dashed var(--line);border-radius:12px;padding:14px;color:var(--muted)}
.tools{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px}.tools input{font:inherit;min-height:44px;flex:1 1 200px;border:1px solid var(--line);border-radius:22px;padding:0 16px;background:var(--card);color:var(--ink)}
.spend{margin-top:26px;color:var(--muted);font-size:.9rem}.spend b{color:var(--ink)}
@container(min-width:700px){.strip{grid-template-columns:repeat(4,1fr)}.cols{grid-template-columns:repeat(2,1fr)}.mach{grid-template-columns:repeat(2,1fr)}.top h1{font-size:1.9rem}.top .sub{width:auto}}
@container(min-width:1050px){.cols{grid-template-columns:repeat(3,1fr)}.mach{grid-template-columns:repeat(3,1fr)}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
</style><div id="wrap"><div class="top"><h1>Mission Control</h1><a class="btn" href="/?view=todos">To-do list</a><button class="btn" id="theme" type="button">Dark / light</button><p class="sub" id="fresh" role="status">Loading the latest updates...</p></div>
<nav class="strip" id="strip" aria-label="Summary"></nav>
<details id="source-details"><summary>Source freshness <span id="evidence-n" class="meta"></span></summary><div id="evidence" class="cols"></div></details>
<section id="needs"><h2>Needs you <small id="needs-n"></small></h2><div class="cols" id="decisions"></div><div class="more" id="needs-more"></div></section>
<section id="work"><h2>Work <small id="work-n"></small></h2><div class="tools"><input id="search" type="search" aria-label="Find a task" placeholder="Find a task by name or ID"><button class="btn" id="done-toggle" type="button"></button></div><div id="tasks"></div></section>
<section id="machines"><h2>Machines <small id="mach-n"></small></h2><div class="mach" id="mach"></div></section>
<section id="cloud"><h2>Cloud services</h2><div class="pills" id="services"></div></section>
<p class="spend" id="spend"></p></div><script>
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MOJI=[['â€”','—'],['â€“','–'],['â€™','’'],['â€˜','‘'],['â€œ','“'],['â€\u009d','”'],['â€¦','…'],['â€','—'],['Ã©','é']];
const fix=s=>{s=String(s==null?'':s);if(/[âÃ]/.test(s))for(const[a,b]of MOJI)s=s.split(a).join(b);return s};
const FMT=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'2-digit',day:'2-digit',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true});
const when=s=>{if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s.slice(5,7)+'/'+s.slice(8,10)+'/'+s.slice(0,4);const t=Date.parse(s);return s&&!isNaN(t)?FMT.format(new Date(t)).replace(',',' at')+' ET':'No date recorded'};
const mins=s=>{const t=Date.parse(s);return s&&!isNaN(t)?Math.max(0,Math.floor((Date.now()-t)/60000)):null};
const rel=m=>m==null?'never':m<1?'just now':m<60?m+' min ago':m<1440?Math.floor(m/60)+' hr ago':Math.floor(m/1440)+' days ago';
const dur=m=>m<60?m+' minutes':m<1440?Math.floor(m/60)+' hours':Math.floor(m/1440)+' days';
const NAMES={halo1:'Halo 1',halo2:'Halo 2',halo3:'Halo 3','frank-mini':"Frank's Mac mini",aries:'Aries Mac mini',nas:'Network storage'};
const MKR={wait:'⏳',unknown:'?',run:'\u{1F7E1}',done:'\u{1F7E2}',bad:'⚠️',ask:'\u{1F534}',stop:'⏸️'};
const parseOptions=${parseOptions.toString()};
const taskFailure=${taskFailure.toString()};
const evidenceFreshness=${evidenceFreshness.toString()};
const taskState=${taskState.toString()};
const taskCounts=${taskCounts.toString()};
const sourceFreshness=${sourceFreshness.toString()};
const machineTelemetry=${machineTelemetry.toString()};
const serviceState=${serviceState.toString()};
let answers=[],answersError=false;const drafts=new Map(),sending=new Map(),sendErrors=new Map(),attempts=new Map();
try{for(const [id,text] of JSON.parse(sessionStorage.missionDrafts||'[]'))drafts.set(id,text)}catch(e){}
function answerStatus(a){if(!a)return '';if(a.received)return 'Received by <code class="session-tag">'+esc(a.received_by||'unknown session')+'</code> at '+esc(clock(a.received))+' ET';const m=mins(a.created);return m>=15?'<span class="w warn">Not read yet, sent '+m+' minutes ago. No session has picked it up.</span>':'Sent '+esc(clock(a.created))+', waiting for a session'}
const clock=s=>new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(s));
let records=[],todos=[],todoErr=false,showDone=false,showAllAsks=false,loaded=false;const open=new Set();
const num=s=>{const m=/(\d+(?:\.\d+)?)/.exec(String(s==null?'':s));return m?Math.min(100,+m[1]):null};
function bar(label,v){if(v==null)return'<div class="bar"><span>'+label+'</span><i></i><em>n/a</em></div>';return'<div class="bar"><span>'+label+'</span><i><b class="'+(v>=90?'hi':'')+'" style="width:'+v+'%"></b></i><em>'+Math.round(v)+'%</em></div>'}
function taskInfo(r){const d=r.data,state=taskState(r),t=state.evidence.at,m=state.evidence.minutes;
const k={running:'run',waiting:'wait',failed:'bad',done:'done',stopped:'stop',unknown:'unknown'}[state.state];
const word={running:'Running',waiting:'Waiting',failed:'Failed',done:'Done',stopped:'Stopped',unknown:'Status unknown'}[state.state];
const cls=state.failure?'bad':state.state==='done'?'ok':['running','waiting'].includes(state.state)?'warn':'idle';
return{...state,id:r.id,title:fix(d.title)||r.id,step:fix(d.step),report:d.report,t,m,k,word,cls,status:state.state,stuck:state.failure}}
function evidenceLabel(e){return e.status==='missing'?'Evidence missing':e.status==='stale'?'Evidence stale · '+rel(e.minutes):'Evidence '+rel(e.minutes)}
function taskHtml(x){const stepTxt=x.step&&!/^rc=\d+$/.test(x.step)?x.step:'';
return'<details class="task'+(x.stuck?' stuck':'')+'" data-id="'+esc(x.id)+'"'+(open.has(x.id)?' open':'')+'><summary><span class="mk" aria-hidden="true">'+MKR[x.k]+'</span><span class="tt">'+esc(x.title)+'<span class="id">'+esc(x.id)+'</span></span><span class="meta"><span class="w '+x.cls+'">'+esc(x.word)+'</span> · '+esc(evidenceLabel(x.evidence))+'</span>'+(stepTxt?'<span class="step">'+esc(stepTxt)+'</span>':'')+'</summary><div class="body"><p><b>Latest step:</b> '+esc(stepTxt||'Nothing recorded')+'</p><p>Last task evidence: '+esc(x.t?when(x.t):'No progress recorded')+'</p><p class="path">Report: '+esc(x.report||'none recorded')+'</p>'+instructionBox(x.id)+'</div></details>'}
function instructionBox(id){const sent=answers.filter(a=>a.card_id===id&&a.kind==='text').at(-1),text=drafts.get(id)||'',busy=sending.has(id),err=sendErrors.get(id);
return '<div class="instructions" data-card="'+esc(id)+'"><label for="instruction-'+esc(id)+'">Your instructions</label><textarea id="instruction-'+esc(id)+'" data-instruction="'+esc(id)+'" rows="2" maxlength="4000"'+(busy?' disabled':'')+'>'+esc(text)+'</textarea><button type="button" class="btn primary send" data-send="'+esc(id)+'"'+(!text.trim()||busy?' disabled':'')+'>'+(busy?'Sending…':'Send')+'</button><p class="answer-status'+(err?' error':'')+'" role="status" aria-live="polite">'+(busy?'Sending your instructions…':err?esc(err):sent?answerStatus(sent):answersError?'Sent status unavailable. Your draft stays here.':'')+'</p>'+(err?'<button type="button" class="btn" data-retry="'+esc(id)+'">Retry</button>':'')+'</div>'}
function askCard(a){const opts=parseOptions(a.options),chosen=answers.find(x=>x.card_id===a.id&&x.kind==='choice'),locked=!!(chosen&&chosen.received),busy=sending.has(a.id);
return'<article class="ask-card" data-card="'+esc(a.id)+'"><p class="q">'+esc(fix(a.text))+'</p><p class="since">'+(a.dueIso?(a.dueIso<TODAY()?'<b class="w bad">⚠️ Overdue</b> (due '+esc(when(a.dueIso))+'). ':'<b>Due today.</b> '):'')+(a.created?'Waiting since '+esc(when(a.created))+' ('+rel(mins(a.created))+')':(a.dueIso?'':'No date recorded'))+'</p>'+(a.todo?'':(opts.length?'<ul class="opts" aria-label="Your choices">'+opts.map(o=>'<li><button type="button" class="btn option" data-choice="'+esc(o.label)+'" data-card="'+esc(a.id)+'" aria-pressed="'+!!(chosen&&chosen.choice===o.label)+'"'+(locked||busy||answersError?' disabled':'')+'><span>'+esc(fix(o.label))+'</span>'+(o.recommended?'<span class="recommended">Recommended</span>':'')+'</button></li>').join('')+'</ul>':''))+(a.todo?'<a class="btn primary" href="/?view=todos&amp;task='+esc(encodeURIComponent(a.todo_id))+'">Open in to-do list</a>':(chosen?'<p class="answer-status">You chose: '+esc(chosen.choice)+', '+esc(clock(chosen.created))+' ET'+'<br>'+answerStatus(chosen)+(locked?' · Received. Use Your instructions to change it.':'')+'</p>':'')+instructionBox(a.id))+'</article>'}
const TODAY=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date());
const dueIso=s=>{s=String(s||'');let m=/(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);if(m)return m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');m=/(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);return m?m[3]+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0'):''};
function render(){const focused=document.activeElement,focusId=focused&&focused.id,selection=focused&&focused.tagName==='TEXTAREA'?[focused.selectionStart,focused.selectionEnd]:null;const by=k=>records.filter(r=>r.kind===k);
let asks=by('decision').filter(r=>r.data.status!=='done'&&r.data.text).map(r=>({id:r.id,text:r.data.text,options:r.data.options,created:r.data.created||r.updated,todo:false})).concat(todos);
const today=TODAY();const allTodos=asks.filter(a=>a.todo);const dueTodos=allTodos.filter(a=>{a.dueIso=dueIso(a.due);return a.dueIso&&a.dueIso<=today});const otherTodos=allTodos.length-dueTodos.length;
asks=asks.filter(a=>!a.todo||dueTodos.includes(a));
asks.sort((a,b)=>(a.dueIso&&a.dueIso<today?0:1)-(b.dueIso&&b.dueIso<today?0:1)||(a.created?0:1)-(b.created?0:1)||String(a.created).localeCompare(String(b.created)));
const tasks=by('task').map(taskInfo),counts=taskCounts(tasks),running=counts.running,stuck=counts.failed;
const mrows=by('machine');for(const id of Object.keys(NAMES))if(!mrows.some(r=>r.id===id))mrows.push({id,data:{},updated:null});
const mst=mrows.map(r=>({r,...machineTelemetry(r)}));
const svc=by('service').map(r=>({r,...serviceState(r)}));
const svcBad=svc.filter(s=>s.availability==='unavailable'||s.operational==='degraded').length,machOff=mst.filter(x=>x.state==='offline').length,machOn=mst.filter(x=>x.state==='online').length,problems=stuck+machOff+svcBad;
const unknownMachines=mst.length-machOn-machOff;
document.getElementById('strip').innerHTML=
'<a class="tile'+(asks.length?' ask':' ok')+'" href="#needs"><b>'+asks.length+'</b><span>need you</span></a>'+
'<a class="tile" href="#work"><b>'+running+'</b><span>reported running</span></a>'+
'<a class="tile'+(problems?' hot':'')+'" href="#'+(stuck?'work':machOff?'machines':'cloud')+'"><b>'+(problems?'⚠️ ':'')+problems+'</b><span>confirmed issues</span></a>'+
'<a class="tile'+(machOff?' hot':'')+'" href="#machines"><b>'+machOn+' of '+mst.length+'</b><span>machines online'+(unknownMachines?' · '+unknownMachines+' unconfirmed':'')+'</span></a>';
const sources=sourceFreshness(records),staleSources=sources.reduce((n,s)=>n+s.stale,0),missingSources=sources.reduce((n,s)=>n+s.missing,0);
document.getElementById('evidence-n').textContent='· '+staleSources+' stale · '+missingSources+' missing';
document.getElementById('evidence').innerHTML=sources.map(s=>'<article class="empty"><b>'+esc(s.name)+'</b><p class="meta">'+s.current+' current · '+s.stale+' stale · '+s.missing+' missing</p><p class="meta">Latest evidence: '+esc(s.latest?when(s.latest):'Unknown')+'<br>Oldest evidence: '+esc(s.oldest?when(s.oldest):'Unknown')+'</p></article>').join('')||'<p class="meta">No source evidence has reported.</p>';
document.getElementById('needs-n').textContent=asks.length?'oldest first':'';
const shown=showAllAsks?asks:asks.slice(0,6);
document.getElementById('decisions').innerHTML=asks.length?shown.map(askCard).join(''):(todoErr?'':'<div class="empty">No decisions or due to-dos are waiting on you.</div>');
if(todoErr)document.getElementById('decisions').innerHTML+='<div class="empty bad">⚠️ Your Aries to-do items could not be read, so this list may be missing some.</div>';
document.getElementById('needs-more').innerHTML=(otherTodos?'<p class="meta"><a href="/?view=todos">'+otherTodos+' more on your to-do list</a></p>':'')+(asks.length>6?'<button class="btn" id="asks-toggle" type="button">'+(showAllAsks?'Show fewer':'Show all '+asks.length)+'</button>':'');
const q=document.getElementById('search').value.toLowerCase().trim();const cutoff=24*60;
const vis=x=>{if(q)return(x.id+' '+x.title+' '+x.step).toLowerCase().includes(q);return showDone||!(x.k==='done'||x.k==='stop')||(x.m!=null&&x.m<=cutoff)};
const order={bad:0,run:1,wait:2,unknown:3,done:4,stop:5};const sorter=(a,b)=>order[a.k]-order[b.k]||(a.m==null?9e9:a.m)-(b.m==null?9e9:b.m);
const stages=by('project').sort((a,b)=>a.id.localeCompare(b.id)).map(r=>({r,ids:String(r.data.tasks||'').split(/[,\s]+/).filter(Boolean)}));
const claimed=new Set();const groups=stages.map(s=>{const list=tasks.filter(x=>s.ids.includes(x.id));list.forEach(x=>claimed.add(x.id));const t=fix(s.r.data.title||'').split(' · ');return{name:t[0]?t.slice(0,1).join(''):'Stage',head:t.slice(1).join(' · '),goal:fix(s.r.data.done_when),list}});
const rest=tasks.filter(x=>!claimed.has(x.id));if(rest.length)groups.push({name:'Everything else',head:'Tasks that are not part of a plan stage',goal:'',list:rest});
const hiddenN=tasks.filter(x=>!q&&!showDone&&(x.k==='done'||x.k==='stop')&&!(x.m!=null&&x.m<=cutoff)).length;
document.getElementById('work-n').textContent=tasks.length+' tasks';
const dt=document.getElementById('done-toggle');dt.textContent=showDone?'Hide old finished tasks':'Show finished tasks'+(hiddenN?' ('+hiddenN+' older than a day)':'');
document.getElementById('tasks').innerHTML=groups.map(g=>{const l=g.list.filter(vis).sort(sorter);if(!l.length&&q)return'';const c=taskCounts(g.list),nrun=c.running,nbad=c.failed;
return'<div class="proj"><header><h3>'+esc(g.name)+'</h3><span class="counts">'+esc(g.head)+'</span></header>'+(g.goal?'<p class="goal">Done when: '+esc(g.goal)+'</p>':'')+'<p class="counts">'+nrun+' running · '+c.waiting+' waiting'+(nbad?' · ⚠️ '+nbad+' failed':'')+' · '+c.done+' done'+(c.stale?' · '+c.stale+' stale evidence':'')+(c.missing?' · '+c.missing+' missing evidence':'')+'</p>'+(l.length?l.map(taskHtml).join(''):'<p class="meta">Nothing active. Older finished tasks are hidden.</p>')+'</div>'}).join('')||'<div class="empty">No tasks have reported yet.</div>';
document.getElementById('mach-n').textContent=machOn+' of '+mst.length+' online'+(unknownMachines?' · '+unknownMachines+' unconfirmed':'');
document.getElementById('mach').innerHTML=mst.sort((a,b)=>(a.state==='online')-(b.state==='online')).map(x=>{const {r,state,observation,heartbeat}=x,d=r.data,halo=r.id.startsWith('halo'),model=d.models?String(d.models).split(/,\s*/).map(esc).join('<br>'):'';
const online=state==='online',offline=state==='offline',word=online?'Online':offline?'Offline':state==='stale'?'Observation stale':'Unknown';
return'<article class="m'+(offline?' off':'')+'"><h3><span aria-hidden="true">'+(online?MKR.done:offline?MKR.bad:MKR.unknown)+'</span>'+esc(NAMES[r.id]||r.id)+' <span class="pill '+(online?'ok':offline?'bad':'warn')+'">'+word+'</span></h3><p class="heard">Observation: '+esc(observation.at?when(observation.at):'Missing')+'</p>'+
(halo?bar('Rolling busy',num(d.busy)):bar('CPU',num(d.cpu)))+bar('Memory',num(d.memory))+'<div class="bar"><span>Disk</span><span>'+(d.disk?esc(d.disk)+' free':'Unknown')+'</span><em></em></div>'+
'<p class="doing"><b>Current job:</b> '+(x.jobCurrent?esc(fix(x.job)):'Unknown')+'</p><p class="doing"><b>Queue depth:</b> '+(x.queueCurrent?x.queue:'Unknown')+'</p><p class="meta"><b>Runner heartbeat:</b> '+esc(heartbeat.at?when(heartbeat.at)+' · '+heartbeat.status:'Unknown')+'</p>'+
(d.chunk?'<p class="meta"><b>Last recorded work:</b> '+esc(fix(d.chunk))+'</p>':'')+(halo?'<p class="meta">Rolling busy describes recent utilization; it does not identify a current job.</p>':'')+(d.observer?'<p class="meta">Observed by '+esc(d.observer)+'.</p>':'')+
(model||x.job||x.queue!==null?'<details data-id="m-'+esc(r.id)+'"'+(open.has('m-'+r.id)?' open':'')+'><summary>Details</summary>'+(model?'<p>'+model+'</p>':'')+(x.job&&!x.jobCurrent?'<p>Last reported job: '+esc(fix(x.job))+'</p>':'')+(x.queue!==null&&!x.queueCurrent?'<p>Last reported queue depth: '+x.queue+'</p>':'')+'</details>':'')+'</article>'}).join('');
document.getElementById('services').innerHTML=svc.map(({r,evidence,availability,operational})=>{const good=operational==='healthy',bad=operational==='degraded'||availability==='unavailable',cls=good?'ok':bad?'bad':'warn';
const available=availability==='available'?'Reachable':availability==='gated'?'Access gate':availability==='unavailable'?'Unavailable':evidence.status==='stale'?'Check stale':'Availability unknown';
const health=good?'Operational checks passed':operational==='degraded'?'Operational checks degraded':'Operational health unknown';
const queue=r.data.operational&&r.data.operational.queue;
return'<span class="pill '+cls+'" title="'+esc((r.data.detail||'')+(queue?' · Queue: '+queue.pending+' pending, '+queue.failed+' failed':''))+'"><span aria-hidden="true">'+(good?MKR.done:bad?MKR.bad:MKR.unknown)+'</span>'+esc(r.id.replace('.flood.doctor','').replace('.restorationdoctors.com',' (Restoration Doctors)'))+': '+available+' · '+health+'</span>'}).join('')||'<div class="empty">Waiting for the first cloud check.</div>';
const sp=by('spend')[0];const spm=sp?mins(sp.updated):null;document.getElementById('spend').innerHTML=sp?'<b>Spend today:</b> '+esc((String(sp.data.text).match(/^\$[\d,.]+/)||['unknown'])[0])+' at list price'+(spm>20?' <span class="pill bad">⚠️ Spend figure is old</span>':'')+' (Not the amount billed.)':'<span class="pill bad">⚠️ Spend has not reported. That does not mean zero.</span>';
if(focusId){const el=document.getElementById(focusId);if(el){el.focus({preventScroll:true});if(selection)el.setSelectionRange(...selection)}}
for(const el of document.querySelectorAll('textarea[data-instruction]'))grow(el);
}
async function refresh(){const f=document.getElementById('fresh');try{try{const t=await fetch('/api/todos');if(!t.ok)throw Error();const j=await t.json();todos=(j.items||[]).filter(t=>!t.done&&!t.archived&&/frank/i.test((t.assignee||'')+' '+(t.who||''))).map(t=>({id:'Todo-'+t.id,todo_id:String(t.id),text:t.text,created:t.created||t.date||'',due:t.due||'',todo:true}));todoErr=false}catch(e){todoErr=true}
const r=await fetch('/api/mission');if(!r.ok)throw Error('Server answered '+r.status);records=(await r.json()).records;await refreshAnswers();loaded=true;render();f.className='sub';f.textContent='API fetched '+when(new Date().toISOString())+'. Source evidence ages are shown separately. Refreshes every 30 seconds.'}catch(e){f.className='sub bad';f.textContent='⚠️ Updates are not arriving. What you see may be old. ('+e.message+')';if(loaded)render()}}
function grow(el){el.style.height='auto';el.style.height=Math.max(76,el.scrollHeight)+'px'}
function remember(){try{sessionStorage.missionDrafts=JSON.stringify([...drafts])}catch(e){}}
async function refreshAnswers(){try{const r=await fetch('/api/mission/answers',{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error();answers=(await r.json()).answers;answersError=false}catch(e){answersError=true}}
async function sendAnswer(id,kind,choice){if(sending.has(id))return;const text=drafts.get(id)||'';if(kind==='text'&&!text.trim())return;
let attempt=attempts.get(id);if(!attempt||attempt.kind!==kind||attempt.text!==text||attempt.choice!==choice){attempt={kind,text,choice,request_id:crypto.randomUUID()};attempts.set(id,attempt)}
sending.set(id,kind);sendErrors.delete(id);render();
try{if(!navigator.onLine)throw Error('offline');const r=await fetch('/api/mission/answer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({card_id:id,...attempt}),signal:AbortSignal.timeout(20000)});let j;try{j=await r.json()}catch(e){throw Error('server')};if(!r.ok)throw Error(j.error||'server');answers=answers.filter(a=>a.id!==j.answer.id).concat(j.answer);answersError=false;if(kind==='text'){drafts.delete(id);remember()}attempts.delete(id)}
catch(e){sendErrors.set(id,e.message==='offline'?'You are offline. Your text is saved here. Retry when connected.':e.name==='TimeoutError'||e.name==='AbortError'?'The reply is slow. Your text is saved here. Retry safely.':e.message==='Failed to fetch'?'Could not send. Your text is saved here. Retry.':e.message);await refreshAnswers()}
finally{sending.delete(id);render()}}
document.addEventListener('input',e=>{const el=e.target;if(!el.dataset||!el.dataset.instruction)return;const id=el.dataset.instruction;drafts.set(id,el.value);remember();grow(el);const b=el.parentElement.querySelector('[data-send]');b.disabled=!el.value.trim()||sending.has(id)});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.choice)sendAnswer(b.dataset.card,'choice',b.dataset.choice);else if(b.dataset.send)sendAnswer(b.dataset.send,'text');else if(b.dataset.retry){const a=attempts.get(b.dataset.retry);sendAnswer(b.dataset.retry,a?a.kind:'text',a&&a.choice)}});
document.addEventListener('toggle',e=>{const d=e.target;if(d.dataset&&d.dataset.id){d.open?open.add(d.dataset.id):open.delete(d.dataset.id)}},true);
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.id==='done-toggle'){showDone=!showDone;render()}if(b.id==='asks-toggle'){showAllAsks=!showAllAsks;render()}});
document.getElementById('search').oninput=()=>loaded&&render();
(()=>{let s='';try{s=localStorage.missionTheme||''}catch(e){}if(s)document.documentElement.dataset.theme=s})();
document.getElementById('theme').onclick=()=>{const dark=matchMedia('(prefers-color-scheme:dark)').matches,cur=document.documentElement.dataset.theme||(dark?'dark':'light'),n=cur==='dark'?'light':'dark';document.documentElement.dataset.theme=n;try{localStorage.missionTheme=n}catch(e){}};
refresh();setInterval(refresh,30000);
</script></html>`
```


### `src/mission.js`

```js
import { MISSION_HTML } from './mission-ui.js'
import { evidenceFreshness, parseOptions } from './mission-state.js'
/** @param {Request} request @param {any} env @param {boolean|string} canRead */
export async function missionRequest(request, env, canRead) {
  const url = new URL(request.url)
  if (url.pathname === '/api/mission/answer' || url.pathname === '/api/mission/answers') return answerRequest(request,env,canRead)
  const post = url.hostname === 'aries-publish.flood.doctor' && url.pathname === '/api/mission/push'
  const publisherRead = url.hostname === 'aries-publish.flood.doctor' && url.pathname === '/api/mission'
  if (post || publisherRead) {
    if (request.method !== (publisherRead ? 'GET' : 'POST')) return new Response('Method not allowed', {status:405})
    const token = request.headers.get('authorization') || ''
    /** @param {string} s */
    const hash = async s => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
    const a = await hash(token), b = await hash('Bearer ' + env.MISSION_TOKEN)
    if (!env.MISSION_TOKEN || a.some((v,i)=>v!==b[i])) return new Response('Unauthorized',{status:401})
    if (publisherRead) {
      const rows = await env.DB.prepare('SELECT kind,id,data,updated FROM mission_records').all()
      return Response.json({records:rows.results.map(/** @param {any} r */ r=>({...r,data:JSON.parse(r.data)}))},{headers:{'cache-control':'no-store'}})
    }
    const raw = await request.text()
    if (raw.length > 100000) return new Response('Too large',{status:413})
    let body
    try { body = JSON.parse(raw) } catch { return new Response('Invalid JSON',{status:400}) }
    const {kind,id,data} = body
    if(kind==='check' && id==='cloud'){await checkServices(env);return Response.json({ok:true,id,updated:new Date().toISOString()})}
    if (!['task','decision','machine','project','spend'].includes(kind) || typeof id !== 'string' || !/^[\w.-]{1,100}$/.test(id) || !data || typeof data !== 'object' || Array.isArray(data)) return new Response('Invalid record',{status:400})
    if(kind==='task' && !['running','done','stopped','failed','waiting'].includes(data.status)) return new Response('Invalid status',{status:400})
    const now = new Date().toISOString()
    // Compare within the upsert so concurrent CLI pushes cannot race a read-then-write guard.
    const result = await env.DB.prepare(`
      INSERT INTO mission_records(kind,id,data,updated) VALUES(?,?,?,?)
      ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data,updated=excluded.updated
      WHERE NOT (
        excluded.kind='task'
        AND COALESCE(json_extract(excluded.data,'$.origin'),'backfill')='backfill'
        AND COALESCE(json_extract(mission_records.data,'$.origin'),
          CASE WHEN lower(COALESCE(json_extract(mission_records.data,'$.status_source'),'')) LIKE '%cli%'
            OR lower(COALESCE(json_extract(mission_records.data,'$.status_source'),'')) LIKE '%recorder%'
          THEN 'cli' ELSE 'backfill' END)='cli'
        AND (json_extract(mission_records.data,'$.status') IN ('done','closed','waiting')
          OR COALESCE(julianday(json_extract(excluded.data,'$.source_updated')) > julianday(mission_records.updated),0)=0)
      )`).bind(kind,id,JSON.stringify(data),now).run()
    if (result?.meta?.changes === 0) return Response.json({ok:true,id,skipped:'newer cli push'})
    return Response.json({ok:true,id,updated:now})
  }
  if (!canRead || url.hostname !== 'aries.flood.doctor') return new Response('Forbidden',{status:403})
  if (request.method !== 'GET') return new Response('Method not allowed',{status:405})
  if(url.pathname === '/mission') return new Response(MISSION_HTML,{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"}})
  const rows = await env.DB.prepare('SELECT kind,id,data,updated FROM mission_records').all()
  return Response.json({now:new Date().toISOString(),records:rows.results.map(/** @param {any} r */ r=>({...r,data:JSON.parse(r.data)}))},{headers:{'cache-control':'no-store'}})
}
/** @param {Request} request @param {any} env @param {boolean|string} actor */
async function answerRequest(request, env, actor) {
  const url = new URL(request.url)
  /** @param {any} body @param {number} [status] */
  const response = (body,status=200) => Response.json(body,{status,headers:{'cache-control':'no-store'}})
  if (url.hostname === 'aries-publish.flood.doctor' && url.pathname === '/api/mission/answers') {
    if (request.method !== 'POST') return response({error:'Method not allowed'},405)
    /** @param {string} value */
    const hash = async value => new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))
    const a=await hash(request.headers.get('authorization')||''), b=await hash('Bearer '+env.MISSION_TOKEN)
    if (!env.MISSION_TOKEN || a.some((v,i)=>v!==b[i])) return response({error:'Unauthorized'},401)
    if (!(request.headers.get('content-type')||'').match(/^application\/json(?:\s*;|$)/i)) return response({error:'JSON required'},415)
    let body
    try { body=await request.json() } catch {return response({error:'Invalid JSON'},400)}
    if (!body || !['new','all'].includes(body.mode)) return response({error:'Invalid mode'},400)
    const by=body.by==null?'mission-poller':body.by
    if (typeof by!=='string' || !/^[\w.:@-]{1,160}$/.test(by)) return response({error:'Invalid session tag'},400)
    // One SQLite statement claims the entire pending set. No read-before-write race.
    const rows=body.mode==='new'
      ? await env.DB.prepare('UPDATE mission_answers SET received=?,received_by=? WHERE received IS NULL RETURNING id,card_id,kind,choice,text,created,author,received,received_by').bind(new Date().toISOString(),by).all()
      : await env.DB.prepare('SELECT id,card_id,kind,choice,text,created,author,received,received_by FROM mission_answers ORDER BY id').all()
    return response({answers:rows.results.map((/** @type {any} */ row)=>({...row,by:row.received_by})).sort((/** @type {any} */ a,/** @type {any} */ b)=>a.id-b.id)})
  }
  if (url.hostname !== 'aries.flood.doctor') return response({error:'Not found'},404)
  if (typeof actor !== 'string' || !actor) return response({error:'Unauthorized'},401)
  if (url.pathname === '/api/mission/answers') {
    if (request.method !== 'GET') return response({error:'Method not allowed'},405)
    const rows=await env.DB.prepare('SELECT id,card_id,kind,choice,text,created,received,received_by FROM mission_answers WHERE author=? ORDER BY id').bind(actor).all()
    return response({answers:rows.results})
  }
  if (request.method !== 'POST') return response({error:'Method not allowed'},405)
  if (request.headers.get('origin') !== url.origin) return response({error:'Origin does not match'},403)
  if (!(request.headers.get('content-type')||'').match(/^application\/json(?:\s*;|$)/i)) return response({error:'JSON required'},415)
  const raw=await request.text()
  if (raw.length>30000) return response({error:'Too large'},413)
  let body
  try {body=JSON.parse(raw)} catch {return response({error:'Invalid JSON'},400)}
  if (!body || typeof body.card_id!=='string' || !/^[\w.-]{1,100}$/.test(body.card_id) || !['choice','text'].includes(body.kind)) return response({error:'Invalid answer'},400)
  const card=await env.DB.prepare("SELECT kind,data FROM mission_records WHERE id=? AND kind IN ('decision','task') ORDER BY CASE kind WHEN 'decision' THEN 0 ELSE 1 END LIMIT 1").bind(body.card_id).first()
  if (!card) return response({error:'Card not found'},404)
  const data=JSON.parse(card.data)
  const now=new Date().toISOString()
  if (body.kind==='choice') {
    if (typeof body.choice!=='string' || !parseOptions(data.options).some(o=>o.label===body.choice)) return response({error:'Invalid choice'},400)
    const rows=await env.DB.prepare(`INSERT INTO mission_answers(card_id,kind,choice,created,author)
      VALUES(?,'choice',?,?,?) ON CONFLICT(card_id,author) WHERE kind='choice'
      DO UPDATE SET choice=excluded.choice,created=excluded.created WHERE mission_answers.received IS NULL
      RETURNING id,card_id,kind,choice,text,created,received,received_by`).bind(body.card_id,body.choice,now,actor).all()
    if (!rows.results.length) return response({error:'Received. Use Your instructions to change your choice.'},409)
    return response({answer:rows.results[0]})
  }
  if (typeof body.text!=='string' || !body.text.trim() || body.text.length>4000) return response({error:'Instructions must contain 1 to 4,000 characters'},400)
  if (body.request_id==null) body.request_id=crypto.randomUUID()
  if (typeof body.request_id!=='string' || !/^[\w-]{1,100}$/.test(body.request_id)) return response({error:'Invalid request id'},400)
  const rows=await env.DB.prepare(`INSERT INTO mission_answers(card_id,kind,text,created,author,request_id)
    VALUES(?,'text',?,?,?,?) ON CONFLICT(author,request_id) DO UPDATE SET request_id=excluded.request_id
    RETURNING id,card_id,kind,choice,text,created,received,received_by`).bind(body.card_id,body.text,now,actor,body.request_id).all()
  return response({answer:rows.results[0]})
}
/** A responding homepage proves availability only. Operational health requires dated evidence.
 * @param {number} status @param {string} text @param {number} [now] */
export function serviceProbe(status, text, now=Date.now()) {
  const gate=status>=300&&status<400 || [401,403].includes(status) || /cloudflare access|sign in.*cloudflare/i.test(text)
  const ok=status>=200&&status<300
  const availability=gate?'gated':ok?'available':'unavailable'
  let body
  try {body=JSON.parse(text)} catch {}
  const source=body?.operational
  const sources=Array.isArray(source?.sources)?source.sources.slice(0,30).map((/** @type {any} */ s)=>({name:String(s?.name||'Source').slice(0,100),status:String(s?.status||'unknown'),last_evidence_at:s?.last_evidence_at||null,after_seconds:s?.after_seconds===undefined?600:s.after_seconds})):[]
  const queue=source?.queue, hasQueue=queue && Number.isSafeInteger(queue.pending)&&queue.pending>=0&&Number.isSafeInteger(queue.failed)&&queue.failed>=0
  const checked=evidenceFreshness(source?.checked_at,10,now)
  /** @param {any} at @param {any} afterSeconds */
  const currentEvidence=(at,afterSeconds)=>{
    if (typeof afterSeconds!=='number'||!Number.isFinite(afterSeconds)||afterSeconds<=0) return false
    const evidence=evidenceFreshness(at,afterSeconds/60,now),age=now-Date.parse(at)
    return evidence.status==='current'&&age>=0&&age<=afterSeconds*1000
  }
  let health='unknown'
  if (ok&&!gate&&currentEvidence(source?.checked_at,600)&&(sources.length||hasQueue)) {
    if (source.status==='degraded') health='degraded'
    if (source.status==='healthy'&&sources.length&&sources.every((/** @type {any} */ s)=>['current','healthy'].includes(s.status)&&currentEvidence(s.last_evidence_at,s.after_seconds))&&(!hasQueue||queue.failed===0)) health='healthy'
  }
  const detail=gate?'Access gate answered; operational health unknown':!ok?'HTTP '+status+'; service unavailable':health==='healthy'?'Fresh operational checks passed':health==='degraded'?'Operational checks report a problem':'HTTP '+status+'; reachable, operational evidence unavailable'
  return {status:gate?'waiting':ok?'up':'down',availability,operational:{status:health,checked_at:checked.at,sources,...(hasQueue?{queue:{pending:queue.pending,failed:queue.failed}}:{})},detail}
}
/** @param {any} env */
export async function checkServices(env, cause='manual') {
  const targets = [
    ['engine.flood.doctor','https://engine.flood.doctor/health'],
    ['dashboard.restorationdoctors.com','https://dashboard.restorationdoctors.com/'],
    ['aries.flood.doctor','https://aries-publish.flood.doctor/healthz'],
    ['crm.flood.doctor','https://crm.flood.doctor/']
  ]
  await Promise.all(targets.map(async ([host,url])=>{
    const start=Date.now();
    /** @type {any} */
    let data
    /** @type {Record<string,string>} */
    const headers = host==='engine.flood.doctor' ? {'CF-Access-Client-Id':env.ENGINE_ACCESS_ID,'CF-Access-Client-Secret':env.ENGINE_ACCESS_SECRET} : host==='aries.flood.doctor'&&env.MISSION_TOKEN ? {Authorization:'Bearer '+env.MISSION_TOKEN} : {}
    try {
      const r=host==='aries.flood.doctor' && env.SELF ? await env.SELF.fetch('https://aries.flood.doctor/healthz',{headers}) : host==='engine.flood.doctor' && env.ENGINE ? await env.ENGINE.fetch(url,{headers}) : await fetch(url,{headers,redirect:'manual',signal:AbortSignal.timeout(10000)})
      const text=(await r.text()).slice(0,32000)
      data={...serviceProbe(r.status,text),ms:Date.now()-start}
    } catch {data={status:'down',availability:'unavailable',operational:{status:'unknown'},ms:Date.now()-start,detail:'No response; operational health unknown'}}
    data.checked_by=cause
    await env.DB.prepare('INSERT INTO mission_records VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data,updated=excluded.updated').bind('service',host,JSON.stringify(data),new Date().toISOString()).run()
  }))
}
```


### `src/ui.js`

```js
import { BOARD_UPGRADE_CSS, BOARD_UPGRADE_CONTROLS, BOARD_UPGRADE_DIALOGS, BOARD_UPGRADE_SCRIPT } from './board-ui-upgrades.js'

export const APP_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Aries — Operations Board</title>
  <style>
    :root {
      --ink: #17191f;
      --muted: #69707d;
      --faint: #9299a6;
      --paper: #f4f5f7;
      --surface: #ffffff;
      --line: #dfe2e7;
      --blue: #1967d2;
      --blue-soft: #e8f0fe;
      --green: #137b50;
      --green-soft: #e2f4eb;
      --amber: #a35b00;
      --amber-soft: #fff2d5;
      --red: #bd2d28;
      --red-soft: #fce8e6;
      --violet: #6f42c1;
      --shadow: 0 14px 36px rgba(24, 29, 38, .08);
      --radius: 18px;
    }

    * { box-sizing: border-box; }
    html { min-height: 100%; background: var(--paper); }
    body {
      min-height: 100vh;
      margin: 0;
      color: var(--ink);
      background:
        linear-gradient(90deg, rgba(25, 103, 210, .055) 1px, transparent 1px),
        linear-gradient(rgba(25, 103, 210, .045) 1px, transparent 1px),
        radial-gradient(circle at 86% 6%, rgba(25, 103, 210, .11), transparent 26rem),
        var(--paper);
      background-size: 48px 48px, 48px 48px, auto, auto;
      font: 15px/1.5 Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    button, input { font: inherit; }
    button { min-height: 44px; }
    .skip-link {
      position: fixed;
      left: 16px;
      top: 12px;
      z-index: 20;
      padding: 10px 14px;
      color: white;
      background: var(--ink);
      border-radius: 9px;
      transform: translateY(-160%);
      transition: transform .18s ease;
    }
    .skip-link:focus { transform: translateY(0); }

    .shell { width: min(1480px, 100%); margin: 0 auto; padding: 28px 34px 64px; }
    .masthead {
      position: relative;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 28px;
      align-items: end;
      overflow: hidden;
      padding: 28px 30px;
      color: white;
      background: #181b22;
      border-radius: 22px;
      box-shadow: var(--shadow);
    }
    .masthead::before {
      content: "";
      position: absolute;
      inset: 0 auto 0 0;
      width: 8px;
      background: linear-gradient(180deg, #6aa8ff, var(--blue));
    }
    .masthead::after {
      content: "";
      position: absolute;
      width: 360px;
      height: 360px;
      right: -160px;
      top: -240px;
      border: 1px solid rgba(255, 255, 255, .17);
      border-radius: 50%;
      box-shadow: 0 0 0 42px rgba(255, 255, 255, .025), 0 0 0 84px rgba(255, 255, 255, .018);
    }
    .brand, .mast-meta { position: relative; z-index: 1; }
    .brand-line { display: flex; align-items: center; gap: 13px; }
    .mark {
      display: grid;
      place-items: center;
      width: 42px;
      height: 42px;
      color: #bcd6ff;
      background: rgba(255, 255, 255, .07);
      border: 1px solid rgba(255, 255, 255, .14);
      border-radius: 12px;
      font-size: 25px;
    }
    h1 { margin: 0; font-size: clamp(2rem, 4vw, 3.25rem); line-height: .95; letter-spacing: -.055em; }
    .eyebrow { margin: 0 0 8px; color: #9abff3; font-size: 11px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; }
    .subtitle { margin: 13px 0 0 55px; color: #b9bec9; font-size: 14px; }
    .mast-meta { display: grid; justify-items: end; gap: 7px; text-align: right; }
    .state-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 32px;
      padding: 6px 11px;
      color: #c8f4df;
      background: rgba(28, 160, 103, .16);
      border: 1px solid rgba(91, 225, 163, .27);
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .1em;
      text-transform: uppercase;
    }
    .state-badge::before { content: ""; width: 8px; height: 8px; background: #59dc9d; border-radius: 50%; box-shadow: 0 0 0 4px rgba(89, 220, 157, .12); }
    .state-badge.stale { color: #ffd98e; background: rgba(163, 91, 0, .19); border-color: rgba(255, 202, 97, .28); }
    .state-badge.stale::before { background: #ffc85c; box-shadow: 0 0 0 4px rgba(255, 200, 92, .12); }
    .state-badge.offline { color: #ffc1bd; background: rgba(189, 45, 40, .18); border-color: rgba(255, 126, 118, .25); }
    .state-badge.offline::before { background: #ff7c73; box-shadow: 0 0 0 4px rgba(255, 124, 115, .12); }
    #activity-link { color: #aeb4c0; font-size: 12px; font-weight: 700; }
    #published { color: #aeb4c0; font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }

    .view-switch {
      display: inline-flex;
      gap: 4px;
      margin: 18px 0 0;
      padding: 4px;
      background: rgba(255, 255, 255, .84);
      border: 1px solid var(--line);
      border-radius: 12px;
      box-shadow: 0 6px 18px rgba(24, 29, 38, .035);
    }
    .view-switch button {
      min-width: 104px;
      padding: 7px 16px;
      color: var(--muted);
      background: transparent;
      border: 0;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 800;
    }
    .view-switch button[aria-pressed="true"] { color: white; background: var(--ink); box-shadow: 0 4px 12px rgba(24, 29, 38, .16); }

    .summary-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin: 18px 0 26px; }
    .metric {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 18px;
      background: rgba(255, 255, 255, .88);
      border: 1px solid var(--line);
      border-radius: 14px;
      box-shadow: 0 6px 18px rgba(24, 29, 38, .035);
    }
    .metric-label { color: var(--muted); font-size: 12px; font-weight: 750; letter-spacing: .07em; text-transform: uppercase; }
    .metric-value { font: 700 25px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }

    .section-head { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin-bottom: 14px; }
    .section-head h2 { margin: 0; font-size: clamp(1.35rem, 2.2vw, 1.8rem); letter-spacing: -.03em; }
    .section-head p { margin: 4px 0 0; color: var(--muted); }
    .refresh-button, .card-action, .dialog-action {
      border: 1px solid #cfd3da;
      border-radius: 10px;
      background: white;
      color: var(--ink);
      cursor: pointer;
      font-weight: 720;
      transition: transform .16s ease, border-color .16s ease, background .16s ease, box-shadow .16s ease;
    }
    .refresh-button { padding: 9px 15px; }
    .refresh-button:hover, .card-action:hover, .dialog-action:hover { transform: translateY(-1px); border-color: #9fa8b5; box-shadow: 0 6px 14px rgba(24, 29, 38, .08); }
    button:focus-visible, input:focus-visible, .user-field input:focus { outline: 3px solid rgba(25, 103, 210, .28); outline-offset: 2px; }

    .board { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 15px; align-items: start; }
    .board[data-layout="list"] { grid-template-columns: minmax(0, 1fr); gap: 10px; }
    .card[data-collapsed="true"] { min-height: 0; padding: 16px 18px; cursor: pointer; }
    .card[data-collapsed="true"] :is(.needs, .status-lines, .do-this, .owner-row, .owner-hint, .nudge-row, .prep-row, .actions, .choices, .history) { display: none !important; }
    .card[data-collapsed="true"] h3 { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
    .card-peek, .card-owner-line { display: none; }
    .card[data-collapsed="true"] .card-peek { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; margin: 6px 0 0; color: var(--ink); font-size: 13px; }
    .card[data-collapsed="true"] .card-owner-line { display: block; margin: 8px 0 0; overflow: hidden; color: var(--muted); font-size: 12px; font-weight: 700; white-space: nowrap; text-overflow: ellipsis; }
    .card-top-right { display: flex; align-items: center; gap: 6px; }
    .card-toggle { display: grid; place-items: center; width: 32px; min-height: 32px; padding: 0; color: var(--muted); background: #f2f4f7; border: 1px solid var(--line); border-radius: 8px; cursor: pointer; }
    .card-toggle::before { content: ""; width: 7px; height: 7px; margin-top: -3px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(45deg); }
    .card-toggle:hover { color: var(--ink); border-color: #9fa8b5; }
    .card-toggle[aria-expanded="true"] { transform: rotate(180deg); }
    .card {
      position: relative;
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 268px;
      overflow: hidden;
      padding: 20px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      animation: reveal .32s both;
    }
    .card::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 4px; background: var(--blue); }
    .card[data-urgent="true"]::before { width: 6px; background: var(--red); }
    .card[data-urgent="true"] { border-color: #f0b7b3; box-shadow: 0 14px 36px rgba(189, 45, 40, .12); }
    .urgent-toggle { min-height: 28px; padding: 4px 10px; color: var(--red); background: white; border: 1px solid #f0b7b3; border-radius: 999px; cursor: pointer; font-size: 10.5px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; white-space: nowrap; }
    .urgent-toggle:hover { background: var(--red-soft); border-color: var(--red); }
    .urgent-toggle[aria-pressed="true"] { color: white; background: var(--red); border-color: var(--red); }
    .urgent-toggle:disabled { opacity: .6; cursor: progress; }
    .snoozed-list { margin: 18px 0 0; color: var(--muted); }
    .snoozed-list summary { cursor: pointer; font-weight: 750; }
    .snoozed-list[hidden] { display: none; }
    .snoozed-rows { display: grid; gap: 8px; margin: 10px 0 0; }
    .card[data-status="done"] { opacity: .64; }
    .card-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
    .chips { display: flex; flex-basis: 100%; flex-wrap: wrap; gap: 6px; }
    .chip { padding: 4px 8px; color: #4e5663; background: #f2f4f7; border: 1px solid #e0e4e9; border-radius: 999px; font-size: 10px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; }
    .chip.kind { color: #6841a5; background: #f2ecfb; border-color: #e2d5f5; }
    .chip.kind[data-act="close"] { color: var(--green); background: var(--green-soft); border-color: #b9dfcc; }
    .chip.counsel { color: white; background: var(--ink); border-color: var(--ink); }
    .chip.aries-state { color: var(--violet); background: #f6f1fd; border-color: #d9c8f3; }
    .chip.aries-state[data-tone="ready"] { color: var(--green); background: var(--green-soft); border-color: #b9dfcc; }
    .chip.aries-state[data-tone="failed"] { color: var(--red); background: var(--red-soft); border-color: #f0b7b3; }
    .item-id { color: var(--faint); font: 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .card h3 { margin: 12px 0 8px; font-size: 18px; line-height: 1.25; letter-spacing: -.02em; }
    .card .summary { display: -webkit-box; overflow: hidden; margin: 0; color: var(--muted); -webkit-line-clamp: 4; -webkit-box-orient: vertical; }
    .details { display: grid; gap: 5px; margin: 16px 0; color: #596170; font-size: 12px; }
    .detail:empty { display: none; }
    .item-note { margin: 0 0 16px; padding: 10px 11px; color: #505764; background: #f7f8fa; border-left: 2px solid #aab2bf; border-radius: 0 8px 8px 0; font-size: 12px; }
    .item-note:empty { display: none; }
    .note-entry + .note-entry { margin-top: 9px; padding-top: 9px; border-top: 1px solid #e5e8ed; }
    .note-entry .note-text { font-style: italic; white-space: pre-wrap; }
    .note-entry .note-by { display: block; margin-top: 3px; font-style: normal; font-size: 11px; color: var(--faint); }
    .note-entry.pending { opacity: .7; }
    .actions { display: flex; gap: 8px; margin-top: auto; padding-top: 5px; }
    .card-action { flex: 1; padding: 8px 12px; }
    /* Done is deliberately NOT a filled button. A solid dark control on every single card
       read as a badge announcing the item was already done, instead of a control that marks
       it done. It keeps a quiet green tint so it is still the obvious first action. */
    .card-action.done { flex: 1 1 40%; color: #14663f; background: #f2faf5; border-color: #bfe3ce; font-weight: 700; }
    .card-action.done:hover { background: #e3f5ea; border-color: #93cfae; }
    .card-action:disabled { opacity: .5; cursor: wait; transform: none; }
    .actions { flex-wrap: wrap; gap: 6px; }
    .card-action.assign-select { flex: 1 1 40%; padding: 8px 10px; background: white; cursor: pointer; }
    .card-action.source-link { flex: 1 1 40%; display: inline-flex; align-items: center; justify-content: center; text-decoration: none; }
    .card-action.source-link[hidden] { display: none; }
    .card-action.danger { flex: 0 0 auto; color: #a1231f; border-color: #e6c3c1; }
    .card-action.danger:hover { background: #fdf2f1; }
    /* The thumbs sit on their own row: they teach the inbox sweep rather than change the task,
       and mixing them in with Done/Delete invites a mis-click on the one control here that has
       a lasting effect on what Aries shows everybody. */
    .feedback-group { flex: 1 0 100%; display: flex; gap: 8px; margin-top: 2px; padding-top: 8px; border-top: 1px dashed var(--line, #e3e6ec); }
    .card-action.thumb { flex: 1; font-size: .85rem; color: var(--muted, #5d6674); }
    .card-action.thumb:disabled { opacity: .6; cursor: default; }
    /* The card answers three questions in order: what does it need, who touched it last, what
       do I do now. The "Do this" panel is the one loud element; its color says what kind of
       move it is (answer, call, money, decide, wait, counsel), so a column of cards can be
       scanned by color before a word is read. */
    .chip.when { color: #4e5663; }
    .chip.when[data-tone="soon"] { color: var(--amber); background: var(--amber-soft); border-color: #f3d9a4; }
    .chip.when[data-tone="late"] { color: var(--red); background: var(--red-soft); border-color: #f2c4c0; }
    .card h3 { margin-top: 14px; }
    .facts { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 0 0 10px; color: #4e5663; font-size: 13px; font-weight: 650; }
    .facts:empty { display: none; }
    .needs { margin: 0; color: #3b414c; font-size: 14px; line-height: 1.5; }
    .status-lines { display: grid; gap: 6px; margin: 14px 0 0; font-size: 13px; line-height: 1.45; }
    .status-line { display: grid; grid-template-columns: 8.4em minmax(0, 1fr); gap: 8px; }
    .status-line dt { white-space: nowrap; }
    .status-line[hidden] { display: none; }
    .status-line dt { color: var(--muted); font-weight: 700; }
    .status-line dd { margin: 0; color: var(--ink); overflow-wrap: anywhere; }
    .status-line dd b { font-weight: 750; }
    .status-line dd .quiet { color: var(--muted); }
    .do-this {
      --act: var(--blue);
      --act-soft: var(--blue-soft);
      margin: 16px 0 0;
      padding: 13px 14px 12px;
      background: var(--act-soft);
      border-left: 4px solid var(--act);
      border-radius: 4px 12px 12px 4px;
    }
    .do-this[data-act="call"] { --act: var(--green); --act-soft: var(--green-soft); }
    .do-this[data-act="invoice"], .do-this[data-act="payment"] { --act: var(--amber); --act-soft: var(--amber-soft); }
    .do-this[data-act="decide"] { --act: var(--violet); --act-soft: #f2ecfb; }
    .do-this[data-act="wait"], .do-this[data-act="file"], .do-this[data-act="close"], .do-this[data-act="none"] { --act: #5d6674; --act-soft: #f2f4f7; }
    .do-this[data-act="legal"] { --act: var(--red); --act-soft: var(--red-soft); }
    .do-counsel { margin: 0 0 6px; color: var(--red); font-size: 13px; font-weight: 800; }
    .do-counsel:empty { display: none; }
    .do-text { margin: 0; color: var(--ink); font-size: 15px; font-weight: 650; line-height: 1.4; }
    .do-text:empty { display: none; }
    .do-text:empty + .do-buttons { margin-top: 0; }
    .do-buttons { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }
    .do-buttons:empty { display: none; }
    .do-button {
      display: inline-flex; align-items: center; justify-content: center;
      min-height: 40px; padding: 8px 13px;
      color: var(--act); background: white; border: 1px solid var(--act); border-radius: 10px;
      cursor: pointer; font-weight: 750; text-decoration: none;
    }
    .do-button.primary { color: white; background: var(--act); }
    .do-button:hover { filter: brightness(.95); }
    .do-button:disabled { opacity: .55; cursor: wait; }
    .owner-row { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin: 14px 0 0; }
    .owner-label { margin-right: 2px; color: var(--muted); font-size: 12px; font-weight: 700; }
    .owner-chip {
      min-height: 32px; padding: 4px 8px;
      color: #3b414c; background: white; border: 1px solid #d4d8de; border-radius: 999px;
      cursor: pointer; font-size: 12px; font-weight: 700;
    }
    .owner-chip[aria-pressed="true"] { color: white; background: var(--ink); border-color: var(--ink); }
    .owner-chip.suggested:not([aria-pressed="true"]) { color: var(--blue); border: 1px dashed var(--blue); }
    .owner-chip:disabled { opacity: .55; cursor: wait; }
    .owner-chip.aries { color: var(--violet); background: #f6f1fd; border-color: #d9c8f3; }
    .owner-chip.aries[aria-pressed="true"] { color: white; background: var(--violet); border-color: var(--violet); }
    .owner-hint { margin: 5px 0 0; color: var(--blue); font-size: 12px; font-weight: 650; }
    .nudge-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 10px 0 0; }
    .nudge-row[hidden] { display: none; }
    .nudge-button {
      min-height: 34px; padding: 5px 12px;
      color: var(--amber); background: var(--amber-soft); border: 1px solid #f0cf8f; border-radius: 999px;
      cursor: pointer; font-size: 12px; font-weight: 750;
    }
    .nudge-button:hover { border-color: var(--amber); }
    .nudge-button:disabled { color: var(--muted); background: #f2f4f7; border-color: var(--line); cursor: default; }
    .nudge-note { color: var(--muted); font-size: 12px; }
    .prep-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 8px 0 0; }
    .prep-row[hidden] { display: none; }
    .prep-button {
      min-height: 34px; padding: 5px 12px;
      color: var(--violet); background: #f3eefc; border: 1px solid #d5c6f1; border-radius: 999px;
      cursor: pointer; font-size: 12px; font-weight: 750;
    }
    .prep-button:hover { border-color: var(--violet); }
    .prep-note { color: var(--muted); font-size: 12px; }
    .owner-hint:empty { display: none; }
    .card .actions { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
    .card .actions .card-action { flex: 1 1 0; min-height: 40px; padding: 7px 10px; }
    .card-action[aria-expanded="true"] { color: white; background: var(--ink); border-color: var(--ink); }
    .choices { display: grid; gap: 8px; margin-top: 8px; padding: 11px; background: #f7f8fa; border: 1px solid var(--line); border-radius: 12px; }
    .choices-label { margin: 0; color: var(--muted); font-size: 12px; font-weight: 700; }
    .choice-row { display: flex; flex-wrap: wrap; gap: 6px; }
    .choice {
      min-height: 36px; padding: 6px 11px;
      color: var(--ink); background: white; border: 1px solid #cfd3da; border-radius: 9px;
      cursor: pointer; font-size: 13px; font-weight: 700;
    }
    .choice:hover { border-color: #9fa8b5; }
    .choice.danger { color: #a1231f; border-color: #e6c3c1; }
    .choice:disabled { opacity: .55; cursor: wait; }
    .choice-date { min-height: 36px; padding: 5px 8px; border: 1px solid #cfd3da; border-radius: 9px; font: inherit; font-size: 13px; }
    .history { margin-top: 10px; font-size: 12px; }
    .history summary { width: fit-content; color: var(--muted); cursor: pointer; font-weight: 700; }
    .history[hidden] { display: none; }
    .history-list { display: grid; gap: 7px; margin: 9px 0 0; padding: 0; list-style: none; }
    .history-entry { display: grid; grid-template-columns: 8.4em minmax(0, 1fr); gap: 8px; color: #3b414c; }
    .history-entry time { color: var(--faint); font-variant-numeric: tabular-nums; }
    .history-entry.theirs { color: var(--muted); }
    .history-entry.theirs b { color: #3b414c; }
    .history-text { overflow-wrap: anywhere; }
    .worklist { display: flex; flex-direction: column; gap: 6px; }
    .worklist-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; align-items: start;
      padding: 11px 14px; background: white; border: 1px solid #e4e7ec; border-radius: 11px; }
    .worklist-row[data-done="true"] { opacity: .5; }
    .worklist-row[data-done="true"] .worklist-text { text-decoration: line-through; }
    .worklist-mark { font-weight: 800; color: var(--muted); }
    .worklist-text { min-width: 0; overflow-wrap: anywhere; }
    .worklist-meta { display: flex; gap: 8px; white-space: nowrap; color: var(--muted); font-size: 12px; font-weight: 700; }
    #worklist-filter { min-width: 180px; }
    .checked-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center;
      padding: 12px 14px; background: white; border: 1px solid #e4e7ec; border-radius: 11px; }
    .checked-row .worklist-text { text-decoration: line-through; color: var(--muted); }
    .checked-row .card-action { flex: 0 0 auto; }
    .thread-body { max-width: min(760px, 92vw); max-height: 80vh; overflow-y: auto; }
    .thread-message { padding: 12px 0; border-top: 1px solid #e4e7ec; }
    .thread-message:first-of-type { border-top: none; }
    .thread-meta { display: block; color: var(--muted); font-size: 12px; font-weight: 700; margin-bottom: 6px; overflow-wrap: anywhere; }
    .thread-text { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14px; line-height: 1.5; }
    .thread-truncated { color: var(--muted); font-size: 12px; font-style: italic; }
    .empty {
      grid-column: 1 / -1;
      padding: 54px 24px;
      color: var(--muted);
      background: rgba(255, 255, 255, .68);
      border: 1px dashed #bdc3cd;
      border-radius: var(--radius);
      text-align: center;
    }
    .empty strong { display: block; margin-bottom: 5px; color: var(--ink); font-size: 18px; }

    [hidden] { display: none !important; }
    .todo-toolbar { display: flex; gap: 8px; }
    .todo-list { display: grid; gap: 10px; }
    .todo-row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 14px;
      align-items: start;
      padding: 17px 18px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 14px;
      box-shadow: 0 8px 22px rgba(24, 29, 38, .045);
    }
    .todo-row[data-done="true"] .todo-copy { opacity: .55; text-decoration: line-through; }
    .todo-row[data-archived="true"] { border-style: dashed; }
    .todo-row[data-urgent="true"] { border-color: #f0b7b3; box-shadow: inset 5px 0 0 var(--red), 0 8px 22px rgba(189, 45, 40, .08); }
    .todo-meta .chip[data-tone="urgent"] { color: white; background: var(--red); border-color: var(--red); }
    .todo-meta .chip[data-tone="late"] { color: var(--amber); background: #fff5e6; border-color: #f1d3a6; }
    .todo-meta .chip[data-tone="aries"] { color: var(--violet); background: #f6f1fd; border-color: #d9c8f3; }
    .todo-meta .chip[data-tone="failed"] { color: var(--red); background: var(--red-soft); border-color: #f0b7b3; }
    .todo-actions select, .todo-actions a { min-height: 38px; padding: 7px 10px; color: var(--ink); background: white; border: 1px solid #d4d8de; border-radius: 9px; font: inherit; font-size: 12px; font-weight: 750; text-decoration: none; }
    .todo-actions a { display: inline-flex; align-items: center; color: var(--blue); }
    .todo-toggle { width: 44px; min-width: 44px; padding: 0; color: var(--green); background: var(--green-soft); border: 1px solid #b9dfcc; border-radius: 10px; cursor: pointer; font-size: 20px; font-weight: 900; }
    .todo-row[data-done="false"] .todo-toggle { color: var(--faint); background: #f7f8fa; border-color: #d9dde3; }
    .todo-copy h3 { margin: 0; font-size: 16px; line-height: 1.35; }
    .todo-copy p { margin: 4px 0 0; color: var(--muted); font-size: 13px; }
    .todo-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
    .todo-actions { display: flex; flex-wrap: wrap; justify-content: end; gap: 7px; }
    .todo-actions button { min-height: 38px; padding: 7px 10px; color: var(--ink); background: white; border: 1px solid #d4d8de; border-radius: 9px; cursor: pointer; font-size: 12px; font-weight: 750; }
    .sync-line { min-height: 22px; margin: 9px 0 0; color: var(--muted); font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }

    .toast { position: fixed; left: 50%; bottom: 26px; z-index: 30; max-width: min(560px, calc(100vw - 32px)); padding: 12px 16px; color: white; background: var(--ink); border-radius: 11px; box-shadow: 0 14px 36px rgba(0, 0, 0, .26); opacity: 0; transform: translate(-50%, 14px); pointer-events: none; transition: opacity .2s ease, transform .2s ease; }
    .toast.show { opacity: 1; transform: translate(-50%, 0); }
    .toast.error { background: #7c211e; }

    dialog { width: min(520px, calc(100% - 32px)); padding: 0; border: 0; border-radius: 18px; box-shadow: 0 24px 80px rgba(15, 18, 24, .32); }
    dialog::backdrop { background: rgba(15, 18, 24, .54); backdrop-filter: blur(3px); }
    .dialog-body { padding: 24px; }
    .dialog-body h2 { margin: 0 0 6px; }
    .dialog-body p { margin: 0 0 17px; color: var(--muted); }
    .dialog-body label { display: block; margin-bottom: 6px; font-weight: 720; }
    .dialog-body input { width: 100%; min-height: 48px; padding: 11px 12px; border: 1px solid #bbc1ca; border-radius: 10px; }
    .dialog-body textarea { width: 100%; min-height: 120px; padding: 11px 12px; border: 1px solid #bbc1ca; border-radius: 10px; font: inherit; resize: vertical; }
    .dialog-hint { margin: 8px 0 0; color: var(--muted); font-size: 12px; }
    .dialog-actions { display: flex; justify-content: end; gap: 9px; margin-top: 18px; }
    .dialog-action { padding: 9px 16px; }
    .dialog-action.primary { color: white; background: var(--blue); border-color: var(--blue); }
    .user-list { display: grid; gap: 10px; }
    .user-row {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr) minmax(0, 1.5fr) auto;
      gap: 6px 14px;
      align-items: end;
      padding: 16px 18px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 14px;
      box-shadow: 0 8px 22px rgba(24, 29, 38, .045);
    }
    .user-row.add { margin-top: 18px; background: rgba(255, 255, 255, .6); border-style: dashed; box-shadow: none; }
    .user-initial { display: grid; place-items: center; width: 44px; height: 44px; align-self: center; color: var(--blue); background: var(--blue-soft); border-radius: 50%; font-size: 17px; font-weight: 800; }
    .user-row.add .user-initial { color: var(--muted); background: #eef0f3; }
    .user-field label { display: block; margin-bottom: 5px; color: var(--muted); font-size: 12px; font-weight: 750; }
    .user-field input { width: 100%; min-height: 42px; padding: 9px 11px; color: var(--ink); background: white; border: 1px solid #bbc1ca; border-radius: 10px; font: inherit; }
    .user-save { min-height: 42px; padding: 9px 16px; color: white; background: var(--blue); border: 1px solid var(--blue); border-radius: 10px; cursor: pointer; font-weight: 750; }
    .user-save:disabled { color: var(--faint); background: #f1f3f5; border-color: var(--line); cursor: default; }
    .user-note, .user-error { grid-column: 2 / -1; margin: 0; font-size: 12px; }
    .user-note { color: var(--muted); }
    .user-error { color: var(--red); font-weight: 700; }
    .user-error:empty, .user-note:empty { display: none; }
    .user-help { max-width: 72ch; margin: 14px 0 0; color: var(--muted); font-size: 13px; }
    footer { margin-top: 30px; color: var(--faint); font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; text-align: center; }

    @keyframes reveal { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    /* One claim, one card: the client and claim on top, each open task below it as a slim card
       that keeps its own Done, Snooze, Note and owner. */
    .claim-card {
      position: relative;
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow: hidden;
      padding: 18px 14px 14px 20px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      animation: reveal .32s both;
    }
    .claim-card::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 4px; background: var(--blue); }
    .claim-card[data-urgent="true"]::before { width: 6px; background: var(--red); }
    .claim-card[data-urgent="true"] { border-color: #f0b7b3; }
    .claim-head h3 { margin: 0 0 6px; font-size: 19px; line-height: 1.25; letter-spacing: -.02em; }
    .claim-head .facts { margin: 0 0 4px; }
    .claim-count { margin: 0 0 12px; color: var(--muted); font-size: 13px; font-weight: 700; }
    .claim-tasks { display: grid; gap: 8px; }
    .claim-tasks .card { min-height: 0; padding: 14px 14px 14px 18px; background: #f8f9fb; border-radius: 12px; box-shadow: none; animation: none; }
    .claim-tasks .card[data-collapsed="false"] { background: var(--surface); }
    .claim-tasks .card::before { width: 3px; }
    .claim-tasks .card h3 { margin: 8px 0 4px; font-size: 15.5px; }
    .claim-tasks .fact-client { display: none; }
    @media (max-width: 980px) { .board { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 680px) {
      .shell { padding: 16px 14px 48px; }
      .masthead { grid-template-columns: 1fr; padding: 24px 21px; }
      .mast-meta { justify-items: start; text-align: left; }
      .subtitle { margin-left: 0; }
      .summary-strip { grid-template-columns: 1fr; gap: 8px; }
      .metric { padding: 12px 15px; }
      .board { grid-template-columns: 1fr; }
      .section-head { align-items: start; }
      .card { min-height: 0; }
      .todo-row { grid-template-columns: auto minmax(0, 1fr); }
      .todo-actions { grid-column: 2; justify-content: start; }
      .todo-toolbar { flex-wrap: wrap; justify-content: end; }
      .view-switch { display: flex; flex-wrap: wrap; }
      .view-switch button { flex: 1 1 30%; min-width: 0; padding: 7px 10px; }
      .user-row { grid-template-columns: 44px minmax(0, 1fr); }
      .user-row .user-field, .user-row .user-save { grid-column: 2; }
      .user-row .user-save { justify-self: start; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; animation: none !important; transition-duration: .01ms !important; }
    }
${BOARD_UPGRADE_CSS}
  </style>
</head>
<body>
  <a class="skip-link" href="#main">Skip to board</a>
  <div class="shell">
    <header class="masthead">
      <div class="brand">
        <p class="eyebrow">Flood Doctor · Team Surface</p>
        <div class="brand-line"><span class="mark" aria-hidden="true">♈</span><h1>Aries</h1></div>
        <p class="subtitle">Operations board · live team assignments</p>
      </div>
      <div class="mast-meta">
        <span id="state-badge" class="state-badge stale">Loading</span>
        <span id="published">Waiting for first snapshot</span>
        <a id="activity-link" href="/activity" hidden>Activity log</a>
      </div>
    </header>

    <nav class="view-switch" aria-label="Aries view"><a href="/mission" style="padding:12px;color:inherit">Mission Control</a>
      <button id="show-board" type="button" aria-pressed="true">Board</button>
      <button id="show-mine" type="button" aria-pressed="false" hidden>My cards</button>
      <button id="show-exceptions" type="button" aria-pressed="false">Exceptions</button>
      <button id="show-todos" type="button" aria-pressed="false">To-Do</button>
      <button id="show-worklist" type="button" aria-pressed="false">Full list</button>
      <button id="show-checked" type="button" aria-pressed="false">Checked off</button>
      <button id="show-users" type="button" aria-pressed="false" hidden>User settings</button>
    </nav>

    <main id="main">
      <section id="board-summary" class="summary-strip" aria-label="Board summary">
        <div class="metric"><span class="metric-label">Open items</span><strong id="open-count" class="metric-value">—</strong></div>
        <div class="metric"><span class="metric-label">Urgent</span><strong id="urgent-count" class="metric-value">—</strong></div>
        <div class="metric"><span class="metric-label">Assigned</span><strong id="assigned-count" class="metric-value">—</strong></div>
      </section>

      <section id="board-view" aria-labelledby="board-title">
        <div class="section-head">
          <div><h2 id="board-title">Team attention</h2><p id="board-subtitle">Curated operational items from Aries.</p></div>
          <div class="todo-toolbar"><button id="expand-all" class="refresh-button" type="button">Expand all</button><button id="refresh" class="refresh-button" type="button">Refresh</button></div>
        </div>
${BOARD_UPGRADE_CONTROLS}
        <div id="board" class="board" aria-busy="true"></div>
        <details id="snoozed-list" class="snoozed-list" hidden><summary></summary><div class="snoozed-rows"></div></details>
      </section>

      <section id="checked-view" aria-labelledby="checked-title" hidden>
        <div class="section-head">
          <div><h2 id="checked-title">Checked off</h2><p id="checked-count">Recently completed cards. Undo brings one back to the board.</p></div>
          <button id="refresh-checked" class="refresh-button" type="button">Refresh</button>
        </div>
        <div id="checked" class="worklist" aria-busy="true"></div>
      </section>

      <section id="worklist-view" aria-labelledby="worklist-title" hidden>
        <div class="section-head">
          <div><h2 id="worklist-title">Full list</h2><p id="worklist-count">Aries' complete working list, read-only. Personal items are never published.</p></div>
          <div class="todo-toolbar"><input id="worklist-filter" class="refresh-button" type="search" placeholder="Filter…" autocomplete="off" aria-label="Filter the full list"><button id="refresh-worklist" class="refresh-button" type="button">Refresh</button></div>
        </div>
        <div id="worklist" class="worklist" aria-busy="true"></div>
      </section>

      <section id="todo-view" aria-labelledby="todo-title" hidden>
        <div class="section-head">
          <div><h2 id="todo-title">Aries To-Do</h2><p>One client, one clear action, one owner. Checking off a task made from a card closes that card too.</p><p id="todo-sync-status" class="sync-line" aria-live="polite"></p></div>
          <div class="todo-toolbar"><button id="add-todo" class="refresh-button" type="button">Add task</button><button id="refresh-todos" class="refresh-button" type="button">Refresh</button></div>
        </div>
        <div id="todo-list" class="todo-list" aria-busy="true"></div>
      </section>

      <section id="users-view" aria-labelledby="users-title" hidden>
        <div class="section-head">
          <div><h2 id="users-title">User settings</h2><p>Change a name or an email address, or add someone. Only you see this tab.</p></div>
        </div>
        <div id="user-list" class="user-list" aria-busy="true"></div>
        <form id="add-user" class="user-row add" autocomplete="off">
          <span class="user-initial" aria-hidden="true">+</span>
          <div class="user-field"><label for="add-user-name">Name</label><input id="add-user-name" name="name" maxlength="40" required></div>
          <div class="user-field"><label for="add-user-email">Email</label><input id="add-user-email" name="email" type="email" maxlength="120" required></div>
          <button class="user-save" type="submit">Add user</button>
          <p class="user-error" role="alert"></p>
        </form>
        <p class="user-help">Use a company address: @flood.doctor, @flooddoctorva.com or @restorationdoctors.com. A new user can sign in to this board right away, and Aries emails them when a card is assigned to them. Renaming someone keeps every card they own.</p>
      </section>
    </main>

    <footer>Cloud-backed read surface · actions queue safely when the Aries workstation is offline</footer>
  </div>

  <template id="card-template">
    <article class="card">
      <div class="card-top"><span class="item-id"></span><div class="card-top-right"><button class="urgent-toggle" data-action="urgent" type="button" aria-pressed="false">Mark urgent</button><button class="card-toggle" data-action="toggle" type="button" aria-expanded="false" aria-label="Show details"></button></div><div class="chips"><span class="chip counsel" hidden>Counsel only</span><span class="chip kind"></span><span class="chip when"></span><span class="chip aries-state" hidden></span></div></div>
      <h3></h3>
      <p class="facts"></p>
      <p class="card-peek"></p>
      <p class="card-owner-line"></p>
      <p class="needs"></p>
      <dl class="status-lines">
        <div class="status-line waiting"><dt>Waiting on</dt><dd></dd></div>
        <div class="status-line last"><dt>Last worked on</dt><dd></dd></div>
      </dl>
      <section class="do-this" aria-label="What to do next">
        <p class="do-counsel"></p>
        <p class="do-text"></p>
        <div class="do-buttons"></div>
      </section>
      <div class="owner-row" role="group" aria-label="Owner"><span class="owner-label">Owner</span></div>
      <p class="owner-hint"></p>
      <div class="nudge-row" hidden><button class="nudge-button" data-action="nudge" type="button"></button><span class="nudge-note"></span></div>
      <div class="prep-row" hidden><button class="prep-button" data-action="prep" type="button"></button><span class="prep-note"></span></div>
      <div class="actions">
        <button class="card-action done" data-action="done" type="button" aria-expanded="false">✓ Done</button>
        <button class="card-action" data-action="snooze" type="button" aria-expanded="false">Snooze</button>
        <button class="card-action" data-action="note" type="button">Note</button>
        <button class="card-action" data-action="more" type="button" aria-expanded="false">More</button>
      </div>
      <div class="choices" hidden></div>
      <details class="history"><summary></summary><ol class="history-list"></ol></details>
    </article>
  </template>

  <dialog id="thread-dialog">
    <div class="dialog-body thread-body">
      <h2 id="thread-title">Source email</h2>
      <p id="thread-mailbox" class="sync-line"></p>
      <div id="thread-messages"></div>
      <div class="dialog-actions"><button class="dialog-action" type="button" id="thread-close">Close</button></div>
    </div>
  </dialog>

  <dialog id="note-dialog">
    <form id="note-form" class="dialog-body" method="dialog">
      <h2>Add a note</h2>
      <p id="note-target"></p>
      <label for="note-text">Team note</label>
      <input id="note-text" name="note" maxlength="2000" required autocomplete="off">
      <div class="dialog-actions"><button class="dialog-action" value="cancel" type="button" id="note-cancel">Cancel</button><button class="dialog-action primary" value="submit" type="submit">Queue note</button></div>
    </form>
  </dialog>
  <dialog id="aries-dialog">
    <form id="aries-form" class="dialog-body" method="dialog">
      <h2 id="aries-heading">Assign to Aries</h2>
      <p id="aries-target"></p>
      <label id="aries-label" for="aries-text">What should Aries do? (optional)</label>
      <textarea id="aries-text" name="instruction" maxlength="1800" placeholder="Example: reject the offer and draft a rebuttal using our rebuttal cards."></textarea>
      <p id="aries-hint" class="dialog-hint">Aries reads the email thread, drafts replies for review, and asks teammates if it needs something. It never sends anything outside the company. It writes what it did on this card.</p>
      <div class="dialog-actions"><button class="dialog-action" type="button" id="aries-cancel">Cancel</button><button class="dialog-action primary" type="submit" id="aries-submit">Give it to Aries</button></div>
    </form>
  </dialog>
${BOARD_UPGRADE_DIALOGS}
  <div id="toast" class="toast" role="status" aria-live="polite"></div>

  <script>
    const board = document.querySelector('#board');
    const template = document.querySelector('#card-template');
    const stateBadge = document.querySelector('#state-badge');
    const published = document.querySelector('#published');
    const toast = document.querySelector('#toast');
    const noteDialog = document.querySelector('#note-dialog');
    const noteForm = document.querySelector('#note-form');
    const noteText = document.querySelector('#note-text');
    const boardView = document.querySelector('#board-view');
    const boardSummary = document.querySelector('#board-summary');
    const todoView = document.querySelector('#todo-view');
    const todoList = document.querySelector('#todo-list');
    const todoSyncStatus = document.querySelector('#todo-sync-status');
    const showBoardButton = document.querySelector('#show-board');
    const showTodosButton = document.querySelector('#show-todos');
    const showWorklistButton = document.querySelector('#show-worklist');
    const worklistView = document.querySelector('#worklist-view');
    const worklist = document.querySelector('#worklist');
    const worklistFilter = document.querySelector('#worklist-filter');
    const worklistCount = document.querySelector('#worklist-count');
    let worklistItems = [];
    const showCheckedButton = document.querySelector('#show-checked');
    const checkedView = document.querySelector('#checked-view');
    const checkedList = document.querySelector('#checked');
    const checkedCount = document.querySelector('#checked-count');
    const showUsersButton = document.querySelector('#show-users');
    const showMineButton = document.querySelector('#show-mine');
    const usersView = document.querySelector('#users-view');
    const userList = document.querySelector('#user-list');
    const addUserForm = document.querySelector('#add-user');
    let boardItems = [];
    const threadDialog = document.querySelector('#thread-dialog');
    const threadMessages = document.querySelector('#thread-messages');
    const threadTitle = document.querySelector('#thread-title');
    const threadMailbox = document.querySelector('#thread-mailbox');
    let noteItem = null;
    let noteHost = null;
    let toastTimer = null;
    let activeView = 'board';

    function showToast(message, isError) {
      window.clearTimeout(toastTimer);
      toast.textContent = message;
      toast.classList.toggle('error', Boolean(isError));
      toast.classList.add('show');
      toastTimer = window.setTimeout(function () { toast.classList.remove('show'); }, 4200);
    }

    function formatTime(value) {
      if (!value) return 'No snapshot published';
      const date = new Date(value);
      if (Number.isNaN(date.valueOf())) return value;
      const p = {};
      for (const x of new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(date)) p[x.type] = x.value;
      return p.month + '/' + p.day + '/' + p.year + ' ' + p.hour + ':' + p.minute + ' ' + p.dayPeriod + ' ET';
    }

    function formatDue(value) {
      const m = /(\\d{4})-(\\d{1,2})-(\\d{1,2})/.exec(String(value || ''));
      return m ? m[2].padStart(2, '0') + '/' + m[3].padStart(2, '0') + '/' + m[1] : String(value || '');
    }

    function setFreshness(payload) {
      const stale = payload.stale || { is_stale: true };
      stateBadge.className = 'state-badge' + (stale.is_stale ? ' stale' : '');
      stateBadge.textContent = stale.is_stale ? 'Snapshot old' : 'Snapshot current';
      published.textContent = payload.published_at ? 'Snapshot published ' + formatTime(payload.published_at) : 'Waiting for first snapshot';
    }

    function isUrgent(item) {
      return Boolean(item.urgent) || String(item.priority || '').toLowerCase() === 'urgent';
    }

    // Frank, 09/29/2026: "remove cards from the board that are snoozed so they dont clutter the
    // board. brin them back after the snooz period". A snoozed card rests until its date, in the
    // viewer's own calendar, and is back on the board that morning.
    function todayIso() {
      const now = new Date();
      return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    }

    function isResting(item) {
      const day = String(item.due || '').slice(0, 10);
      return !item.pending && item.status === 'snoozed' && ISO_DAY_PATTERN.test(day) && day > todayIso();
    }

    function onBoard(item) {
      return (item.status !== 'done' || (item.pending && (item.command_receipt||{}).operation === 'done')) && !isResting(item);
    }

    let threadIds = new Set();

    // The three header counters and the empty state are DERIVED from the board, so every path
    // that takes a card away has to recompute them. Removing only the node left "12 open"
    // sitting above an eleven card board.
    function refreshBoardChrome() {
      const open = visibleBoardItems();
      updateUpgradeChrome();
      board.querySelectorAll('.claim-card').forEach(fillClaimCard);
      renderSnoozed();
      if (me) showMineButton.textContent = 'My cards (' + boardItems.filter(function (item) {
        return onBoard(item) && String(item.assignee || '').toLowerCase() === me.key;
      }).length + ')';
      syncExpandAll();
      document.querySelector('#open-count').textContent = String(open.length);
      document.querySelector('#urgent-count').textContent = String(open.filter(isUrgent).length);
      document.querySelector('#assigned-count').textContent = String(open.filter(function (item) { return Boolean(item.assignee); }).length);

      const hasCard = Boolean(board.querySelector('.card, .compact-table tbody tr'));
      if (!hasCard && (filters.query || filters.owner || filters.client || filters.claim || filters.status || activeView === 'exceptions')) {
        const prior = board.querySelector('.empty'); if (prior) prior.remove();
        const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = 'No cards match this view. Change or clear the filters.'; board.append(empty); return;
      }
      const placeholder = board.querySelector('.empty');
      if (hasCard) {
        if (placeholder) placeholder.remove();
        return;
      }
      if (placeholder) return;
      const empty = document.createElement('div');
      empty.className = 'empty';
      const title = document.createElement('strong');
      title.textContent = boardFilter === 'mine' ? 'Nothing is assigned to you right now.' : 'Nothing needs team attention.';
      const detail = document.createElement('span');
      detail.textContent = boardFilter === 'mine' ? 'Cards someone gives you show up here.' : 'Aries will publish the next operational item here.';
      empty.append(title, detail);
      board.append(empty);
    }

    function render(items) {
      const restoreFocus = rememberFocus();
      board.dataset.layout = boardFilter === 'mine' ? 'list' : 'grid';
      const open = items.filter(boardScope).filter(inView).filter(filteredBoardItem).sort(function (left, right) {
        const urgent = Number(isUrgent(right)) - Number(isUrgent(left));
        if (urgent) return urgent;
        const leftDue = sortDeadline(left), rightDue = sortDeadline(right);
        if (leftDue === null || rightDue === null) return (leftDue === null ? 1 : 0) - (rightDue === null ? 1 : 0);
        return leftDue - rightDue;
      });
      const slots = [], claims = new Map();
      open.forEach(function (item) {
        const key = item.claim_group || '';
        if (key && claims.has(key)) { claims.get(key).push(item); return; }
        const members = [item]; if (key) claims.set(key,members); slots.push(members);
      });
      const nodes = board.dataset.density === 'compact' && open.length ? [renderCompactTable(open)] : slots.map(function (members,index) { return members.length > 1 ? buildClaimCard(members,index) : buildCard(members[0],index); });
      reconcileChildren(board,nodes);
      refreshBoardChrome();
      board.setAttribute('aria-busy','false');
      restoreFocus();
    }

    // ---- Cards ------------------------------------------------------------------------------
    // Frank, 09/29/2026: "I never know what each task needs or who was last to work on that
    // task or what I should do about it." Each card now answers those three in that order,
    // from the brief Aries writes out of the card's email thread and the card's own history.
    const OWNERS = ['frank', 'mark', 'steve', 'shayan', 'katherine'];
    // The roster the board sends with every refresh (key and name). A key never changes, so a
    // renamed person keeps their cards; only the name on the chips and labels moves.
    let teamList = OWNERS.map(function (key) { return { key: key, name: titleName(key) }; });
    // Frank, 09/30/2026: "the board cards are huge now. make them collapsobale and give each use
    // a tab where they can see a list of ony the cards assigned to them". Cards start folded to
    // their title, facts and next step. The ones a viewer opens stay open across refreshes on
    // that browser. My cards is the same board, filtered to the signed-in person, as a list.
    let me = null;
    let boardFilter = 'all';
    const EXPANDED_KEY = 'aries-expanded-cards';
    const expandedCards = new Set((function () {
      try { return JSON.parse(window.localStorage.getItem(EXPANDED_KEY) || '[]'); } catch (error) { return []; }
    })());
    function saveExpanded() {
      try { window.localStorage.setItem(EXPANDED_KEY, JSON.stringify(Array.from(expandedCards).slice(-200))); } catch (error) { /* private window */ }
    }
    function inView(item) {
      return boardFilter !== 'mine' || (me && String(item.assignee || '').toLowerCase() === me.key);
    }
    function setCollapsed(card, item, collapsed) {
      card.dataset.collapsed = String(collapsed);
      const toggle = card.querySelector('.card-toggle');
      toggle.setAttribute('aria-expanded', String(!collapsed));
      toggle.setAttribute('aria-label', collapsed ? 'Show details' : 'Hide details');
      if (collapsed) expandedCards.delete(item.id); else expandedCards.add(item.id);
      saveExpanded();
      syncExpandAll();
    }
    function syncExpandAll() {
      const cards = board.querySelectorAll('.card');
      const allOpen = cards.length > 0 && Array.prototype.every.call(cards, function (card) { return card.dataset.collapsed === 'false'; });
      document.querySelector('#expand-all').textContent = allOpen ? 'Collapse all' : 'Expand all';
    }
    const DONE_REASONS = [
      ['replied', 'Replied'],
      ['paid', 'Paid'],
      ['called', 'Called'],
      ['handled another way', 'Handled another way'],
      ['nothing was needed', 'Nothing needed'],
    ];
    const ISO_DAY_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
    const openHistory = new Set();

    function titleName(name) { return name ? name.charAt(0).toUpperCase() + name.slice(1) : ''; }
    function nameOf(key) {
      const found = teamList.find(function (person) { return person.key === key; });
      return found ? found.name : titleName(key);
    }

    // Whole days from today to a calendar day (negative means it has passed), in the viewer's
    // own calendar so "due tomorrow" means tomorrow where they are sitting.
    function daysUntil(isoDay) {
      if (!ISO_DAY_PATTERN.test(String(isoDay || '').slice(0, 10))) return null;
      const parts = String(isoDay).slice(0, 10).split('-').map(Number);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return Math.round((new Date(parts[0], parts[1] - 1, parts[2]) - today) / 86400000);
    }

    function monthDay(isoDay) {
      const parts = String(isoDay || '').slice(0, 10).split('-').map(Number);
      return parts.length === 3 ? parts[1] + '/' + parts[2] : String(isoDay || '');
    }

    function whenShort(value) {
      const date = new Date(value);
      if (Number.isNaN(date.valueOf())) return String(value || '');
      return date.toLocaleString('en-US', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
    }

    function ago(value) {
      const date = new Date(value);
      if (Number.isNaN(date.valueOf())) return '';
      const minutes = Math.round((Date.now() - date.valueOf()) / 60000);
      if (minutes < 1) return 'just now';
      if (minutes < 60) return minutes + ' min ago';
      const hours = Math.round(minutes / 60);
      if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
      const days = Math.round(hours / 24);
      if (days === 1) return 'yesterday';
      if (days < 14) return days + ' days ago';
      return 'on ' + date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'America/New_York' });
    }

    // A calendar day N days out, in local time. toISOString would give the UTC day, which after
    // 8 PM Eastern is already tomorrow and would snooze a card one day too long.
    function isoDayFromNow(days) {
      const date = new Date(Date.now() + days * 86400000);
      return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }

    function daysToNextMonday() {
      const weekday = new Date().getDay();
      return ((8 - weekday) % 7) || 7;
    }

    // Frank, 09/30/2026: "audit the aries todo list and aries prep work and aries cards ob the
    // board and enhance in anywway that you can". A third of the cards were titled with a raw
    // email subject. Aries' brief now writes a title; until a card has one, the subject loses its
    // mail prefixes and Aries' own inbox tag, which say nothing about the task.
    function cleanSubject(text) {
      let title = String(text || '').trim();
      for (let pass = 0; pass < 8; pass += 1) {
        const lower = title.toLowerCase();
        const prefix = ['re:', 'fw:', 'fwd:'].find(function (word) { return lower.indexOf(word) === 0; });
        const close = title.indexOf(']');
        if (prefix) title = title.slice(prefix.length).trim();
        else if (title.charAt(0) === '[' && close > 0 && close < 26) title = title.slice(close + 1).trim();
        else break;
      }
      return title || String(text || '');
    }

    function cardTitle(item) {
      const brief = item.brief || {};
      return brief.title || cleanSubject(item.title);
    }

    // The chip says what the card needs done, from the brief, instead of the mail category.
    const ACTION_LABELS = {
      reply: 'Reply', call: 'Call', invoice: 'Invoice', payment: 'Payment', review: 'Review',
      decide: 'Decide', wait: 'Waiting', file: 'File', close: 'Looks done',
    };
    const TASK_STOPPED = ['failed', 'timed_out', 'interrupted', 'cancelled'];

    // A task still "queued" or "running" hours after it was asked has lost its ending (a prep
    // stops at 20 minutes, an Aries task at an hour), so the board stops claiming it is running.
    function staleTask(task) {
      const asked = new Date(task.at).valueOf();
      return (task.status === 'queued' || task.status === 'running') && (!Number.isFinite(asked) || Date.now() - asked > 3 * 3600000);
    }

    // What Aries is doing on the card, shown on the folded card too: the prep for its owner, or
    // the card itself when Aries owns it.
    function ariesState(item) {
      const owner = String(item.assignee || '').toLowerCase();
      const task = owner === 'aries' ? item.aries_task : item.prep;
      if (!task || !task.status || staleTask(task)) return null;
      const stopped = TASK_STOPPED.indexOf(task.status) >= 0;
      if (owner === 'aries') {
        if (task.status === 'ready') return { text: 'Aries finished', tone: 'ready', title: 'Aries finished ' + ago(task.finished_at || task.at) + '. Its note is on the card.' };
        if (stopped) return { text: 'Aries got stuck', tone: 'failed', title: 'Aries could not finish. The note on the card says why.' };
        return { text: task.status === 'running' ? 'Aries working' : 'Waiting for Aries', tone: 'working', title: 'Asked ' + ago(task.at) + '.' };
      }
      if (task.status === 'ready') return { text: 'Prep ready', tone: 'ready', title: 'Aries prepared this ' + ago(task.finished_at || task.at) + '. See its note on the card.' };
      if (stopped) return { text: 'Prep failed', tone: 'failed', title: 'Aries could not finish the prep. Ask it again.' };
      return { text: task.status === 'running' ? 'Aries prepping' : 'Prep queued', tone: 'working', title: 'Asked ' + ago(task.at) + '.' };
    }

    // Days until the deadline that orders the board, for cards overdue or due within a week.
    function sortDeadline(item) {
      const brief = item.brief || {};
      const due = ISO_DAY_PATTERN.test(String(item.due || '')) && item.status !== 'snoozed' ? item.due : '';
      const days = daysUntil(brief.deadline || due);
      return days !== null && days <= 7 ? days : null;
    }

    function whenChip(item) {
      const brief = item.brief || {};
      if (item.status === 'snoozed' && ISO_DAY_PATTERN.test(String(item.due || '').slice(0, 10))) {
        return { text: 'Back from snooze', tone: 'soon', title: 'Snoozed until ' + monthDay(item.due) };
      }
      const deadline = brief.deadline || (ISO_DAY_PATTERN.test(item.due || '') ? item.due : '');
      if (deadline) {
        const days = daysUntil(deadline);
        let text = 'Due ' + monthDay(deadline);
        let tone = 'plain';
        if (days !== null && days < 0) { text = 'Overdue since ' + monthDay(deadline); tone = 'late'; }
        else if (days === 0) { text = 'Due today'; tone = 'late'; }
        else if (days === 1) { text = 'Due tomorrow'; tone = 'late'; }
        else if (days !== null && days <= 7) { text = 'Due ' + monthDay(deadline) + ', in ' + days + ' days'; tone = 'soon'; }
        return { text: text, tone: tone, title: brief.deadline_note || '' };
      }
      const age = daysUntil(item.created);
      if (age === null) return null;
      const open = Math.max(0, -age);
      return {
        text: open === 0 ? 'Opened today' : 'Open ' + open + (open === 1 ? ' day' : ' days'),
        tone: open >= 14 ? 'soon' : 'plain',
        title: 'Opened ' + monthDay(item.created),
      };
    }

    function addHistory(item, what) {
      const entry = { at: new Date().toISOString(), who: 'You', what: what, ours: true, kind: 'action' };
      item.history = [entry].concat(Array.isArray(item.history) ? item.history : []);
    }

    function buildClaimCard(members, index) {
      const cached = groupNodes.get(members[0].claim_group);
      if (cached) {
        cached.querySelector('.claim-head h3').textContent = members[0].claim_label || cardTitle(members[0]);
        reconcileChildren(cached.querySelector('.claim-tasks'), members.map(function(item, at) { return buildCard(item,index+at); }));
        fillClaimCard(cached); return cached;
      }
      const group = document.createElement('section');
      group.className = 'claim-card';
      group.dataset.claim = members[0].claim_group;
      group.style.animationDelay = Math.min(index * 45, 360) + 'ms';
      const head = document.createElement('header');
      head.className = 'claim-head';
      const name = document.createElement('h3');
      name.textContent = members[0].claim_label || cardTitle(members[0]);
      group.setAttribute('aria-label', 'Claim: ' + name.textContent);
      const facts = document.createElement('p');
      facts.className = 'facts';
      const numbers = [];
      members.forEach(function (item) {
        const claim = item.brief && item.brief.claim ? String(item.brief.claim) : '';
        const text = claim ? (/^(invoice|claim)/i.test(claim) ? claim : 'Claim ' + claim) : '';
        if (text && numbers.indexOf(text) < 0) numbers.push(text);
      });
      numbers.forEach(function (text) {
        const span = document.createElement('span');
        span.textContent = text;
        facts.append(span);
      });
      const count = document.createElement('p');
      count.className = 'claim-count';
      const list = document.createElement('div');
      list.className = 'claim-tasks';
      members.forEach(function (item, at) { list.append(buildCard(item, index + at)); });
      head.append(name, facts, count);
      group.append(head, list);
      fillClaimCard(group);
      groupNodes.set(members[0].claim_group,group);
      return group;
    }

    // The task count and the urgent bar follow the cards inside. A claim whose last task was
    // checked off leaves the board with it.
    function fillClaimCard(group) {
      const cards = group.querySelectorAll('.card');
      if (!cards.length) { group.remove(); return; }
      group.querySelector('.claim-count').textContent = cards.length + (cards.length === 1 ? ' open task' : ' open tasks');
      group.dataset.urgent = String(Array.prototype.some.call(cards, function (card) { return card.dataset.urgent === 'true'; }));
    }

    function buildCard(item, index) {
      const cached = cardNodes.get(String(item.id));
      if (cached) {
        if (!cached.contains(document.activeElement) && !cached.querySelector('.choices:not([hidden])')) fillCard(cached,item);
        else decorateCard(cached,item);
        return cached;
      }
      const fragment = template.content.cloneNode(true);
      const card = fragment.querySelector('.card');
      card.dataset.id = String(item.id);
      cardNodes.set(String(item.id),card);
      card.dataset.priority = String(item.priority || 'normal').toLowerCase();
      card.querySelector('[data-action="urgent"]').addEventListener('click', function (event) {
        toggleUrgent(card, item, event.currentTarget);
      });
      card.querySelector('[data-action="toggle"]').addEventListener('click', function (event) {
        event.stopPropagation();
        setCollapsed(card, item, card.dataset.collapsed !== 'true');
      });
      card.addEventListener('click', function (event) {
        if (card.dataset.collapsed === 'true' && !event.target.closest('a, button, input, select, label')) setCollapsed(card, item, false);
      });
      card.dataset.collapsed = String(!expandedCards.has(item.id));
      card.querySelector('.card-toggle').setAttribute('aria-expanded', String(expandedCards.has(item.id)));
      card.querySelector('.card-toggle').setAttribute('aria-label', expandedCards.has(item.id) ? 'Hide details' : 'Show details');
      card.dataset.status = String(item.status || 'open').toLowerCase();
      card.style.animationDelay = Math.min(index * 45, 360) + 'ms';
      fragment.querySelector('.item-id').textContent = '#' + item.id;
      const cardLink = document.createElement('a');
      cardLink.className = 'card-action';
      cardLink.href = '/card?id=' + item.id;
      cardLink.textContent = 'Card link';
      cardLink.setAttribute('aria-label', 'Open card #' + item.id);
      fragment.querySelector('.actions').append(cardLink);

      card.querySelector('[data-action="done"]').addEventListener('click', function (event) {
        toggleChoices(card, item, 'done', event.currentTarget);
      });
      card.querySelector('[data-action="snooze"]').addEventListener('click', function (event) {
        toggleChoices(card, item, 'snooze', event.currentTarget);
      });
      card.querySelector('[data-action="more"]').addEventListener('click', function (event) {
        toggleChoices(card, item, 'more', event.currentTarget);
      });
      card.querySelector('[data-action="nudge"]').addEventListener('click', function (event) {
        nudgeOwner(card, item, event.currentTarget);
      });
      card.querySelector('[data-action="prep"]').addEventListener('click', function () {
        openAriesDialog(card, item, 'prep');
      });
      card.querySelector('[data-action="note"]').addEventListener('click', function () {
        noteItem = item;
        noteHost = card;
        document.querySelector('#note-target').textContent = '#' + item.id + ' · ' + cardTitle(item);
        noteText.value = '';
        noteDialog.showModal();
        noteText.focus();
      });
      const history = card.querySelector('.history');
      history.open = openHistory.has(item.id);
      history.addEventListener('toggle', function () {
        if (history.open) openHistory.add(item.id); else openHistory.delete(item.id);
      });
      fillCard(card, item);
      return card;
    }

    // Everything on a card that changes when someone acts on it. Called on first render and
    // again after an action, so the card shows the new owner or note at once instead of
    // waiting 30 seconds for the next poll and looking like the button did nothing.
    function fillCard(card, item) {
      const brief = item.brief || null;
      const kind = card.querySelector('.kind');
      kind.textContent = brief && ACTION_LABELS[brief.action] ? ACTION_LABELS[brief.action] : (item.kind || 'operations');
      kind.dataset.act = brief ? brief.action : '';
      // Counsel-only shows folded too: the banner that says so sits in the part a fold hides.
      card.querySelector('.chip.counsel').hidden = !(brief && brief.counsel_only);
      const state = ariesState(item);
      const stateChip = card.querySelector('.aries-state');
      stateChip.hidden = !state;
      if (state) {
        stateChip.textContent = state.text;
        stateChip.dataset.tone = state.tone;
        stateChip.title = state.title;
      }
      const chip = card.querySelector('.when');
      const when = whenChip(item);
      chip.hidden = !when;
      if (when) {
        chip.textContent = when.text;
        chip.dataset.tone = when.tone;
        chip.title = when.title;
      }
      const heading = card.querySelector('h3');
      heading.textContent = cardTitle(item);
      heading.title = heading.textContent !== item.title ? 'Email subject: ' + item.title : '';
      const urgent = isUrgent(item);
      card.dataset.urgent = String(urgent);
      const urgentButton = card.querySelector('[data-action="urgent"]');
      urgentButton.setAttribute('aria-pressed', String(urgent));
      urgentButton.textContent = urgent ? 'Urgent ✕' : 'Mark urgent';
      urgentButton.title = urgent ? 'Clear urgent' : 'Move this card to the top and have Aries email whoever must act now';

      const facts = card.querySelector('.facts');
      facts.textContent = '';
      if (brief) {
        // A card with no claim number may carry its invoice number there, already labeled.
        const claim = brief.claim ? (/^invoice/i.test(brief.claim) ? brief.claim : 'Claim ' + brief.claim) : '';
        [brief.client, claim, brief.amount].forEach(function (text, at) {
          if (!text) return;
          const span = document.createElement('span');
          span.textContent = text;
          // Inside a claim card the client is already its heading.
          if (at === 0) span.className = 'fact-client';
          facts.append(span);
        });
      }
      card.querySelector('.needs').textContent = (brief && brief.needs) || item.summary || '';
      card.querySelector('.card-peek').textContent = (brief && (brief.next_step || brief.needs)) || item.summary || '';
      // The folded card's last line: who has it (or who Aries thinks should), and who we wait on.
      const ownerKey = String(item.assignee || '').toLowerCase();
      const hintKey = brief ? brief.owner_hint : '';
      const ownerParts = [ownerKey ? 'Owner: ' + (ownerKey === 'aries' ? 'Aries' : nameOf(ownerKey)) : 'No owner yet'];
      if (!ownerKey && hintKey) ownerParts.push('Aries suggests ' + nameOf(hintKey));
      if (brief && brief.waiting_on) {
        const waited = daysUntil(brief.waiting_since);
        ownerParts.push('Waiting on ' + brief.waiting_on + (waited !== null && waited < 0 ? ' for ' + (-waited) + (waited === -1 ? ' day' : ' days') : ''));
      }
      card.querySelector('.card-owner-line').textContent = ownerParts.join('. ');

      const waiting = card.querySelector('.waiting');
      const waitingText = waiting.querySelector('dd');
      waiting.hidden = !brief;
      waitingText.textContent = '';
      if (brief && !brief.waiting_on) waitingText.textContent = 'Nobody is waiting on us right now.';
      if (brief && brief.waiting_on) {
        waitingText.textContent = brief.waiting_on;
        const since = daysUntil(brief.waiting_since);
        if (since !== null) {
          const quiet = document.createElement('span');
          quiet.className = 'quiet';
          const count = Math.max(0, -since);
          quiet.textContent = ', since ' + monthDay(brief.waiting_since) + (count ? ' (' + count + (count === 1 ? ' day)' : ' days)') : '');
          waitingText.append(quiet);
        }
      }

      const lastText = card.querySelector('.last dd');
      lastText.textContent = '';
      const last = (Array.isArray(item.history) ? item.history : []).find(function (entry) { return entry.ours; });
      if (last) {
        const who = document.createElement('b');
        who.textContent = last.who;
        const quiet = document.createElement('span');
        quiet.className = 'quiet';
        quiet.textContent = ', ' + ago(last.at);
        lastText.append(who, document.createTextNode(' ' + last.what), quiet);
      } else {
        lastText.textContent = 'Nobody yet.';
        if (item.created) {
          const quiet = document.createElement('span');
          quiet.className = 'quiet';
          quiet.textContent = ' Card opened ' + monthDay(item.created) + '.';
          lastText.append(quiet);
        }
      }

      fillDoThis(card, item);
      fillOwners(card, item);
      fillNudge(card, item);
      fillPrep(card, item);
      fillHistory(card, item);
      decorateCard(card, item);
    }

    function doButton(label, onClick) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'do-button';
      button.textContent = label;
      button.addEventListener('click', function () { onClick(button); });
      return button;
    }

    function fillDoThis(card, item) {
      const brief = item.brief || null;
      const section = card.querySelector('.do-this');
      const counsel = Boolean(brief && brief.counsel_only);
      section.dataset.act = counsel ? 'legal' : (brief ? brief.action : 'none');
      section.querySelector('.do-counsel').textContent = counsel ? 'Counsel only. No direct contact with this party.' : '';
      section.querySelector('.do-text').textContent = brief ? brief.next_step : '';
      const buttons = section.querySelector('.do-buttons');
      buttons.textContent = '';
      const owner = String(item.assignee || '').toLowerCase();
      const hint = brief ? brief.owner_hint : '';
      // Aries reads the thread as finished. Closing is the next step, so it is the first button;
      // it still asks nothing further and writes why on the card like any other Done.
      if (brief && brief.action === 'close') {
        buttons.append(doButton('Mark done', function (button) { doneWithReason(card, item, 'nothing more was needed', button); }));
      }
      if (hint && hint !== owner && !(brief && brief.action === 'close')) {
        buttons.append(doButton('Hand to ' + nameOf(hint), function (button) { assignTo(card, item, hint, button); }));
      }
      if (brief && brief.action === 'call' && brief.phone && !counsel) {
        const call = document.createElement('a');
        call.className = 'do-button';
        call.href = 'tel:' + brief.phone.replace(/[^0-9+]/g, '');
        call.textContent = 'Call ' + brief.phone;
        buttons.append(call);
      }
      if (brief && brief.action === 'wait') {
        const until = isoDayFromNow(3);
        buttons.append(doButton('Still waiting, check again ' + monthDay(until), function (button) {
          markWaiting(card, item, until, button);
        }));
      }
      if (threadIds.has(item.id)) {
        buttons.append(doButton('Open email', function () { openThread(item); }));
      }
      if (buttons.firstElementChild) buttons.firstElementChild.classList.add('primary');
      section.hidden = !brief && !buttons.childElementCount;
    }

    function fillOwners(card, item) {
      const row = card.querySelector('.owner-row');
      let select = row.querySelector('select');
      if (!select) {
        select = document.createElement('select'); select.className = 'owner-select';
        select.setAttribute('aria-label','Owner for card #'+item.id);
        select.addEventListener('change',function () {
          if (select.value === 'aries') { openAriesDialog(card,item,'assign'); select.value=String(item.assignee||'').toLowerCase(); }
          else assignTo(card,item,select.value,select);
        }); row.append(select);
      }
      if (document.activeElement !== select) {
        const owner=String(item.assignee||'').toLowerCase();
        const people=[{key:'',name:'Unassigned'}].concat(teamList,[{key:'aries',name:'Aries (delegate work)'}]);
        if(owner && !people.some(function(person){return person.key===owner;}))people.push({key:owner,name:nameOf(owner)});
        select.replaceChildren();people.forEach(function(person){select.append(new Option(person.name,person.key));});select.value=owner;
      }
      const hint=(item.brief||{}).owner_hint;
      card.querySelector('.owner-hint').textContent=hint && hint!==item.assignee?'Suggested owner: '+nameOf(hint)+'. Preparation is separate below.':'Owner is accountable. Preparation by Aries keeps this owner.';
    }

    function fillHistory(card, item) {
      const history = Array.isArray(item.history) ? item.history : [];
      const details = card.querySelector('.history');
      details.hidden = !history.length;
      details.querySelector('summary').textContent = 'History (' + history.length + ')';
      const list = details.querySelector('.history-list');
      list.textContent = '';
      history.forEach(function (entry) {
        const row = document.createElement('li');
        row.className = 'history-entry' + (entry.ours ? '' : ' theirs');
        const time = document.createElement('time');
        time.dateTime = entry.at;
        time.textContent = whenShort(entry.at);
        const text = document.createElement('span');
        text.className = 'history-text';
        const who = document.createElement('b');
        who.textContent = entry.who;
        text.append(who, document.createTextNode(' ' + entry.what));
        row.append(time, text);
        list.append(row);
      });
    }

    // Urgent: the card goes to the top of the board and Aries emails whoever must act now, the
    // owner first. Clearing it sends nothing.
    function urgentTarget(item) {
      const owner = String(item.assignee || '').toLowerCase();
      if (owner && owner !== 'aries') return nameOf(owner);
      const hint = item.brief ? item.brief.owner_hint : '';
      return hint ? nameOf(hint) : 'Frank';
    }

    function toggleUrgent(card, item, button) {
      const turningOn = !isUrgent(item);
      submitAction(button, { operation: 'urgent', id: item.id, value: turningOn ? 'on' : 'off' }, function (command) {
        if (turningOn) item.urgent = command.created_at || new Date().toISOString();
        else delete item.urgent;
        addHistory(item, turningOn ? 'marked it urgent' : 'cleared urgent');
        render(boardItems);
      }, turningOn ? 'Marked urgent. It is at the top, and Aries emails ' + urgentTarget(item) + ' now.' : 'No longer urgent.');
    }

    function renderSnoozed() {
      const holder = document.querySelector('#snoozed-list');
      const resting = boardItems.filter(isResting).sort(function (left, right) {
        return String(left.due).localeCompare(String(right.due));
      });
      holder.hidden = !resting.length;
      holder.querySelector('summary').textContent = 'Snoozed (' + resting.length + '). Each one comes back on its date.';
      const rows = holder.querySelector('.snoozed-rows');
      rows.replaceChildren();
      resting.forEach(function (item) {
        const row = document.createElement('div');
        row.className = 'checked-row';
        const text = document.createElement('span');
        text.className = 'worklist-text';
        text.textContent = '#' + item.id + ' · ' + cardTitle(item) + ' · back ' + monthDay(item.due);
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'card-action';
        back.textContent = 'Bring back now';
        back.addEventListener('click', function (event) {
          submitAction(event.currentTarget, { operation: 'reopen', id: item.id }, function () {
            addHistory(item, 'requested reopening');
            back.textContent = commandReceiptText(item.command_receipt);
          }, 'Back on the board.');
        });
        row.append(text, back);
        rows.append(row);
      });
    }

    // The Nudge button: Aries emails the owner that someone is asking for an update and copies
    // whoever asked. One an hour per card, the same limit Aries holds itself to, so a double tap
    // or a second teammate a minute later does not send the owner two emails.
    const NUDGE_GAP_MS = 3600000;

    function lastNudge(item) {
      return (Array.isArray(item.history) ? item.history : []).find(function (entry) {
        return entry.kind === 'action' && entry.what.indexOf('for an update') >= 0;
      }) || null;
    }

    function fillNudge(card, item) {
      const row = card.querySelector('.nudge-row');
      const owner = String(item.assignee || '').toLowerCase();
      row.hidden = !owner || owner === 'aries';
      if (row.hidden) return;
      const button = row.querySelector('.nudge-button');
      const note = row.querySelector('.nudge-note');
      const last = lastNudge(item);
      const recent = last && Date.now() - new Date(last.at).valueOf() < NUDGE_GAP_MS;
      button.textContent = 'Nudge ' + nameOf(owner) + ' for an update';
      button.disabled = Boolean(recent);
      button.title = 'Aries emails ' + nameOf(owner) + ' that you are asking where this stands, and copies you';
      note.textContent = last ? 'Last nudged ' + ago(last.at) + (recent ? '. You can nudge again in an hour.' : '.') : '';
    }

    function nudgeOwner(card, item, button) {
      const owner = String(item.assignee || '').toLowerCase();
      if (!owner) return;
      submitAction(button, { operation: 'nudge', id: item.id, value: owner }, function () {
        addHistory(item, 'asked ' + nameOf(owner) + ' for an update');
        fillCard(card, item);
      }, 'Nudged ' + nameOf(owner) + '. Aries emails them now and copies you.').then(function () {
        // submitAction re-enables its button when it settles; the hour limit has to win.
        fillNudge(card, item);
      });
    }

    // Aries prep: the teammate keeps the card and Aries does the groundwork for them. Frank,
    // 09/29/2026: "assign a task to a teamate, and also assign it to aries so that aries can do
    // some prep work for that teamate." Aries holds a repeat inside two hours unless it carries a
    // new instruction, so the button says when it is already working.
    const PREP_GAP_MS = 2 * 3600000;

    function lastPrep(item) {
      return (Array.isArray(item.history) ? item.history : []).find(function (entry) {
        return entry.kind === 'action' && entry.what.indexOf('asked Aries to prep') === 0;
      }) || null;
    }

    function fillPrep(card, item) {
      const row = card.querySelector('.prep-row');
      const owner = String(item.assignee || '').toLowerCase();
      row.hidden = !owner || owner === 'aries';
      if (row.hidden) return;
      const last = lastPrep(item);
      // The queue's own state when the board has it, else the last time someone asked.
      const task = item.prep && item.prep.status && !staleTask(item.prep) ? item.prep : null;
      const stopped = Boolean(task && TASK_STOPPED.indexOf(task.status) >= 0);
      const working = task
        ? task.status === 'queued' || task.status === 'running'
        : Boolean(last && Date.now() - new Date(last.at).valueOf() < PREP_GAP_MS);
      const button = row.querySelector('.prep-button');
      if (working) button.textContent = '♈ Aries is prepping: add an instruction';
      else if (stopped) button.textContent = '♈ Prep did not finish: ask Aries again';
      else if (task && task.status === 'ready') button.textContent = '♈ Ask Aries to prep it again';
      else button.textContent = '♈ Have Aries prep this for ' + nameOf(owner);
      button.title = nameOf(owner) + ' keeps the card. Aries reads the email, gathers what ' + nameOf(owner) + ' needs and drafts replies for review.';
      let prepNote = last ? 'Asked ' + ago(last.at) + '.' : '';
      if (task && task.status === 'queued') prepNote = 'Asked ' + ago(task.at) + '. Waiting its turn.';
      if (task && task.status === 'running') prepNote = 'Asked ' + ago(task.at) + '. Aries is on it now.';
      if (task && task.status === 'ready') prepNote = 'Ready ' + ago(task.finished_at || task.at) + '. The prep is in the notes on this card.';
      if (stopped) prepNote = 'Stopped ' + ago(task.finished_at || task.at) + '. The note on the card says why.';
      row.querySelector('.prep-note').textContent = prepNote;
    }

    const ariesDialog = document.querySelector('#aries-dialog');
    const ariesText = document.querySelector('#aries-text');
    const ARIES_LABEL = document.querySelector('#aries-label').textContent;
    const ARIES_HINT = document.querySelector('#aries-hint').textContent;
    const ARIES_PLACEHOLDER = ariesText.placeholder;
    let ariesCard = null;
    let ariesItem = null;
    let ariesMode = 'assign';

    function openAriesDialog(card, item, mode) {
      ariesCard = card;
      ariesItem = item;
      ariesMode = mode === 'prep' ? 'prep' : 'assign';
      const owner = String(item.assignee || '').toLowerCase();
      const heading = document.querySelector('#aries-heading');
      const submit = document.querySelector('#aries-submit');
      let already = owner === 'aries';
      if (ariesMode === 'prep') {
        const last = lastPrep(item);
        already = Boolean(last && Date.now() - new Date(last.at).valueOf() < PREP_GAP_MS);
        heading.textContent = already ? 'Give Aries a new instruction for this prep' : 'Aries preps this for ' + nameOf(owner);
        document.querySelector('#aries-label').textContent = 'What should Aries get ready for ' + nameOf(owner) + '?' + (already ? '' : ' (optional)');
        document.querySelector('#aries-hint').textContent = nameOf(owner) + ' keeps the card. Aries reads the email, gathers the facts and documents ' + nameOf(owner) + ' needs, drafts replies for review, and writes what it prepared on this card. It never sends anything outside the company.';
        ariesText.placeholder = 'Example: pull the invoice and photos, and draft the reply to the adjuster.';
        submit.textContent = already ? 'Send to Aries' : 'Start prep';
      } else {
        heading.textContent = already ? 'Give Aries a new instruction' : 'Assign to Aries';
        document.querySelector('#aries-label').textContent = ARIES_LABEL;
        document.querySelector('#aries-hint').textContent = ARIES_HINT;
        ariesText.placeholder = ARIES_PLACEHOLDER;
        submit.textContent = already ? 'Send to Aries' : 'Give it to Aries';
      }
      document.querySelector('#aries-target').textContent = '#' + item.id + ' · ' + cardTitle(item);
      ariesText.value = '';
      ariesText.required = already;
      ariesDialog.showModal();
      ariesText.focus();
    }

    // Same order as giveToAries: the instruction note first, so Aries reads it as its task.
    async function prepForOwner(card, item, instruction) {
      const owner = String(item.assignee || '').toLowerCase();
      const submit = document.querySelector('#aries-submit');
      submit.disabled = true;
      try {
        if (instruction) {
          const command = await postAction({ operation: 'note', id: item.id, note: 'For Aries: ' + instruction });
          item.notes = (Array.isArray(item.notes) ? item.notes : []).concat([{ text: 'For Aries: ' + instruction, by: command.actor_email || '', at: command.created_at || '', pending: true }]);
          addHistory(item, 'wrote: For Aries: ' + instruction);
        }
        await postAction({ operation: 'prep', id: item.id, value: owner });
        addHistory(item, 'asked Aries to prep it for ' + nameOf(owner));
        ariesDialog.close();
        if (card.isConnected) fillCard(card, item);
        showToast(commandReceiptText(item.command_receipt)+'. Preparation has been requested.', false);
      } catch (error) {
        showToast(error.message || 'Could not start the prep', true);
      } finally {
        submit.disabled = false;
      }
    }

    // The instruction travels as a note that starts "For Aries:", queued before the assignment,
    // so Aries reads it as its task and everyone else can see what it was asked to do.
    async function giveToAries(card, item, instruction) {
      const submit = document.querySelector('#aries-submit');
      submit.disabled = true;
      try {
        if (instruction) {
          const command = await postAction({ operation: 'note', id: item.id, note: 'For Aries: ' + instruction });
          item.notes = (Array.isArray(item.notes) ? item.notes : []).concat([{ text: 'For Aries: ' + instruction, by: command.actor_email || '', at: command.created_at || '', pending: true }]);
          addHistory(item, 'wrote: For Aries: ' + instruction);
        }
        await postAction({ operation: 'assign', id: item.id, value: 'aries' });
        addHistory(item, 'requested assignment to Aries');
        ariesDialog.close();
        if (card.isConnected) fillCard(card, item);
        refreshBoardChrome();
        showToast(commandReceiptText(item.command_receipt)+'. Awaiting application by Aries.', false);
      } catch (error) {
        showToast(error.message || 'Could not give it to Aries', true);
      } finally {
        submit.disabled = false;
      }
    }

    document.querySelector('#aries-form').addEventListener('submit', function (event) {
      event.preventDefault();
      if (!ariesItem) return;
      if (ariesMode === 'prep') prepForOwner(ariesCard, ariesItem, ariesText.value.trim());
      else giveToAries(ariesCard, ariesItem, ariesText.value.trim());
    });
    document.querySelector('#aries-cancel').addEventListener('click', function () { ariesDialog.close(); });

    function closeChoices(card) {
      const panel = card.querySelector('.choices');
      panel.hidden = true;
      panel.textContent = '';
      card.querySelectorAll('.actions [aria-expanded]').forEach(function (button) {
        button.setAttribute('aria-expanded', 'false');
      });
    }

    function choice(label, onClick, danger) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'choice' + (danger ? ' danger' : '');
      button.textContent = label;
      button.addEventListener('click', function () { onClick(button); });
      return button;
    }

    // Done, Snooze and More open a row of choices inside the card rather than a browser prompt:
    // one tap to pick, and the answer is written on the card for the next person.
    function toggleChoices(card, item, kind, trigger) {
      const wasOpen = trigger.getAttribute('aria-expanded') === 'true';
      closeChoices(card);
      if (wasOpen) return;
      trigger.setAttribute('aria-expanded', 'true');
      const panel = card.querySelector('.choices');
      const label = document.createElement('p');
      label.className = 'choices-label';
      const row = document.createElement('div');
      row.className = 'choice-row';
      panel.append(label, row);
      if (kind === 'done') {
        label.textContent = 'What happened? It goes on the card so the team knows.';
        DONE_REASONS.forEach(function (pair) {
          row.append(choice(pair[1], function (button) { doneWithReason(card, item, pair[0], button); }));
        });
      } else if (kind === 'snooze') {
        label.textContent = 'Bring it back on:';
        [['Tomorrow', 1], ['In 3 days', 3], ['Next Monday', daysToNextMonday()]].forEach(function (pair) {
          const day = isoDayFromNow(pair[1]);
          row.append(choice(pair[0] + ' (' + monthDay(day) + ')', function (button) { snoozeTo(card, item, day, button); }));
        });
        const picker = document.createElement('input');
        picker.type = 'date';
        picker.className = 'choice-date';
        picker.min = isoDayFromNow(1);
        picker.value = isoDayFromNow(7);
        picker.setAttribute('aria-label', 'Snooze until a date');
        row.append(picker, choice('Snooze to this date', function (button) {
          if (!ISO_DAY_PATTERN.test(picker.value)) { showToast('Pick a date first.', true); return; }
          snoozeTo(card, item, picker.value, button);
        }));
      } else {
        label.textContent = 'Other actions:';
        if (item.assignee) {
          row.append(choice('Clear the owner', function (button) { assignTo(card, item, '', button); }));
        }
        row.append(choice('\u{1F44D} Worth a card', function (button) {
          submitAction(button, { operation: 'useful', id: item.id }, function () {
            addHistory(item, 'said it was worth a card');
            closeChoices(card);
            fillCard(card, item);
          });
        }));
        row.append(choice('\u{1F44E} Not a task', function (button) {
          if (!window.confirm('Tell Aries to stop making tasks out of emails like this one?\\n\\n' + item.title)) return;
          submitAction(button, { operation: 'not_useful', id: item.id }, function () {
            closeChoices(card);
            fillCard(card, item);
            refreshBoardChrome();
          });
        }));
        row.append(choice('Delete', function (button) {
          if (!window.confirm('Delete #' + item.id + ' permanently? ' + item.title)) return;
          submitAction(button, { operation: 'delete', id: item.id }, function () {
            closeChoices(card);
            fillCard(card, item);
            refreshBoardChrome();
          });
        }, true));
      }
      panel.hidden = false;
      const first = row.querySelector('button');
      if (first) first.focus();
    }

    function assignTo(card, item, person, button) {
      const message = person === 'aries'
        ? 'Assigned to Aries. It starts within a few minutes and writes what it did on the card.'
        : person
          ? 'Assigned to ' + nameOf(person) + '. Aries emails ' + nameOf(person) + ' about it.'
          : 'Owner cleared.';
      submitAction(button, { operation: 'assign', id: item.id, value: person }, function () {
        addHistory(item, person ? 'requested assignment to ' + nameOf(person) : 'requested clearing the owner');
        closeChoices(card);
        if (!inView(item)) card.remove();
        else fillCard(card, item);
        refreshBoardChrome();
      }, message);
    }

    function snoozeTo(card, item, day, button) {
      submitAction(button, { operation: 'snooze', id: item.id, value: day }, function () {
        addHistory(item, 'requested snooze to ' + monthDay(day));
        closeChoices(card);
        if (isResting(item)) {
          card.remove();
          refreshBoardChrome();
        } else {
          fillCard(card, item);
        }
      }, 'Snoozed to ' + monthDay(day) + '. It leaves the board until then.');
    }

    // Two queued commands, in order: the note that says why, then the change itself. The note
    // goes first so whoever reads the card later sees the reason next to the action.
    async function doneWithReason(card, item, reason, button) {
      button.disabled = true;
      try {
        await postAction({ operation: 'note', id: item.id, note: 'Done: ' + reason + '.' });
        await postAction({ operation: 'done', id: item.id });
        closeChoices(card);
        fillCard(card, item);
        refreshBoardChrome();
        showToast(commandReceiptText(item.command_receipt)+'. Completion requested: '+reason+'.', false);
      } catch (error) {
        button.disabled = false;
        showToast(error.message || 'Could not mark it done', true);
      }
    }

    async function markWaiting(card, item, day, button) {
      const who = (item.brief && item.brief.waiting_on) || 'the other side';
      button.disabled = true;
      try {
        await postAction({ operation: 'note', id: item.id, note: 'Still waiting on ' + who + '. Check again ' + monthDay(day) + '.' });
        await postAction({ operation: 'snooze', id: item.id, value: day });
        addHistory(item, 'requested a check on ' + monthDay(day) + ' while waiting on ' + who);
        fillCard(card, item);
        showToast(commandReceiptText(item.command_receipt)+'. Return date requested: '+monthDay(day)+'.', false);
      } catch (error) {
        button.disabled = false;
        showToast(error.message || 'Could not mark it waiting', true);
      }
    }

    function newEventId() {
      return 'ui-' + crypto.randomUUID();
    }

    function newTaskId() {
      const bytes = new Uint8Array(7);
      crypto.getRandomValues(bytes);
      return 'task-' + Array.from(bytes, function (value) { return value.toString(16).padStart(2, '0'); }).join('');
    }

    async function submitTodoAction(itemId, operation, payload) {
      const response = await fetch('/api/todo/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          event_id: newEventId(),
          item_id: itemId,
          operation: operation,
          payload: payload,
          client_ts: new Date().toISOString(),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'To-Do action was not saved');
      todoSyncStatus.textContent = 'Saved.';
      await loadTodos();
    }

    // Frank, 09/29/2026: "make sure the "Aries To-Do / One client, one clear action, one owner."
    // gets updated as board gets updated". Aries carries urgent and its prep state over from the
    // card; older catalogues only prefixed the task with "URGENT: ".
    function todoUrgent(item) {
      return item.urgent === true || String(item.text || '').indexOf('URGENT: ') === 0;
    }

    function todoText(item) {
      const text = String(item.text || '');
      return text.indexOf('URGENT: ') === 0 ? text.slice(8) : text;
    }

    // Month/day/year, in Eastern time for a timestamp.
    function fullDate(value) {
      const text = String(value || '');
      if (ISO_DAY_PATTERN.test(text)) {
        const parts = text.split('-').map(Number);
        return parts[1] + '/' + parts[2] + '/' + parts[0];
      }
      const date = new Date(text);
      if (Number.isNaN(date.valueOf())) return text;
      return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
    }

    function todoOwner(value) {
      const wanted = String(value || '').trim().toLowerCase();
      if (wanted === 'aries') return 'Aries';
      const person = teamList.find(function (entry) { return entry.key === wanted || entry.name.toLowerCase() === wanted; });
      return person ? person.name : String(value || '');
    }

    function todoOwnerKey(value) {
      const wanted = String(value || '').trim().toLowerCase();
      if (!wanted || wanted === 'aries') return wanted;
      const person = teamList.find(function (entry) { return entry.key === wanted || entry.name.toLowerCase() === wanted; });
      return person ? person.key : '';
    }

    const TODO_PREP_LABELS = {
      queued: ['Aries prep queued', 'aries'],
      running: ['Aries prepping', 'aries'],
      ready: ['Aries prep ready', 'aries'],
      failed: ['Aries prep failed', 'failed'],
    };

    let currentTodos = [];
    function renderTodos(items) {
      currentTodos = items;
      const restoreFocus=rememberFocus();
      const existingTodos=new Map(Array.from(todoList.querySelectorAll('[data-task-id]')).map(function(row){return [row.dataset.taskId,row];}));
      const nextTodoNodes=[];
      if(!items.length)todoList.replaceChildren();
      items = items.slice().sort(function (left, right) { return Number(todoUrgent(right)) - Number(todoUrgent(left)); });
      if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        const title = document.createElement('strong');
        title.textContent = 'No active team tasks.';
        const detail = document.createElement('span');
        detail.textContent = 'Add one here or let Aries publish the next catalogue.';
        empty.append(title, detail);
        todoList.append(empty);
      }

      items.forEach(function (item) {
        const row = document.createElement('article');
        row.className = 'todo-row';
        row.dataset.taskId=String(item.id);
        row.dataset.signature=JSON.stringify(item);
        row.dataset.done = String(Boolean(item.done));
        row.dataset.archived = String(Boolean(item.archived));
        row.dataset.urgent = String(todoUrgent(item) && !item.done);

        const toggle = document.createElement('button');
        toggle.className = 'todo-toggle';
        toggle.type = 'button';
        toggle.setAttribute('aria-label', (item.done ? 'Reopen ' : 'Complete ') + todoText(item));
        toggle.setAttribute('aria-pressed', String(Boolean(item.done)));
        toggle.textContent = item.done ? '✓' : '○';
        toggle.addEventListener('click', function () {
          toggle.disabled = true;
          submitTodoAction(item.id, 'toggle', { done: !(currentTodos.find(function(current){return current.id===item.id;})||item).done }).catch(function (error) {
            showToast(error.message || 'Unable to update task', true);
            toggle.disabled = false;
          });
        });

        const copy = document.createElement('div');
        copy.className = 'todo-copy';
        const title = document.createElement('h3');
        title.textContent = todoText(item);
        const details = document.createElement('p');
        details.textContent = item.details || '';
        const meta = document.createElement('div');
        meta.className = 'todo-meta';
        const dueIn = item.due ? daysUntil(String(item.due).slice(0, 10)) : null;
        const received = item.notificationDate ? daysUntil(String(item.notificationDate).slice(0, 10)) : null;
        const prepLabel = TODO_PREP_LABELS[item.ariesPrep];
        const prep = prepLabel && item.ariesPrepFor && item.ariesPrep !== 'failed'
          ? [prepLabel[0] + ' for ' + todoOwner(item.ariesPrepFor), prepLabel[1]]
          : prepLabel;
        [
          todoUrgent(item) ? ['Urgent', 'urgent'] : null,
          [item.assignee ? 'Owner: ' + todoOwner(item.assignee) : 'No owner yet', ''],
          item.client ? ['Client: ' + item.client, ''] : null,
          item.due ? ['Due ' + fullDate(item.due), dueIn !== null && dueIn <= 1 ? 'late' : ''] : null,
          item.notificationDate ? ['Received ' + fullDate(item.notificationDate)
            + (received !== null && received < 0 ? ', ' + (-received) + (received === -1 ? ' day ago' : ' days ago') : ''), ''] : null,
          prep ? prep : null,
          item.snoozedUntil ? ['Snoozed until ' + fullDate(item.snoozedUntil), ''] : null,
          item.archived ? ['Archived', ''] : null,
        ].filter(Boolean).forEach(function (entry) {
          const chip = document.createElement('span');
          chip.className = 'chip';
          chip.textContent = entry[0];
          if (entry[1]) chip.dataset.tone = entry[1];
          meta.append(chip);
        });
        copy.append(title, details, meta);

        const actions = document.createElement('div');
        actions.className = 'todo-actions';
        // The owner is picked from the roster, so a typo can no longer invent a teammate.
        const assign = document.createElement('select');
        assign.setAttribute('aria-label', 'Owner of ' + todoText(item));
        [{ key: '', name: 'No owner' }].concat(teamList, [{ key: 'aries', name: 'Aries' }]).forEach(function (person) {
          const option = document.createElement('option');
          option.value = person.key;
          option.textContent = person.key ? 'Owner: ' + person.name : 'No owner';
          assign.append(option);
        });
        assign.value = todoOwnerKey(item.assignee);
        assign.addEventListener('change', function () {
          assign.disabled = true;
          submitTodoAction(item.id, 'assign', { assignee: assign.value }).catch(function (error) {
            showToast(error.message || 'Unable to change the owner', true);
            assign.disabled = false;
          });
        });
        const snooze = document.createElement('select');
        snooze.setAttribute('aria-label', 'Snooze ' + todoText(item));
        [['', 'Snooze'], ['1', 'Until tomorrow'], ['monday', 'Until Monday'], ['7', 'For a week'], ['14', 'For two weeks']].forEach(function (entry) {
          const option = document.createElement('option');
          option.value = entry[0];
          option.textContent = entry[1];
          snooze.append(option);
        });
        snooze.addEventListener('change', function () {
          if (!snooze.value) return;
          const until = isoDayFromNow(snooze.value === 'monday' ? daysToNextMonday() : Number(snooze.value));
          snooze.disabled = true;
          submitTodoAction(item.id, 'snooze', { until: until }).catch(function (error) {
            showToast(error.message || 'Unable to snooze', true);
            snooze.disabled = false;
          });
        });
        actions.append(assign, snooze);
        if (/^https:[/][/]/.test(String(item.sourceUrl || ''))) {
          const source = document.createElement('a');
          source.href = item.sourceUrl;
          source.target = '_blank';
          source.rel = 'noopener';
          source.textContent = 'Open email';
          actions.append(source);
        }
        row.append(toggle, copy, actions);
        const previous=existingTodos.get(String(item.id));
        nextTodoNodes.push(previous && (previous.dataset.signature===row.dataset.signature || (previous.contains(document.activeElement) && !previous.querySelector(':disabled'))) ? previous : row);
      });
      if(items.length)reconcileChildren(todoList,nextTodoNodes);
      todoList.setAttribute('aria-busy', 'false');
      restoreFocus();
      handleTodoLink();
    }

    async function loadTodos() {
      todoList.setAttribute('aria-busy', 'true');
      try {
        const response = await fetch('/api/todos', { headers: { accept: 'application/json' }, cache: 'no-store' });
        if (!response.ok) throw new Error('To-Do request failed (' + response.status + ')');
        const payload = await response.json();
        setFreshness(payload);
        todoSyncStatus.textContent = payload.stale && payload.stale.is_stale
          ? 'Last known list. Aries has not refreshed it in the last few minutes.'
          : 'Catalogue snapshot received. Source tasks may have older evidence.';
        const catalogue=Array.isArray(payload.items)?payload.items:[];
        todoSyncStatus.textContent += ' '+catalogue.length+' catalogue tasks, '+catalogue.filter(function(item){return !item.done;}).length+' open. This is a separate collection from Board.';
        renderTodos(Array.isArray(payload.items) ? payload.items : []);
      } catch (error) {
        stateBadge.className = 'state-badge offline';
        stateBadge.textContent = 'Unavailable';
        todoList.setAttribute('aria-busy', 'false');
        showToast(error.message || 'To-Do unavailable', true);
      }
    }

    function switchView(view) {
      activeView = view;
      const showingTodos = view === 'todos';
      const showingWorklist = view === 'worklist';
      const showingChecked = view === 'checked';
      const showingUsers = view === 'users';
      const showingMine = view === 'mine';
      const showingExceptions = view === 'exceptions';
      document.querySelector('#show-exceptions').setAttribute('aria-pressed', String(showingExceptions));
      const showingBoard = !showingExceptions && !showingTodos && !showingWorklist && !showingChecked && !showingUsers && !showingMine;
      boardFilter = showingMine ? 'mine' : 'all';
      document.querySelector('#board-title').textContent = showingExceptions ? 'Exceptions requiring review' : showingMine ? 'My cards' : 'Team attention';
      document.querySelector('#board-subtitle').textContent = showingMine && me
        ? 'Only the cards assigned to you, ' + me.name + '.'
        : 'Curated operational items from Aries.';
      boardView.hidden = !showingBoard && !showingMine && !showingExceptions;
      boardSummary.hidden = !showingBoard && !showingMine && !showingExceptions;
      showMineButton.setAttribute('aria-pressed', String(showingMine));
      todoView.hidden = !showingTodos;
      worklistView.hidden = !showingWorklist;
      checkedView.hidden = !showingChecked;
      usersView.hidden = !showingUsers;
      showBoardButton.setAttribute('aria-pressed', String(showingBoard));
      showTodosButton.setAttribute('aria-pressed', String(showingTodos));
      showWorklistButton.setAttribute('aria-pressed', String(showingWorklist));
      showCheckedButton.setAttribute('aria-pressed', String(showingChecked));
      showUsersButton.setAttribute('aria-pressed', String(showingUsers));
      if (showingUsers) loadUsers();
      else if (showingTodos) loadTodos();
      else if (showingWorklist) loadWorklist();
      else loadBoard();
    }

    async function openThread(item) {
      threadTitle.textContent = '#' + item.id + ' · ' + cardTitle(item);
      threadMailbox.textContent = 'Loading the conversation…';
      threadMessages.replaceChildren();
      threadDialog.showModal();
      try {
        const response = await fetch('/api/thread?id=' + encodeURIComponent(item.id), {
          headers: { accept: 'application/json' }, cache: 'no-store',
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not load the email');
        threadMailbox.textContent = (payload.mailbox ? 'Mailbox: ' + payload.mailbox + ' · ' : '') +
          payload.messages.length + ' message' + (payload.messages.length === 1 ? '' : 's');
        payload.messages.forEach(function (message) {
          const block = document.createElement('div');
          block.className = 'thread-message';
          const meta = document.createElement('span');
          meta.className = 'thread-meta';
          meta.textContent = [message.from, message.date].filter(Boolean).join(' · ');
          const text = document.createElement('div');
          text.className = 'thread-text';
          text.textContent = message.body || '(no text in this message)';
          block.append(meta, text);
          if (message.truncated) {
            const note = document.createElement('div');
            note.className = 'thread-truncated';
            note.textContent = 'Message shortened — the rest is in the original mailbox.';
            block.append(note);
          }
          threadMessages.append(block);
        });
      } catch (error) {
        threadMailbox.textContent = error.message || 'Could not load the email';
      }
    }

    function renderChecked() {
      const done = boardItems.filter(function (item) { return item.status === 'done' && !item.pending; });
      checkedList.replaceChildren();
      done.forEach(function (item) {
        const row = document.createElement('div');
        row.className = 'checked-row';
        const text = document.createElement('span');
        text.className = 'worklist-text';
        text.textContent = '#' + item.id + ' · ' + cardTitle(item);
        const undo = document.createElement('button');
        undo.type = 'button';
        undo.className = 'card-action';
        undo.textContent = 'Undo';
        undo.addEventListener('click', function (event) {
          submitAction(event.currentTarget, { operation: 'reopen', id: item.id }, function () {
            undo.textContent = commandReceiptText(item.command_receipt);
            undo.disabled = true;
          });
        });
        row.append(text, undo);
        checkedList.append(row);
      });
      checkedCount.textContent = done.length
        ? done.length + ' recently checked off · Undo brings one back to the board'
        : 'Nothing checked off in the last 7 days.';
      checkedList.setAttribute('aria-busy', 'false');
    }

    function renderWorklist() {
      const needle = (worklistFilter.value || '').trim().toLowerCase();
      const rows = needle
        ? worklistItems.filter(function (item) {
            return (item.text + ' ' + (item.who || '') + ' ' + (item.section || '')).toLowerCase().includes(needle);
          })
        : worklistItems;
      worklist.replaceChildren();
      rows.forEach(function (item) {
        const row = document.createElement('div');
        row.className = 'worklist-row';
        row.dataset.done = String(Boolean(item.done));
        const mark = document.createElement('span');
        mark.className = 'worklist-mark';
        mark.textContent = item.done ? '✓' : '○';
        const text = document.createElement('span');
        text.className = 'worklist-text';
        text.textContent = item.text;
        const meta = document.createElement('span');
        meta.className = 'worklist-meta';
        if (item.who) { const who = document.createElement('span'); who.textContent = item.who; meta.append(who); }
        if (item.due) { const due = document.createElement('span'); due.textContent = 'due ' + formatDue(item.due); meta.append(due); }
        row.append(mark, text, meta);
        worklist.append(row);
      });
      const open = worklistItems.filter(function (item) { return !item.done; }).length;
      worklistCount.textContent = rows.length + ' shown · ' + open + ' open of ' + worklistItems.length +
        ' · read-only, personal items are never published';
      worklist.setAttribute('aria-busy', 'false');
    }

    async function loadWorklist() {
      worklist.setAttribute('aria-busy', 'true');
      try {
        const response = await fetch('/api/worklist', { headers: { accept: 'application/json' }, cache: 'no-store' });
        if (!response.ok) throw new Error('Full list request failed (' + response.status + ')');
        const payload = await response.json();
        setFreshness(payload);
        worklistItems = Array.isArray(payload.items) ? payload.items : [];
        renderWorklist();
      } catch (error) {
        worklist.setAttribute('aria-busy', 'false');
        showToast(error.message || 'Full list unavailable', true);
      }
    }

    // ---- User settings -----------------------------------------------------------------------
    // Frank, 09/29/2026: "if i want to change mark's name to Mike, I dont have a way to do that
    // right now. If mark changes his email address, I want to be able to update it." Owner only:
    // the worker answers /api/team with a 404 for everyone else.
    async function teamRequest(body) {
      const response = await fetch('/api/team', {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
      const result = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        const failure = new Error(result.error || 'The user list did not answer (' + response.status + ')');
        failure.status = response.status;
        throw failure;
      }
      return result;
    }

    function applyTeam(list) {
      teamList = list.map(function (person) { return { key: person.key, name: person.name }; });
      renderUsers(list);
      if (boardItems.length) render(boardItems);
    }

    function userField(label, id, type, value, limit) {
      const field = document.createElement('div');
      field.className = 'user-field';
      const caption = document.createElement('label');
      caption.htmlFor = id;
      caption.textContent = label;
      const input = document.createElement('input');
      input.id = id;
      input.type = type;
      input.required = true;
      input.maxLength = limit;
      input.autocomplete = 'off';
      input.value = value;
      field.append(caption, input);
      return field;
    }

    function userRow(person) {
      const form = document.createElement('form');
      form.className = 'user-row';
      const initial = document.createElement('span');
      initial.className = 'user-initial';
      initial.setAttribute('aria-hidden', 'true');
      initial.textContent = person.name.charAt(0).toUpperCase();
      const nameField = userField('Name', 'user-name-' + person.key, 'text', person.name, 40);
      const emailField = userField('Email', 'user-email-' + person.key, 'email', person.email, 120);
      const nameInput = nameField.querySelector('input');
      const emailInput = emailField.querySelector('input');
      const save = document.createElement('button');
      save.type = 'submit';
      save.className = 'user-save';
      save.textContent = 'Save changes';
      save.disabled = true;
      const note = document.createElement('p');
      note.className = 'user-note';
      const past = Array.isArray(person.past_emails) ? person.past_emails : [];
      note.textContent = past.length ? 'Earlier address: ' + past.join(', ') : '';
      const error = document.createElement('p');
      error.className = 'user-error';
      error.setAttribute('role', 'alert');
      function edited() {
        return nameInput.value.trim() !== person.name || emailInput.value.trim().toLowerCase() !== person.email;
      }
      form.addEventListener('input', function () {
        save.disabled = !edited();
        error.textContent = '';
      });
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        if (!edited()) return;
        const name = nameInput.value.trim();
        const email = emailInput.value.trim().toLowerCase();
        save.disabled = true;
        save.textContent = 'Saving';
        teamRequest({ key: person.key, name: name, email: email }).then(function (result) {
          const renamed = name !== person.name;
          const moved = email !== person.email;
          applyTeam(result.team);
          if (renamed && moved) showToast('Saved. ' + person.name + ' is now ' + name + ', at ' + email + '.', false);
          else if (renamed) showToast('Saved. ' + person.name + ' is now ' + name + '.', false);
          else showToast('Saved. Aries emails ' + name + ' at ' + email + ' from now on.', false);
        }).catch(function (failure) {
          error.textContent = failure.message;
          save.textContent = 'Save changes';
          save.disabled = !edited();
        });
      });
      form.append(initial, nameField, emailField, save, note, error);
      return form;
    }

    function renderUsers(list) {
      userList.textContent = '';
      list.forEach(function (person) { userList.append(userRow(person)); });
      userList.setAttribute('aria-busy', 'false');
    }

    async function loadUsers() {
      userList.setAttribute('aria-busy', 'true');
      try {
        const result = await teamRequest(null);
        renderUsers(Array.isArray(result.team) ? result.team : []);
      } catch (failure) {
        userList.setAttribute('aria-busy', 'false');
        if (failure.status === 404) {
          showUsersButton.hidden = true;
          switchView('board');
          return;
        }
        showToast(failure.message || 'User list unavailable', true);
      }
    }

    addUserForm.addEventListener('submit', function (event) {
      event.preventDefault();
      const nameInput = document.querySelector('#add-user-name');
      const emailInput = document.querySelector('#add-user-email');
      const error = addUserForm.querySelector('.user-error');
      const button = addUserForm.querySelector('.user-save');
      const name = nameInput.value.trim();
      error.textContent = '';
      button.disabled = true;
      teamRequest({ name: name, email: emailInput.value.trim().toLowerCase() }).then(function (result) {
        applyTeam(result.team);
        addUserForm.reset();
        showToast('Added ' + name + '. Cards can be assigned to them now.', false);
      }).catch(function (failure) {
        error.textContent = failure.message;
      }).finally(function () {
        button.disabled = false;
      });
    });
    addUserForm.addEventListener('input', function () { addUserForm.querySelector('.user-error').textContent = ''; });

    async function loadBoard() {
      board.setAttribute('aria-busy', 'true');
      try {
        const response = await fetch('/api/board', { headers: { accept: 'application/json' }, cache: 'no-store' });
        if (!response.ok) throw new Error('Board request failed (' + response.status + ')');
        const payload = await response.json();
        setFreshness(payload);
        boardItems = reconcileBoardItems(boardItems,Array.isArray(payload.items) ? payload.items : []);
        currentReceipts = Array.isArray(payload.command_receipts) ? payload.command_receipts : [];
        const availableIds=new Set(boardItems.map(function(item){return String(item.id);}));
        selectedCards.forEach(function(id){if(!availableIds.has(id)||boardItems.some(function(item){return String(item.id)===id&&item.status==='done';}))selectedCards.delete(id);});
        cardNodes.forEach(function(node,id){if(!availableIds.has(id))cardNodes.delete(id);});
        compactRows.forEach(function(node,id){if(!availableIds.has(id))compactRows.delete(id);});
        threadIds = new Set(Array.isArray(payload.thread_ids) ? payload.thread_ids : []);
        document.querySelector('#activity-link').hidden = payload.activity !== true;
        showUsersButton.hidden = payload.activity !== true;
        if (Array.isArray(payload.team) && payload.team.length) teamList = payload.team;
        me = payload.me && payload.me.key ? payload.me : null;
        showMineButton.hidden = !me;
        render(boardItems);
        renderChecked();
        handleBoardLink();
      } catch (error) {
        stateBadge.className = 'state-badge offline';
        stateBadge.textContent = 'Unavailable';
        board.setAttribute('aria-busy', 'false');
        showToast(error.message || 'Board unavailable', true);
      }
    }

    function defaultSnoozeDate() {
      const when = new Date(Date.now() + 86400000);
      return when.toISOString().slice(0, 10);
    }

    const ACTION_WORDING = {
      done: 'Marked done.',
      note: 'Note queued for Aries.',
      assign: 'Assignment queued for Aries.',
      snooze: 'Snoozed.',
      delete: 'Delete queued for Aries.',
      reorder: 'Reordered.',
      useful: 'Noted \u2014 Aries will keep flagging these.',
      not_useful: 'Noted \u2014 Aries will stop flagging these.',
    };

    async function postAction(payload) {
      const response = await fetch('/api/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Action was not queued');
      const command = result.command || {};
      const item = boardItems.find(function (row) { return row.id === payload.id; });
      if (item) { item.command_receipt = result.receipt || command.receipt || Object.assign({},command,{state:command.state || 'queued'}); const card=cardNodes.get(String(item.id)); if(card)decorateCard(card,item); }
      return command;
    }

    async function submitAction(button, payload, onAccepted, message) {
      if (button) button.disabled = true;
      try {
        const command = await postAction(payload);
        showToast(commandReceiptText((boardItems.find(function(item){return item.id===payload.id;})||{}).command_receipt), false);
        // The accepted row carries the identity Access proved and the time the worker stamped.
        // Callers render from THAT rather than guessing at either.
        if (typeof onAccepted === 'function') onAccepted(command);
      } catch (error) {
        showToast(error.message || 'Action failed', true);
      } finally {
        if (button) button.disabled = false;
      }
    }

    noteForm.addEventListener('submit', function (event) {
      event.preventDefault();
      const value = noteText.value.trim();
      if (!noteItem || !value) return;
      noteDialog.close();
      const item = noteItem;
      const host = noteHost;
      // Show it on the card straight away, marked as still on its way. The note only reaches
      // the board on the next sync, and a card that looked completely unchanged afterwards is
      // why the button read as doing nothing at all.
      submitAction(null, { operation: 'note', id: item.id, note: value }, function (command) {
        const entry = { text: value, by: command.actor_email || '', at: command.created_at || '', pending: true };
        item.notes = (Array.isArray(item.notes) ? item.notes : []).concat([entry]);
        item.note = value;
        addHistory(item, 'wrote: ' + value);
        if (host && host.isConnected) fillCard(host, item);
      });
      noteItem = null;
      noteHost = null;
    });
    document.querySelector('#note-cancel').addEventListener('click', function () { noteDialog.close(); noteItem = null; });
    document.querySelector('#thread-close').addEventListener('click', function () { threadDialog.close(); });
    document.querySelector('#refresh').addEventListener('click', loadBoard);
    document.querySelector('#refresh-worklist').addEventListener('click', loadWorklist);
    worklistFilter.addEventListener('input', renderWorklist);
    showWorklistButton.addEventListener('click', function () { switchView('worklist'); });
    showCheckedButton.addEventListener('click', function () { switchView('checked'); });
    showUsersButton.addEventListener('click', function () { switchView('users'); });
    showMineButton.addEventListener('click', function () { switchView('mine'); });
    document.querySelector('#expand-all').addEventListener('click', function () {
      const cards = Array.prototype.slice.call(board.querySelectorAll('.card'));
      const open = document.querySelector('#expand-all').textContent === 'Expand all';
      cards.forEach(function (card) {
        const item = boardItems.find(function (entry) { return String(entry.id) === card.dataset.id; });
        if (item) setCollapsed(card, item, !open);
      });
    });
    document.querySelector('#refresh-checked').addEventListener('click', loadBoard);
    document.querySelector('#refresh-todos').addEventListener('click', loadTodos);
    document.querySelector('#add-todo').addEventListener('click', function () {
      const text = window.prompt('What needs to be done?');
      if (!text || !text.trim()) return;
      const id = newTaskId();
      submitTodoAction(id, 'add', {
        item: {
          id: id,
          text: text.trim(),
          upstreamIds: [],
          seedDone: false,
        },
      }).catch(function (error) { showToast(error.message || 'Unable to add task', true); });
    });
    showBoardButton.addEventListener('click', function () { switchView('board'); });
    showTodosButton.addEventListener('click', function () { switchView('todos'); });
    ${BOARD_UPGRADE_SCRIPT}
    const initialView = new URLSearchParams(location.search).get('view');
    if (['todos','worklist','exceptions','mine'].includes(initialView)) switchView(initialView); else loadBoard();
    window.setInterval(function () {
      if (activeView === 'users' || noteDialog.open || ariesDialog.open || bulkDialog.open) return;
      if (activeView === 'todos') loadTodos();
      else if (activeView === 'worklist') loadWorklist();
      // A card with its Done, Snooze or More choices open is mid-decision. Re-rendering the
      // board under it would close the row and throw away a half-picked date.
      else if (!board.querySelector('.choices:not([hidden])')) loadBoard();  // also refreshes the checked-off list
    }, 30000);
  </script>
</body>
</html>`
```


### `test/activity.test.js`

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import { FakeD1Database } from './fake-d1.js'

const UI_HOST = 'aries.flood.doctor'
const OWNER = 'darakhshan.farough@gmail.com'

function env() {
  return {
    ALLOWED_EMAILS: OWNER,
    ALLOWED_EMAIL_DOMAINS: 'flood.doctor',
    ACTIVITY_OWNER_EMAILS: OWNER,
    PUBLISHER_TOKEN: 'test-publisher-token',
    STALE_AFTER_SECONDS: '300',
    DB: new FakeD1Database(),
  }
}

function as(email, path, init = {}) {
  return new Request(`https://${UI_HOST}${path}`, {
    ...init,
    headers: { 'Cf-Access-Authenticated-User-Email': email, ...(init.headers || {}) },
  })
}

function action(email, body) {
  return as(email, '/api/action', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'CF-Connecting-IP': '203.0.113.9',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
    },
    body: JSON.stringify(body),
  })
}

test('the activity log is served to the owner and is a 404 for every other identity', async () => {
  const { default: worker } = await import('../src/index.js')
  const settings = env()

  for (const path of ['/activity', '/api/activity']) {
    const owner = await worker.fetch(as(OWNER, path), settings, {})
    assert.equal(owner.status, 200, path)
    const ownerCase = await worker.fetch(as('Darakhshan.Farough@gmail.com', path), settings, {})
    assert.equal(ownerCase.status, 404, 'Access sends the exact address; a different casing is not on ALLOWED_EMAILS')

    for (const email of ['mark@flood.doctor', 'dom@flood.doctor', 'outsider@example.com', '']) {
      const response = await worker.fetch(as(email, path), settings, {})
      assert.equal(response.status, 404, `${email || 'anonymous'} ${path}`)
    }
  }
  const post = await worker.fetch(as(OWNER, '/api/activity', { method: 'POST' }), settings, {})
  assert.equal(post.status, 405)
})

test('every board action records who, what, card title, IP, country and device', async () => {
  const { default: worker } = await import('../src/index.js')
  const settings = env()
  settings.DB.seedSnapshot([{ id: 41, title: 'Review carrier estimate' }], new Date().toISOString())

  const request = action('mark@flood.doctor', { id: 41, operation: 'done' })
  Object.defineProperty(request, 'cf', { value: { country: 'US' } })
  const response = await worker.fetch(request, settings, {})
  assert.equal(response.status, 202)
  assert.equal(settings.DB.commands.length, 1)

  const [row] = settings.DB.activity
  assert.equal(row.actor_email, 'mark@flood.doctor')
  assert.equal(row.operation, 'done')
  assert.equal(row.item_id, '41')
  assert.equal(row.title, 'Review carrier estimate')
  assert.equal(row.ip, '203.0.113.9')
  assert.equal(row.country, 'US')
  assert.match(row.user_agent, /Safari/)

  const log = await (await worker.fetch(as(OWNER, '/api/activity'), settings, {})).json()
  assert.equal(log.rows.length, 1)
  assert.equal(log.rows[0].ip, '203.0.113.9')

  const page = await (await worker.fetch(as(OWNER, '/activity'), settings, {})).text()
  assert.match(page, /Review carrier estimate/)
  assert.match(page, /203\.0\.113\.9/)
})

test('a burst of closes by one person is flagged in the 24-hour summary', async () => {
  const { default: worker } = await import('../src/index.js')
  const settings = env()
  for (let id = 1; id <= 25; id += 1) {
    const response = await worker.fetch(action('mark@flood.doctor', { id, operation: 'done' }), settings, {})
    assert.equal(response.status, 202)
  }
  await worker.fetch(action('dom@flood.doctor', { id: 99, operation: 'done' }), settings, {})

  const log = await (await worker.fetch(as(OWNER, '/api/activity?who=mark@flood.doctor&op=done'), settings, {})).json()
  assert.equal(log.rows.length, 25)
  const mark = log.summary.find((entry) => entry.who === 'mark@flood.doctor' && entry.op === 'done')
  assert.equal(mark.count, 25)
  assert.equal(mark.burst.count, 25)
  const dom = log.summary.find((entry) => entry.who === 'dom@flood.doctor')
  assert.equal(dom.burst, null)
})

test('only the owner is told to show the Activity link', async () => {
  const { default: worker } = await import('../src/index.js')
  const settings = env()
  settings.DB.seedSnapshot([], new Date().toISOString())
  const owner = await (await worker.fetch(as(OWNER, '/api/board'), settings, {})).json()
  assert.equal(owner.activity, true)
  const mark = await (await worker.fetch(as('mark@flood.doctor', '/api/board'), settings, {})).json()
  assert.equal(mark.activity, false)
})
```


### `test/audit.test.js`

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import worker from '../src/index.js'
import { APP_HTML } from '../src/ui.js'
import { FakeD1Database } from './fake-d1.js'

// Frank, 09/30/2026: "audit the aries todo list and aries prep work and aries cards ob the board
// and enhance in anywway that you can". These cover what the audit changed in the worker: the
// brief's own title, what Aries is doing on a card, and To-Do changes that reach the board.

const UI_HOST = 'aries.flood.doctor'
const SYNC_HOST = 'aries-publish.flood.doctor'
const TASK_ID = 'task-0123456789abcd'
const MANUAL_ID = 'task-fedcba98765432'

function settings(db) {
  return {
    ALLOWED_EMAILS: 'darakhshan.farough@gmail.com',
    ALLOWED_EMAIL_DOMAINS: 'flood.doctor,flooddoctorva.com,restorationdoctors.com',
    PUBLISHER_TOKEN: 'test-publisher-token',
    STALE_AFTER_SECONDS: '300',
    DB: db,
  }
}

function sync(path, body) {
  return new Request(`https://${SYNC_HOST}${path}`, {
    method: 'POST',
    headers: { authorization: 'Bearer test-publisher-token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function as(email, path, init = {}) {
  return new Request(`https://${UI_HOST}${path}`, {
    ...init,
    headers: { 'Cf-Access-Authenticated-User-Email': email, ...(init.headers || {}) },
  })
}

function brief(overrides = {}) {
  return {
    needs: 'Travelers issued its final determination on the Malik claim.',
    next_step: 'Frank: decide whether to escalate.',
    action: 'decide',
    owner_hint: 'frank',
    waiting_on: '',
    waiting_since: '',
    client: 'Malik',
    claim: 'I9G3968',
    amount: '$40,859.00',
    deadline: '',
    deadline_note: '',
    phone: '',
    counsel_only: false,
    last_ours: null,
    last_theirs: null,
    messages: 3,
    generated_at: '2026-09-30T04:00:00Z',
    ...overrides,
  }
}

test('a brief carries its own title, and a card says what Aries is doing on it', async () => {
  const db = new FakeD1Database()
  const env = settings(db)
  const accepted = await worker.fetch(sync('/api/sync/snapshot', { items: [
    { id: 4011, title: '[aries inbox] RE: [External] Re: Claim Nbr: I9G3968', status: 'open', assignee: 'steve',
      brief: brief({ title: 'Malik: Travelers final determination, $40,859' }),
      prep: { status: 'running', for: 'steve', at: '2026-09-30T04:10:00Z', task: 'ot-x', prompt: 'never published' } },
    { id: 4012, title: 'Aries card', status: 'open', assignee: 'aries',
      aries_task: { status: 'ready', at: '2026-09-30T03:00:00Z', finished_at: '2026-09-30T03:20:00Z' } },
    { id: 4013, title: 'Bad prep', status: 'open', prep: { status: 'exploded', at: 'soon' } },
  ] }), env, {})
  assert.equal(accepted.status, 200)

  const board = await (await worker.fetch(as('steve@restorationdoctors.com', '/api/board'), env, {})).json()
  const cards = Object.fromEntries(board.items.map((item) => [item.id, item]))
  assert.equal(cards[4011].brief.title, 'Malik: Travelers final determination, $40,859')
  assert.deepEqual(cards[4011].prep, { status: 'running', for: 'steve', at: '2026-09-30T04:10:00Z' },
    'only the state is published, never the task or its prompt')
  assert.deepEqual(cards[4012].aries_task, { status: 'ready', at: '2026-09-30T03:00:00Z', finished_at: '2026-09-30T03:20:00Z' })
  assert.equal(cards[4013].title, 'Bad prep', 'an off-contract task state drops only itself')
  assert.equal('prep' in cards[4013], false)
  assert.equal('title' in brief(), false, 'a brief without a title stays valid')
})

function catalogueItem(overrides = {}) {
  return {
    id: TASK_ID,
    text: 'URGENT: Confirm the Cigler check arrived',
    client: 'Kevin Cigler',
    sourceRevision: 'rev-1',
    upstreamIds: ['4101', 'board:4102', 'gmail:message-1'],
    assignee: 'Dom',
    seedDone: false,
    urgent: true,
    ariesPrep: 'ready',
    ariesPrepFor: 'steve',
    ...overrides,
  }
}

function todoAction(eventId, itemId, operation, payload, email = 'frankd@flooddoctorva.com') {
  return as(email, '/api/todo/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event_id: eventId, item_id: itemId, operation, payload, client_ts: new Date().toISOString() }),
  })
}

async function todoBoard() {
  const db = new FakeD1Database()
  db.seedTeam()
  const env = settings(db)
  const published = await worker.fetch(sync('/api/sync/todos/catalogue', { items: [
    catalogueItem(),
    catalogueItem({ id: MANUAL_ID, text: 'Buy fans', upstreamIds: undefined, urgent: undefined, ariesPrep: 'thinking' }),
  ] }), env, {})
  assert.equal(published.status, 200)
  return { db, env }
}

test('a To-Do task carries urgent and Aries prep from its card, and ignores an unknown prep state', async () => {
  const { env } = await todoBoard()
  const list = await (await worker.fetch(as('frankd@flooddoctorva.com', '/api/todos'), env, {})).json()
  const items = Object.fromEntries(list.items.map((item) => [item.id, item]))
  assert.equal(items[TASK_ID].urgent, true)
  assert.equal(items[TASK_ID].ariesPrep, 'ready')
  assert.equal(items[TASK_ID].ariesPrepFor, 'steve')
  assert.equal('urgent' in items[MANUAL_ID], false)
  assert.equal('ariesPrep' in items[MANUAL_ID], false)
})

test('checking off or handing on a To-Do task changes the board cards it came from', async () => {
  const { db, env } = await todoBoard()
  const done = await worker.fetch(todoAction('ui-0000000000000001', TASK_ID, 'toggle', { done: true }), env, {})
  assert.equal(done.status, 202)
  assert.deepEqual(db.commands.map((command) => [command.operation, command.item_id, command.value]),
    [['done', 4101, null], ['done', 4102, null]], 'the card ids only, never a mail id')
  assert.equal(db.commands[0].actor_email, 'frankd@flooddoctorva.com')

  await worker.fetch(todoAction('ui-0000000000000002', TASK_ID, 'toggle', { done: false }), env, {})
  assert.deepEqual(db.commands.slice(2).map((command) => command.operation), ['reopen', 'reopen'])

  // The desktop app sends a name; the board takes the roster key.
  await worker.fetch(todoAction('ui-0000000000000003', TASK_ID, 'assign', { assignee: 'Steve' }), env, {})
  assert.deepEqual(db.commands.slice(4).map((command) => [command.operation, command.value]),
    [['assign', 'steve'], ['assign', 'steve']])

  const before = db.commands.length
  await worker.fetch(todoAction('ui-0000000000000004', TASK_ID, 'assign', { assignee: 'Zed' }), env, {})
  await worker.fetch(todoAction('ui-0000000000000005', MANUAL_ID, 'toggle', { done: true }), env, {})
  // A repeat of an event already stored is not a new change.
  await worker.fetch(todoAction('ui-0000000000000001', TASK_ID, 'toggle', { done: true }), env, {})
  assert.equal(db.commands.length, before, 'unknown owners, hand-made tasks and repeats change no card')
})

test('a later change on the board wins over an older To-Do owner or check-off', async () => {
  const { db, env } = await todoBoard()
  await worker.fetch(todoAction('ui-0000000000000006', TASK_ID, 'assign', { assignee: 'shayan' }), env, {})
  const before = await (await worker.fetch(as('frankd@flooddoctorva.com', '/api/todos'), env, {})).json()
  assert.equal(before.items.find((item) => item.id === TASK_ID).assignee, 'shayan')

  // The board hands the card to Katherine afterward, and the next catalogue says so.
  const later = new Date(Date.now() + 60000).toISOString()
  await worker.fetch(sync('/api/sync/todos/catalogue', { items: [
    catalogueItem({ assignee: 'katherine', sourceUpdatedAt: later }),
  ] }), env, {})
  const after = await (await worker.fetch(as('frankd@flooddoctorva.com', '/api/todos'), env, {})).json()
  assert.equal(after.items.find((item) => item.id === TASK_ID).assignee, 'katherine')
  assert.equal(db.todoOperations.length, 1, 'the operation is kept, only overtaken')
})

test('the page shows counsel-only and Aries state on folded cards and picks To-Do owners from the roster', () => {
  assert.match(APP_HTML, /<span class="chip counsel" hidden>Counsel only<\/span>/)
  assert.match(APP_HTML, /<span class="chip aries-state" hidden><\/span>/)
  const todo = APP_HTML.slice(APP_HTML.indexOf('function renderTodos'), APP_HTML.indexOf('async function loadTodos'))
  assert.doesNotMatch(todo, /window\.prompt/, 'no free-text owner or date prompts')
  assert.match(todo, /createElement\('select'\)/)
  assert.match(APP_HTML, /One client, one clear action, one owner\./)
})
```


### `test/auth.test.js`

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import { FakeD1Database } from './fake-d1.js'

const UI_HOST = 'aries.flood.doctor'
const SYNC_HOST = 'aries-publish.flood.doctor'

function request(host, path = '/', init = {}) {
  return new Request(`https://${host}${path}`, init)
}

function env(overrides = {}) {
  return {
    ALLOWED_EMAILS: 'dom@flood.doctor,mark@flood.doctor',
    PUBLISHER_TOKEN: 'test-publisher-token',
    STALE_AFTER_SECONDS: '300',
    DB: new FakeD1Database(),
    ...overrides,
  }
}

test('serves only a minimal public health response on the two configured hosts', async () => {
  const { default: worker } = await import('../src/index.js')

  for (const host of [UI_HOST, SYNC_HOST]) {
    const response = await worker.fetch(request(host, '/healthz'), env(), {})
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true })
    assert.equal(response.headers.get('cache-control'), 'no-store')
  }

  const foreign = await worker.fetch(request('attacker.example', '/healthz'), env(), {})
  assert.equal(foreign.status, 404)
  assert.equal(await foreign.text(), 'Not found')
})

test('fails closed on UI identity and sync bearer authentication', async () => {
  const { default: worker } = await import('../src/index.js')
  const settings = env()

  const missingIdentity = await worker.fetch(request(UI_HOST), settings, {})
  assert.equal(missingIdentity.status, 403)

  const unlistedIdentity = await worker.fetch(request(UI_HOST, '/', {
    headers: { 'Cf-Access-Authenticated-User-Email': 'outsider@flood.doctor' },
  }), settings, {})
  assert.equal(unlistedIdentity.status, 403)

  const wrongCaseIdentity = await worker.fetch(request(UI_HOST, '/', {
    headers: { 'Cf-Access-Authenticated-User-Email': 'Dom@flood.doctor' },
  }), settings, {})
  assert.equal(wrongCaseIdentity.status, 403)

  const teammate = await worker.fetch(request(UI_HOST, '/', {
    headers: { 'Cf-Access-Authenticated-User-Email': 'dom@flood.doctor' },
  }), settings, {})
  assert.notEqual(teammate.status, 403)

  const missingBearer = await worker.fetch(request(SYNC_HOST, '/api/sync/commands'), settings, {})
  assert.equal(missingBearer.status, 401)

  const accessHeaderCannotReplaceBearer = await worker.fetch(request(SYNC_HOST, '/api/sync/commands', {
    headers: { 'Cf-Access-Authenticated-User-Email': 'dom@flood.doctor' },
  }), settings, {})
  assert.equal(accessHeaderCannotReplaceBearer.status, 401)

  const validBearer = await worker.fetch(request(SYNC_HOST, '/api/sync/commands', {
    headers: { authorization: 'Bearer test-publisher-token' },
  }), settings, {})
  assert.notEqual(validBearer.status, 401)

  const crossHost = await worker.fetch(request(UI_HOST, '/api/sync/commands', {
    headers: {
      authorization: 'Bearer test-publisher-token',
      'Cf-Access-Authenticated-User-Email': 'dom@flood.doctor',
    },
  }), settings, {})
  assert.equal(crossHost.status, 404)
})
```


### `test/board-ui-state.test.js`

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { APP_HTML } from '../src/ui.js'
import { cardExceptions, matchesBoardFilters, commandReceiptText, bulkActionPlan, bulkUndoPayload, reconcileBoardItems } from '../src/board-ui-state.js'

test('board filters combine text, identity, responsibility, urgency, due date and status', () => {
  const item = { id: 34, title: 'Review repair scope', status: 'open', due: '2026-10-10', priority: 'urgent', assignee: 'mark', responsibility: { owner: 'frank' }, brief: { client: 'Pickering', claim: 'AB-14' }, identity: { invoice_id: '115224' } }
  assert.equal(matchesBoardFilters(item, { query: 'repair', owner: 'frank', client: 'PICKERING', claim: '115224', urgency: 'urgent', due: 'overdue', status: 'open' }, '2026-10-11'), true)
  for (const filters of [{ owner: 'mark' }, { due: 'today' }, { urgency: 'normal' }, { claim: 'AB-99' }, { status: 'done' }, { owner: 'unassigned' }]) assert.equal(matchesBoardFilters(item, filters, '2026-10-11'), false)
  assert.equal(matchesBoardFilters({ title: 'Undated', due: 'unknown' }, { due: 'undated', owner: 'unassigned' }, '2026-10-11'), true)
})

test('exceptions distinguish stale and unknown evidence from actual command and preparation failures', () => {
  const now = Date.parse('2026-10-11T12:00:00Z')
  const item = { source_updated_at: '2026-10-01T12:00:00Z', prep: { status: 'timed_out', error: 'Document absent' }, command_receipt: { state: 'received', created_at: '2026-10-11T10:00:00Z' }, brief: { action: 'close' } }
  assert.deepEqual(cardExceptions(item, now).map(issue => issue.code), ['prep_failed', 'command_stuck', 'evidence_stale', 'looks_done'])
  assert.deepEqual(cardExceptions({}, now).map(issue => issue.code), ['evidence_unknown'])
  assert.equal(cardExceptions({ source_updated_at: '2026-10-11T11:00:00Z', prep: { status: 'running' } }, now).length, 0)
  assert.deepEqual(cardExceptions({ source_updated_at: '2026-10-11T11:00:00Z', aries_task: { status: 'interrupted' }, prep: { status: 'queued', at: '2026-10-11T06:00:00Z' } }, now).map(issue => issue.code), ['aries_failed', 'prep_stuck'])
})

test('a queued receipt never claims application or delivery', () => {
  assert.equal(commandReceiptText({ state: 'queued', operation: 'assign' }), 'Queued for Aries · assign')
  assert.equal(commandReceiptText({ state: 'received', operation: 'prep' }), 'Received by Aries · prep')
  assert.match(commandReceiptText({ state: 'failed', detail: 'Runner unavailable' }), /Failed: Runner unavailable/)
})

test('bulk plan freezes affected values, excludes completed cards, and duplicate review only adds a note', () => {
  const rows = [{ id: 1, title: 'Scope', assignee: 'mark', status: 'open' }, { id: 2, status: 'done' }]
  const plan = bulkActionPlan(rows, new Set(['1', '2']), 'assign', 'frank')
  assert.equal(plan.length, 1)
  rows[0].assignee = 'steve'
  assert.equal(plan[0].before.assignee, 'mark')
  const review = bulkActionPlan(rows, new Set(['1']), 'duplicate-review', '')[0]
  assert.equal(review.payload.operation, 'note')
  assert.match(review.payload.note, /before changing or closing/)
  assert.throws(() => bulkActionPlan(rows, new Set(['1']), 'delete', ''), /not supported/)
})

test('bulk undo requires the exact applied receipt and current unchanged value', () => {
  const entry = { id: 1, command_id: 22, operation: 'assign', value: 'frank', before: { assignee: 'mark' } }
  const item = { id: 1, assignee: 'frank', command_receipt: { id: 22 } }
  assert.equal(bulkUndoPayload(entry, item, { id: 22, state: 'queued' }), null)
  assert.equal(bulkUndoPayload(entry, item, { id: 21, state: 'applied' }), null)
  assert.deepEqual(bulkUndoPayload(entry, item, { id: 22, state: 'applied' }), { id: 1, operation: 'assign', value: 'mark', expected: { command_id:22, assignee:'frank', due:'', status:'open' } })
  assert.equal(bulkUndoPayload(entry, { ...item, assignee: 'steve' }, { id: 22, state: 'applied' }), null)
  assert.equal(bulkUndoPayload(entry, { ...item, command_receipt: { id: 23 } }, { id: 22, state: 'applied' }), null)
  const snooze = { id: 1, command_id: 22, operation: 'snooze', value: '2026-10-18', before: { status: 'open', due: '' } }
  const snoozed = { id: 1, status: 'snoozed', due: '2026-10-18' }
  assert.equal(bulkUndoPayload(snooze, snoozed, { id: 22, state: 'applied' }), null)
  assert.equal(bulkUndoPayload({ ...snooze, before: { status: 'snoozed', due: '2026-10-15' } }, snoozed, { id: 22, state: 'applied' }).value, '2026-10-15')
})

test('refresh retains card object identity for bound handlers but removes obsolete fields', () => {
  const item = { id: 1, assignee: 'mark', prep: { status: 'running' } }
  const rows = reconcileBoardItems([item], [{ id: 1, assignee: 'frank' }, { id: 2, title: 'New task' }])
  assert.equal(rows[0], item)
  assert.equal(item.assignee, 'frank')
  assert.equal('prep' in item, false)
  assert.equal(rows.length, 2)
})

test('upgraded served script remains parseable and offers non-destructive bulk choices', () => {
  const scripts = [...APP_HTML.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  for (const script of scripts) assert.doesNotThrow(() => new Function(script[1]))
  assert.match(APP_HTML, /id="show-exceptions"/)
  assert.match(APP_HTML, /id="detail-dialog"/)
  assert.match(APP_HTML, /id="bulk-preview"/)
  assert.match(APP_HTML, /reconcileChildren\(board,nodes\)/)
  assert.match(APP_HTML, /data-task-id/)
})
```


### `test/c34-live-harness.mjs`

```js
// Explicit TEST-only harness: installed Worker code, synthetic allowed Access identity, live D1.
import assert from 'node:assert/strict'
import worker from '../src/index.js'
const account=process.env.C34_ACCOUNT_ID, token=process.env.CLOUDFLARE_API_TOKEN
if(!account||!token)throw Error('Required environment is missing')
const query=async(sql,params=[])=>{
  const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/33888fc5-0e13-413a-8a51-5b0cc365703b/query`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sql,params})})
  const body=await response.json();if(!body.success)throw Error('D1 query failed')
  return body.result[0]
}
const env={ALLOWED_EMAILS:'frank@example.test',DB:{prepare(sql){return{values:[],bind(...values){this.values=values;return this},async all(){return query(sql,this.values)},async first(){return (await query(sql,this.values)).results[0]},async run(){return query(sql,this.values)}}}}}
const call=(path,body)=>worker.fetch(new Request('https://aries.flood.doctor'+path,{method:body?'POST':'GET',headers:{'Cf-Access-Authenticated-User-Email':'frank@example.test','Origin':'https://aries.flood.doctor','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,{})
const action=process.argv[2]
if(action==='post'){
 const r=await call('/api/mission/answer',{card_id:'TEST-C34',kind:'text',text:'TEST C34: A. Keep my Mission instructions across sessions.',request_id:'TEST-C34-proof'})
 const j=await r.json();assert.equal(r.status,200);assert.equal(j.answer.card_id,'TEST-C34');console.log(JSON.stringify({method:'Worker test harness with synthetic TEST Access identity and live D1',...j}))
}else if(action==='read'){
 const records=await (await call('/api/mission')).json(),answers=await (await call('/api/mission/answers')).json()
 console.log(JSON.stringify({records:records.records.filter(r=>r.id==='TEST-C34'),answers:answers.answers.filter(r=>r.card_id==='TEST-C34')}))
}else if(action==='cleanup'){
 await query("DELETE FROM mission_answers WHERE card_id='TEST-C34'")
 await query("DELETE FROM mission_records WHERE id='TEST-C34'")
 const results=await query("SELECT (SELECT COUNT(*) FROM mission_answers WHERE card_id='TEST-C34') answers,(SELECT COUNT(*) FROM mission_records WHERE id='TEST-C34') cards")
 assert.deepEqual(results.results,[{answers:0,cards:0}]);console.log(JSON.stringify(results.results[0]))
}else throw Error('TEST action required')
```


### `test/card-completion.test.js`

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

import worker from '../src/index.js'
import { CARD_HTML } from '../src/card-ui.js'

const UI_ORIGIN = 'https://aries.flood.doctor'
const SNAPSHOT_AT = '2020-01-01T10:00:00.000Z'
const BASE_ITEM = Object.freeze({ id: 41, title: 'TEST: review the next step', status: 'open', assignee: 'Frank' })

// Run the production SQL against SQLite, including conditional INSERT and RETURNING.
// The hook lets a competing request change durable state after the worker has read it,
// immediately before its final write. No production services or credentials are used.
function fixture(t, items = [BASE_ITEM]) {
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))
  t.after(() => db.close())
  let beforeInsert = null
  const execute = (sql, values, mode) => {
    if (/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+command_queue/i.test(sql) && beforeInsert) {
      const hook = beforeInsert
      beforeInsert = null
      hook()
    }
    const statement = db.prepare(sql)
    if (mode === 'all') return { results: statement.all(...values), success: true }
    if (mode === 'first') return statement.get(...values) ?? null
    const result = statement.run(...values)
    return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }
  }
  const env = {
    ALLOWED_EMAILS: 'frank@example.test',
    ALLOWED_EMAIL_DOMAINS: 'flood.doctor',
    PUBLISHER_TOKEN: 'TEST-only-publisher',
    STALE_AFTER_SECONDS: '300',
    DB: {
      prepare(sql) {
        return {
          values: [],
          bind(...values) { this.values = values; return this },
          async all() { return execute(sql, this.values, 'all') },
          async first() { return execute(sql, this.values, 'first') },
          async run() { return execute(sql, this.values, 'run') },
        }
      },
      async batch(statements) { const out = []; for (const statement of statements) out.push(await statement.run()); return out },
    },
  }
  const call = (path, body, options = {}) => {
    const headers = new Headers({
      'Cf-Access-Authenticated-User-Email': 'frank@example.test',
      Origin: UI_ORIGIN,
      'Content-Type': 'application/json',
      ...options.headers,
    })
    for (const header of options.omitHeaders || []) headers.delete(header)
    return worker.fetch(new Request((options.origin || UI_ORIGIN) + path, {
      method: options.method || (body === undefined ? 'GET' : 'POST'),
      headers,
      ...(body === undefined ? {} : { body: options.raw ? body : JSON.stringify(body) }),
    }), env, {})
  }
  const snapshot = (nextItems, publishedAt = SNAPSHOT_AT) => {
    db.prepare(`INSERT INTO board_snapshot (singleton_id, snapshot_json, published_at)
      VALUES (1, ?, ?) ON CONFLICT(singleton_id) DO UPDATE SET
      snapshot_json = excluded.snapshot_json, published_at = excluded.published_at`)
      .run(JSON.stringify({ items: nextItems }), publishedAt)
  }
  const command = (operation, options = {}) => {
    const result = db.prepare(`INSERT INTO command_queue
      (operation, item_id, note, value, actor_email, state, created_at, acked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      operation, options.itemId ?? 41, options.note ?? null, options.value ?? null,
      options.actor ?? 'mark@flood.doctor', options.state ?? 'queued',
      options.createdAt ?? '2020-01-01T11:00:00.000Z', options.ackedAt ?? null,
    )
    return Number(result.lastInsertRowid)
  }
  const card = async (id = 41) => {
    const response = await call('/api/card?id=' + id)
    assert.equal(response.status, 200)
    return response.json()
  }
  const done = (revision, id = 41, options = {}) => call('/api/card/done', { id, revision }, options)
  const rows = () => db.prepare('SELECT * FROM command_queue ORDER BY id').all()
  snapshot(items)
  return { db, call, card, done, snapshot, command, rows, beforeInsert(hook) { beforeInsert = hook } }
}

test('card page and API are authenticated, host-restricted and not unlocked by publisher bearer tokens', async (t) => {
  const f = fixture(t)
  for (const path of ['/card?id=41', '/api/card?id=41', '/api/card/done']) {
    const body = path.endsWith('/done') ? { id: 41, revision: 'untrusted' } : undefined
    for (const email of ['', 'outsider@evil.test', 'staff@flood.doctor.evil.test']) {
      assert.equal((await f.call(path, body, { headers: { 'Cf-Access-Authenticated-User-Email': email } })).status, 403)
    }
    assert.equal((await f.call(path, body, {
      omitHeaders: ['Cf-Access-Authenticated-User-Email'],
      headers: { Authorization: 'Bearer TEST-only-publisher' },
    })).status, 403)
    for (const origin of ['https://aries-publish.flood.doctor', 'https://attacker.example']) {
      assert.equal((await f.call(path, body, { origin })).status, 404)
    }
  }
  assert.equal((await f.call('/card?id=41', undefined, { headers: { 'Cf-Access-Authenticated-User-Email': 'staff@flood.doctor' } })).status, 200)
  assert.equal((await f.call('/api/card?id=41', undefined, { headers: { 'Cf-Access-Authenticated-User-Email': 'staff@flood.doctor' } })).status, 200)
  assert.equal(f.rows().length, 0)
})

test('scanner GET, prefetch and reload never complete a card', async (t) => {
  const f = fixture(t)
  const initial = f.db.prepare('SELECT * FROM board_snapshot').get()
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const page = await f.call('/card?id=41&done=true', undefined, { headers: { Purpose: 'prefetch', 'Sec-Purpose': 'prefetch' } })
    assert.equal(page.status, 200)
    assert.match(page.headers.get('content-type'), /text\/html/)
    assert.equal(page.headers.get('cache-control'), 'no-store')
    assert.equal(page.headers.get('referrer-policy'), 'no-referrer')
    assert.equal(page.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(page.headers.get('x-frame-options'), 'DENY')
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/)
    assert.equal((await f.card()).state, 'open')
    const scanner = await f.call('/api/card/done?id=41')
    assert.equal(scanner.status, 405)
    assert.equal(scanner.headers.get('allow'), 'POST')
  }
  assert.equal(f.rows().length, 0)
  assert.deepEqual(f.db.prepare('SELECT * FROM board_snapshot').get(), initial)
})

test('card reads return only the selected card and an opaque revision without changing the snapshot', async (t) => {
  const f = fixture(t, [BASE_ITEM, { id: 42, title: 'TEST: a different card', status: 'open' }])
  const response = await f.call('/api/card?id=41')
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const payload = await response.json()
  assert.equal(payload.item.id, 41)
  assert.equal(payload.item.title, BASE_ITEM.title)
  assert.equal(payload.state, 'open')
  assert.equal(typeof payload.revision, 'string')
  assert.ok(payload.revision.length)
  assert.equal(payload.items, undefined)
  assert.equal((await f.card()).revision, payload.revision)
  assert.equal(f.rows().length, 0)
})

test('card reads refuse invalid, missing and unknown identifiers', async (t) => {
  const f = fixture(t)
  for (const id of ['', '0', '-1', '1.5', '1e2', '41junk', '9007199254740992', '../41']) {
    assert.equal((await f.call('/api/card?id=' + encodeURIComponent(id))).status, 400, id)
  }
  assert.equal((await f.call('/api/card')).status, 400)
  assert.equal((await f.call('/api/card?id=999')).status, 404)
  f.db.exec('DELETE FROM board_snapshot')
  assert.equal((await f.call('/api/card?id=41')).status, 404)
  assert.equal(f.rows().length, 0)
})

test('completion requires an explicit same-origin JSON POST', async (t) => {
  const f = fixture(t)
  const { revision } = await f.card()
  for (const origin of ['', 'null', 'https://evil.test', 'https://aries.flood.doctor.evil.test', 'http://aries.flood.doctor']) {
    assert.equal((await f.done(revision, 41, { headers: { Origin: origin } })).status, 403, origin)
  }
  assert.equal((await f.done(revision, 41, { omitHeaders: ['Origin'] })).status, 403)
  for (const contentType of ['', 'text/plain', 'application/x-www-form-urlencoded']) {
    assert.equal((await f.done(revision, 41, { headers: { 'Content-Type': contentType } })).status, 415)
  }
  for (const method of ['PUT', 'PATCH', 'DELETE']) {
    assert.equal((await f.done(revision, 41, { method })).status, 405)
  }
  for (const method of ['HEAD', 'OPTIONS']) {
    assert.equal((await f.call('/api/card/done?id=41', undefined, { method })).status, 405)
  }
  assert.equal(f.rows().length, 0)
})

test('completion payload shape is exact and cannot inject actor, timestamp or operation', async (t) => {
  const f = fixture(t)
  const { revision } = await f.card()
  const invalid = [
    null, [], {}, { id: 41 }, { revision }, { id: '41', revision }, { id: 0, revision },
    { id: -1, revision }, { id: 1.5, revision }, { id: Number.MAX_SAFE_INTEGER + 1, revision },
    { id: 41, revision: null }, { id: 41, revision: 12 }, { id: 41, revision: '' },
    { id: 41, revision, actor_email: 'attacker@example.test' },
    { id: 41, revision, created_at: '1900-01-01T00:00:00Z' },
    { id: 41, revision, operation: 'delete' },
  ]
  for (const body of invalid) {
    assert.equal((await f.call('/api/card/done', body)).status, 400, JSON.stringify(body))
  }
  assert.equal((await f.call('/api/card/done', '{invalid', { raw: true })).status, 400)
  assert.equal(f.rows().length, 0)
})

test('successful completion records authenticated actor and server time durably and shows Done immediately', async (t) => {
  const f = fixture(t)
  const { revision } = await f.card()
  const original = f.db.prepare('SELECT * FROM board_snapshot').get()
  const before = Date.now()
  const response = await f.done(revision, 41, { headers: { 'Cf-Access-Authenticated-User-Email': 'dom@flood.doctor', 'Content-Type': 'application/json; charset=UTF-8' } })
  assert.equal(response.status, 202)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const payload = await response.json()
  assert.equal(payload.saved, true)
  assert.equal(payload.existing, false)
  assert.equal(payload.state, 'done')
  const [row] = f.rows()
  assert.equal(f.rows().length, 1)
  assert.equal(row.operation, 'done')
  assert.equal(row.item_id, 41)
  assert.equal(row.actor_email, 'dom@flood.doctor')
  assert.equal(row.state, 'queued')
  assert.equal(row.note, null)
  assert.equal(row.value, null)
  assert.ok(Date.parse(row.created_at) >= before)
  assert.ok(Date.parse(row.created_at) <= Date.now())
  assert.deepEqual(payload.command, {
    id: row.id, operation: 'done', item_id: 41,
    actor_email: row.actor_email, created_at: row.created_at,
  })
  assert.deepEqual(f.db.prepare('SELECT * FROM board_snapshot').get(), original)
  assert.equal((await f.card()).state, 'done')
  const board = await (await f.call('/api/board')).json()
  assert.equal(board.items.find(item => item.id === 41).status, 'done')
})

test('repeated completion using the original link revision returns existing without duplicate commands', async (t) => {
  const f = fixture(t)
  const { revision } = await f.card()
  assert.equal((await f.done(revision)).status, 202)
  const first = f.rows()[0]
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await f.done(revision)
    assert.equal(response.status, 200)
    assert.equal((await response.json()).existing, true)
  }
  assert.equal(f.rows().length, 1)
  assert.deepEqual(f.rows()[0], first)
})

test('concurrent same-revision completion POSTs atomically create one command', async (t) => {
  const f = fixture(t)
  const { revision } = await f.card()
  const responses = await Promise.all(Array.from({ length: 8 }, () => f.done(revision)))
  assert.equal(responses.filter(response => response.status === 202).length, 1)
  assert.equal(responses.filter(response => response.status === 200).length, 7)
  for (const response of responses.filter(response => response.status === 200)) {
    assert.equal((await response.json()).existing, true)
  }
  assert.equal(f.rows().length, 1)
})

test('a card already Done in the published snapshot returns existing without enqueuing work', async (t) => {
  const f = fixture(t, [{ ...BASE_ITEM, status: 'done' }])
  const card = await f.card()
  assert.equal(card.state, 'done')
  const response = await f.done(card.revision)
  assert.equal(response.status, 200)
  assert.equal((await response.json()).existing, true)
  assert.equal(f.rows().length, 0)
})

test('missing and queued-deleted cards cannot be completed', async (t) => {
  const f = fixture(t)
  const original = await f.card()
  assert.equal((await f.done(original.revision, 999)).status, 404)
  f.command('delete')
  assert.equal((await f.card()).state, 'deleted')
  const response = await f.done(original.revision)
  assert.ok(response.status >= 400 && response.status < 500)
  assert.equal(f.rows().length, 1)
  const board = await (await f.call('/api/board')).json()
  const pendingDelete = board.items.find(item => item.id === 41)
  assert.equal(pendingDelete.pending, true, 'keep the delivery receipt visible until deletion is applied')
  assert.equal(pendingDelete.command_receipt.operation, 'delete')
  f.snapshot([])
  assert.equal((await f.done(original.revision)).status, 404)
  assert.equal(f.rows().length, 1)
})

test('changed snapshot invalidates an old open-card revision before completion', async (t) => {
  const f = fixture(t)
  const original = await f.card()
  f.snapshot([{ ...BASE_ITEM, title: 'TEST: changed instructions' }], '2020-01-01T12:00:00.000Z')
  const next = await f.card()
  assert.notEqual(next.revision, original.revision)
  assert.equal((await f.done(original.revision)).status, 409)
  assert.equal(f.rows().length, 0)
  assert.equal((await f.done(next.revision)).status, 202)
})

test('an arbitrary revision cannot complete an open card', async (t) => {
  const f = fixture(t)
  assert.equal((await f.done('old-or-invented-revision')).status, 409)
  assert.equal(f.rows().length, 0)
})

test('queued completion, reopen and deletion are folded in command order', async (t) => {
  const f = fixture(t)
  const original = await f.card()
  f.command('done')
  const done = await f.card()
  assert.equal(done.state, 'done')
  assert.notEqual(done.revision, original.revision)
  f.command('reopen')
  const reopened = await f.card()
  assert.equal(reopened.state, 'open')
  assert.notEqual(reopened.revision, done.revision)
  f.command('delete')
  assert.equal((await f.card()).state, 'deleted')
  assert.equal(f.rows().length, 3)
})

test('newly applied completion remains visible while the published snapshot catches up', async (t) => {
  const f = fixture(t)
  f.command('done', { state: 'applied', ackedAt: '2020-01-01T11:30:00.000Z' })
  const card = await f.card()
  assert.equal(card.state, 'done')
  assert.equal((await f.done(card.revision)).status, 200)
  assert.equal(f.rows().length, 1)
  assert.equal((await (await f.call('/api/board')).json()).items[0].status, 'done')
})

test('old applied completion does not overwrite a newer reopened snapshot', async (t) => {
  const f = fixture(t)
  f.command('done', { state: 'applied', createdAt: '2019-12-31T10:00:00.000Z', ackedAt: '2019-12-31T11:30:00.000Z' })
  assert.equal((await f.card()).state, 'open')
  assert.equal((await (await f.call('/api/board')).json()).items[0].status, 'open')
})

test('failed commands and unrelated cards do not change a card state or revision', async (t) => {
  const f = fixture(t)
  const original = await f.card()
  f.command('done', { state: 'failed', ackedAt: '2020-01-01T11:30:00.000Z' })
  f.command('delete', { state: 'failed' })
  f.command('done', { itemId: 42 })
  f.command('note', { note: 'TEST: unrelated to completion state' })
  const current = await f.card()
  assert.equal(current.state, 'open')
  assert.equal(current.revision, original.revision)
  assert.equal((await f.done(current.revision)).status, 202)
  assert.equal(f.rows().filter(row => row.item_id === 41 && row.operation === 'done' && row.state === 'queued').length, 1)
})

test('reopening prevents stale retries and a fresh revision can complete the card again', async (t) => {
  const f = fixture(t)
  const original = await f.card()
  assert.equal((await f.done(original.revision)).status, 202)
  const reopen = await f.call('/api/action', { operation: 'reopen', id: 41 })
  assert.equal(reopen.status, 202)
  const reopened = await f.card()
  assert.equal(reopened.state, 'open')
  assert.notEqual(reopened.revision, original.revision)
  assert.equal((await f.done(original.revision)).status, 409)
  assert.equal((await f.done(reopened.revision)).status, 202)
  assert.deepEqual(f.rows().map(row => row.operation), ['done', 'reopen', 'done'])
  assert.equal((await f.card()).state, 'done')
})

test('conditional completion refuses a snapshot replacement between validation and INSERT', async (t) => {
  const f = fixture(t)
  const original = await f.card()
  f.beforeInsert(() => f.snapshot([{ ...BASE_ITEM, title: 'TEST: concurrently changed instructions' }]))
  assert.equal((await f.done(original.revision)).status, 409)
  assert.equal(f.rows().length, 0)
  assert.equal((await f.card()).state, 'open')
})

test('conditional completion refuses concurrent deletion rather than queueing a resurrected completion', async (t) => {
  const f = fixture(t)
  const original = await f.card()
  f.beforeInsert(() => f.command('delete'))
  const response = await f.done(original.revision)
  assert.ok(response.status >= 400 && response.status < 500)
  assert.deepEqual(f.rows().map(row => row.operation), ['delete'])
  assert.equal((await f.card()).state, 'deleted')
})

test('conditional completion returns existing after a competing completion wins before INSERT', async (t) => {
  const f = fixture(t)
  const original = await f.card()
  f.beforeInsert(() => f.command('done'))
  const response = await f.done(original.revision)
  assert.equal(response.status, 200)
  assert.equal((await response.json()).existing, true)
  assert.equal(f.rows().length, 1)
  assert.equal(f.rows()[0].actor_email, 'mark@flood.doctor')
})

test('conditional completion refuses a concurrent reopen even when both observed states were open', async (t) => {
  const f = fixture(t)
  const original = await f.card()
  f.beforeInsert(() => f.command('reopen'))
  assert.equal((await f.done(original.revision)).status, 409)
  assert.deepEqual(f.rows().map(row => row.operation), ['reopen'])
  assert.equal((await f.card()).state, 'open')
})

test('unrelated snapshot updates do not invalidate the selected card revision', async (t) => {
  const f = fixture(t, [BASE_ITEM, { id: 42, title: 'TEST: other card' }])
  const original = await f.card()
  f.snapshot([BASE_ITEM, { id: 42, title: 'TEST: changed unrelated card' }], '2020-01-01T12:00:00.000Z')
  assert.equal((await f.card()).revision, original.revision)
  assert.equal((await f.done(original.revision)).status, 202)
})

test('corrupt stored snapshots fail closed without queueing completion', async (t) => {
  const f = fixture(t)
  const original = await f.card()
  for (const snapshotJson of ['not-json', '{"items":null}', '{"items":[{"id":41,"title":"secret","kind":"personal"}]}']) {
    f.db.prepare('UPDATE board_snapshot SET snapshot_json = ?').run(snapshotJson)
    assert.equal((await f.call('/api/card?id=41')).status, 503)
    assert.equal((await f.done(original.revision)).status, 503)
    assert.equal(f.rows().length, 0)
  }
})

test('acknowledged lifecycle commands use receipt time and stop overlaying once the snapshot catches up', async (t) => {
  const f = fixture(t, [{ ...BASE_ITEM, status: 'done' }])
  f.command('reopen', { state: 'applied', createdAt: '2019-12-31T10:00:00.000Z', ackedAt: '2020-01-01T11:30:00.000Z' })
  assert.equal((await f.card()).state, 'open')
  assert.equal((await (await f.call('/api/board')).json()).items[0].status, 'open')
  f.snapshot([{ ...BASE_ITEM, status: 'done' }], '2020-01-01T11:30:00.000Z')
  assert.equal((await f.card()).state, 'done')
  assert.equal((await (await f.call('/api/board')).json()).items[0].status, 'done')
})

// Execute the actual inline page script with a minimal DOM. Deferred fetches let us
// exercise interrupted and repeated flows deterministically without a live endpoint.
function pageFixture(search = '?id=41') {
  const nodes = new Map()
  for (const id of ['card', 'title', 'summary', 'state', 'message', 'confirm', 'refresh', 'number']) {
    const listeners = new Map()
    nodes.set(id, {
      textContent: '', hidden: ['confirm', 'refresh', 'summary'].includes(id), disabled: false,
      attributes: {},
      setAttribute(name, value) { this.attributes[name] = value },
      addEventListener(name, listener) { listeners.set(name, listener) },
      trigger(name, event = {}) { return listeners.get(name)?.(event) },
      set innerHTML(_value) { throw new Error('Untrusted card content must never be injected as HTML') },
    })
  }
  const requests = []
  const windowEvents = new Map()
  const script = CARD_HTML.match(/<script>([\s\S]*?)<\/script>/)[1]
  runInNewContext(script, {
    URLSearchParams, location: { search },
    document: { querySelector(selector) { return nodes.get(selector.slice(1)) } },
    window: { addEventListener(name, listener) { windowEvents.set(name, listener) } },
    fetch(url, options = {}) {
      return new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }))
    },
  })
  const flush = () => new Promise(resolve => setImmediate(resolve))
  const reply = async (index, payload, status = 200) => {
    requests[index].resolve(Response.json(payload, { status }))
    await flush()
  }
  const open = (revision = 'test-revision', item = BASE_ITEM) => ({ item, state: 'open', revision })
  return { nodes, requests, windowEvents, flush, reply, open }
}

test('confirmation UI loads read-only, safely renders card text, and POSTs only on an explicit click', async () => {
  const p = pageFixture()
  assert.equal(p.requests.length, 1)
  assert.equal(p.requests[0].url, '/api/card?id=41')
  assert.equal(p.requests[0].options.method, undefined)
  assert.equal(p.nodes.get('confirm').hidden, true)
  const title = '<img src=x onerror=alert(1)>'
  await p.reply(0, p.open('reviewed-revision', { ...BASE_ITEM, title, summary: '<script>unsafe()</script>' }))
  assert.equal(p.nodes.get('title').textContent, title)
  assert.equal(p.nodes.get('summary').textContent, '<script>unsafe()</script>')
  assert.equal(p.nodes.get('confirm').hidden, false)
  assert.equal(p.requests.length, 1)
  const firstClick = p.nodes.get('confirm').trigger('click')
  await p.nodes.get('confirm').trigger('click')
  assert.equal(p.requests.length, 2)
  assert.equal(p.requests[1].url, '/api/card/done')
  assert.equal(p.requests[1].options.method, 'POST')
  assert.equal(p.requests[1].options.credentials, 'same-origin')
  assert.deepEqual(JSON.parse(p.requests[1].options.body), { id: 41, revision: 'reviewed-revision' })
  assert.equal(p.nodes.get('confirm').disabled, true)
  assert.equal(p.nodes.get('refresh').disabled, true)
  await p.reply(1, { item: { ...BASE_ITEM, status: 'done' }, state: 'done', saved: true, existing: false }, 202)
  await firstClick
  assert.equal(p.nodes.get('state').textContent, 'Done')
  assert.equal(p.nodes.get('confirm').hidden, true)
  assert.match(p.nodes.get('message').textContent, /Saved for Aries to sync/)
})

test('confirmation UI does not POST for invalid links or an interrupted Access login', async () => {
  const invalid = pageFixture('?id=0')
  await invalid.flush()
  assert.equal(invalid.requests.length, 0)
  assert.equal(invalid.nodes.get('confirm').hidden, true)
  assert.match(invalid.nodes.get('message').textContent, /invalid/)
  const login = pageFixture()
  login.requests[0].resolve(new Response('<html>Sign in</html>', { headers: { 'content-type': 'text/html' } }))
  await login.flush()
  assert.equal(login.nodes.get('confirm').hidden, true)
  assert.match(login.nodes.get('message').textContent, /sign-in may have expired/)
  await login.nodes.get('confirm').trigger('click')
  assert.equal(login.requests.length, 1)
})

test('a lost completion response requires a fresh read before another POST', async () => {
  const p = pageFixture()
  await p.reply(0, p.open())
  const saving = p.nodes.get('confirm').trigger('click')
  p.requests[1].reject(new Error('TEST: connection interrupted'))
  await saving
  assert.equal(p.nodes.get('confirm').hidden, true)
  assert.equal(p.nodes.get('refresh').hidden, false)
  assert.match(p.nodes.get('message').textContent, /Refresh the card/)
  await p.nodes.get('confirm').trigger('click')
  assert.equal(p.requests.length, 2)
  const refresh = p.nodes.get('refresh').trigger('click')
  assert.equal(p.requests[2].options.method, undefined)
  await p.reply(2, { item: { ...BASE_ITEM, status: 'done' }, state: 'done', revision: 'done-revision' })
  await refresh
  assert.equal(p.nodes.get('state').textContent, 'Done')
  assert.equal(p.nodes.get('confirm').hidden, true)
  assert.equal(p.requests.length, 3)
})

test('stale-revision responses hide completion until the user refreshes and reviews', async () => {
  const p = pageFixture()
  await p.reply(0, p.open('old-revision'))
  const saving = p.nodes.get('confirm').trigger('click')
  await p.reply(1, { error: 'This card changed. Review it again before marking it done.' }, 409)
  await saving
  assert.equal(p.nodes.get('confirm').hidden, true)
  assert.match(p.nodes.get('message').textContent, /Review it again/)
  const refreshing = p.nodes.get('refresh').trigger('click')
  await p.reply(2, p.open('fresh-revision', { ...BASE_ITEM, title: 'TEST: changed task' }))
  await refreshing
  assert.equal(p.nodes.get('title').textContent, 'TEST: changed task')
  assert.equal(p.nodes.get('confirm').hidden, false)
  const resaving = p.nodes.get('confirm').trigger('click')
  assert.equal(JSON.parse(p.requests[3].options.body).revision, 'fresh-revision')
  await p.reply(3, { item: { ...BASE_ITEM, status: 'done' }, state: 'done', existing: true })
  await resaving
})

test('Back/Forward revalidates and delayed old reads cannot restore an older confirmation', async () => {
  const p = pageFixture()
  p.windowEvents.get('pageshow')({ persisted: true })
  assert.equal(p.requests.length, 2)
  await p.reply(1, p.open('newest-revision', { ...BASE_ITEM, title: 'TEST: newest task' }))
  await p.reply(0, { item: { ...BASE_ITEM, title: 'TEST: obsolete task', status: 'done' }, state: 'done', revision: 'older-revision' })
  assert.equal(p.nodes.get('title').textContent, 'TEST: newest task')
  assert.equal(p.nodes.get('state').textContent, 'Open')
  assert.equal(p.nodes.get('confirm').hidden, false)
  const saving = p.nodes.get('confirm').trigger('click')
  assert.equal(JSON.parse(p.requests[2].options.body).revision, 'newest-revision')
  await p.reply(2, { item: { ...BASE_ITEM, status: 'done' }, state: 'done', existing: false }, 202)
  await saving
  p.windowEvents.get('pageshow')({ persisted: true })
  assert.equal(p.nodes.get('confirm').hidden, true)
  await p.reply(3, p.open('reopened-revision'))
  assert.equal(p.nodes.get('confirm').hidden, false)
  assert.equal(p.nodes.get('state').textContent, 'Open')
})
```


### `test/card-data.test.js`

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { curateCardMetadata, enrichBoardItems } from '../src/card-data.js'
import { claimGroupDetails, claimGroups } from '../src/claim-groups.js'

test('source contradictions are visible and survive a curated publish/read round trip', () => {
  const source = {
    id: 12, title: 'PetSmart marketing promotion', identity: { claim_id: 'CL-100' },
    source_context: { subject: 'Work authorisation routing', client: 'Client A', claim: 'CL-100' },
    brief: { client: 'Client B', claim: 'CL-200', identity: { claim_id: 'CL-200' } },
  }
  const curated = curateCardMetadata(source)
  assert.equal(curated.quality.status, 'review')
  assert.deepEqual(curated.quality.issues.map(issue => issue.code).sort(),
    ['claim_mismatch', 'client_mismatch', 'conflicting_claim_id', 'title_subject_mismatch'])
  const stored = { id: source.id, title: source.title, ...curated }
  assert.deepEqual(curateCardMetadata(stored).quality, curated.quality)
  assert.equal(source.identity.claim_id, 'CL-100', 'original evidence is never overwritten')
})

test('missing evidence and ambiguous prose never become a zero balance or inferred payment', () => {
  const metadata = curateCardMetadata({ brief: { amount: '$12,400 issued, still unpaid' } })
  assert.deepEqual(metadata.financials, [])
  assert.equal(metadata.quality.status, 'unverified')
  assert.equal(metadata.identity.claim_id, null)
})

test('structured financial facts retain their distinct states, source, date and valid zero', () => {
  const make = (type, amount_minor) => ({ type, amount_minor, currency: 'usd', source: 'Invoice 115224', date: '2026-10-01' })
  const metadata = curateCardMetadata({ financials: [
    make('invoice_total', 150000), make('outstanding_balance', 0), make('payment_issued', 120000),
    make('payment_received', 100000), make('contractor_paid', 0), make('claimed_cumulative_payment', 110000),
  ] })
  assert.equal(metadata.financials.length, 6)
  assert.equal(metadata.financials[1].amount_minor, 0)
  assert.equal(metadata.financials[2].type, 'payment_issued')
  assert.equal(metadata.financials[3].type, 'payment_received')
  assert.equal(metadata.financials[0].currency, 'USD')
  assert.equal(metadata.financials[0].date, '2026-10-01')
})

test('untyped, fractional, unsourced and impossible-date financial entries are flagged', () => {
  const valid = { type: 'invoice_total', amount_minor: 0, currency: 'USD', source: 'Invoice 1', date: '2026-02-30' }
  const metadata = curateCardMetadata({ financials: [valid, { ...valid, source: '' }, { ...valid, amount_minor: 1.5 }, { ...valid, type: 'money' }] })
  assert.equal(metadata.financials.length, 1)
  assert.equal(metadata.financials[0].date, null)
  assert.equal(metadata.quality.status, 'review')
  assert.ok(metadata.quality.issues.some(issue => issue.code === 'invalid_financial_entry'))
  assert.ok(metadata.quality.issues.some(issue => issue.code === 'invalid_financial_date'))
})

test('responsibility distinguishes owner, next actor and waiting party with provenance', () => {
  const metadata = curateCardMetadata({ assignee: 'Mark', brief: {
    next_step: 'Frank: approve the response.', waiting_on: 'Abbey and Lacey', owner_hint: 'Steve',
  } })
  assert.equal(metadata.responsibility.owner, 'Mark')
  assert.equal(metadata.responsibility.next_actor, 'Frank')
  assert.equal(metadata.responsibility.waiting_on, 'Abbey and Lacey')
  assert.equal(metadata.responsibility.provenance.next_actor, 'brief.next_step_prefix')
  const [unassigned] = enrichBoardItems([{ ...metadata, assignee: null }])
  assert.equal(unassigned.responsibility.owner, null, 'unassignment cannot retain the previous structured owner')
  assert.equal(curateCardMetadata({ brief: { owner_hint: 'Steve' } }).responsibility.owner, null)
})

test('confirmed relationships remain separate from suggestions and retain both source cards', () => {
  const source = [
    { id: 1, status: 'open', relationships: { supersedes: [2, 2, 1, -4], duplicate_of: 3,
      suggestions: [{ type: 'duplicate', card_id: 4, reason: 'Similar subject, needs review' }] } },
    { id: 2, status: 'done' },
  ]
  const result = enrichBoardItems(source)
  assert.equal(result.length, 2)
  assert.deepEqual(result[0].relationships.supersedes, [2])
  assert.equal(result[0].relationships.duplicate_of, 3)
  assert.equal(result[0].relationships.suggestions[0].card_id, 4)
  assert.equal(result[1].status, 'done')
  assert.deepEqual(source[0].relationships.supersedes, [2, 2, 1, -4])
})

test('relationship cycles are visible without deleting or consolidating cards', () => {
  const result = enrichBoardItems([
    { id: 1, relationships: { superseded_by: 2 } },
    { id: 2, relationships: { superseded_by: 3 } },
    { id: 3, relationships: { superseded_by: 1 } },
  ])
  assert.equal(result.length, 3)
  assert.ok(result.every(item => item.quality.issues.some(issue => issue.code === 'relationship_cycle')))
  const mixed = enrichBoardItems([
    { id: 1, relationships: { supersedes: [2], duplicate_of: 3 } },
    { id: 2, relationships: { supersedes: [1] } },
    { id: 3 },
  ])
  assert.ok(mixed[0].quality.issues.some(issue => issue.code === 'relationship_cycle'))
  assert.ok(mixed[1].quality.issues.some(issue => issue.code === 'relationship_cycle'))
  assert.equal(mixed[2].quality.status, 'unverified')
})

const card = (id, claim_id, client_id = 'client-1') => ({
  id, status: 'open', brief: { client: 'Linda Pickering' }, identity: { claim_id, client_id },
})

test('canonical claim keys stay stable as tasks are closed, added or reordered', () => {
  const first = claimGroups([card(1, 'CL-100'), card(2, 'cl100')])
  const changed = claimGroups([card(9, 'CL-100'), card(2, 'cl100'), { ...card(1, 'CL-100'), status: 'done' }])
  assert.equal(first.get(1).key, changed.get(9).key)
  assert.equal(first.get(1).key, 'claim_id:cl100')
  assert.match(first.get(1).reason, /explicit claim id/)
})

test('matching display names never merge conflicting explicit claims or clients', () => {
  const { groups, conflicts } = claimGroupDetails([card(1, 'CL-100'), card(2, 'CL-200'), card(3, 'CL-100', 'client-2')])
  assert.equal(groups.size, 0)
  assert.ok(conflicts.get(1).some(entry => entry.field === 'claim_id'))
  assert.ok(conflicts.get(1).some(entry => entry.field === 'client_id'))
})

test('an unidentified third card cannot bridge incompatible explicit claims', () => {
  const { groups } = claimGroupDetails([card(1, 'CL-100'), { id: 2, status: 'open', brief: { client: 'Linda Pickering' } }, card(3, 'CL-200')])
  assert.notEqual(groups.get(1)?.key, groups.get(3)?.key)
})

test('one explicit claim can contain multiple invoices without losing its canonical key', () => {
  const groups = claimGroups([
    { ...card(1, 'CL-100'), identity: { claim_id: 'CL-100', invoice_id: 'INV1' } },
    { ...card(2, 'CL-100'), identity: { claim_id: 'CL-100', invoice_id: 'INV2' } },
  ])
  assert.equal(groups.get(1).key, 'claim_id:cl100')
  assert.equal(groups.get(2).key, 'claim_id:cl100')
})
```


### `test/cards.test.js`

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import worker from '../src/index.js'
import { FakeD1Database } from './fake-d1.js'

// Frank, 09/29/2026: "I never know what each task needs or who was last to work on that task
// or what I should do about it." These cover the data behind the answer: the brief Aries
// publishes with each card, and the history the worker assembles for it.

const UI_HOST = 'aries.flood.doctor'
const SYNC_HOST = 'aries-publish.flood.doctor'

function settings(db) {
  return {
    ALLOWED_EMAILS: 'darakhshan.farough@gmail.com',
    ALLOWED_EMAIL_DOMAINS: 'flood.doctor,restorationdoctors.com',
    PUBLISHER_TOKEN: 'test-publisher-token',
    STALE_AFTER_SECONDS: '300',
    DB: db,
  }
}

function publish(items) {
  return new Request(`https://${SYNC_HOST}/api/sync/snapshot`, {
    method: 'POST',
    headers: { authorization: 'Bearer test-publisher-token', 'content-type': 'application/json' },
    body: JSON.stringify({ items }),
  })
}

function as(email, path, init = {}) {
  return new Request(`https://${UI_HOST}${path}`, {
    ...init,
    headers: { 'Cf-Access-Authenticated-User-Email': email, ...(init.headers || {}) },
  })
}

function brief(overrides = {}) {
  return {
    needs: 'Kevin Cigler mailed the lien payoff check on 9/26 and wants us to confirm it arrived.',
    next_step: 'Steve: confirm the Cigler check arrived and reply to Kevin.',
    action: 'reply',
    owner_hint: 'steve',
    waiting_on: 'Kevin Cigler (client)',
    waiting_since: '2026-09-28',
    client: 'Kevin Cigler',
    claim: '',
    amount: '$12,400.00',
    deadline: '2026-10-04',
    deadline_note: 'Lien deadline',
    phone: '',
    counsel_only: false,
    last_ours: { by: 'Steve', at: '2026-09-27T14:05:00Z', what: 'sent Kevin the payoff amount' },
    last_theirs: { by: 'Kevin Cigler (client)', at: '2026-09-28T16:30:00Z', what: 'asked us to confirm the check arrived' },
    messages: 4,
    generated_at: '2026-09-29T23:00:00Z',
    ...overrides,
  }
}

test('a card carries its brief and opening date to the board', async () => {
  const db = new FakeD1Database()
  const env = settings(db)
  const accepted = await worker.fetch(publish([
    { id: 3612, title: 'Cigler check mailed', status: 'open', created: '2026-09-28', brief: brief() },
  ]), env, {})
  assert.equal(accepted.status, 200)
  assert.equal((await accepted.json()).briefs_dropped, 0)

  const board = await (await worker.fetch(as('steve@restorationdoctors.com', '/api/board'), env, {})).json()
  const [card] = board.items
  assert.equal(card.created, '2026-09-28')
  assert.deepEqual(card.brief, brief())
})

test('an off-contract brief is dropped from its card, counted, and never blocks the board', async () => {
  const db = new FakeD1Database()
  const env = settings(db)
  const bad = [
    brief({ action: 'send' }),                       // not an action the card knows
    brief({ owner_hint: 'bob' }),                    // not on the roster
    brief({ needs: 'x'.repeat(401) }),               // over its length limit
    brief({ deadline: '10/04/2026' }),               // not an ISO day
    brief({ counsel_only: 'yes' }),                  // wrong type
    brief({ last_ours: { by: 'Steve', at: 'yesterday', what: 'x' } }),
    brief({ generated_at: undefined }),
  ]
  const items = bad.map((value, index) => ({ id: 100 + index, title: `Card ${index}`, status: 'open', brief: value }))
  items.push({ id: 200, title: 'Good card', status: 'open', brief: brief() })
  const accepted = await worker.fetch(publish(items), env, {})
  assert.equal(accepted.status, 200)
  assert.equal((await accepted.json()).briefs_dropped, bad.length)

  const board = await (await worker.fetch(as('mark@flood.doctor', '/api/board'), env, {})).json()
  assert.equal(board.items.length, bad.length + 1, 'every card is still on the board')
  assert.equal(board.items.filter((item) => item.brief).length, 1)
})

test('a card says who last worked on it: actions, notes and the latest email, newest first', async () => {
  const db = new FakeD1Database()
  const env = settings(db)
  await worker.fetch(publish([{
    id: 3612,
    title: 'Cigler check mailed',
    status: 'open',
    notes: [{ at: '2026-09-29T20:10:00-04:00', by: 'aries@flood.doctor', text: 'REOPENED 9/29: confirm the check arrived.' }],
    brief: brief(),
  }]), env, {})
  const assign = await worker.fetch(as('darakhshan.farough@gmail.com', '/api/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operation: 'assign', id: 3612, value: 'steve' }),
  }), env, {})
  assert.equal(assign.status, 202)

  const board = await (await worker.fetch(as('mark@flood.doctor', '/api/board'), env, {})).json()
  const history = board.items[0].history
  assert.deepEqual(history.map((entry) => [entry.who, entry.what, entry.ours]), [
    ['Frank', 'assigned it to Steve', true],
    ['Aries', 'wrote: REOPENED 9/29: confirm the check arrived.', true],
    ['Kevin Cigler (client)', 'asked us to confirm the check arrived', false],
    ['Steve', 'sent Kevin the payoff amount', true],
  ])
})

test('the card layout offers the new controls and still parses', async () => {
  const env = settings(new FakeD1Database())
  const html = await (await worker.fetch(as('mark@flood.doctor', '/'), env, {})).text()
  for (const marker of ['Waiting on', 'Last worked on', 'class="do-this"', 'data-action="more"',
    'data-action="snooze"', 'owner-row', 'Nothing needed', 'Next Monday', "brief.action === 'close'",
    'data-action="nudge"', 'Assign to Aries']) {
    assert.ok(html.includes(marker), marker)
  }
})

test('a nudge is queued with the owner it asks, and the card history says so', async () => {
  const db = new FakeD1Database()
  const env = settings(db)
  await worker.fetch(publish([{ id: 3612, title: 'Cigler check mailed', status: 'open', assignee: 'steve' }]), env, {})
  const post = (body) => worker.fetch(as('darakhshan.farough@gmail.com', '/api/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }), env, {})

  const nudged = await post({ operation: 'nudge', id: 3612, value: 'steve' })
  assert.equal(nudged.status, 202)
  assert.equal((await nudged.json()).command.value, 'steve')
  for (const bad of [{ operation: 'nudge', id: 3612 }, { operation: 'nudge', id: 3612, value: 'aries' },
    { operation: 'nudge', id: 3612, value: 'bob' }, { operation: 'nudge', id: 3612, value: '' }]) {
    assert.equal((await post(bad)).status, 400, JSON.stringify(bad))
  }
  const board = await (await worker.fetch(as('mark@flood.doctor', '/api/board'), env, {})).json()
  assert.deepEqual(board.items[0].history.map((entry) => [entry.who, entry.what]), [['Frank', 'asked Steve for an update']])
  assert.equal(board.items[0].assignee, 'steve', 'a nudge changes nothing on the card itself')
})

test('Aries can be given a card like any teammate', async () => {
  const db = new FakeD1Database()
  const env = settings(db)
  await worker.fetch(publish([{ id: 3683, title: 'Lumina Pilates lead', status: 'open' }]), env, {})
  const response = await worker.fetch(as('darakhshan.farough@gmail.com', '/api/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operation: 'assign', id: 3683, value: 'aries' }),
  }), env, {})
  assert.equal(response.status, 202)
  const board = await (await worker.fetch(as('mark@flood.doctor', '/api/board'), env, {})).json()
  assert.equal(board.items[0].assignee, 'aries')
  assert.equal(board.items[0].history[0].what, 'assigned it to Aries')
})
```


### `test/claim-groups.test.js`

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import worker from '../src/index.js'
import { claimGroups, claimNumbers, parseClient } from '../src/claim-groups.js'
import { FakeD1Database } from './fake-d1.js'

// Frank, 10/04/2026: "the same customer / claim is currently being assigned several cards.
// consolidate the cards and list all open tasks for that claim under the same card."
// The client lines below are the ones Aries actually wrote on the live board that day.

/** @param {number} id @param {string} client @param {string} [claim] @param {string} [status] */
function card(id, client, claim = '', status = 'open') {
  return { id, title: `Card ${id}`, status, brief: { client, claim } }
}

/** @param {Map<number, {key: string}>} groups */
function together(groups, ...ids) {
  const keys = ids.map((id) => groups.get(id)?.key)
  return keys.every((key) => key && key === keys[0])
}

test('the same invoice number is one claim, however the client is written', () => {
  const groups = claimGroups([
    card(4001, 'Linda Pickering', 'Invoice 115224'),
    card(4137, 'Pickering, Linda & Orlowski, Lynn', 'Invoice 115224'),
    card(3971, 'Victor Yoo', 'USAA 021792489-801'),
    card(3972, '', '021792489801'),
  ])
  assert.ok(together(groups, 4001, 4137))
  assert.ok(together(groups, 3971, 3972), 'carrier prefix and dashes do not split a claim number')
  assert.equal(groups.get(4001)?.label, 'Pickering, Linda & Orlowski, Lynn', 'a tie goes to the line naming both owners')
})

test('one client written several ways is one claim', () => {
  const groups = claimGroups([
    card(4132, 'Robert and Elizabeth Badgett'),
    card(4190, 'Robert Badgett'),
    card(4013, 'Commander Robert (Bruce) Badgett and Elizabeth Badgett'),
    card(4014, 'Robert Badgett & Elizabeth Badgett'),
    card(4126, 'Tom Williams'),
    card(4018, 'Thomas Williams'),
    card(3970, 'Joshua Carrico'),
    card(4016, 'Carrico'),
    card(3957, 'Aidan West Crews'),
    card(4185, 'West-Crews'),
    card(3594, 'Steven J Siwecki'),
    card(4139, 'Siwecki'),
  ])
  assert.ok(together(groups, 4132, 4190, 4013, 4014))
  assert.ok(together(groups, 4126, 4018), 'Tom is Thomas')
  assert.ok(together(groups, 3970, 4016), 'a surname alone joins the one full name it ends')
  assert.ok(together(groups, 3957, 4185), 'a hyphenated surname matches the spaced one')
  assert.ok(together(groups, 3594, 4139))
  assert.equal(groups.get(4190)?.label, 'Robert and Elizabeth Badgett')
  assert.notEqual(groups.get(4126)?.key, groups.get(4132)?.key)
})

test('different people never share a claim card', () => {
  const groups = claimGroups([
    card(4122, 'Mike Arnold'),
    card(4123, 'Arnold Makarov & Jane Burke'),
    card(4003, 'Naa Brown'),
    card(4076, 'Sarah Brown'),
    card(4500, 'Brown'),
    card(4501, 'Brown'),
    card(3541, 'Adrian W'),
    card(4178, 'Adrian McNamara'),
  ])
  assert.equal(groups.size, 0, 'Arnold the surname is not Arnold the first name, and "Brown" could be either Brown')
})

test('carriers, our own names, staff, roll-ups and placeholders never pull claims together', () => {
  const groups = claimGroups([
    card(1, 'USAA'),
    card(2, 'USAA'),
    card(3, 'Flood Doctor'),
    card(4, 'Flood Doctor'),
    card(5, 'Steve'),
    card(6, 'Steve'),
    card(7, 'Multiple clients'),
    card(8, 'Multiple clients'),
    card(9, '23 clients'),
    card(10, '23 clients'),
    card(11, 'Amber Gray, Rodolfo Morera, Charles Musser, Lynn Orlowski, Linda Pickering'),
    card(12, 'Charles Musser'),
    card(13, 'Linda Pickering'),
  ], { staff: ['steve', 'Steve'] })
  assert.equal(groups.size, 0)
})

test('checked-off cards and lone cards get no group', () => {
  const groups = claimGroups([
    card(4121, 'Caroline Bermel', 'Invoice 115268'),
    card(4127, 'Caroline Bermel', 'Invoice 115268', 'done'),
    card(4140, 'Kevin Cigler'),
  ])
  assert.equal(groups.size, 0)
})

test('the client line parser reads the forms Aries writes', () => {
  assert.deepEqual(parseClient('Pickering, Linda & Orlowski, Lynn')?.people.map((who) => who.tokens.join(' ')),
    ['linda pickering', 'lynn orlowski'])
  assert.deepEqual(parseClient('Harrison and Anne Crecraft')?.people.map((who) => who.tokens.join(' ')),
    ['harrison crecraft', 'anne crecraft'])
  assert.equal(parseClient('One Central Park condominium association')?.org, 'one central park condominium association')
  assert.equal(parseClient('Lincoln Park Condominium')?.people.length, 0)
  assert.equal(parseClient('Kelly, Szurgyi, Daehn')?.rollup, true)
  assert.equal(parseClient(''), null)
  assert.deepEqual(claimNumbers('Invoice 1120'), [], 'four digits could be a street number')
  assert.deepEqual(claimNumbers('CID #23959115'), ['23959115'])
})

test('the board API marks cards that share a claim, and leaves the rest alone', async () => {
  const db = new FakeD1Database()
  const env = {
    ALLOWED_EMAILS: 'darakhshan.farough@gmail.com',
    ALLOWED_EMAIL_DOMAINS: 'flood.doctor,restorationdoctors.com',
    PUBLISHER_TOKEN: 'test-publisher-token',
    STALE_AFTER_SECONDS: '300',
    DB: db,
  }
  const brief = (client, claim) => ({
    needs: 'Needs a reply.', next_step: 'Reply.', action: 'reply', owner_hint: '', waiting_on: '',
    waiting_since: '', client, claim, amount: '', deadline: '', deadline_note: '', phone: '',
    counsel_only: false, last_ours: null, last_theirs: null, messages: 1, generated_at: '2026-10-04T12:00:00Z',
  })
  const accepted = await worker.fetch(new Request('https://aries-publish.flood.doctor/api/sync/snapshot', {
    method: 'POST',
    headers: { authorization: 'Bearer test-publisher-token', 'content-type': 'application/json' },
    body: JSON.stringify({ items: [
      { id: 4095, title: '1306 S Poe St driveway staining', status: 'open', brief: brief('Sara King', '') },
      { id: 4138, title: 'King, 1306 S Poe St driveway oil damage', status: 'open', brief: brief('Sara King', '') },
      { id: 3612, title: 'Cigler check mailed', status: 'open', brief: brief('Kevin Cigler', '') },
    ] }),
  }), env, {})
  assert.equal(accepted.status, 200)
  assert.equal((await accepted.json()).briefs_dropped, 0)

  const board = await (await worker.fetch(new Request('https://aries.flood.doctor/api/board', {
    headers: { 'Cf-Access-Authenticated-User-Email': 'mark@flood.doctor' },
  }), env, {})).json()
  const byId = new Map(board.items.map((item) => [item.id, item]))
  assert.equal(byId.get(4095).claim_group, byId.get(4138).claim_group)
  assert.equal(byId.get(4095).claim_label, 'Sara King')
  assert.equal(byId.get(3612).claim_group, undefined)
})
```


### `test/command-delivery.test.js`

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { SqliteD1 } from './sqlite-d1.js'
import { receiveCommands, claimCommands, acknowledgeDelivery, commandReceipts, retryCommand } from '../src/command-queue.js'

async function seed(db, operation = 'assign') {
  const r = await db.prepare(`INSERT INTO command_queue(operation,item_id,value,actor_email,created_at) VALUES(?,81,?,'teammate@example.test',?)`).bind(operation, operation === 'assign' ? 'mark' : null, new Date().toISOString()).run()
  return r.meta.last_row_id
}

test('delivery migration is additive and preserves queued, applied and failed history', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE command_queue(id INTEGER PRIMARY KEY,state TEXT,acked_at TEXT,ack_detail TEXT); INSERT INTO command_queue VALUES(1,'queued',NULL,NULL),(2,'applied','2026-01-01','done'),(3,'failed','2026-01-02','oops')`)
  db.exec(readFileSync(new URL('../migrations/0013_command_delivery.sql', import.meta.url),'utf8'))
  assert.deepEqual(db.prepare('SELECT state,attempts FROM command_queue ORDER BY id').all().map(r=>({...r})), [{state:'queued',attempts:0},{state:'applied',attempts:0},{state:'failed',attempts:0}])
  db.close()
})

test('legacy publisher receives original shape and receipt advances only once until acknowledgement', async () => {
  const db = new SqliteD1(); const id = await seed(db)
  assert.equal((await commandReceipts(db))[0].state,'queued')
  const commands = await receiveCommands(db,50)
  assert.deepEqual(Object.keys(commands[0]),['id','operation','item_id','note','value','actor_email','created_at'])
  assert.equal((await commandReceipts(db))[0].state,'received')
  assert.equal((await receiveCommands(db,50)).length,0)
  assert.equal((await commandReceipts(db))[0].attempts,1)
  assert.equal((await claimCommands(db,50)).length,0,'do not race a legacy worker already processing')
  assert.equal((await acknowledgeDelivery(db,id,'applied','Saved',undefined)).ok,true)
  assert.equal((await commandReceipts(db))[0].state,'applied')
  assert.equal((await receiveCommands(db,50)).length,0)
  db.close()
})

test('atomic claims are exclusive, exclude legacy polling and fence acknowledgements', async () => {
  const db = new SqliteD1(); await seed(db)
  const [a,b] = await Promise.all([claimCommands(db,50),claimCommands(db,50)])
  assert.equal(a.length+b.length,1)
  const command = (a[0]||b[0])
  assert.equal(command.idempotency_key,'command-1')
  assert.equal((await commandReceipts(db))[0].state,'processing')
  assert.equal((await receiveCommands(db,50)).length,0)
  assert.equal((await acknowledgeDelivery(db,command.id,'applied',null,'old-token')).status,409)
  assert.equal((await acknowledgeDelivery(db,command.id,'applied',null,command.lease_token)).ok,true)
  db.close()
})

test('expired leases stop in dead-letter state and only explicit bounded retry requeues them', async () => {
  const db = new SqliteD1(); await seed(db)
  const [claimed] = await claimCommands(db,1)
  db.raw.prepare("UPDATE command_queue SET lease_expires_at='2000-01-01T00:00:00.000Z'").run()
  const [receipt] = await commandReceipts(db)
  assert.equal(receipt.state,'failed'); assert.equal(receipt.dead_letter,true); assert.equal(receipt.error_code,'lease_expired')
  assert.equal((await receiveCommands(db,50)).length,0)
  assert.equal((await retryCommand(db,1)).ok,true)
  const [again] = await claimCommands(db,1)
  assert.equal(again.id,claimed.id); assert.equal(again.attempt,2); assert.notEqual(again.lease_token,claimed.lease_token)
  assert.equal((await acknowledgeDelivery(db,1,'applied',null,claimed.lease_token)).status,409)
  assert.equal((await acknowledgeDelivery(db,1,'failed','Temporary failure',again.lease_token)).ok,true)
  assert.equal((await retryCommand(db,1)).status,429)
  db.raw.prepare("UPDATE command_queue SET attempts=5,next_attempt_at=NULL").run()
  assert.equal((await retryCommand(db,1)).status,409)
  db.close()
})

test('legacy deliveries time out visibly rather than repeating an unacknowledged action',async()=>{
  const db=new SqliteD1(); await seed(db)
  await receiveCommands(db,1)
  db.raw.exec("UPDATE command_queue SET lease_expires_at='2000-01-01T00:00:00Z'")
  const [receipt]=await commandReceipts(db)
  assert.equal(receipt.state,'failed')
  assert.equal(receipt.error_code,'lease_expired')
  assert.equal((await receiveCommands(db,1)).length,0)
  assert.equal((await acknowledgeDelivery(db,1,'applied',null,undefined)).status,404)
  db.close()
})
```


### `test/commands.test.js`

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import worker from '../src/index.js'
import { FakeD1Database } from './fake-d1.js'

const UI_HOST = 'aries.flood.doctor'
const SYNC_HOST = 'aries-publish.flood.doctor'

function settings(db) {
  return {
    ALLOWED_EMAILS: 'dom@flood.doctor,mark@flood.doctor',
    PUBLISHER_TOKEN: 'test-publisher-token',
    STALE_AFTER_SECONDS: '300',
    DB: db,
  }
}

function action(body, email = 'dom@flood.doctor') {
  return new Request(`https://${UI_HOST}/api/action`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Cf-Access-Authenticated-User-Email': email,
    },
    body: JSON.stringify(body),
  })
}

function sync(path, init = {}) {
  return new Request(`https://${SYNC_HOST}${path}`, {
    ...init,
    headers: {
      authorization: 'Bearer test-publisher-token',
      'content-type': 'application/json',
      ...init.headers,
    },
  })
}

test('queues only teammate-authorized done and note commands with the actor identity', async () => {
  const db = new FakeD1Database()
  const env = settings(db)

  const done = await worker.fetch(action({ operation: 'done', id: 81 }), env, {})
  assert.equal(done.status, 202)
  const donePayload = await done.json()
  assert.deepEqual({
    id: donePayload.command.id,
    operation: donePayload.command.operation,
    item_id: donePayload.command.item_id,
    note: donePayload.command.note,
    actor_email: donePayload.command.actor_email,
  }, {
    id: 1,
    operation: 'done',
    item_id: 81,
    note: null,
    actor_email: 'dom@flood.doctor',
  })

  const note = await worker.fetch(action({ operation: 'note', id: 82, note: '  Call complete.  ' }), env, {})
  assert.equal(note.status, 202)

  const queued = await worker.fetch(sync('/api/sync/commands?limit=10'), env, {})
  assert.equal(queued.status, 200)
  assert.deepEqual(await queued.json(), {
    commands: [
      {
        id: 1,
        operation: 'done',
        item_id: 81,
        note: null,
        value: null,
        actor_email: 'dom@flood.doctor',
        created_at: donePayload.command.created_at,
      },
      {
        id: 2,
        operation: 'note',
        item_id: 82,
        note: 'Call complete.',
        value: null,
        actor_email: 'dom@flood.doctor',
        created_at: db.commands[1].created_at,
      },
    ],
    count: 2,
  })
})

test('rejects unsafe operations and invalid action payloads without queueing', async () => {
  const db = new FakeD1Database()
  const env = settings(db)
  const rejected = [
    { operation: 'draft', id: 1 },
    { operation: 'ask', id: 1 },
    { operation: 'todo', id: 1 },
    { operation: 'reorder', id: 1 },
    { operation: 'assign', id: 1 },
    { operation: 'snooze', id: 1 },
    { operation: 'done', id: 0 },
    { operation: 'done', id: '1' },
    { operation: 'note', id: 1, note: '   ' },
    { operation: 'note', id: 1, note: 'x'.repeat(2001) },
  ]

  for (const payload of rejected) {
    const response = await worker.fetch(action(payload), env, {})
    assert.equal(response.status, 400, JSON.stringify(payload))
  }

  const crossSiteSimpleRequest = await worker.fetch(new Request(`https://${UI_HOST}/api/action`, {
    method: 'POST',
    headers: {
      'content-type': 'text/plain',
      'Cf-Access-Authenticated-User-Email': 'dom@flood.doctor',
    },
    body: JSON.stringify({ operation: 'done', id: 99 }),
  }), env, {})
  assert.equal(crossSiteSimpleRequest.status, 415)
  assert.equal(db.commands.length, 0)
})

test('acknowledges a queued command exactly once and removes it from the pending feed', async () => {
  const db = new FakeD1Database()
  const env = settings(db)
  await worker.fetch(action({ operation: 'done', id: 91 }), env, {})

  const ack = await worker.fetch(sync('/api/sync/commands/1/ack', {
    method: 'POST',
    body: JSON.stringify({ status: 'applied', detail: 'board updated' }),
  }), env, {})
  assert.equal(ack.status, 200)
  const ackPayload = await ack.json()
  assert.equal(ackPayload.ok, true)
  assert.equal(ackPayload.id, 1)
  assert.equal(ackPayload.status, 'applied')
  assert.match(ackPayload.acked_at, /^\d{4}-\d{2}-\d{2}T/)

  const secondAck = await worker.fetch(sync('/api/sync/commands/1/ack', {
    method: 'POST',
    body: JSON.stringify({ status: 'applied' }),
  }), env, {})
  assert.equal(secondAck.status, 404)

  const pending = await worker.fetch(sync('/api/sync/commands'), env, {})
  assert.deepEqual(await pending.json(), { commands: [], count: 0 })
})
```


### `test/domains.test.js`

```js
// Staff sign in with a company Google account, so the worker admits by email domain as well
// as by the individual allowlist. Access is the gate that proves who someone is; this is the
// worker's own second check, and it has to admit exactly the same people — no more.

import assert from 'node:assert/strict'
import test from 'node:test'

import worker from '../src/index.js'
import { FakeD1Database } from './fake-d1.js'

const UI_HOST = 'aries.flood.doctor'

function settings(db) {
  return {
    ALLOWED_EMAILS: 'darakhshan.farough@gmail.com',
    ALLOWED_EMAIL_DOMAINS: 'restorationdoctors.com,flood.doctor,flooddoctorva.com',
    PUBLISHER_TOKEN: 'test-publisher-token',
    STALE_AFTER_SECONDS: '300',
    DB: db,
  }
}

function board(email) {
  const headers = email ? { 'Cf-Access-Authenticated-User-Email': email } : {}
  return new Request(`https://${UI_HOST}/api/board`, { headers })
}

test('admits every company domain and the named individual', async () => {
  const env = settings(new FakeD1Database())
  const welcome = [
    'shayan@restorationdoctors.com',
    'katherine@restorationdoctors.com',
    'STEVE@RestorationDoctors.com',
    'mark@flood.doctor',
    'frankd@flooddoctorva.com',
    'darakhshan.farough@gmail.com',
  ]
  for (const email of welcome) {
    const response = await worker.fetch(board(email), env, {})
    assert.equal(response.status, 200, `${email} should be admitted`)
  }
})

test('refuses lookalike domains, subdomains and missing identities', async () => {
  const env = settings(new FakeD1Database())
  const refused = [
    'attacker@notrestorationdoctors.com',
    'attacker@restorationdoctors.com.evil.net',
    'attacker@evil.restorationdoctors.com',
    'attacker@flood.doctor.evil.net',
    'someone@gmail.com',
    'no-domain-at-all',
    '',
  ]
  for (const email of refused) {
    const response = await worker.fetch(board(email), env, {})
    assert.equal(response.status, 403, `${email || '(none)'} must be refused`)
  }
  const anonymous = await worker.fetch(board(null), env, {})
  assert.equal(anonymous.status, 403)
})

test('falls back to the individual allowlist when no domains are configured', async () => {
  const env = settings(new FakeD1Database())
  delete env.ALLOWED_EMAIL_DOMAINS
  const named = await worker.fetch(board('darakhshan.farough@gmail.com'), env, {})
  assert.equal(named.status, 200)
  const staff = await worker.fetch(board('shayan@restorationdoctors.com'), env, {})
  assert.equal(staff.status, 403)
})
```


### `test/fake-d1.js`

```js
function result(results = [], changes = 0, lastRowId = 0) {
  return {
    success: true,
    results,
    meta: {
      duration: 0,
      size_after: 0,
      rows_read: results.length,
      rows_written: changes,
      last_row_id: lastRowId,
      changed_db: changes > 0,
      changes,
    },
  }
}

class FakeD1Statement {
  constructor(database, query, values = []) {
    this.database = database
    this.query = query.replace(/\s+/g, ' ').trim().toLowerCase()
    this.values = values
  }

  bind(...values) {
    return new FakeD1Statement(this.database, this.query, values)
  }

  async first(columnName) {
    let row = null
    if (this.query.includes('from board_snapshot')) {
      row = this.database.snapshot ? { ...this.database.snapshot } : null
    } else if (this.query.includes('from board_threads')) {
      row = this.database.threads.get(Number(this.values[0])) || null
      row = row ? { ...row } : null
    } else if (this.query.includes('from worklist_snapshot')) {
      row = this.database.worklist ? { ...this.database.worklist } : null
    } else if (this.query.includes('from todo_catalogue')) {
      row = this.database.todoCatalogue ? { ...this.database.todoCatalogue } : null
    } else if (this.query.includes('max(sequence)') && this.query.includes('from todo_operations')) {
      row = { latest_sequence: this.database.todoOperations.length
        ? Math.max(...this.database.todoOperations.map((operation) => operation.sequence))
        : 0 }
    } else if (this.query.includes('from todo_operations') && this.query.includes('where event_id = ?')) {
      row = this.database.todoOperations.find((operation) => operation.event_id === this.values[0]) || null
      row = row ? { ...row } : null
    } else if (this.query.includes('from command_queue') && this.query.includes('where id = ?')) {
      row = this.database.commands.find((command) => command.id === Number(this.values[0])) || null
      row = row ? { ...row } : null
    } else {
      throw new Error(`Unsupported D1 first(): ${this.query}`)
    }
    return columnName && row ? row[columnName] ?? null : row
  }

  async all() {
    if(this.query.startsWith('update command_queue set received_at = ?')) {
      const [at,expires,max,now,limit]=this.values
      const rows=this.database.commands.filter(c=>c.state==='queued'&&!c.lease_token&&!c.received_at&&(c.attempts||0)<max&&(!c.next_attempt_at||c.next_attempt_at<=now)).sort((a,b)=>a.id-b.id).slice(0,limit)
      for(const c of rows)Object.assign(c,{received_at:at,lease_expires_at:expires,attempts:(c.attempts||0)+1})
      return result(rows.map(c=>({...c})),rows.length)
    }
    if (this.query === 'select * from command_queue order by id desc limit 1000') return result(this.database.commands.slice().sort((a,b)=>b.id-a.id).slice(0,1000).map(c=>({...c})))
    if (this.query.includes('from command_queue') && this.query.includes("state = 'applied'")) {
      return result(this.database.commands.filter((c) => (!this.query.includes("where operation in") || ['done', 'reopen', 'delete'].includes(c.operation)) && (c.state === 'queued' || (c.state === 'applied' && c.acked_at > this.values[0]))).sort((a, b) => a.id - b.id).map((c) => ({ ...c })))
    }
    if (this.query.includes('from command_queue') && this.query.includes("state = 'queued'")) {
      // The board read folds in every queued command and binds no limit; the sync read binds one.
      const limit = this.values.length ? Number(this.values.at(-1)) : Infinity
      const rows = this.database.commands
        .filter((command) => command.state === 'queued' && (!this.query.includes('lease_token is null') || !command.lease_token) && (!this.query.includes('next_attempt_at') || !command.next_attempt_at || command.next_attempt_at <= this.values[0]))
        .sort((left, right) => left.id - right.id)
        .slice(0, limit)
        .map(({ id, operation, item_id, note, value, actor_email, created_at }) => ({
          id,
          operation,
          item_id,
          note,
          value,
          actor_email,
          created_at,
        }))
      return result(rows)
    }
    if (this.query.includes('from todo_operations') && this.query.includes('where sequence > ?')) {
      const after = Number(this.values[0])
      const rows = this.database.todoOperations
        .filter((operation) => operation.sequence > after)
        .sort((left, right) => left.sequence - right.sequence)
        .map((operation) => ({ ...operation }))
      return result(rows)
    }
    if (this.query.includes('from activity_log')) {
      // A card's history on the board: that card's actions since a cutoff, newest first.
      if (this.query.includes("where source = 'board' and at >= ?")) {
        const since = String(this.values[0])
        return result(this.database.activity
          .filter((row) => row.source === 'board' && row.at >= since)
          .sort((a, b) => b.at.localeCompare(a.at))
          .map(({ item_id, at, actor_email, operation, value }) => ({ item_id, at, actor_email, operation, value })))
      }
      if (this.query.includes('select distinct')) {
        return result(this.database.activity.map(({ actor_email, operation }) => ({ actor_email, operation })))
      }
      if (this.query.includes('where at >= ?')) {
        const since = String(this.values[0])
        return result(this.database.activity.filter((row) => row.at >= since).sort((a, b) => a.at.localeCompare(b.at)))
      }
      const [who, , op, , limit] = this.values
      return result(this.database.activity
        .filter((row) => (!who || row.actor_email.toLowerCase() === who) && (!op || row.operation === op))
        .sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id)
        .slice(0, Number(limit)))
    }
    if (this.query.includes('from team_users')) {
      return result([...this.database.team]
        .sort((left, right) => left.position - right.position || left.key.localeCompare(right.key))
        .map(({ key, name, email, past_emails }) => ({ key, name, email, past_emails })))
    }
    // Which cards have a rendered email chain. The board serves this so the UI can offer
    // "Open email" only where there is one to open.
    if (this.query.includes('from board_threads')) {
      return result([...this.database.threads].map(([item_id,row]) => ({ item_id, source_subject: JSON.parse(row.thread_json).subject })))
    }
    throw new Error(`Unsupported D1 all(): ${this.query}`)
  }

  async run() {
    if (this.query.startsWith('insert into board_snapshot')) {
      const [snapshot_json, published_at] = this.values
      this.database.snapshot = { snapshot_json, published_at }
      return result([], 1, 1)
    }

    if (this.query.startsWith('delete from board_threads')) {
      this.database.threads.clear()
      return result([], 1, 0)
    }

    if (this.query.startsWith('insert into board_threads')) {
      const [item_id, thread_json, published_at] = this.values
      this.database.threads.set(Number(item_id), { item_id, thread_json, published_at })
      return result([], 1, 1)
    }

    if (this.query.startsWith('insert into worklist_snapshot')) {
      const [worklist_json, published_at] = this.values
      this.database.worklist = { worklist_json, published_at }
      return result([], 1, 1)
    }

    if (this.query.startsWith('insert into todo_catalogue')) {
      const [catalogue_json, published_at] = this.values
      this.database.todoCatalogue = { catalogue_json, published_at }
      return result([], 1, 1)
    }

    if (this.query.startsWith('insert into command_queue')) {
      const [operation, item_id, note, value, actor_email, created_at] = this.values
      const id = this.database.nextCommandId
      this.database.nextCommandId += 1
      this.database.commands.push({
        id,
        operation,
        item_id,
        note,
        value,
        actor_email,
        state: 'queued',
        created_at,
        acked_at: null,
        ack_status: null,
        ack_detail: null,
      })
      return result([], 1, id)
    }

    if (this.query.startsWith('insert or ignore into todo_operations')) {
      const [event_id, item_id, operation, payload_json, actor_email, actor_name, client_ts, server_ts] = this.values
      const existing = this.database.todoOperations.find((entry) => entry.event_id === event_id)
      if (existing) return result([], 0, existing.sequence)
      const sequence = this.database.nextTodoSequence
      this.database.nextTodoSequence += 1
      this.database.todoOperations.push({
        sequence,
        event_id,
        item_id,
        operation,
        payload_json,
        actor_email,
        actor_name,
        client_ts,
        server_ts,
      })
      return result([], 1, sequence)
    }

    if (this.query.startsWith('insert into activity_log')) {
      const [at, actor_email, source, operation, item_id, value, , , , , ip, country, user_agent] = this.values
      let title = null
      if (source === 'board' && this.database.snapshot) {
        const found = JSON.parse(this.database.snapshot.snapshot_json).items.find((item) => String(item.id) === item_id)
        title = found ? found.title : null
      } else if (source === 'todo' && this.database.todoCatalogue) {
        const found = JSON.parse(this.database.todoCatalogue.catalogue_json).items.find((item) => item.id === item_id)
        title = found ? found.text : null
      }
      const id = this.database.activity.length + 1
      this.database.activity.push({ id, at, actor_email, source, operation, item_id, value, title, ip, country, user_agent })
      return result([], 1, id)
    }

    if (this.query.startsWith('insert into team_users')) {
      const [key, name, email, updated_at, updated_by] = this.values
      if (this.database.team.some((row) => row.key === key || row.email === email)) {
        throw new Error('D1_ERROR: UNIQUE constraint failed')
      }
      const position = Math.max(0, ...this.database.team.map((row) => row.position)) + 1
      this.database.team.push({ key, name, email, past_emails: '[]', position, updated_at, updated_by })
      return result([], 1, this.database.team.length)
    }

    if (this.query.startsWith('update team_users')) {
      const [name, email, past_emails, updated_at, updated_by, key] = this.values
      const row = this.database.team.find((candidate) => candidate.key === key)
      if (!row) return result([], 0)
      if (this.database.team.some((other) => other !== row && other.email === email)) {
        throw new Error('D1_ERROR: UNIQUE constraint failed')
      }
      Object.assign(row, { name, email, past_emails, updated_at, updated_by })
      return result([], 1)
    }

    if (this.query.startsWith('insert into team_changes')) {
      const [at, actor_email, user_key, field, old_value, new_value] = this.values
      this.database.teamChanges.push({ at, actor_email, user_key, field, old_value, new_value })
      return result([], 1, this.database.teamChanges.length)
    }

    if (this.query.startsWith('update command_queue') && this.query.includes("error_code = 'lease_expired'")) {
      let changes=0
      for(const c of this.database.commands) if(c.state==='queued'&&c.lease_expires_at&&c.lease_expires_at<=this.values[1]) {Object.assign(c,{state:'failed',error_code:'lease_expired',acked_at:this.values[0],ack_detail:'Processing lease expired. Check the source before retrying.'});changes++}
      return result([],changes)
    }
    if (this.query.startsWith('update command_queue') && this.query.includes('received_at = coalesce')) {
      const c=this.database.commands.find(c=>c.id===this.values[1]&&c.state==='queued'&&!c.lease_token)
      if(!c)return result([],0)
      if(!c.received_at){c.received_at=this.values[0];c.attempts=(c.attempts||0)+1}
      return result([],1)
    }
    if (this.query.startsWith('update command_queue') && this.query.includes('next_attempt_at = ?')) {
      const [state,detail,acked_at,error_code,next_attempt_at,id,token]=this.values
      const c=this.database.commands.find(c=>c.id===id&&c.state==='queued'&&(!c.lease_token||c.lease_token===token))
      if(!c)return result([],0)
      Object.assign(c,{state,ack_status:state,ack_detail:detail,acked_at,error_code,next_attempt_at})
      return result([],1)
    }
    if (this.query.startsWith('update command_queue')) {
      const [state, detail, acked_at, id] = this.values
      const command = this.database.commands.find((candidate) => candidate.id === Number(id))
      if (!command || command.state !== 'queued') return result([], 0)
      command.state = state
      command.ack_status = state
      command.ack_detail = detail
      command.acked_at = acked_at
      return result([], 1)
    }
    throw new Error(`Unsupported D1 run(): ${this.query}`)
  }
}

export class FakeD1Database {
  constructor() {
    this.snapshot = null
    this.worklist = null
    this.threads = new Map()
    this.commands = []
    this.nextCommandId = 1
    this.todoCatalogue = null
    this.todoOperations = []
    this.nextTodoSequence = 1
    this.activity = []
    // Empty, as before migration 0007 seeds it; seedTeam() is the seeded roster.
    this.team = []
    this.teamChanges = []
  }

  seedTeam() {
    const people = [
      ['frank', 'Frank', 'frankd@flooddoctorva.com'],
      ['mark', 'Mark', 'mark@flood.doctor'],
      ['steve', 'Steve', 'steve@restorationdoctors.com'],
      ['shayan', 'Shayan', 'shyon@restorationdoctors.com'],
      ['katherine', 'Katherine', 'katherine@restorationdoctors.com'],
    ]
    this.team = people.map(([key, name, email], index) => ({
      key, name, email, past_emails: '[]', position: index + 1, updated_at: '2026-09-30T00:00:00Z', updated_by: 'seed',
    }))
  }

  prepare(query) {
    return new FakeD1Statement(this, query)
  }

  async batch(statements) {
    return Promise.all(statements.map((statement) => statement.run()))
  }

  async exec() {
    return { count: 0, duration: 0 }
  }

  seedSnapshot(items, publishedAt) {
    this.snapshot = {
      snapshot_json: JSON.stringify({ items }),
      published_at: publishedAt,
    }
  }

  seedTodoCatalogue(items, publishedAt) {
    this.todoCatalogue = {
      catalogue_json: JSON.stringify({ items }),
      published_at: publishedAt,
    }
  }
}
```


### `test/feedback.test.js`

```js
// Thumbs up / thumbs down on a card. These do not change the task; they are how the team tells
// Aries whether an email of that shape should have become a card at all. The card identifies the
// sender, and the sender is what Aries learns, so neither verb carries an argument.
//
// The refusals are the part worth testing: a feedback verb that quietly accepted a value would
// let a caller smuggle state past the queue's CHECK constraints, and a thumb that reached Aries
// without an actor would teach the sweep something nobody can be asked about later.

import assert from 'node:assert/strict'
import test from 'node:test'

import worker from '../src/index.js'
import { FakeD1Database } from './fake-d1.js'

const UI_HOST = 'aries.flood.doctor'
const SYNC_HOST = 'aries-publish.flood.doctor'

function settings(db) {
  return {
    ALLOWED_EMAILS: 'mark@flood.doctor',
    PUBLISHER_TOKEN: 'test-publisher-token',
    STALE_AFTER_SECONDS: '300',
    DB: db,
  }
}

function action(body, email = 'mark@flood.doctor') {
  return new Request(`https://${UI_HOST}/api/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Cf-Access-Authenticated-User-Email': email },
    body: JSON.stringify(body),
  })
}

function queued(env) {
  return worker.fetch(new Request(`https://${SYNC_HOST}/api/sync/commands?limit=20`, {
    headers: { authorization: 'Bearer test-publisher-token' },
  }), env, {})
}

test('queues a thumb with the teammate who pressed it, and no argument', async () => {
  const env = settings(new FakeD1Database())

  for (const operation of ['useful', 'not_useful']) {
    const response = await worker.fetch(action({ operation, id: 81 }), env, {})
    assert.equal(response.status, 202, `${operation} should be accepted`)
    const payload = await response.json()
    assert.equal(payload.command.operation, operation)
    assert.equal(payload.command.item_id, 81)
    assert.equal(payload.command.value, null, `${operation} must never carry a value`)
    assert.equal(payload.command.note, null)
    // Aries mutes a sender off the back of this, so the row has to say who asked for it.
    assert.equal(payload.command.actor_email, 'mark@flood.doctor')
  }

  const rows = (await (await queued(env)).json()).commands
  assert.deepEqual(rows.map((row) => row.operation), ['useful', 'not_useful'])
})

test('a value on a thumb is discarded rather than stored', async () => {
  const env = settings(new FakeD1Database())
  const response = await worker.fetch(
    action({ operation: 'not_useful', id: 82, value: 'xactanalysis.com' }), env, {})
  assert.equal(response.status, 202)
  const rows = (await (await queued(env)).json()).commands
  assert.equal(rows[0].value, null)
})

test('an unauthenticated visitor cannot teach the inbox sweep', async () => {
  const env = settings(new FakeD1Database())
  const anonymous = new Request(`https://${UI_HOST}/api/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operation: 'not_useful', id: 83 }),
  })
  const response = await worker.fetch(anonymous, env, {})
  assert.equal(response.status, 403)
})

test('still refuses a verb that was never exposed to the web', async () => {
  const env = settings(new FakeD1Database())
  for (const operation of ['mute', 'thumbs_down', 'archive']) {
    const response = await worker.fetch(action({ operation, id: 84 }), env, {})
    assert.equal(response.status, 400, `${operation} must be refused`)
  }
})
```


### `test/mission-answers.test.js`

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import worker from '../src/index.js'
import { parseOptions, taskFailure, taskState, taskCounts } from '../src/mission-state.js'
import { MISSION_HTML } from '../src/mission-ui.js'

// Execute the actual SQL, including partial indexes and RETURNING, rather than simulate claims.
function fixture() {
  const db=new DatabaseSync(':memory:')
  db.exec(readFileSync(new URL('../migrations/0010_mission.sql',import.meta.url),'utf8'))
  db.exec(readFileSync(new URL('../migrations/0011_mission_answers.sql',import.meta.url),'utf8'))
  db.exec(readFileSync(new URL('../migrations/0012_mission_answers_by.sql',import.meta.url),'utf8'))
  db.prepare('INSERT INTO mission_records VALUES(?,?,?,?)').run('decision','TEST-C33',JSON.stringify({options:'Later,Review (recommended)'}),'2026-10-01T10:00:00Z')
  db.prepare('INSERT INTO mission_records VALUES(?,?,?,?)').run('task','TEST-task',JSON.stringify({status:'running'}),'2026-10-01T10:00:00Z')
  const env={MISSION_TOKEN:'TEST-only',ALLOWED_EMAILS:'frank@example.test',ALLOWED_EMAIL_DOMAINS:'flood.doctor',DB:{prepare(sql){return {values:[],bind(...values){this.values=values;return this},async all(){return {results:db.prepare(sql).all(...this.values)}},async first(){return db.prepare(sql).get(...this.values)}}}}}
  const call=(path,body,headers={},method=body===undefined?'GET':'POST',host='aries.flood.doctor')=>worker.fetch(new Request('https://'+host+path,{method,headers:{'Cf-Access-Authenticated-User-Email':'frank@example.test',Origin:'https://aries.flood.doctor','Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),env,{})
  const answer=(body,headers={})=>call('/api/mission/answer',{card_id:'TEST-C33',...body},headers)
  const poll=(mode,by='TEST-session')=>call('/api/mission/answers',{mode,by},{Authorization:'Bearer TEST-only'},'POST','aries-publish.flood.doctor')
  return {db,call,answer,poll}
}
for (const [name,value] of Object.entries({comma:'Later,Review (recommended)',or:'Later or Review (recommended)',semicolon:'Later;Review (recommended)',newline:'Later\nReview (recommended)',array:['Later','Review (recommended)']})) {
  test('options parse '+name+' and put recommendation first',()=>assert.deepEqual(parseOptions(value),[{label:'Review',recommended:true},{label:'Later',recommended:false}]))
}
test('options trim blanks and ignore non-string items',()=>assert.deepEqual(parseOptions([' ; ',' Review (Recommended) ',null,' Later ']),[{label:'Review',recommended:true},{label:'Later',recommended:false}]))
test('answer writes and reads refuse missing or disallowed Access identity',async()=>{
  const f=fixture()
  for(const email of ['', 'other@evil.test','x@flood.doctor.evil.test']) {
    assert.equal((await f.answer({kind:'choice',choice:'Later'},{'Cf-Access-Authenticated-User-Email':email})).status,401)
    assert.equal((await f.call('/api/mission/answers',undefined,{'Cf-Access-Authenticated-User-Email':email})).status,401)
  }
  assert.equal((await f.answer({kind:'choice',choice:'Later'},{'Cf-Access-Authenticated-User-Email':'staff@flood.doctor'})).status,200)
  assert.equal((await f.poll('all')).status,200)
  assert.equal((await f.call('/api/mission/answers',{mode:'new'},{Authorization:'Bearer wrong'},'POST','aries-publish.flood.doctor')).status,401)
})
test('writes enforce same origin, JSON, card pattern, existence, choice and length',async()=>{
  const f=fixture(),valid={kind:'choice',choice:'Later'}
  for(const origin of ['', 'https://evil.test','https://aries.flood.doctor.evil.test']) assert.equal((await f.answer(valid,{Origin:origin})).status,403)
  assert.equal((await f.answer(valid,{'Content-Type':'text/plain'})).status,415)
  for(const body of [{card_id:'../secret'}, {card_id:'missing'}, {card_id:'TEST-C33',choice:'invented'},{kind:'nope'},{kind:'text',text:'',request_id:'one'},{kind:'text',text:'x'.repeat(4001),request_id:'two'}]) assert.ok((await f.answer({...valid,...body})).status>=400)
  assert.equal((await f.answer({kind:'text',text:'x'.repeat(4000),request_id:'limit'})).status,200)
  assert.equal((await f.answer({card_id:'TEST-task',kind:'text',text:'TEST instruction',request_id:'task'})).status,200)
})
test('author and UTC timestamps are server stamped and reads show only own answers',async()=>{
  const f=fixture(),before=Date.now()
  const r=await (await f.answer({kind:'choice',choice:'Later',author:'attacker',created:'1900',received:'1900'})).json()
  assert.ok(Date.parse(r.answer.created)>=before)
  const row=f.db.prepare('SELECT * FROM mission_answers').get()
  assert.equal(row.author,'frank@example.test');assert.equal(row.received,null)
  assert.equal((await (await f.call('/api/mission/answers')).json()).answers.length,1)
  assert.equal((await (await f.call('/api/mission/answers',undefined,{'Cf-Access-Authenticated-User-Email':'staff@flood.doctor'})).json()).answers.length,0)
})
test('choice changes before receipt, locks after receipt, and text stays available',async()=>{
  const f=fixture()
  const first=await (await f.answer({kind:'choice',choice:'Later'})).json()
  const second=await (await f.answer({kind:'choice',choice:'Review'})).json()
  assert.equal(first.answer.id,second.answer.id)
  assert.equal(second.answer.choice,'Review')
  assert.equal((await (await f.poll('all')).json()).answers.length,1)
  assert.equal(f.db.prepare('SELECT received FROM mission_answers').get().received,null)
  assert.equal((await (await f.poll('new')).json()).answers[0].choice,'Review')
  assert.equal((await f.answer({kind:'choice',choice:'Later'})).status,409)
  assert.equal((await f.answer({kind:'text',text:'TEST: change my choice',request_id:'change'})).status,200)
})
test('two concurrent pollers atomically receive each answer once',async()=>{
  const f=fixture()
  await f.answer({kind:'choice',choice:'Later'})
  await f.answer({kind:'text',text:'TEST text',request_id:'text'})
  const replies=await Promise.all([f.poll('new'),f.poll('new')])
  const rows=(await Promise.all(replies.map(r=>r.json()))).flatMap(r=>r.answers)
  assert.equal(rows.length,2);assert.equal(new Set(rows.map(r=>r.id)).size,2)
  assert.deepEqual((await (await f.poll('new')).json()).answers,[])
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM mission_answers WHERE received IS NOT NULL').get().n,2)
})
test('safe retries keep a text submission once after a lost response',async()=>{
  const f=fixture(),body={kind:'text',text:'TEST retry',request_id:'same-request'}
  const a=await (await f.answer(body)).json(),b=await (await f.answer(body)).json()
  assert.equal(a.answer.id,b.answer.id)
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM mission_answers').get().n,1)
})
test('tile counts actual failures while stale runs and successful stops stay visible',()=>{
  const rows=[{data:{status:'running',step:'quiet for two days'}},{data:{status:'stopped',step:'rc=0'}},{data:{status:'failed',step:'down'}},{data:{status:'stopped',step:'rc=1'}},{data:{status:'stopped',failure_cause:'connection lost'}},{data:{status:'done',step:'old failure recovered'}},{data:{status:'waiting'}}]
  assert.equal(rows.filter(taskFailure).length,3)
  const counts=taskCounts(rows.map(r=>taskState(r)))
  assert.equal(counts.failed,3)
  assert.equal(counts.running,1)
  assert.equal(counts.stopped,1)
})
test('Mission script parses and includes accessible card controls and retained drafts',()=>{
  const script=MISSION_HTML.match(/<script>([\s\S]*?)<\/script>/)[1]
  assert.doesNotThrow(()=>new Function(script))
  for(const text of ['aria-pressed','Your instructions','aria-live="polite"','font:16px','min-height:48px','sessionStorage.missionDrafts','AbortSignal.timeout(20000)','Received. Use Your instructions'])assert.ok(MISSION_HTML.includes(text),text)
})

test('receipt records winning session and all and own reads retain it',async()=>{
  const f=fixture();await f.answer({kind:'choice',choice:'Later'})
  const replies=await Promise.all([f.poll('new','TEST-one'),f.poll('new','TEST-two')])
  const rows=(await Promise.all(replies.map(r=>r.json()))).flatMap(r=>r.answers)
  assert.equal(rows.length,1);assert.ok(['TEST-one','TEST-two'].includes(rows[0].by))
  assert.equal(rows[0].received_by,rows[0].by);assert.ok(rows[0].received)
  assert.equal((await (await f.poll('all')).json()).answers[0].by,rows[0].by)
  assert.equal((await (await f.call('/api/mission/answers')).json()).answers[0].received_by,rows[0].by)
  assert.equal((await f.poll('new','bad\ncontext')).status,400)
})

test('answer states use Eastern clocks, warn at exactly 15 minutes, and clear on receipt',()=>{
  const script=MISSION_HTML.match(/<script>([\s\S]*?)<\/script>/)[1]
  const start=script.indexOf('function answerStatus('),end=script.indexOf('let records=',start)
  const render=new Function('esc','mins',script.slice(start,end)+';return answerStatus')
  const now=Date.parse('2026-10-01T15:35:00Z')
  const status=render(x=>String(x).replace(/</g,'&lt;'),s=>Math.floor((now-Date.parse(s))/60000))
  const a={created:'2026-10-01T15:21:00Z'}
  assert.equal(status(a),'Sent 11:21 AM, waiting for a session')
  a.created='2026-10-01T15:20:00Z'
  assert.match(status(a),/class="w warn".*Not read yet, sent 15 minutes ago. No session has picked it up./)
  a.created='2026-10-01T15:19:00Z';assert.match(status(a),/sent 16 minutes ago/)
  a.received='2026-10-01T15:35:00Z';a.received_by='TEST-session'
  assert.equal(status(a),'Received by <code class="session-tag">TEST-session</code> at 11:35 AM ET')
  assert.doesNotMatch(status(a),/warn|Not read/)
  a.received_by='<script>';assert.match(status(a),/&lt;script>/)
})
```


### `test/mission-freshness.test.js`

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { taskState } from '../src/mission-state.js'
import { MISSION_HTML } from '../src/mission-ui.js'

test('recent activity stays Running even when the status event is older',()=>{
  const source=MISSION_HTML.slice(MISSION_HTML.indexOf('function taskInfo('),MISSION_HTML.indexOf('function taskHtml('))
  const now=Date.now(),recent=new Date(now-60000).toISOString(),old=new Date(now-7200000).toISOString()
  const context=vm.createContext({taskState,fix:t=>t})
  vm.runInContext(source,context)
  const info=context.taskInfo({id:'C31',updated:recent,data:{status:'running',status_source:'progress log and master plan',source_updated:old,activity_updated:recent,title:'Guard'}})
  assert.equal(info.word,'Running')
  assert.equal(info.t,recent)
})
```


### `test/mission-order.test.js`

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { missionRequest } from '../src/mission.js'

function fixture() {
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE mission_records(kind TEXT,id TEXT,data TEXT,updated TEXT,PRIMARY KEY(kind,id))')
  const env = {
    MISSION_TOKEN:'test-only',
    DB:{prepare(sql){
      return {bind(...args){
        return {async run(){
          const r=db.prepare(sql).run(...args)
          return {meta:{changes:Number(r.changes)}}
        }}
      }}
    }}
  }
  const push = async data => (await missionRequest(new Request('https://aries-publish.flood.doctor/api/mission/push',{method:'POST',headers:{authorization:'Bearer test-only'},body:JSON.stringify({kind:'task',id:'T88',data})}),env,false)).json()
  const row = () => db.prepare('SELECT * FROM mission_records').get()
  return {db,push,row}
}
test('recent CLI push retains status, title and updated after stale backfill',async()=>{
  const {push,row}=fixture()
  await push({origin:'cli',status:'running',title:'Live task'})
  const before=row()
  const result=await push({origin:'backfill',source_updated:'2020-01-01T00:00:00Z',status:'stopped',title:'Stale title'})
  assert.deepEqual(row(),before)
  assert.equal(result.skipped,'newer cli push')
})
test('backfill source newer than stale CLI push can replace it',async()=>{
  const {db,push,row}=fixture()
  await push({origin:'cli',status:'running',title:'Old task'})
  db.exec("UPDATE mission_records SET updated='2020-01-01T00:00:00.000Z'")
  await push({origin:'backfill',source_updated:'2021-01-01T00:00:00Z',status:'done',title:'New evidence'})
  assert.equal(JSON.parse(row().data).status,'done')
})
test('backfill owned row keeps updating',async()=>{
  const {push,row}=fixture()
  await push({origin:'backfill',source_updated:'2020-01-01T00:00:00Z',status:'running',title:'First'})
  await push({origin:'backfill',source_updated:'2021-01-01T00:00:00Z',status:'done',title:'Second'})
  assert.equal(JSON.parse(row().data).title,'Second')
})
test('legacy recorder source protects CLI state and equality does not replace it',async()=>{
  const {db,push,row}=fixture()
  await push({status_source:'mission CLI',status:'running',title:'Legacy recorder'})
  db.exec("UPDATE mission_records SET updated='2021-01-01T00:00:00.000Z'")
  const before=row()
  await push({origin:'backfill',source_updated:'2021-01-01T01:00:00+01:00',status:'stopped',title:'Stale'})
  assert.deepEqual(row(),before)
})
test('backfill missing or invalid source time cannot replace CLI',async()=>{
  const {push,row}=fixture()
  await push({origin:'cli',status:'running',title:'Live'})
  const before=row()
  for(const source_updated of [null,'invalid']) {
    const result=await push({origin:'backfill',source_updated,status:'stopped',title:'Stale'})
    assert.deepEqual(row(),before)
    assert.equal(result.skipped,'newer cli push')
  }
})

for (const status of ['done','closed','waiting']) test(`CLI ${status} survives newer backfill evidence and title`,async()=>{
  const {db,push,row}=fixture()
  await push({origin:'cli',status:'done',title:'Recorder title'})
  db.prepare('UPDATE mission_records SET data=?,updated=?').run(JSON.stringify({origin:'cli',status,title:'Recorder title'}),'2020-01-01T00:00:00Z')
  const before=row()
  for (const source_updated of [undefined,'2099-01-01T00:00:00Z']) {
    const result=await push({origin:'backfill',status:'running',title:'Inferred title',source_updated})
    assert.deepEqual(row(),before)
    assert.equal(result.skipped,'newer cli push')
  }
})
for (const status of ['running','stopped','failed']) test(`CLI ${status} requires strictly newer evidence`,async()=>{
  const {db,push,row}=fixture()
  await push({origin:'cli',status,title:'CLI'})
  db.exec("UPDATE mission_records SET updated='2021-01-01T00:00:00Z'")
  const before=row()
  for (const source_updated of [undefined,'invalid','2020-01-01T00:00:00Z','2021-01-01T00:00:00Z']) {
    await push({origin:'backfill',status:'done',title:'Stale',source_updated})
    assert.deepEqual(row(),before)
  }
  await push({origin:'backfill',status:'done',title:'Real evidence',source_updated:'2022-01-01T00:00:00Z'})
  assert.equal(JSON.parse(row().data).title,'Real evidence')
})
test('logless backfill creates a missing row',async()=>{
  const {push,row}=fixture()
  await push({origin:'backfill',status:'waiting',title:'New'})
  assert.equal(JSON.parse(row().data).title,'New')
})
```


### `test/mission-upgrades.test.js`

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { evidenceFreshness, taskState, taskCounts, sourceFreshness, machineTelemetry, serviceState } from '../src/mission-state.js'
import { checkServices, serviceProbe } from '../src/mission.js'
import { MISSION_HTML } from '../src/mission-ui.js'

const now=Date.parse('2026-10-11T20:00:00Z'),fresh=new Date(now-60000).toISOString(),old=new Date(now-7200000).toISOString()
const record=(id,data,updated=fresh,kind='task')=>({kind,id,data,updated})

function view() {
  const elements=new Map()
  const element=id=>{if(!elements.has(id))elements.set(id,{id,value:'',innerHTML:'',textContent:'',style:{},focus(){},setSelectionRange(){}});return elements.get(id)}
  const document={activeElement:null,getElementById:element,querySelectorAll:()=>[]}
  class Clock extends Date {constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
  const context=vm.createContext({document,Date:Clock,Intl,sessionStorage:{},console,AbortSignal,crypto,navigator:{onLine:true}})
  const script=MISSION_HTML.match(/<script>([\s\S]*?)<\/script>/)[1]
  vm.runInContext(script.slice(0,script.indexOf("document.addEventListener('input'")),context)
  const render=records=>{context.input=records;vm.runInContext('records=input;render()',context)}
  return {context,document,element,render}
}

test('stale and missing runs retain lifecycle, stopped success is separate from failure',()=>{
  const rows=[record('old',{status:'running',origin:'backfill',source_updated:old}),record('missing',{status:'running',origin:'backfill'}),record('stop',{status:'stopped',step:'rc=0'}),record('fail',{status:'stopped',step:'rc=2'}),record('wait',{status:'waiting'})]
  const states=rows.map(r=>taskState(r,now)),counts=taskCounts(states)
  assert.equal(counts.running,2);assert.equal(counts.failed,1);assert.equal(counts.stopped,1);assert.equal(counts.waiting,1)
  assert.equal(states[0].evidence.status,'stale');assert.equal(states[1].evidence.status,'missing')
  assert.equal(states[0].failure,false);assert.equal(states[1].failure,false)
})

test('top and section counts render the same stale running tasks and distinguish confirmed issues',()=>{
  const ui=view(),rows=Array.from({length:15},(_,i)=>record('C'+i,{status:'running',origin:'backfill',source_updated:old}))
  ui.render([...rows,record('P',{title:'Stage',tasks:rows.map(r=>r.id).join(',')},fresh,'project')])
  assert.match(ui.element('strip').innerHTML,/<b>15<\/b><span>reported running/)
  assert.match(ui.element('tasks').innerHTML,/15 running · 0 waiting/)
  assert.match(ui.element('strip').innerHTML,/<b>0<\/b><span>confirmed issues/)
  assert.match(ui.element('tasks').innerHTML,/Evidence stale/)
  assert.doesNotMatch(ui.element('tasks').innerHTML,/Stuck:|task stuck/)
})

test('missing and invalid timestamps never count current; recent polling cannot freshen backfill evidence',()=>{
  for(const value of [null,undefined,'','garbage','2099-01-01T00:00:00Z']) assert.equal(evidenceFreshness(value,5,now).status,'missing')
  const rows=[record('old',{status:'running',origin:'backfill',source_updated:old}),record('none',{status:'running',origin:'backfill'}),record('live',{status:'running',origin:'cli'})]
  const summary=sourceFreshness(rows,now),backfill=summary.find(s=>s.name==='Tasks · backfill')
  assert.equal(backfill.current,0);assert.equal(backfill.stale,1);assert.equal(backfill.missing,1)
  assert.equal(backfill.latest,old);assert.equal(backfill.oldest,old)
  assert.equal(summary.find(s=>s.name==='Tasks · cli').current,1)
})

test('fresh activity wins over old status evidence and latest/oldest report actual timestamps',()=>{
  const recent=record('recent',{status:'running',status_source:'progress log',source_updated:old,activity_updated:fresh})
  assert.equal(taskState(recent,now).evidence.at,fresh)
  const [summary]=sourceFreshness([recent,record('older',{status:'running',status_source:'progress log',source_updated:old})],now)
  assert.equal(summary.latest,fresh);assert.equal(summary.oldest,old)
})

test('machine rolling utilization and recorded chunk do not invent a current job or queue',()=>{
  const legacy=record('halo1',{reachable:true,busy:'80%',chunk:'Previous batch',runner_updated:old},fresh,'machine')
  const state=machineTelemetry(legacy,now)
  assert.equal(state.state,'online');assert.equal(state.job,null);assert.equal(state.queue,null)
  const ui=view();ui.render([legacy])
  assert.match(ui.element('mach').innerHTML,/Rolling busy/)
  assert.match(ui.element('mach').innerHTML,/Current job:<\/b> Unknown/)
  assert.match(ui.element('mach').innerHTML,/Queue depth:<\/b> Unknown/)
  assert.match(ui.element('mach').innerHTML,/Last recorded work:<\/b> Previous batch/)
  assert.equal(machineTelemetry(record('halo2',{},null,'machine'),now).state,'missing')
})

test('machine current work and zero queue require current heartbeat and observation',()=>{
  const row=record('halo1',{reachable:true,current_job:'Read documents',queue_depth:0,runner_heartbeat:fresh},fresh,'machine')
  let state=machineTelemetry(row,now)
  assert.equal(state.jobCurrent,true);assert.equal(state.queueCurrent,true);assert.equal(state.queue,0)
  row.data.runner_heartbeat=old;state=machineTelemetry(row,now)
  assert.equal(state.jobCurrent,false);assert.equal(state.queueCurrent,false)
  row.data.runner_heartbeat=fresh;row.updated=old;state=machineTelemetry(row,now)
  assert.equal(state.state,'stale');assert.equal(state.jobCurrent,false)
  row.updated=fresh;row.data.queue_depth='0';assert.equal(machineTelemetry(row,now).queue,null)
})

test('homepage, minimal health JSON, Access, stale checks and operational evidence stay distinct',()=>{
  for(const text of ['<html>Home</html>','{"ok":true}','{"status":"healthy"}']) {
    const probe=serviceProbe(200,text,now)
    assert.equal(probe.availability,'available');assert.equal(probe.operational.status,'unknown')
  }
  assert.equal(serviceProbe(302,'',now).availability,'gated')
  assert.equal(serviceProbe(403,'',now).operational.status,'unknown')
  const payload={operational:{status:'healthy',checked_at:fresh,sources:[{name:'inbox',status:'current',last_evidence_at:fresh}],queue:{pending:0,failed:0}}}
  assert.equal(serviceProbe(200,JSON.stringify(payload),now).operational.status,'healthy')
  payload.operational.sources[0].last_evidence_at=null
  assert.equal(serviceProbe(200,JSON.stringify(payload),now).operational.status,'unknown')
  payload.operational.status='degraded'
  assert.equal(serviceProbe(200,JSON.stringify(payload),now).operational.status,'degraded')
  payload.operational.checked_at=old
  assert.equal(serviceProbe(200,JSON.stringify(payload),now).operational.status,'unknown')
  assert.equal(serviceState(record('aries',{status:'up',operational:{status:'healthy',checked_at:fresh}},null,'service'),now).operational,'unknown')
})

test('healthy service claims require source timestamps within their own cadence and never in the future',()=>{
  const probe=(last_evidence_at,after_seconds,checked_at=fresh)=>serviceProbe(200,JSON.stringify({operational:{status:'healthy',checked_at,sources:[{name:'inbox',status:'current',last_evidence_at,...(after_seconds===undefined?{}:{after_seconds})}]}}),now).operational.status
  assert.equal(probe(fresh),'healthy')
  assert.equal(probe(old),'unknown')
  assert.equal(probe(new Date(now-600001).toISOString()),'unknown')
  assert.equal(probe(new Date(now+1000).toISOString()),'unknown')
  assert.equal(probe(new Date(now+3600000).toISOString()),'unknown')
  assert.equal(probe(fresh,30),'unknown')
  assert.equal(probe(fresh,60),'healthy')
  assert.equal(probe(new Date(now-60001).toISOString(),60),'unknown')
  assert.equal(probe(old,7200),'healthy')
  for (const invalid of [null,0,-1,'600']) assert.equal(probe(fresh,invalid),'unknown')
  assert.equal(probe(fresh,600,new Date(now+1000).toISOString()),'unknown')
  assert.equal(probe(fresh,600,new Date(now-600001).toISOString()),'unknown')
})

test('service probes retain authenticated bindings and make GET-only checks',async t=>{
  const calls=[],saved=[]
  const response=()=>Response.json({ok:true})
  t.mock.method(globalThis,'fetch',async(url,init)=>{calls.push({url,init});return response()})
  const env={MISSION_TOKEN:'fixture-token',ENGINE_ACCESS_ID:'fixture-id',ENGINE_ACCESS_SECRET:'fixture-secret',SELF:{async fetch(url,init){calls.push({url,init});return response()}},ENGINE:{async fetch(url,init){calls.push({url,init});return response()}},DB:{prepare(){return {bind(...args){saved.push(args);return this},async run(){return {}}}}}}
  await checkServices(env,'test')
  assert.equal(calls.length,4);assert.equal(saved.length,4)
  assert.ok(calls.every(c=>(c.init.method||'GET')==='GET'))
  assert.equal(calls.find(c=>c.url==='https://aries.flood.doctor/healthz').init.headers.Authorization,'Bearer fixture-token')
  assert.equal(calls.find(c=>c.url.includes('engine.')).init.headers['CF-Access-Client-Id'],'fixture-id')
  assert.ok(saved.every(args=>JSON.parse(args[2]).operational.status==='unknown'))
})

test('Needs you opens the exact raw todo id and refresh preserves task drafts and focus',async()=>{
  const ui=view(),id='claim/42 & review',task=record('C1',{status:'running',title:'Task'})
  let focused=0,selection
  const input=ui.element('instruction-C1');Object.assign(input,{tagName:'TEXTAREA',selectionStart:2,selectionEnd:5,focus(){focused++},setSelectionRange(...args){selection=args}})
  ui.document.activeElement=input
  vm.runInContext("drafts.set('C1','Keep this instruction');open.add('C1')",ui.context)
  ui.context.fetch=async path=>Response.json(path==='/api/todos'?{items:[{id,text:'Review exact item',assignee:'Frank',due:'2026-10-11'}]}:path==='/api/mission'?{records:[task]}:{answers:[]})
  await vm.runInContext('refresh()',ui.context)
  assert.match(ui.element('decisions').innerHTML,/href="\/\?view=todos&amp;task=claim%2F42%20%26%20review"/)
  assert.doesNotMatch(ui.element('decisions').innerHTML,/task=Todo-/)
  assert.match(ui.element('tasks').innerHTML,/Keep this instruction/)
  assert.match(ui.element('tasks').innerHTML,/data-id="C1" open/)
  assert.equal(focused,1);assert.deepEqual(selection,[2,5])
  assert.match(ui.element('fresh').textContent,/API fetched/)
})
```


### `test/mission.test.js`

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { missionRequest } from '../src/mission.js'

test('mission feed keeps reads behind Access and writes behind the dedicated bearer', async()=>{
  let writes=0
  const env={MISSION_TOKEN:'mission-test-only',DB:{prepare(){return {bind(){return this},async run(){writes++},async all(){return {results:[]}}}}}}
  const req=(host,path,init={})=>new Request('https://'+host+path,init)
  assert.equal((await missionRequest(req('aries.flood.doctor','/api/mission'),env,false)).status,403)
  assert.equal((await missionRequest(req('aries-publish.flood.doctor','/api/mission'),env,true)).status,401)
  assert.equal((await missionRequest(req('aries-publish.flood.doctor','/api/mission',{headers:{authorization:'Bearer mission-test-only'}}),env,false)).status,200)
  assert.equal((await missionRequest(req('aries.flood.doctor','/api/mission'),env,true)).status,200)
  for(const token of ['', 'Bearer publisher-test-only']) {
    assert.equal((await missionRequest(req('aries-publish.flood.doctor','/api/mission/push',{method:'POST',headers:{authorization:token},body:'{}'}),env,false)).status,401)
  }
  const post=data=>missionRequest(req('aries-publish.flood.doctor','/api/mission/push',{method:'POST',headers:{authorization:'Bearer mission-test-only'},body:JSON.stringify(data)}),env,false)
  assert.equal((await post({kind:'task',id:'C13',data:{status:'done'}})).status,200)
  assert.equal((await post({kind:'task',id:'C13',data:{status:'imaginary'}})).status,400)
  assert.equal((await post({kind:'task',id:'../secret',data:{status:'done'}})).status,400)
  assert.equal(writes,1)
})
```


### `test/parity.test.js`

```js
// The cloud board was deliberately built as a two-verb read mirror (done, note). Frank asked
// for parity with the board on his own machine, so it now also queues assign, snooze, reorder
// and delete, carries the source email link, and serves Aries' full working list.
//
// The tests that matter here are the refusals: a widened surface is only safe if every new
// argument is still validated, and if a personal row still cannot reach the web by any route.

import assert from 'node:assert/strict'
import test from 'node:test'

import worker from '../src/index.js'
import { FakeD1Database } from './fake-d1.js'

const UI_HOST = 'aries.flood.doctor'
const SYNC_HOST = 'aries-publish.flood.doctor'

function settings(db) {
  return {
    ALLOWED_EMAILS: 'dom@flood.doctor,mark@flood.doctor',
    PUBLISHER_TOKEN: 'test-publisher-token',
    STALE_AFTER_SECONDS: '300',
    DB: db,
  }
}

function action(body, email = 'dom@flood.doctor') {
  return new Request(`https://${UI_HOST}/api/action`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Cf-Access-Authenticated-User-Email': email,
    },
    body: JSON.stringify(body),
  })
}

function publish(path, body) {
  return new Request(`https://${SYNC_HOST}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer test-publisher-token',
    },
    body: JSON.stringify(body),
  })
}

function read(path, email = 'dom@flood.doctor') {
  return new Request(`https://${UI_HOST}${path}`, {
    headers: { 'Cf-Access-Authenticated-User-Email': email },
  })
}

test('queues every operation the local board supports, with its argument', async () => {
  const db = new FakeD1Database()
  const env = settings(db)

  const cases = [
    { body: { operation: 'assign', id: 11, value: 'Steve' }, value: 'steve' },
    { body: { operation: 'assign', id: 12, value: '' }, value: '' },
    { body: { operation: 'snooze', id: 13, value: '2026-09-01' }, value: '2026-09-01' },
    { body: { operation: 'reorder', id: 14, value: 3 }, value: '3' },
    { body: { operation: 'delete', id: 15 }, value: null },
    { body: { operation: 'reopen', id: 16 }, value: null },
  ]

  for (const { body, value } of cases) {
    const response = await worker.fetch(action(body), env, {})
    assert.equal(response.status, 202, `${body.operation} should be accepted`)
    const payload = await response.json()
    assert.equal(payload.command.operation, body.operation)
    assert.equal(payload.command.item_id, body.id)
    assert.equal(payload.command.value, value, `${body.operation} argument`)
    assert.equal(payload.command.actor_email, 'dom@flood.doctor')
  }
})

test('refuses a malformed argument on every widened operation', async () => {
  const db = new FakeD1Database()
  const env = settings(db)

  const refusals = [
    { operation: 'assign', id: 21, value: 'the-intern' },      // not on the roster
    { operation: 'assign', id: 22 },                            // missing entirely
    { operation: 'snooze', id: 23, value: 'next tuesday' },     // not an ISO date
    { operation: 'snooze', id: 24, value: '2026-13-45' },       // shaped right, not a date
    { operation: 'reorder', id: 25, value: 0 },                 // positions start at 1
    { operation: 'reorder', id: 26, value: 'first' },           // not a number
    { operation: 'archive', id: 27 },                           // never exposed to the web
  ]

  for (const body of refusals) {
    const response = await worker.fetch(action(body), env, {})
    assert.equal(response.status, 400, `${body.operation} ${JSON.stringify(body.value)} must be refused`)
  }
})

test('carries the source email link through to the board', async () => {
  const db = new FakeD1Database()
  const env = settings(db)
  const sourceUrl = 'https://mail.google.com/mail/u/0/#all/1a03556450dc8149'

  const published = await worker.fetch(publish('/api/sync/snapshot', {
    items: [{ id: 31, title: 'Reply on claim C620015899', source_url: sourceUrl, kind: 'adjuster' }],
  }), env, {})
  assert.equal(published.status, 200)

  const board = await worker.fetch(read('/api/board'), env, {})
  const payload = await board.json()
  assert.equal(payload.items[0].source_url, sourceUrl)
})

test('serves the full working list and refuses a personal row', async () => {
  const db = new FakeD1Database()
  const env = settings(db)

  const ok = await worker.fetch(publish('/api/sync/worklist', {
    items: [
      { id: 0, text: 'Chase the Sedgwick invoice', who: 'Mark', due: '2026-08-30', done: false },
      { id: 1, text: 'File the SCC annual fee', done: true },
    ],
  }), env, {})
  assert.equal(ok.status, 200)
  assert.equal((await ok.json()).item_count, 2)

  const listed = await worker.fetch(read('/api/worklist'), env, {})
  assert.equal(listed.status, 200)
  const payload = await listed.json()
  assert.equal(payload.items.length, 2)
  assert.equal(payload.items[0].who, 'Mark')
  assert.equal(payload.items[1].done, true)
  assert.equal(payload.stale.is_stale, false)

  // A personal row must be refused outright rather than quietly dropped, so a publisher
  // that stops filtering fails loudly instead of leaking one row at a time.
  const leak = await worker.fetch(publish('/api/sync/worklist', {
    items: [{ id: 0, text: 'Chime card PIN changed', personal: true }],
  }), env, {})
  assert.equal(leak.status, 400)
})

test('the full working list is not readable without an Access identity', async () => {
  const db = new FakeD1Database()
  const env = settings(db)
  const anonymous = new Request(`https://${UI_HOST}/api/worklist`)
  const response = await worker.fetch(anonymous, env, {})
  assert.equal(response.status, 403)
})

test('a checked-off card can be brought back, and reopen takes no argument', async () => {
  const db = new FakeD1Database()
  const env = settings(db)

  // Undo after a mis-click. The queue is what Aries reads, so the reopen has to survive
  // exactly as issued — no note, no value, just the item.
  const undo = await worker.fetch(action({ operation: 'reopen', id: 41 }), env, {})
  assert.equal(undo.status, 202)
  const queued = await worker.fetch(
    new Request(`https://${SYNC_HOST}/api/sync/commands?limit=10`, {
      headers: { authorization: 'Bearer test-publisher-token' },
    }), env, {})
  const payload = await queued.json()
  assert.equal(payload.commands.length, 1)
  assert.equal(payload.commands[0].operation, 'reopen')
  assert.equal(payload.commands[0].item_id, 41)
  assert.equal(payload.commands[0].note, null)
  assert.equal(payload.commands[0].value, null)

  // An argument on reopen is meaningless; accepting one would let a caller smuggle state
  // past the queue's CHECK constraints.
  const withValue = await worker.fetch(action({ operation: 'reopen', id: 42, value: 'open' }), env, {})
  assert.equal(withValue.status, 202)
  const after = await worker.fetch(
    new Request(`https://${SYNC_HOST}/api/sync/commands?limit=10`, {
      headers: { authorization: 'Bearer test-publisher-token' },
    }), env, {})
  const rows = (await after.json()).commands
  assert.equal(rows.length, 1, 'an already received command is not delivered twice')
  assert.equal(rows[0].item_id, 42)
  assert.equal(rows[0].value, null, 'reopen must never carry a value')
})

test('a checked-off card is published so it can be undone, but stays off the open board', async () => {
  const db = new FakeD1Database()
  const env = settings(db)
  const published = await worker.fetch(publish('/api/sync/snapshot', {
    items: [
      { id: 51, title: 'Still to do', status: 'open' },
      { id: 52, title: 'Checked off by mistake', status: 'done' },
    ],
  }), env, {})
  assert.equal(published.status, 200)

  const board = await worker.fetch(read('/api/board'), env, {})
  const items = (await board.json()).items
  assert.equal(items.length, 2, 'both travel in the snapshot')
  assert.equal(items.filter((item) => item.status === 'done').length, 1, 'the done one is available to undo')
})

test('serves a source email chain to any teammate, whichever mailbox it lives in', async () => {
  const db = new FakeD1Database()
  const env = settings(db)

  const published = await worker.fetch(publish('/api/sync/threads', {
    threads: [{
      item_id: 61,
      subject: 'Re: claim 00300123752',
      mailbox: 'steve@restorationdoctors.com',
      messages: [
        { from: 'adjuster@carrier.com', to: 'steve@restorationdoctors.com', date: 'Mon, 24 Aug 2026 09:00:00 -0400', body: 'Please send the invoice.', truncated: false },
        { from: 'steve@restorationdoctors.com', to: 'adjuster@carrier.com', date: 'Mon, 24 Aug 2026 09:30:00 -0400', body: 'Attached.', truncated: false },
      ],
    }],
  }), env, {})
  assert.equal(published.status, 200)
  assert.equal((await published.json()).thread_count, 1)

  // Mark owns none of those mailboxes; he must still be able to read the chain.
  const asMark = await worker.fetch(read('/api/thread?id=61', 'mark@flood.doctor'), env, {})
  assert.equal(asMark.status, 200)
  const thread = await asMark.json()
  assert.equal(thread.mailbox, 'steve@restorationdoctors.com')
  assert.equal(thread.messages.length, 2)
  assert.equal(thread.messages[0].body, 'Please send the invoice.')

  const missing = await worker.fetch(read('/api/thread?id=62', 'mark@flood.doctor'), env, {})
  assert.equal(missing.status, 404)

  const anonymous = await worker.fetch(new Request(`https://${UI_HOST}/api/thread?id=61`), env, {})
  assert.equal(anonymous.status, 403, 'an email chain must never be readable without an identity')
})

test('refuses an oversized or malformed thread rather than storing part of it', async () => {
  const db = new FakeD1Database()
  const env = settings(db)
  const refusals = [
    { threads: [{ item_id: 0, messages: [{ body: 'x' }] }] },
    { threads: [{ item_id: 71, messages: [] }] },
    { threads: [{ item_id: 72, messages: [{ body: 'x'.repeat(4001) }] }] },
    { threads: [{ item_id: 73, messages: Array.from({ length: 21 }, () => ({ body: 'x' })) }] },
    { threads: [{ item_id: 74, messages: [{ body: 'ok' }] }, { item_id: 74, messages: [{ body: 'dupe' }] }] },
  ]
  for (const body of refusals) {
    const response = await worker.fetch(publish('/api/sync/threads', body), env, {})
    assert.equal(response.status, 400, JSON.stringify(body).slice(0, 60))
  }
})

test('carries the note history, with its author and time, and refuses a malformed one', async () => {
  const db = new FakeD1Database()
  const env = settings(db)

  const notes = [
    { at: '2026-08-24', by: '', text: 'written before notes had an author' },
    { at: '2026-08-25T03:11:02+00:00', by: 'mark@flood.doctor', text: 'called the adjuster back' },
  ]
  const published = await worker.fetch(publish('/api/sync/snapshot', {
    items: [{ id: 91, title: 'Chase the Sedgwick invoice', note: 'called the adjuster back', notes }],
  }), env, {})
  assert.equal(published.status, 200)

  const board = await worker.fetch(read('/api/board'), env, {})
  const item = (await board.json()).items[0]
  assert.deepEqual(item.notes, notes)
  // An unattributed note is expected on older rows and must survive rather than be dropped.
  assert.equal(item.notes[0].by, '')
  assert.equal(item.notes[1].by, 'mark@flood.doctor')

  // A publisher that starts sending something unexpected here should fail loudly.
  const refusals = [
    { id: 92, title: 'x', notes: 'not an array' },
    { id: 93, title: 'x', notes: [{ at: '2026-08-25', by: 'mark@flood.doctor' }] },   // no text
    { id: 94, title: 'x', notes: [{ at: '2026-08-25', by: 12, text: 'ok' }] },
    { id: 95, title: 'x', notes: [{ at: '2026-08-25', by: '', text: 'x'.repeat(2001) }] },
    { id: 96, title: 'x', notes: Array.from({ length: 21 }, () => ({ at: '', by: '', text: 'x' })) },
  ]
  for (const item of refusals) {
    const response = await worker.fetch(publish('/api/sync/snapshot', { items: [item] }), env, {})
    assert.equal(response.status, 400, JSON.stringify(item).slice(0, 70))
  }
})

test('the board says which cards actually have an email chain', async () => {
  const db = new FakeD1Database()
  const env = settings(db)

  await worker.fetch(publish('/api/sync/snapshot', {
    items: [
      { id: 101, title: 'Made from an email' },
      { id: 102, title: 'Never came from an email' },
    ],
  }), env, {})
  await worker.fetch(publish('/api/sync/threads', {
    threads: [{ item_id: 101, subject: 'Re: claim', mailbox: 'steve@restorationdoctors.com',
                messages: [{ from: 'a@b.com', body: 'hello', truncated: false }] }],
  }), env, {})

  const payload = await (await worker.fetch(read('/api/board'), env, {})).json()
  // The UI hides "Open email" on anything absent here. It used to offer the button wherever a
  // link could be BUILT, which is not the same thing: a card whose mailbox could not be
  // resolved got a button whose only job was to say there was no source email.
  assert.deepEqual(payload.thread_ids, [101])
})
```


### `test/snapshot.test.js`

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import worker from '../src/index.js'
import { FakeD1Database } from './fake-d1.js'

const UI_HOST = 'aries.flood.doctor'
const SYNC_HOST = 'aries-publish.flood.doctor'
// Assert the original publisher contract independently of the added server metadata.
function legacyItems(items) {
  return items.map(({identity,quality,responsibility,financials,relationships,command_receipt,group_conflicts,...legacy})=>legacy)
}

function settings(db) {
  return {
    ALLOWED_EMAILS: 'dom@flood.doctor,mark@flood.doctor',
    PUBLISHER_TOKEN: 'test-publisher-token',
    STALE_AFTER_SECONDS: '300',
    DB: db,
  }
}

function uiRequest(path) {
  return new Request(`https://${UI_HOST}${path}`, {
    headers: { 'Cf-Access-Authenticated-User-Email': 'mark@flood.doctor' },
  })
}

function syncRequest(path, init = {}) {
  return new Request(`https://${SYNC_HOST}${path}`, {
    ...init,
    headers: {
      authorization: 'Bearer test-publisher-token',
      'content-type': 'application/json',
      ...init.headers,
    },
  })
}

test('publishes a curated snapshot and serves it to an authenticated teammate', async () => {
  const db = new FakeD1Database()
  const env = settings(db)
  const items = [{
    id: 41,
    title: 'Review carrier estimate',
    summary: 'Coverage decision is ready for review.',
    assignee: 'Mark',
    priority: 1,
    status: 'open',
    due: '2026-08-25',
    kind: 'claim',
    note: 'Confirm depreciation line.',
    updated: '2026-08-24T12:00:00Z',
    msg_id: 'must-not-leave-aries',
    account: 'must-not-leave-aries',
  }]

  const publish = await worker.fetch(syncRequest('/api/sync/snapshot', {
    method: 'POST',
    body: JSON.stringify({ items }),
  }), env, {})
  assert.equal(publish.status, 200)
  const published = await publish.json()
  assert.equal(published.ok, true)
  assert.equal(published.item_count, 1)
  assert.match(published.published_at, /^\d{4}-\d{2}-\d{2}T/)

  const board = await worker.fetch(uiRequest('/api/board'), env, {})
  assert.equal(board.status, 200)
  const payload = await board.json()
  assert.equal(payload.published_at, published.published_at)
  assert.equal(payload.stale.is_stale, false)
  assert.equal(payload.stale.after_seconds, 300)
  assert.deepEqual(legacyItems(payload.items), [{
    id: 41,
    title: 'Review carrier estimate',
    summary: 'Coverage decision is ready for review.',
    assignee: 'Mark',
    priority: 1,
    status: 'open',
    due: '2026-08-25',
    kind: 'claim',
    note: 'Confirm depreciation line.',
    updated: '2026-08-24T12:00:00Z',
  }])
  assert.equal(payload.items[0].responsibility.owner, 'Mark')
  assert.equal(payload.items[0].quality.status, 'unverified')
  assert.deepEqual(payload.items[0].financials, [])
  assert.equal(Object.hasOwn(payload.items[0], 'msg_id'), false)
  assert.equal(Object.hasOwn(payload.items[0], 'account'), false)
})

test('serves a stale last-known snapshot when Aries is offline', async () => {
  const db = new FakeD1Database()
  db.seedSnapshot([{ id: 7, title: 'Last-known assignment' }], '2026-01-01T00:00:00.000Z')

  const board = await worker.fetch(uiRequest('/api/board'), settings(db), {})
  assert.equal(board.status, 200)
  const payload = await board.json()
  assert.deepEqual(legacyItems(payload.items), [{ id: 7, title: 'Last-known assignment' }])
  assert.equal(payload.published_at, '2026-01-01T00:00:00.000Z')
  assert.equal(payload.stale.is_stale, true)
  assert.ok(payload.stale.age_seconds > 300)
})

test('rejects malformed snapshots without replacing the last-known board', async () => {
  const db = new FakeD1Database()
  db.seedSnapshot([{ id: 7, title: 'Keep me' }], '2026-08-24T00:00:00.000Z')

  const invalid = await worker.fetch(syncRequest('/api/sync/snapshot', {
    method: 'POST',
    body: JSON.stringify({ items: [{ id: 'not-a-number', title: '' }] }),
  }), settings(db), {})
  assert.equal(invalid.status, 400)

  const board = await worker.fetch(uiRequest('/api/board'), settings(db), {})
  const payload = await board.json()
  assert.deepEqual(legacyItems(payload.items), [{ id: 7, title: 'Keep me' }])
})

test('fails closed when a snapshot contains a personal item', async () => {
  const db = new FakeD1Database()
  const response = await worker.fetch(syncRequest('/api/sync/snapshot', {
    method: 'POST',
    body: JSON.stringify({ items: [{ id: 19, title: 'Private errand', kind: 'personal' }] }),
  }), settings(db), {})

  assert.equal(response.status, 400)
  assert.equal(db.snapshot, null)
})

test('rejects a curated snapshot before it can exceed the D1 row limit', async () => {
  const db = new FakeD1Database()
  const items = Array.from({ length: 1000 }, (_, index) => ({
    id: index + 1,
    title: `Item ${index + 1}`,
    summary: 's'.repeat(2000),
    note: 'n'.repeat(2000),
  }))
  const response = await worker.fetch(syncRequest('/api/sync/snapshot', {
    method: 'POST',
    body: JSON.stringify({ items }),
  }), settings(db), {})

  assert.equal(response.status, 400)
  assert.equal(db.snapshot, null)
})
```


### `test/sqlite-d1.js`

```js
// Real SQLite execution keeps delivery concurrency and migration tests independent of SQL mocks.
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'

export class SqliteD1 {
  constructor() {
    this.raw = new DatabaseSync(':memory:')
    this.raw.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))
  }
  prepare(sql) {
    const db = this.raw
    const statement = (values = []) => ({
      bind: (...args) => statement(args),
      async all() { return { results: db.prepare(sql).all(...values), success: true } },
      async first(column) { const row = db.prepare(sql).get(...values); return column && row ? row[column] : row || null },
      async run() { const r = db.prepare(sql).run(...values); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } } },
    })
    return statement()
  }
  async batch(statements) {
    this.raw.exec('BEGIN')
    try { const rows = []; for (const statement of statements) rows.push(await statement.run()); this.raw.exec('COMMIT'); return rows }
    catch (error) { this.raw.exec('ROLLBACK'); throw error }
  }
  close() { this.raw.close() }
}
```


### `test/team.test.js`

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import worker from '../src/index.js'
import { FakeD1Database } from './fake-d1.js'

// Frank, 09/29/2026: "if i want to change mark's name to Mike, I dont have a way to do that
// right now. If mark changes his email address, I want to be able to update it. User Settings
// tab." These cover the roster behind that tab and everything on the board that reads it.

const UI_HOST = 'aries.flood.doctor'
const SYNC_HOST = 'aries-publish.flood.doctor'
const OWNER = 'darakhshan.farough@gmail.com'

function settings(db) {
  return {
    ALLOWED_EMAILS: OWNER,
    ALLOWED_EMAIL_DOMAINS: 'flood.doctor,flooddoctorva.com,restorationdoctors.com',
    ACTIVITY_OWNER_EMAILS: OWNER,
    PUBLISHER_TOKEN: 'test-publisher-token',
    STALE_AFTER_SECONDS: '300',
    DB: db,
  }
}

function seeded() {
  const db = new FakeD1Database()
  db.seedTeam()
  db.seedSnapshot([{ id: 7, title: 'Call the carrier', assignee: 'mark', status: 'open' }], new Date().toISOString())
  return db
}

function as(email, path, init = {}) {
  return new Request(`https://${UI_HOST}${path}`, {
    ...init,
    headers: { 'Cf-Access-Authenticated-User-Email': email, ...(init.headers || {}) },
  })
}

function saveUser(email, body) {
  return as(email, '/api/team', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function boardAction(email, body) {
  return as(email, '/api/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function board(db, email = OWNER) {
  const response = await worker.fetch(as(email, '/api/board'), settings(db), {})
  assert.equal(response.status, 200)
  return response.json()
}

test('the user list is served to the owner and is a 404 for every other identity', async () => {
  const db = seeded()
  const owner = await worker.fetch(as(OWNER, '/api/team'), settings(db), {})
  assert.equal(owner.status, 200)
  const body = await owner.json()
  assert.deepEqual(body.team.map((member) => member.key), ['frank', 'mark', 'steve', 'shayan', 'katherine'])
  assert.equal(body.team[1].email, 'mark@flood.doctor')

  for (const email of ['mark@flood.doctor', 'frankd@flooddoctorva.com', 'outsider@example.com']) {
    const read = await worker.fetch(as(email, '/api/team'), settings(db), {})
    assert.equal(read.status, 404, email)
    const write = await worker.fetch(saveUser(email, { key: 'mark', name: 'Mike', email: 'mark@flood.doctor' }), settings(db), {})
    assert.equal(write.status, 404, email)
  }
  assert.equal(db.team.find((row) => row.key === 'mark').name, 'Mark')
  const put = await worker.fetch(as(OWNER, '/api/team', { method: 'PUT' }), settings(db), {})
  assert.equal(put.status, 405)
})

test('renaming Mark to Mike keeps his cards and renames him everywhere the board names him', async () => {
  const db = seeded()
  db.activity.push({
    id: 1, at: new Date().toISOString(), actor_email: OWNER, source: 'board', operation: 'assign',
    item_id: '7', value: 'mark', title: null, ip: null, country: null, user_agent: null,
  })
  const saved = await worker.fetch(saveUser(OWNER, { key: 'mark', name: 'Mike', email: 'mark@flood.doctor' }), settings(db), {})
  assert.equal(saved.status, 200)
  const body = await saved.json()
  assert.equal(body.changed, true)
  assert.equal(body.team.find((member) => member.key === 'mark').name, 'Mike')

  const payload = await board(db)
  assert.equal(payload.items[0].assignee, 'mark', 'the card still belongs to the same person')
  assert.deepEqual(payload.team.find((member) => member.key === 'mark'), { key: 'mark', name: 'Mike' })
  assert.equal(payload.items[0].history[0].what, 'assigned it to Mike')
  assert.equal(payload.team.some((member) => 'email' in member), false, 'staff get names, not the address book')

  assert.deepEqual(db.teamChanges.map(({ actor_email, user_key, field, old_value, new_value }) => ({ actor_email, user_key, field, old_value, new_value })), [
    { actor_email: OWNER, user_key: 'mark', field: 'name', old_value: 'Mark', new_value: 'Mike' },
  ])
})

test('changing an email keeps the old address as his, so his history and his To-Do access follow him', async () => {
  const db = seeded()
  db.activity.push({
    id: 1, at: new Date().toISOString(), actor_email: 'mark@flood.doctor', source: 'board', operation: 'done',
    item_id: '7', value: null, title: null, ip: null, country: null, user_agent: null,
  })
  const saved = await worker.fetch(saveUser(OWNER, { key: 'mark', name: 'Mike', email: 'Mike@Flood.Doctor ' }), settings(db), {})
  assert.equal(saved.status, 200)
  const mark = (await saved.json()).team.find((member) => member.key === 'mark')
  assert.equal(mark.email, 'mike@flood.doctor')
  assert.deepEqual(mark.past_emails, ['mark@flood.doctor'])

  const payload = await board(db)
  assert.equal(payload.items[0].history[0].who, 'Mike', 'an action under the old address names him')

  db.seedTodoCatalogue([{ id: 'task-0123456789abcd', text: 'Call the carrier' }], new Date().toISOString())
  const todo = (email, eventId) => as(email, '/api/todo/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      event_id: eventId, item_id: 'task-0123456789abcd', operation: 'toggle',
      payload: { done: true }, client_ts: '2026-09-30T12:00:00.000Z',
    }),
  })
  const fromNew = await worker.fetch(todo('mike@flood.doctor', 'ui-new-address'), settings(db), {})
  assert.equal(fromNew.status, 202)
  assert.equal((await fromNew.json()).operation.actor_name, 'Mike')
  const fromOld = await worker.fetch(todo('mark@flood.doctor', 'ui-old-address'), settings(db), {})
  assert.equal(fromOld.status, 202)
  const steve = await worker.fetch(todo('steve@restorationdoctors.com', 'ui-steve'), settings(db), {})
  assert.equal(steve.status, 403, 'the To-Do list keeps its three writers')

  // Changing it again pushes the newer old address to the front and never lists the current one.
  await worker.fetch(saveUser(OWNER, { key: 'mark', name: 'Mike', email: 'mark@flood.doctor' }), settings(db), {})
  const again = await (await worker.fetch(as(OWNER, '/api/team'), settings(db), {})).json()
  assert.deepEqual(again.team.find((member) => member.key === 'mark').past_emails, ['mike@flood.doctor'])
})

test('a bad name or address is refused with a message that says how to fix it', async () => {
  const db = seeded()
  const cases = [
    [{ key: 'mark', name: '', email: 'mark@flood.doctor' }, 400, /Enter a name/],
    [{ key: 'mark', name: '<b>Mike</b>', email: 'mark@flood.doctor' }, 400, /Enter a name/],
    [{ key: 'mark', name: 'M'.repeat(41), email: 'mark@flood.doctor' }, 400, /Enter a name/],
    [{ key: 'mark', name: 'Mike', email: 'mike' }, 400, /full email address/],
    [{ key: 'mark', name: 'Mike', email: 'mike@example.com' }, 400, /company address/],
    [{ key: 'mark', name: 'Mike', email: 'aries@flood.doctor' }, 400, /Aries sends from/],
    [{ key: 'mark', name: 'Mike', email: 'steve@restorationdoctors.com' }, 409, /Steve already uses steve@restorationdoctors.com/],
    [{ key: 'nobody', name: 'Mike', email: 'mike@flood.doctor' }, 404, /not on the list/],
    [{ name: 'Jose', email: 'steve@restorationdoctors.com' }, 409, /Steve already uses/],
  ]
  for (const [body, status, message] of cases) {
    const response = await worker.fetch(saveUser(OWNER, body), settings(db), {})
    assert.equal(response.status, status, JSON.stringify(body))
    assert.match((await response.json()).error, message, JSON.stringify(body))
  }
  const wrongType = await worker.fetch(as(OWNER, '/api/team', { method: 'POST', body: '{}' }), settings(db), {})
  assert.equal(wrongType.status, 415)
  assert.equal(db.teamChanges.length, 0)
  assert.equal(db.team.find((row) => row.key === 'mark').name, 'Mark')

  const unchanged = await worker.fetch(saveUser(OWNER, { key: 'mark', name: 'Mark', email: 'mark@flood.doctor' }), settings(db), {})
  assert.equal((await unchanged.json()).changed, false)
  assert.equal(db.teamChanges.length, 0)
})

test('a new user can be assigned, nudged and suggested by Aries straight away', async () => {
  const db = seeded()
  const added = await worker.fetch(saveUser(OWNER, { name: 'José García', email: 'jose@flood.doctor' }), settings(db), {})
  assert.equal(added.status, 201)
  const body = await added.json()
  assert.equal(body.key, 'jose')
  assert.deepEqual(body.team.at(-1), { key: 'jose', name: 'José García', email: 'jose@flood.doctor', past_emails: [] })

  const second = await (await worker.fetch(saveUser(OWNER, { name: 'Jose Lopez', email: 'jlopez@flood.doctor' }), settings(db), {})).json()
  assert.equal(second.key, 'joselopez', 'a taken first name adds the last name')
  const reserved = await (await worker.fetch(saveUser(OWNER, { name: 'Aries', email: 'ariesperson@flood.doctor' }), settings(db), {})).json()
  assert.equal(reserved.key, 'aries2', 'nobody becomes the Aries key')

  const assign = await worker.fetch(boardAction('dom@flood.doctor', { operation: 'assign', id: 7, value: 'jose' }), settings(db), {})
  assert.equal(assign.status, 202)
  const nudge = await worker.fetch(boardAction('dom@flood.doctor', { operation: 'nudge', id: 7, value: 'jose' }), settings(db), {})
  assert.equal(nudge.status, 202)
  const stranger = await worker.fetch(boardAction('dom@flood.doctor', { operation: 'assign', id: 7, value: 'bob' }), settings(db), {})
  assert.equal(stranger.status, 400)
  const nudgeAries = await worker.fetch(boardAction('dom@flood.doctor', { operation: 'nudge', id: 7, value: 'aries' }), settings(db), {})
  assert.equal(nudgeAries.status, 400)

  const brief = {
    needs: 'A reply to the adjuster.', next_step: 'José: call the adjuster.', waiting_on: '', client: '', claim: '',
    amount: '', deadline_note: '', phone: '', action: 'call', owner_hint: 'jose', waiting_since: '', deadline: '',
    counsel_only: false, last_ours: null, last_theirs: null, messages: 2, generated_at: '2026-09-30T12:00:00Z',
  }
  const published = await worker.fetch(new Request(`https://${SYNC_HOST}/api/sync/snapshot`, {
    method: 'POST',
    headers: { authorization: 'Bearer test-publisher-token', 'content-type': 'application/json' },
    body: JSON.stringify({ items: [{ id: 7, title: 'Call the carrier', assignee: 'jose', brief }] }),
  }), settings(db), {})
  assert.equal((await published.json()).briefs_dropped, 0)
  const payload = await board(db)
  assert.equal(payload.items[0].brief.owner_hint, 'jose')
  assert.equal(payload.team.at(-3).name, 'José García')
})

test('Aries reads the roster from the sync host with its token, and only with it', async () => {
  const db = seeded()
  await worker.fetch(saveUser(OWNER, { key: 'mark', name: 'Mike', email: 'mike@flood.doctor' }), settings(db), {})
  const synced = await worker.fetch(new Request(`https://${SYNC_HOST}/api/sync/team`, {
    headers: { authorization: 'Bearer test-publisher-token' },
  }), settings(db), {})
  assert.equal(synced.status, 200)
  const body = await synced.json()
  assert.deepEqual(body.team[1], { key: 'mark', name: 'Mike', email: 'mike@flood.doctor', past_emails: ['mark@flood.doctor'] })

  const anonymous = await worker.fetch(new Request(`https://${SYNC_HOST}/api/sync/team`), settings(db), {})
  assert.equal(anonymous.status, 401)
  const onUiHost = await worker.fetch(as('mark@flood.doctor', '/api/sync/team'), settings(db), {})
  assert.equal(onUiHost.status, 404)
})

test('before the roster table is seeded the board keeps today’s five people', async () => {
  const db = new FakeD1Database()
  db.seedSnapshot([{ id: 7, title: 'Call the carrier' }], new Date().toISOString())
  const payload = await board(db)
  assert.deepEqual(payload.team.map((member) => member.name), ['Frank', 'Mark', 'Steve', 'Shayan', 'Katherine'])
})

test('the page carries a User settings tab that only the owner is shown', async () => {
  const db = seeded()
  const page = await (await worker.fetch(as('mark@flood.doctor', '/'), settings(db), {})).text()
  assert.match(page, /<button id="show-users" type="button" aria-pressed="false" hidden>User settings<\/button>/)
  assert.match(page, /\/api\/team/)
  assert.equal((await board(db, 'mark@flood.doctor')).activity, false)
  assert.equal((await board(db)).activity, true)
})

// Frank, 09/29/2026: "i want to be able to assign a task to a teamate, and also assign it to
// aries so that aries can do some prep work for that teamate."
test('Aries can prep a card for its teammate while the teammate keeps it', async () => {
  const db = seeded()
  await worker.fetch(saveUser(OWNER, { key: 'mark', name: 'Mike', email: 'mark@flood.doctor' }), settings(db), {})
  const prep = await worker.fetch(boardAction('dom@flood.doctor', { operation: 'prep', id: 7, value: 'mark' }), settings(db), {})
  assert.equal(prep.status, 202)
  const queued = db.commands.at(-1)
  assert.deepEqual({ operation: queued.operation, value: queued.value, note: queued.note }, { operation: 'prep', value: 'mark', note: null })

  const payload = await board(db)
  assert.equal(payload.items[0].assignee, 'mark', 'the teammate still owns the card')
  assert.equal(payload.items[0].history[0].what, 'asked Aries to prep it for Mike')
  assert.equal(payload.items[0].history[0].who, 'Dom')

  for (const value of ['aries', 'bob', '', undefined]) {
    const refused = await worker.fetch(boardAction('dom@flood.doctor', { operation: 'prep', id: 7, value }), settings(db), {})
    assert.equal(refused.status, 400, String(value))
  }
})

test('the card carries a prep button next to the nudge', async () => {
  const db = seeded()
  const page = await (await worker.fetch(as('mark@flood.doctor', '/'), settings(db), {})).text()
  assert.match(page, /<div class="prep-row" hidden><button class="prep-button" data-action="prep" type="button"><\/button>/)
  assert.match(page, /operation: 'prep', id: item\.id, value: owner/)
})

// Frank, 09/29/2026: "createn an urgent button where I can mark a card Urgent and it appears at
// the top and it nudges the teamates that must do something asap".
test('Urgent is on or off, shows at once, and rides the snapshot', async () => {
  const db = seeded()
  const on = await worker.fetch(boardAction(OWNER, { operation: 'urgent', id: 7, value: 'on' }), settings(db), {})
  assert.equal(on.status, 202)
  let payload = await board(db)
  assert.equal(typeof payload.items[0].urgent, 'string', 'a queued urgent shows before Aries applies it')
  assert.equal(payload.items[0].history[0].what, 'marked it urgent')
  for (const value of ['yes', '', undefined, true]) {
    const refused = await worker.fetch(boardAction(OWNER, { operation: 'urgent', id: 7, value }), settings(db), {})
    assert.equal(refused.status, 400, String(value))
  }
  const off = await worker.fetch(boardAction(OWNER, { operation: 'urgent', id: 7, value: 'off' }), settings(db), {})
  assert.equal(off.status, 202)
  payload = await board(db)
  assert.equal('urgent' in payload.items[0], false)

  const published = await worker.fetch(new Request(`https://${SYNC_HOST}/api/sync/snapshot`, {
    method: 'POST',
    headers: { authorization: 'Bearer test-publisher-token', 'content-type': 'application/json' },
    body: JSON.stringify({ items: [{ id: 7, title: 'Call the carrier', urgent: '2026-09-30T09:00:00-04:00' }] }),
  }), settings(db), {})
  assert.equal(published.status, 200)
})

// Frank, 09/29/2026: "remove cards from the board that are snoozed so they dont clutter the
// board. brin them back after the snooz period".
test('a queued snooze marks the card snoozed so it leaves the board at once', async () => {
  const db = seeded()
  await worker.fetch(boardAction(OWNER, { operation: 'snooze', id: 7, value: '2099-01-02' }), settings(db), {})
  const payload = await board(db)
  assert.equal(payload.items[0].status, 'snoozed')
  assert.equal(payload.items[0].due, '2099-01-02')
  const page = await (await worker.fetch(as('mark@flood.doctor', '/'), settings(db), {})).text()
  assert.match(page, /function isResting\(item\)/)
  assert.match(page, /<details id="snoozed-list" class="snoozed-list" hidden>/)
})

// Frank, 09/30/2026: "the board cards are huge now. make them collapsobale and give each use a
// tab where they can see a list of ony the cards assigned to them".
test('the board says who is looking, so My cards can show only theirs', async () => {
  const db = seeded()
  assert.deepEqual((await board(db, 'mark@flood.doctor')).me, { key: 'mark', name: 'Mark' })
  assert.deepEqual((await board(db)).me, { key: 'frank', name: 'Frank' }, 'Frank signs in with his own address')
  const outside = await worker.fetch(as('newhire@flood.doctor', '/api/board'), settings(db), {})
  assert.equal((await outside.json()).me, null, 'someone not on the list gets no My cards tab')
  await worker.fetch(saveUser(OWNER, { key: 'mark', name: 'Mike', email: 'mike@flood.doctor' }), settings(db), {})
  assert.deepEqual((await board(db, 'mike@flood.doctor')).me, { key: 'mark', name: 'Mike' })
})

test('cards fold and the page carries the My cards tab', async () => {
  const db = seeded()
  const page = await (await worker.fetch(as('mark@flood.doctor', '/'), settings(db), {})).text()
  assert.match(page, /<button id="show-mine" type="button" aria-pressed="false" hidden>My cards<\/button>/)
  assert.match(page, /<button class="card-toggle" data-action="toggle" type="button" aria-expanded="false" aria-label="Show details">/)
  assert.match(page, /\.card\[data-collapsed="true"\]/)
  assert.match(page, /<button id="expand-all" class="refresh-button" type="button">Expand all<\/button>/)
})

// Frank, 09/30/2026: "add an URGENT action button to cards". It sits in the card header, so a
// folded card shows it too, and it is the only urgent control on the card.
test('the urgent button is in the card header', async () => {
  const db = seeded()
  const page = await (await worker.fetch(as('mark@flood.doctor', '/'), settings(db), {})).text()
  const header = page.slice(page.indexOf('<div class="card-top-right">'), page.indexOf('<h3></h3>'))
  assert.match(header, /<button class="urgent-toggle" data-action="urgent" type="button" aria-pressed="false">Mark urgent<\/button>/)
  const actions = page.slice(page.indexOf('<div class="actions">'), page.indexOf('<div class="choices"'))
  assert.doesNotMatch(actions, /urgent/, 'the action row no longer carries a second one')
  assert.doesNotMatch(page, /\.card\[data-collapsed="true"\] :is\([^)]*urgent/, 'folding never hides it')
})
```


### `test/todos.test.js`

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import worker from '../src/index.js'
import { FakeD1Database } from './fake-d1.js'

const UI_HOST = 'aries.flood.doctor'
const SYNC_HOST = 'aries-publish.flood.doctor'
const TASK_ID = 'task-0123456789abcd'
const ADDED_ID = 'task-fedcba98765432'

function settings(db, overrides = {}) {
  return {
    ALLOWED_EMAILS: 'darakhshan.farough@gmail.com,frankd@flooddoctorva.com,dom@flood.doctor,mark@flood.doctor',
    PUBLISHER_TOKEN: 'test-publisher-token',
    STALE_AFTER_SECONDS: '300',
    DB: db,
    ...overrides,
  }
}

function ui(path, init = {}, email = 'mark@flood.doctor') {
  return new Request(`https://${UI_HOST}${path}`, {
    ...init,
    headers: {
      'Cf-Access-Authenticated-User-Email': email,
      ...init.headers,
    },
  })
}

function sync(path, init = {}) {
  return new Request(`https://${SYNC_HOST}${path}`, {
    ...init,
    headers: {
      authorization: 'Bearer test-publisher-token',
      'content-type': 'application/json',
      ...init.headers,
    },
  })
}

function catalogueItem(overrides = {}) {
  return {
    id: TASK_ID,
    text: 'Confirm tomorrow\'s crew',
    details: 'Call before 4 PM.',
    client: 'Example Client',
    actionType: 'call',
    notificationDate: '2026-08-24',
    date: '2026-08-24',
    due: '2026-08-25',
    sourceUrl: 'https://mail.google.com/example',
    sourceMessageId: 'message-1',
    sourceAccount: 'shared@example.com',
    sourceRevision: 'rev-1',
    upstreamIds: ['gmail:message-1'],
    assignee: 'Dom',
    who: 'Shoghi',
    section: 'Today',
    seedDone: false,
    ...overrides,
  }
}

async function publishCatalogue(db, items = [catalogueItem()]) {
  return worker.fetch(sync('/api/sync/todos/catalogue', {
    method: 'POST',
    body: JSON.stringify({ items }),
  }), settings(db), {})
}

test('publishes the curated v2 catalogue and serves a stale-aware effective list', async () => {
  const db = new FakeD1Database()
  const source = catalogueItem({ localPath: '/private/fd-todos/items.json' })
  const publish = await publishCatalogue(db, [source])

  assert.equal(publish.status, 200)
  const published = await publish.json()
  assert.equal(published.ok, true)
  assert.equal(published.item_count, 1)
  assert.match(published.published_at, /^\d{4}-\d{2}-\d{2}T/)

  const response = await worker.fetch(ui('/api/todos'), settings(db), {})
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.published_at, published.published_at)
  assert.equal(payload.stale.is_stale, false)
  assert.equal(payload.sequence, 0)
  assert.deepEqual(payload.items, [{
    ...catalogueItem(),
    done: false,
    attachments: [],
    snoozedUntil: null,
    archived: false,
  }])
  assert.equal(Object.hasOwn(payload.items[0], 'localPath'), false)
})

test('keeps the last-known v2 list available when the Aries publisher is offline', async () => {
  const db = new FakeD1Database()
  db.seedTodoCatalogue([catalogueItem()], '2026-01-01T00:00:00.000Z')

  const response = await worker.fetch(ui('/api/todos'), settings(db), {})
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.items[0].id, TASK_ID)
  assert.equal(payload.published_at, '2026-01-01T00:00:00.000Z')
  assert.equal(payload.stale.is_stale, true)
  assert.ok(payload.stale.age_seconds > 300)
})

test('refuses empty, personal, duplicate, malformed, overlong, and oversized catalogue replacement', async () => {
  const invalidCatalogues = [
    [],
    [catalogueItem({ id: '1' })],
    [catalogueItem({ text: '' })],
    [catalogueItem({ seedDone: 'no' })],
    [catalogueItem(), catalogueItem({ text: 'duplicate' })],
    [catalogueItem({ kind: 'personal' })],
    [catalogueItem({ personal: true })],
    [catalogueItem({ text: 'x'.repeat(1001) })],
    [catalogueItem({ upstreamIds: Array.from({ length: 51 }, (_, index) => `source:${index}`) })],
  ]

  for (const items of invalidCatalogues) {
    const db = new FakeD1Database()
    db.seedTodoCatalogue([catalogueItem({ text: 'Keep me' })], '2026-08-24T00:00:00.000Z')
    const response = await publishCatalogue(db, items)
    assert.equal(response.status, 400, JSON.stringify(items).slice(0, 180))
    assert.equal(JSON.parse(db.todoCatalogue.catalogue_json).items[0].text, 'Keep me')
  }

  const db = new FakeD1Database()
  const tooLarge = Array.from({ length: 1000 }, (_, index) => catalogueItem({
    id: `task-${index.toString(16).padStart(14, '0')}`,
    text: `Task ${index} ${'x'.repeat(930)}`,
    details: 'd'.repeat(4000),
  }))
  const response = await publishCatalogue(db, tooLarge)
  assert.equal(response.status, 400)
  assert.equal(db.todoCatalogue, null)
})

test('maps the Access identity server-side and replays a durable UI action immediately', async () => {
  const db = new FakeD1Database()
  await publishCatalogue(db)
  const eventId = 'ui-0123456789abcdef'
  const clientTs = '2026-08-24T12:00:00.000Z'
  const action = await worker.fetch(ui('/api/todo/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      event_id: eventId,
      item_id: TASK_ID,
      operation: 'toggle',
      payload: { done: true },
      client_ts: clientTs,
    }),
  }), settings(db), {})

  assert.equal(action.status, 202)
  const saved = await action.json()
  assert.equal(saved.accepted, true)
  assert.equal(saved.operation.actor_email, 'mark@flood.doctor')
  assert.equal(saved.operation.actor_name, 'Mark')
  assert.equal(saved.operation.client_ts, clientTs)
  assert.equal(saved.operation.sequence, 1)

  const response = await worker.fetch(ui('/api/todos'), settings(db), {})
  const current = await response.json()
  assert.equal(current.items[0].done, true)
  assert.equal(current.sequence, 1)
})

test('accepts publisher operations idempotently and returns catalogue plus operations after a D1 sequence', async () => {
  const db = new FakeD1Database()
  await publishCatalogue(db)
  const operations = [
    {
      event_id: 'event-00000000000001',
      item_id: TASK_ID,
      operation: 'assign',
      payload: { assignee: 'Mark' },
      actor_email: 'aries@flood.doctor',
      actor_name: 'Aries',
      client_ts: '2026-08-24T12:01:00.000Z',
    },
    {
      event_id: 'event-00000000000002',
      item_id: TASK_ID,
      operation: 'snooze',
      payload: { until: '2026-08-27T13:00:00.000Z' },
      actor_email: 'aries@flood.doctor',
      actor_name: 'Aries',
      client_ts: '2026-08-24T12:02:00.000Z',
    },
  ]

  const first = await worker.fetch(sync('/api/sync/todos/operations', {
    method: 'POST',
    body: JSON.stringify({ operations }),
  }), settings(db), {})
  assert.equal(first.status, 200)
  assert.deepEqual(await first.json(), { ok: true, accepted: 2, existing: 0, last_sequence: 2 })

  const replay = await worker.fetch(sync('/api/sync/todos/operations', {
    method: 'POST',
    body: JSON.stringify({ operations }),
  }), settings(db), {})
  assert.deepEqual(await replay.json(), { ok: true, accepted: 0, existing: 2, last_sequence: 2 })

  const state = await worker.fetch(sync('/api/sync/todos/state?after=1'), settings(db), {})
  assert.equal(state.status, 200)
  const pulled = await state.json()
  assert.equal(pulled.catalogue.items[0].id, TASK_ID)
  assert.equal(pulled.catalogue_published_at, db.todoCatalogue.published_at)
  assert.equal(pulled.latest_sequence, 2)
  assert.equal(pulled.operations.length, 1)
  assert.deepEqual({
    sequence: pulled.operations[0].sequence,
    event_id: pulled.operations[0].event_id,
    operation: pulled.operations[0].operation,
    payload: pulled.operations[0].payload,
  }, {
    sequence: 2,
    event_id: 'event-00000000000002',
    operation: 'snooze',
    payload: { until: '2026-08-27T13:00:00.000Z' },
  })
})

test('replays edit, attach, detach, archive, add, and delete operations deterministically', async () => {
  const db = new FakeD1Database()
  await publishCatalogue(db)
  const operations = [
    ['edit', TASK_ID, { changes: { text: 'Updated task', details: 'Updated details' } }],
    ['attach', TASK_ID, { attachments: [{ id: 'att-1', kind: 'link', name: 'estimate.pdf', url: 'https://files.example/estimate.pdf' }] }],
    ['detach', TASK_ID, { attachmentIds: ['att-1'] }],
    ['archive', TASK_ID, { archived: true }],
    ['add', ADDED_ID, { item: catalogueItem({ id: ADDED_ID, text: 'Added in D1', seedDone: true }) }],
    ['delete', TASK_ID, {}],
  ].map(([operation, item_id, payload], index) => ({
    event_id: `event-${(index + 10).toString().padStart(14, '0')}`,
    item_id,
    operation,
    payload,
    actor_email: 'aries@flood.doctor',
    actor_name: 'Aries',
    client_ts: `2026-08-24T12:${String(index + 10).padStart(2, '0')}:00.000Z`,
  }))

  const save = await worker.fetch(sync('/api/sync/todos/operations', {
    method: 'POST',
    body: JSON.stringify({ operations }),
  }), settings(db), {})
  assert.equal(save.status, 200)

  const response = await worker.fetch(ui('/api/todos'), settings(db), {})
  const current = await response.json()
  assert.equal(current.items.length, 2)
  const deleted = current.items.find((item) => item.id === TASK_ID)
  const added = current.items.find((item) => item.id === ADDED_ID)
  assert.equal(deleted.text, 'Updated task')
  assert.equal(deleted.archived, true)
  assert.equal(added.text, 'Added in D1')
  assert.equal(added.done, true)
})

test('reopening a deleted task restores the native reducer archived state', async () => {
  const db = new FakeD1Database()
  await publishCatalogue(db)
  const operations = [
    ['delete', {}, 'event-delete'],
    ['toggle', { done: false }, 'event-reopen'],
  ].map(([operation, payload, event_id], index) => ({
    event_id,
    item_id: TASK_ID,
    operation,
    payload,
    actor_email: 'aries@flood.doctor',
    actor_name: 'Aries',
    client_ts: `2026-08-24T12:3${index}:00.000Z`,
  }))
  const save = await worker.fetch(sync('/api/sync/todos/operations', {
    method: 'POST', body: JSON.stringify({ operations }),
  }), settings(db), {})
  assert.equal(save.status, 200)

  const response = await worker.fetch(ui('/api/todos'), settings(db), {})
  const current = await response.json()
  assert.equal(current.items[0].done, false)
  assert.equal(current.items[0].archived, false)
})

test('preserves completion snapshots and revisions when the current catalogue no longer has the item', async () => {
  const db = new FakeD1Database()
  await publishCatalogue(db)
  const missingId = 'task-11111111111111'
  const save = await worker.fetch(sync('/api/sync/todos/operations', {
    method: 'POST',
    body: JSON.stringify({ operations: [{
      event_id: 'event-completion-snapshot',
      item_id: missingId,
      operation: 'toggle',
      payload: {
        done: true,
        sourceRevision: 7,
        item: {
          id: missingId,
          text: 'Completed historical task',
          details: 'Retained for checked-off history.',
          client: 'Example Client',
          actionType: 'needs_review',
          notificationDate: null,
          sourceUrl: null,
          due: null,
          assignee: 'mark',
          attachments: [],
          sourceRevision: 7,
          historyVisible: true,
        },
      },
      actor_email: 'aries@flood.doctor',
      actor_name: 'Aries',
      client_ts: '2026-08-24T12:20:00.000Z',
    }] }),
  }), settings(db), {})
  assert.equal(save.status, 200)

  const state = await worker.fetch(sync('/api/sync/todos/state?after=0'), settings(db), {})
  const pulled = await state.json()
  assert.equal(pulled.operations[0].payload.sourceRevision, 7)
  assert.equal(pulled.operations[0].payload.item.id, missingId)

  const response = await worker.fetch(ui('/api/todos'), settings(db), {})
  const current = await response.json()
  const historical = current.items.find((item) => item.id === missingId)
  assert.equal(historical.done, true)
  assert.equal(historical.historyVisible, true)
})

test('strictly rejects malformed action envelopes and per-verb payloads', async () => {
  const db = new FakeD1Database()
  await publishCatalogue(db)
  const base = {
    event_id: 'ui-0123456789abcdef',
    item_id: TASK_ID,
    operation: 'toggle',
    payload: { done: true },
    client_ts: '2026-08-24T12:00:00.000Z',
  }
  const invalid = [
    { ...base, extra: true },
    { ...base, event_id: 'spaces are invalid' },
    { ...base, item_id: 'task-short' },
    { ...base, operation: 'unknown' },
    { ...base, payload: { done: 'true' } },
    { ...base, operation: 'assign', payload: { assignee: 42 } },
    { ...base, operation: 'add', payload: { item: catalogueItem({ id: ADDED_ID }) } },
    { ...base, operation: 'edit', payload: { changes: {} } },
    { ...base, operation: 'attach', payload: { attachments: [{ id: 'a', kind: 'file', name: 'x', bytes: 'secret' }] } },
    { ...base, operation: 'detach', payload: { attachmentIds: [''] } },
    { ...base, operation: 'snooze', payload: { until: 'not-a-date' } },
    { ...base, operation: 'archive', payload: {} },
    { ...base, operation: 'delete', payload: { force: true } },
  ]

  for (const body of invalid) {
    const response = await worker.fetch(ui('/api/todo/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }), settings(db), {})
    assert.equal(response.status, 400, JSON.stringify(body).slice(0, 220))
  }

  const unknownActor = await worker.fetch(ui('/api/todo/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(base),
  }, 'newhire@flood.doctor'), settings(db, { ALLOWED_EMAILS: 'newhire@flood.doctor' }), {})
  assert.equal(unknownActor.status, 403)
})
```


### `test/ui.test.js`

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import worker from '../src/index.js'
import { FakeD1Database } from './fake-d1.js'

const env = {
  ALLOWED_EMAILS: 'dom@flood.doctor,mark@flood.doctor',
  PUBLISHER_TOKEN: 'test-publisher-token',
  STALE_AFTER_SECONDS: '300',
  DB: new FakeD1Database(),
}

function ui(headers = {}) {
  return new Request('https://aries.flood.doctor/', { headers })
}

test('serves the employee-safe interactive board only to an authenticated teammate', async () => {
  const unauthorized = await worker.fetch(ui(), env, {})
  assert.equal(unauthorized.status, 403)

  const response = await worker.fetch(ui({
    'Cf-Access-Authenticated-User-Email': 'mark@flood.doctor',
  }), env, {})
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /^text\/html/)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.match(response.headers.get('content-security-policy'), /default-src 'none'/)

  const html = await response.text()
  assert.match(html, /<h1[^>]*>\s*Aries\s*<\/h1>/)
  assert.match(html, /Operations board/)
  assert.match(html, />Board<\/button>/)
  assert.match(html, />To-Do<\/button>/)
  assert.match(html, /aria-live="polite"/)
  assert.match(html, /data-action="done"/)
  assert.match(html, /data-action="note"/)
  assert.match(html, /\/api\/board/)
  assert.match(html, /\/api\/action/)
  assert.match(html, /\/api\/todos/)
  assert.match(html, /\/api\/todo\/action/)
  for (const forbidden of ['gmail', 'knowledge', 'memory', 'raw state', '>Draft<', '>Ask<']) {
    assert.equal(html.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden)
  }

  const syncHost = await worker.fetch(new Request('https://aries-publish.flood.doctor/', {
    headers: { authorization: 'Bearer test-publisher-token' },
  }), env, {})
  assert.equal(syncHost.status, 404)
})

// The whole page is authored inside ONE JavaScript template literal, which means an escape
// sequence written with a single backslash is resolved when the module loads, not when the
// browser parses the page. A `\n` inside an inline-script string therefore arrives as a REAL
// newline, leaves that string unterminated, and takes down every script on the page — the
// board renders completely blank, and nothing on the server side looks wrong at all. That has
// now happened twice, so it gets a test rather than a comment.
test('the served page parses as JavaScript, so a stray escape cannot blank the board', async () => {
  const response = await worker.fetch(ui({ 'Cf-Access-Authenticated-User-Email': 'dom@flood.doctor' }), env, {})
  assert.equal(response.status, 200)
  const html = await response.text()

  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  assert.ok(scripts.length > 0, 'the page should carry its behaviour inline')
  for (const source of scripts) {
    // A syntax error anywhere in the module is what produces the blank page; constructing the
    // function is enough to surface it without running any of it.
    assert.doesNotThrow(() => new Function(source), 'inline script must parse')
  }

  // Belt: no single-quoted string may span a line break. new Function() catches the fatal case,
  // but this names the actual mistake if a future one slips through in a spot that still parses.
  for (const source of scripts) {
    const lines = source.split('\n')
    for (const [index, line] of lines.entries()) {
      if (line.trim().startsWith('//')) continue   // prose may contain an apostrophe
      const singles = (line.match(/(?<!\\)'/g) || []).length
      assert.equal(singles % 2, 0,
        `unbalanced quote at inline script line ${index + 1}: ${line.trim().slice(0, 90)}`)
    }
  }
})
```


### `test/upgrades-api.test.js`

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../src/index.js'
import { SqliteD1 } from './sqlite-d1.js'

const envFor = db => ({DB:db, ALLOWED_EMAILS:'reviewer@example.test', PUBLISHER_TOKEN:'test-only',MISSION_TOKEN:'test-mission-only',STALE_AFTER_SECONDS:'300'})
function call(db,path,{body,auth=true,host='aries.flood.doctor',bearer}={}) {
  return worker.fetch(new Request('https://'+host+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(auth?{'Cf-Access-Authenticated-User-Email':'reviewer@example.test'}:{}),...(bearer?{Authorization:'Bearer '+bearer}:{})},...(body?{body:JSON.stringify(body)}:{})}),envFor(db),{})
}

test('operational health requires identity and separates stale data from worker availability',async()=>{
  const db=new SqliteD1()
  assert.deepEqual(await (await call(db,'/healthz',{auth:false})).json(),{ok:true})
  const missing=await (await call(db,'/healthz')).json()
  assert.equal(missing.operational.status,'degraded')
  assert.ok(missing.operational.sources.every(s=>s.status==='unknown'))
  const now=new Date().toISOString()
  for(const [table,column] of [['board_snapshot','snapshot_json'],['todo_catalogue','catalogue_json'],['worklist_snapshot','worklist_json']]) db.raw.prepare(`INSERT INTO ${table} VALUES(1,?,?)`).run('{"items":[]}',now)
  const healthy=await (await call(db,'/healthz',{auth:false,bearer:'test-mission-only',host:'aries-publish.flood.doctor'})).json()
  assert.equal(healthy.operational.status,'healthy')
  db.raw.exec("UPDATE board_snapshot SET published_at='2000-01-01T00:00:00Z'")
  const stale=await (await call(db,'/healthz')).json()
  assert.equal(stale.operational.status,'degraded')
  assert.equal(stale.operational.sources.find(s=>s.name==='board').status,'stale')
  db.close()
})

test('board validates the actual stored email subject and keeps structured evidence',async()=>{
  const db=new SqliteD1()
  const now=new Date().toISOString()
  db.raw.prepare('INSERT INTO board_snapshot VALUES(1,?,?)').run(JSON.stringify({items:[{id:4342,title:'PetSmart promotional newsletter',assignee:'mark',identity:{claim_id:'CLAIM-42'},financials:[{type:'payment_issued',amount_minor:0,currency:'USD',source:'Carrier notice',date:'2026-10-10'}]}]}),now)
  db.raw.prepare('INSERT INTO board_threads VALUES(?,?,?)').run(4342,JSON.stringify({subject:'Work Authorisation routing',messages:[{body:'Review required'}]}),now)
  const result=await (await call(db,'/api/board')).json()
  const item=result.items[0]
  assert.ok(item.quality.issues.some(i=>i.code==='title_subject_mismatch'))
  assert.equal(item.financials[0].amount_minor,0)
  assert.equal(item.responsibility.owner,'mark')
  assert.equal(Object.hasOwn(item,'source_subject'),false)
  db.close()
})

test('retry endpoint requires teammate identity and explicit confirmation and records the actor',async()=>{
  const db=new SqliteD1()
  const now=new Date().toISOString()
  db.raw.prepare("INSERT INTO command_queue(operation,item_id,value,actor_email,state,created_at) VALUES('assign',81,'mark','original@example.test','failed',?)").run(now)
  assert.equal((await call(db,'/api/commands/1/retry',{auth:false,body:{confirm:true}})).status,403)
  assert.equal((await call(db,'/api/commands/1/retry',{body:{}})).status,400)
  const response=await call(db,'/api/commands/1/retry',{body:{confirm:true}})
  assert.equal(response.status,202)
  assert.equal((await response.json()).receipt.state,'queued')
  const history=db.raw.prepare("SELECT operation,actor_email,item_id,value FROM activity_log").get()
  assert.deepEqual({...history},{operation:'retry',actor_email:'reviewer@example.test',item_id:'81',value:'1'})
  assert.equal((await call(db,'/api/commands/1/retry',{body:{confirm:true}})).status,409)
  db.close()
})

test('authenticated publisher can claim and acknowledge through the HTTP contract',async()=>{
  const db=new SqliteD1()
  await call(db,'/api/action',{body:{operation:'assign',id:81,value:'mark'}})
  const opts={auth:false,host:'aries-publish.flood.doctor',bearer:'test-only'}
  const claim=await call(db,'/api/sync/commands',{...opts,body:{limit:1,lease_seconds:30}})
  assert.equal(claim.status,200)
  const [command]=(await claim.json()).commands
  assert.equal(command.attempt,1)
  assert.equal((await call(db,'/api/sync/commands/1/ack',{...opts,body:{status:'applied',lease_token:'wrong'}})).status,409)
  assert.equal((await call(db,'/api/sync/commands/1/ack',{...opts,body:{status:'applied',lease_token:command.lease_token}})).status,200)
  db.close()
})

test('bulk previews reject changed cards atomically without recording rejected actions',async()=>{
  const db=new SqliteD1()
  db.raw.prepare('INSERT INTO board_snapshot VALUES(1,?,?)').run(JSON.stringify({items:[{id:81,title:'Review claim',assignee:'frank',status:'open'}]}),'2026-01-01T00:00:00Z')
  const payload={operation:'assign',id:81,value:'mark',expected:{command_id:0,assignee:'frank',due:'',status:'open'}}
  const batch=db.batch.bind(db)
  db.batch=async statements=>{
    db.raw.prepare("INSERT INTO command_queue(operation,item_id,value,actor_email,created_at) VALUES('assign',81,'dan','other@example.test',?)").run(new Date().toISOString())
    db.batch=batch
    return batch(statements)
  }
  assert.equal((await call(db,'/api/action',{body:payload})).status,409)
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM command_queue').get().n,1)
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM activity_log').get().n,0)
  assert.equal((await call(db,'/api/action',{body:payload})).status,409)
  const board=await (await call(db,'/api/board')).json()
  assert.equal(board.items[0].assignee,'dan')
  const fresh={...payload,expected:{...payload.expected,command_id:1,assignee:'dan'}}
  assert.equal((await call(db,'/api/action',{body:fresh})).status,202)
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM activity_log').get().n,1)
  db.close()
})

test('applied assignment remains visible until a newer source snapshot arrives',async()=>{
  const db=new SqliteD1()
  db.raw.prepare('INSERT INTO board_snapshot VALUES(1,?,?)').run(JSON.stringify({items:[{id:81,title:'Review claim',assignee:'frank'}]}),'2026-01-01T00:00:00Z')
  db.raw.prepare("INSERT INTO command_queue(operation,item_id,value,actor_email,state,created_at,acked_at) VALUES('assign',81,'mark','reviewer@example.test','applied',?,?)").run('2026-10-01T00:00:00Z','2026-10-01T00:01:00Z')
  let board=await (await call(db,'/api/board')).json()
  assert.equal(board.items[0].assignee,'mark')
  assert.equal(board.items[0].responsibility.owner,'mark')
  assert.equal(board.items[0].pending,false)
  db.raw.exec("UPDATE board_snapshot SET published_at='2026-10-02T00:00:00Z'")
  board=await (await call(db,'/api/board')).json()
  assert.equal(board.items[0].assignee,'frank')
  db.close()
})

test('bulk preview is rejected when its prior command fails before the insert',async()=>{
  const db=new SqliteD1()
  db.raw.prepare('INSERT INTO board_snapshot VALUES(1,?,?)').run(JSON.stringify({items:[{id:81,title:'Review claim',assignee:'frank',status:'open'}]}),'2026-01-01T00:00:00Z')
  db.raw.exec("INSERT INTO command_queue(operation,item_id,value,actor_email,created_at) VALUES('assign',81,'mark','reviewer@example.test','2026-10-01T00:00:00Z')")
  const batch=db.batch.bind(db)
  db.batch=async statements=>{
    db.raw.exec("UPDATE command_queue SET state='failed' WHERE id=1")
    db.batch=batch
    return batch(statements)
  }
  const payload={operation:'assign',id:81,value:'steve',expected:{command_id:1,assignee:'mark',due:'',status:'open'}}
  assert.equal((await call(db,'/api/action',{body:payload})).status,409)
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM command_queue').get().n,1)
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM activity_log').get().n,0)
  db.close()
})

test('prepared output and document links are bounded and preserve only safe typed links',async()=>{
  const db=new SqliteD1(),now=new Date().toISOString()
  const attachments=[{filename:'Safe PDF',href:'https://example.test/report.pdf'},{name:'Unsafe',url:'javascript:alert(1)'},{name:'Credentials',url:'https://name:password@example.test/file'}]
  db.raw.prepare('INSERT INTO board_snapshot VALUES(1,?,?)').run(JSON.stringify({items:[{id:81,title:'Claim documents',attachments,prep:{status:'ready',at:now,output:'x'.repeat(7000),attachments}}]}),now)
  const board=await (await call(db,'/api/board')).json()
  assert.equal(board.items[0].prep.output.length,6000)
  assert.deepEqual(board.items[0].attachments,[{name:'Safe PDF',url:'https://example.test/report.pdf'}])
  assert.deepEqual(board.items[0].prep.attachments,board.items[0].attachments)
  db.close()
})
```


### `.gitignore`

```
node_modules/
.wrangler/
.dev.vars*
.env*
wrangler.jsonc

secrets.json
credentials.local
```


### `DEPLOY-SOURCE.md`

```markdown
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
```


### `README.md`

````markdown
# Aries Cloud Operations Board

Employee-safe, last-known Aries board and shared Aries To-Do v2 on Cloudflare Workers + D1. The UI remains readable when `aries.local` is offline. Board actions wait durably for Aries; To-Do actions append immediately to the authoritative D1 operation log for Aries to sync.

## Boundaries

- `aries.flood.doctor` is the UI host. Cloudflare Access must protect it. The Worker independently requires an exact `Cf-Access-Authenticated-User-Email` match from `ALLOWED_EMAILS` for `/`, `/api/board`, `/api/action`, `/api/todos`, and `/api/todo/action`.
- `aries-publish.flood.doctor` is the machine host. It exposes only the sync routes below and requires `Authorization: Bearer $PUBLISHER_TOKEN`.
- `GET /healthz` is public and returns only `{"ok":true}` on either configured host. Every other host returns 404.
- `workers.dev` and preview URLs are disabled. The publisher token is a Wrangler secret, never a config value.

## Deploy

```sh
cp wrangler.template.jsonc wrangler.jsonc
# Replace the D1 ID and exact employee email list in wrangler.jsonc.
npm install
npx wrangler d1 execute aries-cloud-dashboard --remote --file=schema.sql
npx wrangler secret put PUBLISHER_TOKEN
npx wrangler deploy
```

Apply Cloudflare Access to `aries.flood.doctor` with the same exact email membership configured in `ALLOWED_EMAILS`. Do not add Access identity headers at another proxy or origin.

## Sync contract

All sync requests use host `aries-publish.flood.doctor` and the bearer token.

### Publish the current curated board

`POST /api/sync/snapshot`

```json
{
  "items": [
    {
      "id": 41,
      "title": "Review carrier estimate",
      "summary": "Coverage decision is ready for review.",
      "assignee": "Mark",
      "priority": 1,
      "status": "open",
      "due": "2026-08-25",
      "kind": "claim",
      "note": "Confirm depreciation line.",
      "updated": "2026-08-24T12:00:00Z"
    }
  ]
}
```

Only `id,title,summary,assignee,priority,status,due,kind,note,updated` survive. A positive integer `id` and nonempty `title` are required; duplicate IDs, malformed items, more than 1,000 items, a curated payload over 1.8 MB, or `kind: personal` reject the entire publish. The Worker assigns `published_at` and returns:

```json
{"ok":true,"published_at":"2026-08-24T12:01:00.000Z","item_count":1}
```

### Pull pending teammate commands

`GET /api/sync/commands?limit=50` (`limit` is 1–100, default 50)

```json
{
  "commands": [
    {
      "id": 9,
      "operation": "note",
      "item_id": 41,
      "note": "Carrier called back.",
      "actor_email": "mark@flood.doctor",
      "created_at": "2026-08-24T12:03:00.000Z"
    }
  ],
  "count": 1
}
```

The feed is at-least-once until acknowledgement. Apply commands idempotently by command `id`.

### Acknowledge a command

`POST /api/sync/commands/:id/ack`

```json
{"status":"applied","detail":"board updated"}
```

`status` is exactly `applied` or `failed`; `detail` is optional and capped at 2,000 characters. Acknowledgement is one-time and removes the command from the pending feed.

## Aries To-Do v2 contract

D1 stores one current catalogue plus an append-only operation log. It is authoritative for shared team changes; the publisher synchronizes the local `~/fd-todos` materialization without publishing legacy personal `todos.md` content. File bytes never enter D1. Attachment operations carry metadata only.

### Publish the current catalogue

`POST /api/sync/todos/catalogue`

```json
{
  "items": [
    {
      "id": "task-0123456789abcd",
      "text": "Confirm tomorrow's crew",
      "details": "Call before 4 PM.",
      "client": "Example Client",
      "actionType": "call",
      "notificationDate": "2026-08-24",
      "date": "2026-08-24",
      "due": "2026-08-25",
      "sourceUrl": "https://mail.google.com/example",
      "sourceMessageId": "message-1",
      "sourceAccount": "shared@example.com",
      "sourceRevision": "rev-1",
      "upstreamIds": ["gmail:message-1"],
      "assignee": "Dom",
      "who": "Shoghi",
      "section": "Today",
      "seedDone": false
    }
  ]
}
```

The Worker accepts only task IDs matching `task-[0-9a-f]{14}`, curates the documented fields, rejects an empty replacement, duplicate IDs, explicit personal/private rows, malformed fields, more than 1,000 items, or a catalogue over 1.8 MB. A successful publish replaces only the catalogue; the operation log remains append-only.

### Append local operations

`POST /api/sync/todos/operations`

```json
{
  "operations": [
    {
      "event_id": "event-00000000000001",
      "item_id": "task-0123456789abcd",
      "operation": "assign",
      "payload": {"assignee": "Mark"},
      "actor_email": "aries@flood.doctor",
      "actor_name": "Aries",
      "client_ts": "2026-08-24T12:01:00.000Z"
    }
  ]
}
```

`event_id` is unique. Replays are ignored idempotently and reported as `existing`; new rows receive an increasing D1 `sequence` and Worker-owned `server_ts`. Batches contain 1–100 operations and are capped at 512 KB. Supported verbs are `toggle`, `assign`, `add`, `edit`, `attach`, `detach`, `snooze`, `archive`, and `delete`, each with a strict payload shape.

Completion toggles may retain the bounded `sourceRevision` and checked-off item snapshot needed for history after a catalogue refresh. `attach` uses `{attachments:[...]}` and `detach` uses `{attachmentIds:[...]}`; only validated link/file metadata is stored in D1, never attachment bytes.

### Pull D1 state

`GET /api/sync/todos/state?after=0`

Returns the full current `catalogue`, `catalogue_published_at`, operations with `sequence > after` in sequence order, and `latest_sequence`. `after` must be a nonnegative D1 sequence. Aries can rebuild from the full catalogue and then apply only operations after its durable cursor.

### Browser To-Do API

- `GET /api/todos` replays the catalogue and all D1 operations and returns `{items,published_at,sequence,stale}`. Last-known items remain readable if the Aries publisher is offline.
- `POST /api/todo/action` accepts exactly `{event_id,item_id,operation,payload,client_ts}`. Actor email comes from the verified Cloudflare Access header and actor name is mapped server-side for the known roster. The action is durable and visible in the effective list immediately.
- The Board/To-Do switch exposes toggle, assign, add, and snooze. The API also validates edit, attach/detach metadata, archive, and delete operations.

## Browser contract

### Card-specific completion links

Use `https://aries.flood.doctor/card?id=41` for an email's card button, replacing `41`
with the verified board ID. The URL contains no token, email address, or completion command.
The existing Cloudflare Access sign-in applies. GET (including email scanners, previews,
refresh, and Back/Forward) only reads the title and current state. The user must press
**Confirm mark done** before the browser sends a same-origin authenticated JSON POST.

- `GET /card?id=41` serves the confirmation view; `GET /api/card?id=41` reads its current card.
- `POST /api/card/done` accepts exactly `{id,revision}` from that read. Actor/time are server
  stamped. A changed card requires another review; missing/removed cards cannot be closed.
- Repeated or simultaneous confirmations are idempotent, including a retry after a lost
  response. A later explicit reopen permits another completion after a fresh review.
- The existing durable command queue remains the sync mechanism. Board reads immediately
  fold in queued Done/Reopen/Delete changes and acknowledged changes newer than the snapshot.
  The completion page says the action is saved for Aries to sync; it does not claim that
  the workstation has already applied it.
- No schema, credentials, Access policy, routing domains, or bindings change is needed.

Verify with `npm test` and `npx wrangler deploy --dry-run --config wrangler.template.jsonc`.
Deployment must use the existing private deployment configuration, never the placeholder
template. Record the current Worker version immediately before deploy for rollback.

- `GET /api/board` returns `{items,published_at,stale:{is_stale,age_seconds,after_seconds}}`. A missing first snapshot is a stale empty board; a stopped publisher leaves the last-known snapshot available.
- `POST /api/action` accepts only `{operation:"done",id}` or `{operation:"note",id,note}`. It records the authenticated actor and returns `202` after the command is durable. Every other operation is rejected.

Run `npm test` for real request-routing tests backed by an in-memory D1-compatible fake.

Mission answers (C33): `/api/mission/answer` accepts same-origin JSON choice/text writes using the existing allowed Cloudflare Access email. `/api/mission/answers` reads that email's state. Apply additive migration `0011_mission_answers.sql` before deploying; rollback commands are in `ROLLBACK.md`. Text writes accept an optional `request_id` for safe retries. The publisher host's token-authenticated POST `/api/mission/answers` accepts `{"mode":"new"}` (atomic receive) or `{"mode":"all"}` (read only). `mission answers --new` emits one JSON line per newly received answer; `mission answers --all` emits all answers without changing receipt. “Received” means collected by the poller, not task completion.
````


### `ROLLBACK.md`

````markdown
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
````


### `deploy-guard.sh`

```bash
#!/bin/bash
# Refuses to deploy unless the deployable source here is identical to origin/main of
# FrankDark007/aries-cloud-dashboard, the only deploy source for the aries.flood.doctor Worker.
# Set ARIES_DASHBOARD_GUARD_OFF=1 to skip (recorded in the output). Undo: see DEPLOY-SOURCE.md.
set -u
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH
HERE="$(cd "$(dirname "$0")" && pwd)"
if [ "${ARIES_DASHBOARD_GUARD_OFF:-}" = 1 ]; then echo "deploy-guard: SKIPPED by ARIES_DASHBOARD_GUARD_OFF=1"; exit 0; fi
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
if ! git clone -q --depth 1 https://github.com/FrankDark007/aries-cloud-dashboard.git "$TMP/o" 2>"$TMP/err"; then
  echo "deploy-guard: cannot fetch origin/main of aries-cloud-dashboard, refusing to deploy"; cat "$TMP/err" | head -3; exit 1
fi
bad=0
for p in src migrations schema.sql package.json tsconfig.json; do
  if ! diff -rq "$TMP/o/$p" "$HERE/$p" >"$TMP/d" 2>&1; then echo "deploy-guard: $p differs from origin/main:"; head -5 "$TMP/d"; bad=1; fi
done
if [ $bad = 1 ]; then
  echo "deploy-guard: REFUSED. Deploy only from a checkout of FrankDark007/aries-cloud-dashboard at origin/main ($(git -C "$TMP/o" rev-parse --short HEAD))."
  exit 1
fi
echo "deploy-guard: source matches aries-cloud-dashboard origin/main $(git -C "$TMP/o" rev-parse --short HEAD)"
```
