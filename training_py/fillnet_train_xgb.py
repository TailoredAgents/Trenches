import json
import os
from pathlib import Path
from datetime import datetime

import numpy as np
import pandas as pd
import optuna
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import brier_score_loss, mean_absolute_error, mean_absolute_percentage_error
from sklearn.model_selection import TimeSeriesSplit

import xgboost as xgb

from util_ds import get_fillnet_dataset


def _tree_method() -> str:
    try:
        # xgboost will ignore gpu_hist if no GPU
        return 'gpu_hist'
    except Exception:
        return 'hist'


def _objective(trial: optuna.Trial, X: np.ndarray, y: np.ndarray, task: str) -> float:
    params = {
        'max_depth': trial.suggest_int('max_depth', 3, 8),
        'eta': trial.suggest_float('eta', 0.02, 0.3, log=True),
        'subsample': trial.suggest_float('subsample', 0.6, 1.0),
        'colsample_bytree': trial.suggest_float('colsample_bytree', 0.6, 1.0),
        'tree_method': _tree_method(),
        'eval_metric': 'logloss' if task == 'clf' else 'mae',
        'n_estimators': 600,
    }
    if task == 'clf':
        model = xgb.XGBClassifier(**params)
        metric = brier_score_loss
    else:
        model = xgb.XGBRegressor(**params)
        metric = mean_absolute_error

    tscv = TimeSeriesSplit(n_splits=3)
    scores = []
    for tr, va in tscv.split(X):
        model.fit(X[tr], y[tr], eval_set=[(X[va], y[va])], verbose=False)
        preds = model.predict_proba(X[va])[:, 1] if task == 'clf' else model.predict(X[va])
        try:
            s = metric(y[va], preds)
        except Exception:
            s = float('inf')
        scores.append(s)
    return float(np.mean(scores))


def main() -> None:
    out_dir = Path('models')
    out_dir.mkdir(exist_ok=True)
    X, y_fill, y_slip, y_ttl, feats = get_fillnet_dataset(days=14)
    result = {
        'version': 2,
        'created': datetime.utcnow().isoformat() + 'Z',
        'device': _tree_method(),
        'features': feats,
        'metrics': {},
        'models': {},
        'calibration': {},
        'status': 'ok',
    }
    if X.empty or y_fill.empty:
        result['status'] = 'no_data'
        (out_dir / 'fillnet_v2.json').write_text(json.dumps(result, indent=2))
        print('fillnet: no_data')
        return

    Xn = X.to_numpy(dtype=float)

    # pFill (classification)
    study_clf = optuna.create_study(direction='minimize')
    study_clf.optimize(lambda t: _objective(t, Xn, y_fill.to_numpy(dtype=float), 'clf'), n_trials=20, show_progress_bar=False)
    params_clf = study_clf.best_params
    clf = xgb.XGBClassifier(
        max_depth=params_clf['max_depth'],
        eta=params_clf['eta'],
        subsample=params_clf['subsample'],
        colsample_bytree=params_clf['colsample_bytree'],
        tree_method=_tree_method(),
        n_estimators=800,
    )
    clf.fit(Xn, y_fill.to_numpy(dtype=float))
    # Calibration
    cal = CalibratedClassifierCV(clf, cv=3, method='isotonic')
    cal.fit(Xn, y_fill.to_numpy(dtype=float))
    preds_cal = cal.predict_proba(Xn)[:, 1]
    brier = float(brier_score_loss(y_fill.to_numpy(dtype=float), preds_cal))
    result['metrics']['brier'] = brier
    result['models']['pfill'] = {'xgb_params': params_clf}
    result['calibration'] = {'method': 'isotonic'}

    # slippage (regression)
    if not y_slip.empty:
        study_reg = optuna.create_study(direction='minimize')
        study_reg.optimize(lambda t: _objective(t, Xn, y_slip.to_numpy(dtype=float), 'reg'), n_trials=15, show_progress_bar=False)
        params_slip = study_reg.best_params
        reg_slip = xgb.XGBRegressor(
            max_depth=params_slip['max_depth'],
            eta=params_slip['eta'],
            subsample=params_slip['subsample'],
            colsample_bytree=params_slip['colsample_bytree'],
            tree_method=_tree_method(),
            n_estimators=600,
        )
        reg_slip.fit(Xn, y_slip.to_numpy(dtype=float))
        mape = float(mean_absolute_percentage_error(y_slip, reg_slip.predict(Xn)))
        result['metrics']['slip_mape'] = mape
        result['models']['slip_bps'] = {'xgb_params': params_slip}

    # ttl (regression)
    if not y_ttl.empty:
        study_ttl = optuna.create_study(direction='minimize')
        study_ttl.optimize(lambda t: _objective(t, Xn, y_ttl.to_numpy(dtype=float), 'reg'), n_trials=15, show_progress_bar=False)
        params_ttl = study_ttl.best_params
        reg_ttl = xgb.XGBRegressor(
            max_depth=params_ttl['max_depth'],
            eta=params_ttl['eta'],
            subsample=params_ttl['subsample'],
            colsample_bytree=params_ttl['colsample_bytree'],
            tree_method=_tree_method(),
            n_estimators=600,
        )
        reg_ttl.fit(Xn, y_ttl.to_numpy(dtype=float))
        mae = float(mean_absolute_error(y_ttl, reg_ttl.predict(Xn)))
        result['metrics']['ttl_mae'] = mae
        result['models']['ttl_ms'] = {'xgb_params': params_ttl}

    (out_dir / 'fillnet_v2.json').write_text(json.dumps(result, indent=2))
    print('fillnet: trained', json.dumps(result['metrics']))


if __name__ == '__main__':
    main()

