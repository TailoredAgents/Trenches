import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Tuple

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import (
    brier_score_loss,
    log_loss,
    mean_absolute_error,
    mean_absolute_percentage_error,
)

from util_ds import get_fillnet_dataset

FEATURE_NAMES = ['bias', 'sDepth', 'sCong', 'sSpread', 'sVol', 'sAge', 'sRug', 'sSlipReq']
DEFAULT_W_FILL = [-3.0, 2.2, 1.5, 0.8, 0.7, 0.2, 0.8, 0.6]
DEFAULT_W_SLIP = [370.0, -120.0, -80.0, -80.0, -90.0, 0.0, 0.0, 50.0]
DEFAULT_W_TIME = [2500.0, -700.0, -900.0, -500.0, 0.0, 0.0, 0.0, 0.0]


def _pick_column(frame: pd.DataFrame, names: Iterable[str], default: float) -> pd.Series:
    for name in names:
        if name in frame.columns:
            series = frame[name]
            if series is not None:
                return pd.to_numeric(series, errors='coerce').fillna(default)
    return pd.Series(default, index=frame.index, dtype=float)


def build_feature_dataframe(raw: pd.DataFrame) -> pd.DataFrame:
    depth_sol = _pick_column(raw, ['lp_sol', 'lpSol', 'lp_depth_sol'], 0.0)
    congestion = _pick_column(raw, ['congestion_score', 'congestion', 'congestionScore'], 0.5).clip(0.0, 1.0)
    spread_bps = _pick_column(raw, ['spread_bps', 'spreadBps'], 120.0).clip(lower=0.0)
    volatility_bps = _pick_column(raw, ['volatility_bps', 'volatilityBps'], spread_bps.values).clip(lower=0.0)
    age_sec = _pick_column(raw, ['age_sec', 'ageSec', 'age_seconds'], 300.0).clip(lower=0.0)
    rug_prob = _pick_column(raw, ['rug_prob', 'rugProb', 'rug_probability'], 0.5).clip(0.0, 1.0)
    slip_req = _pick_column(raw, ['slippage_req_bps', 'slippage_bps_req', 'slippage_bps'], 180.0).clip(lower=1.0)

    s_depth = np.clip(depth_sol / 50.0, 0.0, 1.0)
    s_cong = congestion
    s_spread = np.clip(1.0 - spread_bps / 200.0, 0.0, 1.0)
    s_vol = np.clip(1.0 - volatility_bps / 300.0, 0.0, 1.0)
    s_age = np.clip(age_sec / 600.0, 0.0, 1.0)
    s_rug = np.clip(1.0 - rug_prob, 0.0, 1.0)
    s_slip_req = np.clip(slip_req / 300.0, 0.0, 1.0)

    features = pd.DataFrame(
        {
            'bias': 1.0,
            'sDepth': s_depth,
            'sCong': s_cong,
            'sSpread': s_spread,
            'sVol': s_vol,
            'sAge': s_age,
            'sRug': s_rug,
            'sSlipReq': s_slip_req,
        },
        index=raw.index,
    ).astype(float)
    return features


