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
