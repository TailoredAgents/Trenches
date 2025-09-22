import argparse
import json
import sqlite3
from pathlib import Path

import numpy as np


def load_contexts(db_path: Path, limit: int = 10000):
    conn = sqlite3.connect(str(db_path))
    cur = conn.cursor()
    # Read order_plan events as context-proxy features
    cur.execute("SELECT payload FROM events WHERE event_type = 'order_plan' ORDER BY created_at DESC LIMIT ?", (limit,))
    xs = []
    ys = []
    for (payload,) in cur.fetchall():
        try:
            evt = json.loads(payload)
            plan = evt.get('plan', {})
            x = [
                float(plan.get('sizeSol', 0.0)),
                float(plan.get('slippageBps', 0)),
                float(plan.get('jitoTipLamports', 0)),
            ]
            xs.append(x)
            # Placeholder label (no reward yet) – set to 0
            ys.append(0.0)
        except Exception:
            pass
    cur.close()
    conn.close()
    if not xs:
        xs = [[0.0, 0.0, 0.0]]
        ys = [0.0]
    return np.array(xs, dtype=np.float32), np.array(ys, dtype=np.float32)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', type=Path, default=Path('../../data/trenches.db'))
    parser.add_argument('--out', type=Path, default=Path('./artifacts/policy.onnx'))
    parser.add_argument('--limit', type=int, default=10000)
    args = parser.parse_args()

    X, Y = load_contexts(args.db, args.limit)
    args.out.parent.mkdir(parents=True, exist_ok=True)

    # Placeholder: Export a dummy ONNX linear model equivalent
    # Real implementation would use d3rlpy IQL/CQL to train and export ONNX
    # For now, write a small JSON metadata file side-by-side to indicate scaffold
    meta = {
        'shape': list(X.shape),
        'labels': list(Y.shape),
        'note': 'This is a scaffold; replace with d3rlpy training and ONNX export.'
    }
    args.out.with_suffix('.json').write_text(json.dumps(meta, indent=2))
    print(f'Wrote scaffold metadata near {args.out}')


if __name__ == '__main__':
    main()

