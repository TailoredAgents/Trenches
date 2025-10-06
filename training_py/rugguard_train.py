import json
from pathlib import Path
from datetime import datetime

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import precision_recall_fscore_support

from util_ds import get_rugguard_dataset


def main() -> None:
    out_dir = Path('models')
    out_dir.mkdir(exist_ok=True)
    X, y, feats = get_rugguard_dataset(days=14)
    result = {
        'version': 2,
        'created': datetime.utcnow().isoformat() + 'Z',
        'features': feats,
        'metrics': {},
        'model': {},
        'status': 'ok'
    }
    if X.empty or y.empty:
        result['status'] = 'no_data'
        (out_dir / 'rugguard_v2.json').write_text(json.dumps(result, indent=2))
        print('rugguard: no_data')
        return

    Xn = X.to_numpy(dtype=float)
    yn = y.to_numpy(dtype=int)
    clf = LogisticRegression(max_iter=200, penalty='l2', solver='lbfgs')
    clf.fit(Xn, yn)
    p = clf.predict_proba(Xn)[:, 1]
    thresh = 0.5
    pred = (p >= thresh).astype(int)
    prec, rec, f1, _ = precision_recall_fscore_support(yn, pred, average='binary', zero_division=0)
    result['metrics'] = {'precision': float(prec), 'recall': float(rec), 'f1': float(f1), 'threshold': thresh}
    result['model'] = {'coef': clf.coef_.tolist(), 'intercept': clf.intercept_.tolist(), 'threshold': thresh}

    (out_dir / 'rugguard_v2.json').write_text(json.dumps(result, indent=2))
    print('rugguard:', json.dumps(result['metrics']))


if __name__ == '__main__':
    main()

