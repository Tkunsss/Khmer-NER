CREATE TABLE annotation_progress (
  doc_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  row_position INTEGER NOT NULL CHECK (row_position > 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (doc_id, username),
  FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE,
  FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
);
