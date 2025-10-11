import json
import os
import shutil
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
from urllib import error as urlerror, request as urlrequest


MODELS = {
    # (candidate_path, production_path_primary, production_path_alias)
    'fillnet': ('models/fillnet_v2.json', 'models/fillnet_v2.json', 'models/fillnet.json'),
    'alpha': ('models/alpha_ranker_v1.json', 'models/alpha_ranker.json', None),
    'rugguard': ('models/rugguard_v2.json', 'models/rugguard_v2.json', 'models/rugguard.json'),
    'survival': ('models/survival_v1.json', 'models/survival.json', None),
}

DEFAULT_RELOAD_ENDPOINTS = {
    'fillnet': 'http://127.0.0.1:4011/control/reload-models',
    'alpha': 'http://127.0.0.1:4021/control/reload-models',
    'rugguard': '',
    'survival': ''
}


def run(cmd: str, env: dict | None = None) -> tuple[int, str]:
    try:
        p = subprocess.run(cmd, shell=True, env={**os.environ, **(env or {})}, capture_output=True, text=True, timeout=1800)
        return p.returncode, (p.stdout or '') + (p.stderr or '')
    except Exception as e:
        return 1, str(e)


def run_script(script: str, args: list[str], env: dict | None = None) -> tuple[int, str]:
    joined_args = ' '.join(args)
    cmd = f"pnpm run --if-present {script}"
    if joined_args:
        cmd = f"{cmd} -- {joined_args}"
    return run(cmd, env)


def backtest_and_ope(env_overrides: dict) -> dict:
    now = datetime.utcnow()
    start = now - timedelta(days=14)
    args = {
        'FROM': start.strftime('%Y-%m-%d'),
        'TO': now.strftime('%Y-%m-%d'),
    }
    summary = {}
    code, out = run_script('backtest', [f"--from {args['FROM']}", f"--to {args['TO']}", '--use-alpha'], env_overrides)
    summary['backtest_ok'] = (code == 0)
    summary['backtest_raw'] = out[-2000:]
    # OPE fee + sizing
    code_f, out_f = run_script('ope', [f"--from {args['FROM']}", f"--to {args['TO']}", '--policy fee'], env_overrides)
    code_s, out_s = run_script('ope', [f"--from {args['FROM']}", f"--to {args['TO']}", '--policy sizing'], env_overrides)
    summary['ope_ok'] = (code_f == 0 and code_s == 0)
    summary['ope_raw'] = (out_f + '\n' + out_s)[-2000:]
    return summary


def trigger_reload(name: str) -> str:
    default = DEFAULT_RELOAD_ENDPOINTS.get(name, '')
    url = os.environ.get(f'PROMOTE_{name.upper()}_RELOAD_URL', default)
    if not url:
        return 'skipped(no_url)'
    try:
        req = urlrequest.Request(url, data=b'', method='POST')
        with urlrequest.urlopen(req, timeout=5) as resp:
            code = resp.getcode()
            return f'ok({code})' if 200 <= code < 300 else f'http_{code}'
    except urlerror.URLError as exc:
        return f'failed:{exc}'
    except Exception as exc:  # pragma: no cover - unexpected errors
        return f'failed:{exc}'


def read_json(path: str) -> dict | None:
    p = Path(path)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except Exception:
        return None


def gate_fillnet(current: dict | None, cand: dict | None) -> tuple[bool, str]:
    if not cand:
        return False, 'candidate_missing'
    status = cand.get('status')
    if status != 'ok':
        return False, f'candidate_status_{status}'
    metrics = cand.get('metrics', {})
    train_size = metrics.get('train_size_fill', cand.get('train_size', 0))
    if train_size is not None and train_size < 200:
        return False, f'insufficient_train_samples({train_size})'
    new_brier = metrics.get('brier')
    current_brier = (current or {}).get('metrics', {}).get('brier', new_brier or 1.0)
    if new_brier is None:
        return False, 'missing_brier_metric'
    improvement = current_brier - new_brier
    slip_mape = metrics.get('slip_mape')
    slip_ok = slip_mape is not None and slip_mape <= 0.3
    if improvement >= 0.02 or (slip_ok and new_brier <= current_brier + 0.005):
        return True, f'brier_delta={improvement:.4f}'
    return False, 'metrics_not_improved'


def gate_alpha(current: dict | None, cand: dict | None) -> tuple[bool, str]:
    if not cand:
        return False, 'candidate_missing'
    status = cand.get('status')
    if status != 'ok':
        return False, f'candidate_status_{status}'
    metrics = cand.get('metrics', {})
    auc10 = metrics.get('auc_10m')
    train_size = max(
        metrics.get('train_size_10m', 0),
        metrics.get('train_size_60m', 0),
        cand.get('train_size', 0)
    )
    if train_size < 200:
        return False, f'insufficient_train_samples({train_size})'
    if auc10 is None or auc10 < 0.7:
        return False, f'auc_10m_too_low({auc10})'
    precision60 = metrics.get('precision_at_50_60m')
    if precision60 is not None and precision60 < 0.5:
        return False, f'precision_60m_too_low({precision60})'
    return True, f'auc_10m={auc10:.3f}'


def gate_rug(current: dict | None, cand: dict | None) -> tuple[bool, str]:
    if not cand:
        return False, 'candidate_missing'
    status = cand.get('status')
    if status != 'ok':
        return False, f'candidate_status_{status}'
    metrics = cand.get('metrics', {})
    train_size = cand.get('train_size', 0)
    if train_size < 200:
        return False, f'insufficient_train_samples({train_size})'
    auc = metrics.get('auc')
    f1 = metrics.get('f1')
    if auc is not None and auc < 0.65:
        return False, f'auc_too_low({auc})'
    if f1 is not None and f1 < 0.4:
        return False, f'f1_too_low({f1})'
    return True, f'auc={auc},f1={f1}'


def gate_survival(current: dict | None, cand: dict | None) -> tuple[bool, str]:
    if not cand:
        return False, 'candidate_missing'
    status = cand.get('status')
    if status != 'ok':
        return False, f'candidate_status_{status}'
    sample_size = cand.get('sample_size') or cand.get('metrics', {}).get('sample_size', 0)
    if sample_size < 100:
        return False, f'insufficient_samples({sample_size})'
    return True, f'sample_size={sample_size}'


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
        reload_status = trigger_reload(name)
        return f"PROMOTE {name}=ok reason={reason} reload={reload_status}"
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
