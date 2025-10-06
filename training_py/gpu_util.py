import os, sys
import numpy as np
import xgboost as xgb


def prefer_gpu():
    if os.getenv('FORCE_CPU') == '1': return False
    if os.getenv('FORCE_GPU') == '1': return True
    try:
        # XGBoost 3.x: device='cuda', tree_method='hist'
        dtrain = xgb.DMatrix(np.random.randn(256, 8), label=(np.random.rand(256) > 0.5).astype(np.float32))
        params = dict(objective='binary:logistic', device='cuda', tree_method='hist', max_depth=2, eta=0.3,
                      subsample=0.8, colsample_bytree=0.8)
        xgb.train(params, dtrain, num_boost_round=5, verbose_eval=False)
        return True
    except Exception:
        return False


def device_params(is_gpu: bool, base: dict | None = None, cpu_threads: int = 2):
    base = dict(base) if base else {}
    if is_gpu:
        base.update(dict(device='cuda', tree_method='hist'))
    else:
        base.update(dict(device='cpu', tree_method='hist', nthread=max(1, cpu_threads)))
    return base


def print_device(is_gpu: bool):
    sys.stdout.write(f"[trainer] device={'GPU' if is_gpu else 'CPU'}\n")
    sys.stdout.flush()
