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

- `GET /api/board` returns `{items,published_at,stale:{is_stale,age_seconds,after_seconds}}`. A missing first snapshot is a stale empty board; a stopped publisher leaves the last-known snapshot available.
- `POST /api/action` accepts only `{operation:"done",id}` or `{operation:"note",id,note}`. It records the authenticated actor and returns `202` after the command is durable. Every other operation is rejected.

Run `npm test` for real request-routing tests backed by an in-memory D1-compatible fake.
