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
