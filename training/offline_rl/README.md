# Offline RL (Scaffold)

This directory scaffolds an offline RL pipeline using d3rlpy (IQL/CQL) to produce an ONNX policy that the policy-engine can load in shadow mode.

Components:
- `requirements.txt` – Python dependencies (install in a venv).
- `train.py` – Minimal script to load logged events from the SQLite DB and train a bandit-like policy; exports ONNX.

Notes:
- This is a scaffold. The actual features and reward shaping should mirror `services/policy-engine/src/context.ts` and the bandit.
- On Jetson, consider TensorRT conversion for inference: build with `onnxruntime-gpu` or TensorRT if available.

Usage:
```
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python train.py --db ../../data/trenches.db --out ./artifacts/policy.onnx
```

