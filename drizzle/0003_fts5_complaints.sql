-- FTS5 index over complaints, kept in sync with triggers.
CREATE VIRTUAL TABLE IF NOT EXISTS complaints_fts USING fts5(
  title,
  body,
  content='complaints',
  content_rowid='id',
  tokenize='porter unicode61'
);
--> statement-breakpoint
INSERT INTO complaints_fts(rowid, title, body)
  SELECT id, title, body FROM complaints;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS complaints_fts_ai AFTER INSERT ON complaints BEGIN
  INSERT INTO complaints_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS complaints_fts_ad AFTER DELETE ON complaints BEGIN
  INSERT INTO complaints_fts(complaints_fts, rowid, title, body)
    VALUES ('delete', old.id, old.title, old.body);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS complaints_fts_au AFTER UPDATE OF title, body ON complaints BEGIN
  INSERT INTO complaints_fts(complaints_fts, rowid, title, body)
    VALUES ('delete', old.id, old.title, old.body);
  INSERT INTO complaints_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;
