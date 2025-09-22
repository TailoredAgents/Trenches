from pathlib import Path
text = Path(r"packages/persistence/src/sqlite.ts").read_text()
start = text.index("INSERT INTO migrations")
print(repr(text[start:start+80]))
