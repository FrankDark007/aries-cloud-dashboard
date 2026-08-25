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
