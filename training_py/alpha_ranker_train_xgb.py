import json
from pathlib import Path
from datetime import datetime

import numpy as np
import optuna
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import TimeSeriesSplit
import xgboost as xgb

from util_ds import get_alpha_dataset
from gpu_util import prefer_gpu, device_params, print_device


def _objective(trial, X, y, device_conf):
    params = dict(device_conf)
    params.update({
        'max_depth': trial.suggest_int('max_depth', 3, 8),
        'eta': trial.suggest_float('eta', 0.02, 0.3, log=True),
        'subsample': trial.suggest_float('subsample', 0.6, 1.0),
        'colsample_bytree': trial.suggest_float('colsample_bytree', 0.6, 1.0),
        'n_estimators': 700,
    })
    model = xgb.XGBClassifier(**params)
    tscv = TimeSeriesSplit(n_splits=3)
    aucs = []
    for tr, va in tscv.split(X):
        model.fit(X[tr], y[tr], eval_set=[(X[va], y[va])], verbose=False)
        p = model.predict_proba(X[va])[:, 1]
        aucs.append(roc_auc_score(y[va], p))
    return -float(np.mean(aucs))


def main() -> None:
    out_dir = Path('models')
    out_dir.mkdir(exist_ok=True)
    X, y10, y60, feats = get_alpha_dataset(days=14)
    base = dict(objective='binary:logistic')
    is_gpu = prefer_gpu()
    device_conf = device_params(is_gpu, base, cpu_threads=2)
    print_device(is_gpu)
    result = {
        'version': 1,
        'created': datetime.utcnow().isoformat() + 'Z',
        'device': device_conf['device'],
        'features': feats,
        'metrics': {},
        'models': {},
        'status': 'ok'
    }
    if X.empty or y10.empty or y60.empty:
        result['status'] = 'no_data'
        (out_dir / 'alpha_ranker_v1.json').write_text(json.dumps(result, indent=2))
        print('alpha_ranker: no_data')
        return

    Xn = X.to_numpy(dtype=float)

    # 10m
    s10 = optuna.create_study(direction='minimize')
    s10.optimize(lambda t: _objective(t, Xn, y10.to_numpy(dtype=float), device_conf), n_trials=20, show_progress_bar=False)
    p10 = s10.best_params
    clf10 = xgb.XGBClassifier(
        max_depth=p10['max_depth'],
        eta=p10['eta'],
        subsample=p10['subsample'],
        colsample_bytree=p10['colsample_bytree'],
        n_estimators=800,
    )
    clf10.set_params(**device_conf)
    clf10.fit(Xn, y10.to_numpy(dtype=float))
    auc10 = float(roc_auc_score(y10, clf10.predict_proba(Xn)[:, 1]))
    result['metrics']['auc_10m'] = auc10
    result['models']['m10'] = {'xgb_params': p10}

    # 60m
    s60 = optuna.create_study(direction='minimize')
    s60.optimize(lambda t: _objective(t, Xn, y60.to_numpy(dtype=float), device_conf), n_trials=20, show_progress_bar=False)
    p60 = s60.best_params
    clf60 = xgb.XGBClassifier(
        max_depth=p60['max_depth'],
        eta=p60['eta'],
        subsample=p60['subsample'],
        colsample_bytree=p60['colsample_bytree'],
        n_estimators=800,
    )
    clf60.set_params(**device_conf)
    clf60.fit(Xn, y60.to_numpy(dtype=float))
    auc60 = float(roc_auc_score(y60, clf60.predict_proba(Xn)[:, 1]))
    result['metrics']['auc_60m'] = auc60
    result['models']['m60'] = {'xgb_params': p60}

    (out_dir / 'alpha_ranker_v1.json').write_text(json.dumps(result, indent=2))
    print('alpha_ranker:', json.dumps(result['metrics']))


if __name__ == '__main__':
    main()
