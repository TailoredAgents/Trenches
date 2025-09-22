from pathlib import Path
text = Path(r"services/narrative-miner/src/harness.ts").read_text()
err_index = next((i for i, ch in enumerate(text) if not (32 <= ord(ch) <= 126 or ch in '\n\r\t')), None)
print(err_index)
print(repr(text[err_index-20:err_index+20]))
