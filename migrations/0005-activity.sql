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
