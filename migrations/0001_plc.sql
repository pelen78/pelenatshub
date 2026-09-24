-- Private PLC records stay in D1; never publish them as repository assets.
CREATE TABLE IF NOT EXISTS plc_entries (
  owner TEXT NOT NULL,
  id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner, id)
);
