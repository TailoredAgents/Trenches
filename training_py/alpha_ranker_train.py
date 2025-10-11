from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Tuple, Dict, Any

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

from util_ds import get_alpha_dataset

FEATURE_NAMES = [
    'bias',
    'flow_norm',
    'lp_norm',
    'uniques_norm',
    'spread_inv',
    'age_inv',
    'rug_inv',
    'author_quality_mean',
    'author_quality_top',
    'author_mentions_norm',
    'lunar_boost'
]


def _pick_column(frame: pd.DataFrame, names: Iterable[str], default: float) -> pd.Series:
    for name in names:
        if name in frame.columns:
            return pd.to_numeric(frame[name], errors='coerce').fillna(default)
    return pd.Series(default, index=frame.index, dtype=float)


def _build_feature_frame(df: pd.DataFrame) -> pd.DataFrame:
    buys = _pick_column(df, ['buys60', 'buys_60s', 'buy_count_60s'], 0.0)
    sells = _pick_column(df, ['sells60', 'sells_60s', 'sell_count_60s'], 0.0)
    uniques = _pick_column(df, ['uniques60', 'unique_traders_60s', 'unique_wallets_60s'], 0.0)
    lp_sol = _pick_column(df, ['lp_sol', 'lpSol', 'lp_depth_sol'], 0.0)
    spread_bps = _pick_column(df, ['spread_bps', 'spreadBps', 'spread'], 120.0)
    age_sec = _pick_column(df, ['age_sec', 'ageSec', 'age_seconds'], 300.0)
    rug_prob = _pick_column(df, ['rug_prob', 'rugProb', 'rug_probability'], 0.5)
    author_quality_mean = _pick_column(df, ['author_quality_mean', 'author_quality'], 0.0)
    author_quality_top = _pick_column(df, ['author_quality_top', 'author_quality_topk'], 0.0)
    author_mentions = _pick_column(df, ['author_mentions', 'author_mentions_60m'], 0.0)
    lunar_boost = _pick_column(df, ['lunar_boost', 'lunar_signal'], 0.0)

    flow = np.where(sells > 0, buys / np.clip(sells, 1e-6, None), buys)
    flow_norm = np.clip(flow / 4.0, 0.0, 1.0)
    lp_norm = np.clip(lp_sol / 50.0, 0.0, 1.0)
    uniques_norm = np.clip(uniques / 25.0, 0.0, 1.0)
    spread_inv = 1.0 - np.clip(spread_bps / 200.0, 0.0, 1.0)
    age_inv = 1.0 - np.clip(age_sec / 1800.0, 0.0, 1.0)
    rug_inv = 1.0 - np.clip(rug_prob, 0.0, 1.0)
    author_mentions_norm = np.clip(author_mentions / 20.0, 0.0, 1.0)
    lunar_boost_clamped = np.clip(lunar_boost, 0.0, 0.2)

    features = pd.DataFrame(
        {
            'bias': 1.0,
            'flow_norm': flow_norm,
            'lp_norm': lp_norm,
            'uniques_norm': uniques_norm,
            'spread_inv': spread_inv,
            'age_inv': age_inv,
            'rug_inv': rug_inv,
            'author_quality_mean': np.clip(author_quality_mean, 0.0, 1.0),
            'author_quality_top': np.clip(author_quality_top, 0.0, 1.0),
            'author_mentions_norm': author_mentions_norm,
            'lunar_boost': lunar_boost_clamped
        },
        index=df.index,
    ).astype(float)
    return features


def _chronological_split(features: pd.DataFrame, labels: pd.Series, holdout_ratio: float = 0.2) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    mask = labels.notna()
    feats = features[mask]
    lbls = labels[mask].astype(float)
    n = len(feats)
    if n == 0:
        return np.empty((0, feats.shape[1])), np.empty(0), np.empty((0, feats.shape[1])), np.empty(0)
    split = max(min(int(n * (1 - holdout_ratio)), n - 1), 1) if n > 8 else n
    X_train = feats.iloc[:split].to_numpy(dtype=float)
    y_train = lbls.iloc[:split].to_numpy(dtype=float)
    X_holdout = feats.iloc[split:].to_numpy(dtype=float) if split < n else np.empty((0, feats.shape[1]))
    y_holdout = lbls.iloc[split:].to_numpy(dtype=float) if split < n else np.empty(0)
    return X_train, y_train, X_holdout, y_holdout


