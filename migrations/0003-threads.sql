CREATE TABLE IF NOT EXISTS board_threads (
  item_id INTEGER PRIMARY KEY CHECK (item_id > 0),
  thread_json TEXT NOT NULL,
  published_at TEXT NOT NULL
);
