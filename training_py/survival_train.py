import json
from pathlib import Path
from datetime import datetime

import numpy as np
import pandas as pd

from util_ds import get_survival_dataset


def main() -> None:
    out_dir = Path('models')
    out_dir.mkdir(exist_ok=True)
    df = get_survival_dataset(days=14)
    result = {
        'version': 1,
        'created': datetime.utcnow().isoformat() + 'Z',
        'metrics': {},
        'params': {},
        'status': 'ok'
    }
    if df.empty:
        result['status'] = 'no_data'
        (out_dir / 'survival_v1.json').write_text(json.dumps(result, indent=2))
        print('survival: no_data')
        return

    # Expect columns: exit_bps, drawdown_bps, time_to_peak_ms (placeholders)
    exit_bps = df['exit_bps'] if 'exit_bps' in df.columns else pd.Series([0])
    draw_bps = df['drawdown_bps'] if 'drawdown_bps' in df.columns else pd.Series([0])
    base_trail_bps = max(60, int(np.percentile(draw_bps, 75)))
    tighten = 0.65
    result['params'] = {
        'baseTrailBps': int(base_trail_bps),
        'minTrailBps': int(max(30, base_trail_bps // 2)),
        'maxTrailBps': int(max(200, base_trail_bps * 2)),
        'hazardTighten': tighten,
        'hazardPanic': 0.85,
    }
    result['metrics'] = {
        'exit_bps_avg': float(np.mean(exit_bps)),
        'drawdown_bps_avg': float(np.mean(draw_bps)),
    }

    (out_dir / 'survival_v1.json').write_text(json.dumps(result, indent=2))
    print('survival:', json.dumps(result['metrics']))


if __name__ == '__main__':
    main()