def _precision_at_k(y_true: np.ndarray, y_score: np.ndarray, k: int = 50) -> float:
    if y_true.size == 0:
        return 0.0
    order = np.argsort(y_score)[::-1]
    top = order[: min(k, y_true.size)]
    if top.size == 0:
        return 0.0
    return float(np.mean(y_true[top] > 0.5))


def _train_one_horizon(features: pd.DataFrame, labels: pd.Series) -> Dict[str, Any]:
    X_train, y_train, X_holdout, y_holdout = _chronological_split(features, labels)
    result: Dict[str, Any] = {
        'weights': FEATURE_NAMES.copy(),
        'metrics': {},
        'status': 'ok',
        'train_size': int(y_train.size),
        'holdout_size': int(y_holdout.size)
    }
    if y_train.size < 30 or len(np.unique(y_train)) < 2:
        result['status'] = 'insufficient_samples'
        result['weights'] = []
        return result

    model = LogisticRegression(max_iter=1000, C=2.0, solver='lbfgs')
    model.fit(X_train[:, 1:], y_train)
    weights = [float(model.intercept_[0])] + [float(c) for c in model.coef_[0]]
    result['weights'] = weights

    train_scores = model.predict_proba(X_train[:, 1:])[:, 1]
    result['metrics']['auc_train'] = float(roc_auc_score(y_train, train_scores))
    result['metrics']['precision_at_50_train'] = _precision_at_k(y_train, train_scores, k=50)

    holdout_src = X_holdout[:, 1:] if X_holdout.size else X_train[:, 1:]
    holdout_labels = y_holdout if y_holdout.size else y_train
    holdout_scores = model.predict_proba(holdout_src)[:, 1]
    result['metrics']['auc_holdout'] = float(roc_auc_score(holdout_labels, holdout_scores))
    result['metrics']['precision_at_50_holdout'] = _precision_at_k(holdout_labels, holdout_scores, k=50)
    result['metrics']['precision_at_50_holdout'] = float(result['metrics']['precision_at_50_holdout'])
    result['metrics']['pred_mean_holdout'] = float(np.mean(holdout_scores))
    return result


def main() -> None:
    out_dir = Path('models')
    out_dir.mkdir(exist_ok=True)

    X_raw, y10, y60, _ = get_alpha_dataset(days=21)
    result = {
        'version': 2,
        'created': datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
        'status': 'ok',
        'features': FEATURE_NAMES,
        'models': {},
        'metrics': {},
        'train_size': 0,
        'holdout_size': 0
    }

    if X_raw.empty or y10.empty or y60.empty:
        result['status'] = 'no_data'
        (out_dir / 'alpha_ranker_v1.json').write_text(json.dumps(result, indent=2))
        print('alpha_ranker: no_data')
        return

    feature_frame = _build_feature_frame(X_raw)

    horizons = {'10m': y10, '60m': y60}
    overall_status = 'ok'
    for horizon, labels in horizons.items():
        trained = _train_one_horizon(feature_frame, labels)
        result['models'][horizon] = trained
        result['train_size'] = max(result['train_size'], trained.get('train_size', 0))
        result['holdout_size'] = max(result['holdout_size'], trained.get('holdout_size', 0))
        status = trained.get('status')
        if status != 'ok':
            overall_status = 'degraded' if status == 'insufficient_samples' else status or 'degraded'
        metrics = trained.get('metrics', {})
        if metrics:
            auc = metrics.get('auc_holdout') or metrics.get('auc_train')
            if auc is not None:
                result['metrics'][f'auc_{horizon}'] = float(auc)
            prec = metrics.get('precision_at_50_holdout') or metrics.get('precision_at_50_train')
            if prec is not None:
                result['metrics'][f'precision_at_50_{horizon}'] = float(prec)
            result['metrics'][f'train_size_{horizon}'] = int(trained.get('train_size', 0))
            result['metrics'][f'holdout_size_{horizon}'] = int(trained.get('holdout_size', 0))
        result['metrics'][horizon] = metrics

    result['status'] = overall_status

    (out_dir / 'alpha_ranker_v1.json').write_text(json.dumps(result, indent=2))
    flattened = {k: v for k, v in result['metrics'].items() if not isinstance(v, dict)}
    print('alpha_ranker:', json.dumps(flattened))


if __name__ == '__main__':
    main()
