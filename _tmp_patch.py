from pathlib import Path
path = Path(r"packages/persistence/src/sqlite.ts")
text = path.read_text()
target = "  const insertStmt = instance.prepare(\"INSERT INTO migrations (id, applied_at) VALUES (?, CURRENT_TIMESTAMP)\");"
if target not in text:
    raise SystemExit('target not found for logging')
replacement = target + "\n\n  console.log('[persistence] migration insert sql', insertStmt.source);"
path.write_text(text.replace(target, replacement, 1))
