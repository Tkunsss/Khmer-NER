CREATE TABLE users (
  username TEXT PRIMARY KEY COLLATE NOCASE,
  pass TEXT NOT NULL,
  user_role TEXT NOT NULL CHECK (user_role IN ('admin', 'annotator'))
);

CREATE TABLE labels (
  name TEXT PRIMARY KEY COLLATE NOCASE,
  color TEXT NOT NULL
);

CREATE TABLE docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body_key TEXT NOT NULL UNIQUE,
  byte_count INTEGER NOT NULL,
  row_count INTEGER NOT NULL,
  assignee TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  review TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (assignee) REFERENCES users(username) ON DELETE SET NULL
);

CREATE INDEX docs_assignee_idx ON docs(assignee);

CREATE TABLE doc_assignments (
  doc_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  PRIMARY KEY (doc_id, username),
  FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE,
  FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
);

CREATE TABLE row_assignments (
  doc_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  row_start INTEGER NOT NULL,
  row_end INTEGER NOT NULL,
  PRIMARY KEY (doc_id, username, row_start, row_end),
  FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE,
  FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
);

CREATE INDEX row_assignments_lookup
  ON row_assignments(doc_id, username, row_start, row_end);

CREATE TABLE anns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER NOT NULL,
  s INTEGER NOT NULL,
  e INTEGER NOT NULL,
  label TEXT NOT NULL,
  author TEXT,
  FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE,
  FOREIGN KEY (label) REFERENCES labels(name)
);

CREATE INDEX anns_doc_offset_idx ON anns(doc_id, s);

CREATE TABLE import_chunks (
  upload_id TEXT NOT NULL,
  username TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  byte_count INTEGER NOT NULL,
  line_break_count INTEGER NOT NULL,
  starts_with_lf INTEGER NOT NULL,
  ends_with_cr INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (upload_id, username, chunk_index),
  FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
);

CREATE INDEX import_chunks_created_at ON import_chunks(created_at);
