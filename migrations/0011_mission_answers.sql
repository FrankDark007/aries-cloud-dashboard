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
