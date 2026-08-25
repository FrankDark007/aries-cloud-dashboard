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
                  'useful', 'not_useful')
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

CREATE INDEX IF NOT EXISTS command_queue_pending_idx
  ON command_queue (state, id);

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
