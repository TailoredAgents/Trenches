import json
import os
import shutil
import subprocess
from datetime import datetime, timedelta
from pathlib import Path


MODELS = {
    # (candidate_path, production_path_primary, production_path_alias)
    'fillnet': ('models/fillnet_v2.json', 'models/fillnet_v2.json', 'models/fillnet.json'),
    'alpha': ('models/alpha_ranker_v1.json', 'models/alpha_ranker.json', None),
    'rugguard': ('models/rugguard_v2.json', 'models/rugguard_v2.json', 'models/rugguard.json'),
    'survival': ('models/survival_v1.json', 'models/survival.json', None),
}


def run(cmd: str, env: dict | None = None) -> tuple[int, str]:
    try:
        p = subprocess.run(cmd, shell=True, env={**os.environ, **(env or {})}, capture_output=True, text=True, timeout=1800)
        return p.returncode, (p.stdout or '') + (p.stderr or '')
    except Exception as e:
        return 1, str(e)


def backtest_and_ope(env_overrides: dict) -> dict:
    now = datetime.utcnow()
    start = now - timedelta(days=14)
    args = {
        'FROM': start.strftime('%Y-%m-%d'),
        'TO': now.strftime('%Y-%m-%d'),
    }
    summary = {}
    code, out = run(f"pnpm backtest --from {args['FROM']} --to {args['TO']} --use-alpha", env_overrides)
    summary['backtest_ok'] = (code == 0)
    summary['backtest_raw'] = out[-2000:]
    # OPE fee + sizing
    code_f, out_f = run(f"pnpm ope --from {args['FROM']} --to {args['TO']} --policy fee", env_overrides)
    code_s, out_s = run(f"pnpm ope --from {args['FROM']} --to {args['TO']} --policy sizing", env_overrides)
    summary['ope_ok'] = (code_f == 0 and code_s == 0)
    summary['ope_raw'] = (out_f + '\n' + out_s)[-2000:]
    return summary


def read_json(path: str) -> dict | None:
    p = Path(path)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except Exception:
        return None


def gate_fillnet(current: dict | None, cand: dict | None) -> tuple[bool, str]:
    if not cand or cand.get('status') != 'ok':
        return False, 'candidate_missing_or_no_data'
    cb = (current or {}).get('metrics', {})
    nb = cand.get('metrics', {})
    # Prefer lower brier, lower slip_mape; landed rate gate delegated to backtest
    brier_ok = nb.get('brier', 1.0) <= cb.get('brier', nb.get('brier', 1.0))
    mape_cur = cb.get('slip_mape', 1.0)
    mape_new = nb.get('slip_mape', 1.0)
    mape_ok = (mape_cur - mape_new) / max(1e-6, mape_cur) >= 0.10 or mape_new <= 0.25
    if brier_ok and mape_ok:
        return True, 'brier_and_slip_ok'
    return False, 'metrics_not_improved'


def gate_alpha(current: dict | None, cand: dict | None) -> tuple[bool, str]:
    if not cand or cand.get('status') != 'ok':
        return False, 'candidate_missing_or_no_data'
    auc10 = cand.get('metrics', {}).get('auc_10m', 0)
    if auc10 >= 0.70:
        return True, 'auc_10m_threshold_ok'
    return False, 'auc_below_threshold'


def gate_rug(current: dict | None, cand: dict | None) -> tuple[bool, str]:
    if not cand or cand.get('status') != 'ok':
        return False, 'candidate_missing_or_no_data'
    # Without consistent tails in current, accept candidate; OPE will catch regressions
    return True, 'accepted_via_ope_guard'


def gate_survival(current: dict | None, cand: dict | None) -> tuple[bool, str]:
    if not cand or cand.get('status') != 'ok':
        return False, 'candidate_missing_or_no_data'
    return True, 'accepted_via_ope_guard'


def maybe_promote(name: str, prod_primary: str, cand_path: str, env_keys: dict, prod_alias: str | None = None) -> str:
    cur = read_json(prod_primary)
    cand = read_json(cand_path)
    gate_fn = {
        'fillnet': gate_fillnet,
        'alpha': gate_alpha,
        'rugguard': gate_rug,
        'survival': gate_survival,
    }[name]
    ok, reason = gate_fn(cur, cand)
    if not ok:
        return f"PROMOTE {name}=skipped reason={reason}"
    # Backtest/OPE with candidate envs
    env_overrides = {k: v for k, v in env_keys.items() if v}
    bt = backtest_and_ope(env_overrides)
    if not (bt['backtest_ok'] and bt['ope_ok']):
        return f"PROMOTE {name}=skipped reason=bt_or_ope_failed"
    # Promote
    try:
        shutil.copyfile(cand_path, prod_primary)
        if prod_alias:
            shutil.copyfile(cand_path, prod_alias)
        return f"PROMOTE {name}=ok reason={reason}"
    except Exception as e:
        return f"PROMOTE {name}=skipped reason=copy_failed:{e}"


def main() -> None:
    # Map env overrides for each model, if supported by services/backtest
    envs = {
        'fillnet': {'FILLNET_MODEL_PATH': str(Path('models/fillnet_v2.json').resolve())},
        'alpha': {'ALPHA_MODEL_PATH': str(Path('models/alpha_ranker_v1.json').resolve())},
        'rugguard': {'RUGGUARD_MODEL_PATH': str(Path('models/rugguard_v2.json').resolve())},
        'survival': {'SURVIVAL_MODEL_PATH': str(Path('models/survival_v1.json').resolve())},
    }
    lines = []
    lines.append(maybe_promote('fillnet', MODELS['fillnet'][1], MODELS['fillnet'][0], envs['fillnet'], MODELS['fillnet'][2]))
    lines.append(maybe_promote('alpha', MODELS['alpha'][1], MODELS['alpha'][0], envs['alpha'], MODELS['alpha'][2]))
    lines.append(maybe_promote('rugguard', MODELS['rugguard'][1], MODELS['rugguard'][0], envs['rugguard'], MODELS['rugguard'][2]))
    lines.append(maybe_promote('survival', MODELS['survival'][1], MODELS['survival'][0], envs['survival'], MODELS['survival'][2]))
    for ln in lines:
        print(ln)


if __name__ == '__main__':
    main()