def _train_test_split(
    features: pd.DataFrame,
    labels: pd.Series,
    holdout_ratio: float = 0.2,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    aligned_labels = labels.reindex(features.index)
    mask = aligned_labels.notna()
    feats = features[mask]
    lbls = aligned_labels[mask]
    n = len(feats)
    if n == 0:
        return np.empty((0, features.shape[1])), np.empty(0), np.empty((0, features.shape[1])), np.empty(0)
    split = max(min(int(n * (1 - holdout_ratio)), n - 1), 1) if n > 4 else n
    train = feats.iloc[:split].to_numpy(dtype=float)
    test = feats.iloc[split:].to_numpy(dtype=float) if split < n else feats.iloc[:0].to_numpy(dtype=float)
    y_train = lbls.iloc[:split].to_numpy(dtype=float)
    y_test = lbls.iloc[split:].to_numpy(dtype=float) if split < n else lbls.iloc[:0].to_numpy(dtype=float)
    return train, y_train, test, y_test


def _has_class_diversity(values: np.ndarray) -> bool:
    unique = np.unique(values)
    return unique.size >= 2


def train_fillnet() -> dict:
    result = {
        'version': 2,
        'created': datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
        'status': 'ok',
        'features': FEATURE_NAMES,
        'metrics': {},
        'wFill': DEFAULT_W_FILL,
        'wSlip': DEFAULT_W_SLIP,
        'wTime': DEFAULT_W_TIME,
        'train_size': 0,
        'holdout_size': 0,
    }

    raw_X, y_fill, y_slip, y_ttl, _ = get_fillnet_dataset(days=21)
    if raw_X.empty or y_fill.empty:
        result['status'] = 'no_data'
        return result

    feature_df = build_feature_dataframe(raw_X)
    X_train_fill, y_train_fill, X_holdout_fill, y_holdout_fill = _train_test_split(feature_df, y_fill)
    result['train_size'] = int(y_train_fill.size)
    result['holdout_size'] = int(y_holdout_fill.size)

    if y_train_fill.size >= 10 and _has_class_diversity(y_train_fill):
        clf = LogisticRegression(max_iter=1000, C=5.0, solver='lbfgs')
        clf.fit(X_train_fill[:, 1:], y_train_fill)
        w_fill = [float(clf.intercept_[0])] + [float(c) for c in clf.coef_[0]]
        result['wFill'] = w_fill
        preds_train = clf.predict_proba(X_train_fill[:, 1:])[:, 1]
        logloss = float(log_loss(y_train_fill, np.clip(preds_train, 1e-6, 1 - 1e-6)))
        result['metrics']['pfill_logloss_train'] = logloss
        holdout_src = X_holdout_fill[:, 1:] if y_holdout_fill.size > 0 else X_train_fill[:, 1:]
        holdout_y = y_holdout_fill if y_holdout_fill.size > 0 else y_train_fill
        preds_holdout = clf.predict_proba(holdout_src)[:, 1]
        result['metrics']['pfill_brier_holdout'] = float(brier_score_loss(holdout_y, preds_holdout))
    else:
        result['status'] = 'insufficient_pfill_data'

    X_train_slip, y_train_slip, X_holdout_slip, y_holdout_slip = _train_test_split(feature_df, y_slip.dropna())
    if y_train_slip.size >= 20:
        reg_slip = Ridge(alpha=5.0)
        reg_slip.fit(X_train_slip[:, 1:], y_train_slip)
        w_slip = [float(reg_slip.intercept_)] + [float(c) for c in reg_slip.coef_]
        result['wSlip'] = w_slip
        preds_slip = reg_slip.predict(X_holdout_slip[:, 1:]) if y_holdout_slip.size > 0 else reg_slip.predict(X_train_slip[:, 1:])
        truth_slip = y_holdout_slip if y_holdout_slip.size > 0 else y_train_slip
        preds_slip = np.clip(preds_slip, 1, None)
        result['metrics']['slip_mae'] = float(mean_absolute_error(truth_slip, preds_slip))
        result['metrics']['slip_mape'] = float(mean_absolute_percentage_error(truth_slip, np.clip(preds_slip, 1e-6, None)))
    else:
        if result['status'] == 'ok':
            result['status'] = 'insufficient_slip_data'

    X_train_ttl, y_train_ttl, X_holdout_ttl, y_holdout_ttl = _train_test_split(feature_df, y_ttl.dropna())
    if y_train_ttl.size >= 20:
        reg_ttl = Ridge(alpha=5.0)
        reg_ttl.fit(X_train_ttl[:, 1:], y_train_ttl)
        w_time = [float(reg_ttl.intercept_)] + [float(c) for c in reg_ttl.coef_]
        result['wTime'] = w_time
        preds_ttl = reg_ttl.predict(X_holdout_ttl[:, 1:]) if y_holdout_ttl.size > 0 else reg_ttl.predict(X_train_ttl[:, 1:])
        truth_ttl = y_holdout_ttl if y_holdout_ttl.size > 0 else y_train_ttl
        preds_ttl = np.clip(preds_ttl, 50, None)
        result['metrics']['ttl_mae'] = float(mean_absolute_error(truth_ttl, preds_ttl))
    else:
        if result['status'] == 'ok':
            result['status'] = 'insufficient_ttl_data'

    return result


def main() -> None:
    out_dir = Path('models')
    out_dir.mkdir(exist_ok=True)
    result = train_fillnet()
    (out_dir / 'fillnet_v2.json').write_text(json.dumps(result, indent=2))
    print('fillnet:', result['status'], json.dumps(result.get('metrics', {})))


if __name__ == '__main__':
    main()
