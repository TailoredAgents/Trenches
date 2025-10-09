from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Tuple

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import precision_recall_fscore_support

from util_ds import get_rugguard_dataset

OUTPUT_PATH = Path('models') / 'rugguard_v2.json'
FEATURE_NAMES = ['bias', 'authority_active', 'lp_norm', 'flow_norm', 'uniques_norm', 'spread_norm', 'age_norm']
DEFAULT_WEIGHTS = [-1.2, 1.2, -0.6, -0.4, -0.3, 0.2, -0.2]
DEFAULT_THRESHOLD = 0.6


def _pick_column(frame: pd.DataFrame, names: Iterable[str], default: float) -> pd.Series:
    for name in names:
        if name in frame.columns:
            col = pd.to_numeric(frame[name], errors='coerce').fillna(default)
            return col
    return pd.Series(default, index=frame.index, dtype=float)


def _build_feature_frame(df: pd.DataFrame) -> pd.DataFrame:
    lp_sol = _pick_column(df, ['lp_sol', 'lpSol', 'lp_depth_sol'], 0.0)
    buys = _pick_column(df, ['buys60', 'buys_60s'], 0.0)
    sells = _pick_column(df, ['sells60', 'sells_60s'], 0.0)
    uniques = _pick_column(df, ['uniques60', 'unique_traders_60s'], 0.0)
    spread_bps = _pick_column(df, ['spread_bps', 'spreadBps'], 0.0)
    age_sec = _pick_column(df, ['age_sec', 'ageSec', 'age_seconds'], 0.0)
    mint_revoked = _pick_column(df, ['mint_revoked', 'mintRevoked'], 0.0)
    freeze_revoked = _pick_column(df, ['freeze_revoked', 'freezeRevoked'], 0.0)

    flow = np.where(sells > 0, buys / np.clip(sells, 1e-6, None), buys)
    authority_active = np.where((mint_revoked >= 1) & (freeze_revoked >= 1), 0.0, 1.0)
    lp_norm = np.clip(lp_sol / 50.0, 0.0, 1.0)
    flow_norm = np.clip(flow / 5.0, 0.0, 1.0)
    uniques_norm = np.clip(uniques / 30.0, 0.0, 1.0)
    spread_norm = np.clip(spread_bps / 200.0, 0.0, 1.0)
    age_norm = np.clip(age_sec / 600.0, 0.0, 1.0)

    frame = pd.DataFrame(
        {
            'bias': 1.0,
            'authority_active': authority_active,
            'lp_norm': lp_norm,
            'flow_norm': flow_norm,
            'uniques_norm': uniques_norm,
            'spread_norm': spread_norm,
            'age_norm': age_norm,
        },
        index=df.index,
    ).astype(float)
    return frame


def _chronological_split(X: pd.DataFrame, y: pd.Series, timestamp: pd.Series, holdout_ratio: float = 0.2) -> Tuple[pd.DataFrame, pd.Series, pd.DataFrame, pd.Series]:
    aligned = pd.DataFrame({'ts': timestamp}).assign(label=y).join(X)
    aligned = aligned.sort_values('ts')
    n = len(aligned)
    if n == 0:
        return X.iloc[:0], y.iloc[:0], X.iloc[:0], y.iloc[:0]
    split = max(min(int(n * (1 - holdout_ratio)), n - 1), 1) if n > 5 else n
    train = aligned.iloc[:split]
    holdout = aligned.iloc[split:] if split < n else aligned.iloc[:0]
    X_train = train.drop(columns=['ts', 'label'])
    y_train = train['label']
    X_holdout = holdout.drop(columns=['ts', 'label'])
    y_holdout = holdout['label']
    return X_train, y_train, X_holdout, y_holdout


def _choose_threshold(y_true: np.ndarray, probs: np.ndarray) -> Tuple[float, dict]:
    best = {'f1': -1.0, 'precision': 0.0, 'recall': 0.0, 'threshold': DEFAULT_THRESHOLD}
    thresholds = np.linspace(0.2, 0.9, 36)
    for thresh in thresholds:
        preds = (probs >= thresh).astype(int)
        prec, rec, f1, _ = precision_recall_fscore_support(y_true, preds, average='binary', zero_division=0)
        if f1 > best['f1']:
            best = {'f1': float(f1), 'precision': float(prec), 'recall': float(rec), 'threshold': float(thresh)}
    return best['threshold'], best


def train_rugguard() -> dict:
    X_raw, y_raw, _ = get_rugguard_dataset(days=21)
    if X_raw.empty or y_raw.empty:
        return {
            'version': 2,
            'created': datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
            'status': 'no_data',
            'features': FEATURE_NAMES,
            'weights': DEFAULT_WEIGHTS,
            'threshold': DEFAULT_THRESHOLD,
            'metrics': {},
            'train_size': 0,
            'holdout_size': 0,
        }

    features = _build_feature_frame(X_raw)
    labels = pd.to_numeric(y_raw, errors='coerce').fillna(0).clip(0, 1).astype(int)
    timestamps = pd.to_datetime(X_raw.get('ts', pd.Series(datetime.now(timezone.utc), index=X_raw.index)))

    X_train, y_train, X_holdout, y_holdout = _chronological_split(features, labels, timestamps)
    train_size = int(y_train.shape[0])
    holdout_size = int(y_holdout.shape[0])

    result = {
        'version': 2,
        'created': datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
        'features': FEATURE_NAMES,
        'train_size': train_size,
        'holdout_size': holdout_size,
        'status': 'ok',
        'weights': DEFAULT_WEIGHTS,
        'threshold': DEFAULT_THRESHOLD,
        'metrics': {},
    }

    if train_size < 25 or len(np.unique(y_train)) < 2:
        result['status'] = 'insufficient_training_samples'
        return result

    clf = LogisticRegression(max_iter=1000, C=2.0, solver='lbfgs')
    clf.fit(X_train.to_numpy(dtype=float), y_train.to_numpy(dtype=int))
    weights = [float(clf.intercept_[0])] + [float(v) for v in clf.coef_[0]]
    result['weights'] = weights

    train_probs = clf.predict_proba(X_train.to_numpy(dtype=float))[:, 1]
    threshold_src = (X_holdout, y_holdout) if holdout_size >= 10 else (X_train, y_train)
    threshold_probs = clf.predict_proba(threshold_src[0].to_numpy(dtype=float))[:, 1]
    threshold_labels = threshold_src[1].to_numpy(dtype=int)
    threshold, metrics = _choose_threshold(threshold_labels, threshold_probs)
    result['threshold'] = threshold
    result['metrics'] = metrics

    prec, rec, f1, _ = precision_recall_fscore_support(
        threshold_labels,
        (threshold_probs >= threshold).astype(int),
        average='binary',
        zero_division=0,
    )
    result['metrics']['precision'] = float(prec)
    result['metrics']['recall'] = float(rec)
    result['metrics']['f1'] = float(f1)
    return result


def main() -> None:
    OUTPUT_PATH.parent.mkdir(exist_ok=True)
    result = train_rugguard()
    OUTPUT_PATH.write_text(json.dumps(result, indent=2))
    print('rugguard:', result['status'], json.dumps(result.get('metrics', {})))


if __name__ == '__main__':
    main()
