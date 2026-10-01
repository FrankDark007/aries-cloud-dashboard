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
