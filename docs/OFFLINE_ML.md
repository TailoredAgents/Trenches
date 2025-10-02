# Offline ML Pack

## Nightly Features Job (author_quality)
- Runs offline on a nightly interval (configurable via featuresJob block).
- Reads recent social_posts from SQLite and computes an author_quality score per author.
- Embedding step uses @xenova/transformers when available; otherwise, the job falls back to simple heuristics.
- Persists results to author_features with posts24h counts.

## Pump/Scam Classifier
- Offline training script (training/pump_classifier/train.ts) expects data/pump_labels.jsonl with {text,label}.
- Trains a small logistic regression over hashed bag-of-words features; saves to models/pump_classifier_v1.json.
- Runtime (safety-engine) loads the model if present and computes pump_prob for token-related text.
- RugGuard includes pump_prob in its feature vector (not a hard gate). Pump probability is added to rug_verdicts reasons for audit.

## FillNet Calibration
- Buckets predictions by pFill into coarse ranges and counts events per bucket.
- Emits an approximate Brier gauge using p*(1-p) (observability aid; true Brier requires label).

## Integration Points
- AlphaRanker can read author_features and include author_quality as an additional feature (mean or top-K).
- RugGuard receives pump_prob as a soft signal to inform risk.

