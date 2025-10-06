import os
import sqlite3
import datetime as dt
from typing import Tuple, Optional, List, Dict, Any

import numpy as np
import pandas as pd

DEFAULT_DB = os.environ.get('PERSISTENCE_SQLITE_PATH', './data/trenches.db')


def _connect(db_path: str = DEFAULT_DB) -> sqlite3.Connection:
    return sqlite3.connect(db_path)


def _read_query(conn: sqlite3.Connection, sql: str, params: Tuple = ()) -> pd.DataFrame:
    try:
        return pd.read_sql_query(sql, conn, params=params)
    except Exception:
        return pd.DataFrame()


def time_bounds(days: int = 14) -> Tuple[str, str]:
    now = dt.datetime.utcnow()
    start = now - dt.timedelta(days=days)
    return start.replace(microsecond=0).isoformat() + 'Z', now.replace(microsecond=0).isoformat() + 'Z'


def get_fillnet_dataset(days: int = 14) -> Tuple[pd.DataFrame, pd.Series, pd.Series, pd.Series, List[str]]:
    """
    Returns (X, y_fill, y_slip, y_ttl, feature_names)
    Falls back to empty DataFrames if no data.
    """
    start, end = time_bounds(days)
    with _connect() as conn:
        # This assumes a denormalized view exists; otherwise stub empty frames
        df = _read_query(
            conn,
            """
            SELECT *
            FROM fill_training_view
            WHERE ts BETWEEN ? AND ?
            """,
            (start, end),
        )
    if df.empty:
        return pd.DataFrame(), pd.Series(dtype=float), pd.Series(dtype=float), pd.Series(dtype=float), []

    # Basic feature selection aligned with serving-side features (placeholder: drop obvious labels/ids)
    label_fill = df.get('y_fill', pd.Series(dtype=float))
    label_slip = df.get('y_slip_bps', pd.Series(dtype=float))
    label_ttl = df.get('y_ttl_ms', pd.Series(dtype=float))
    drop_cols = {'y_fill', 'y_slip_bps', 'y_ttl_ms', 'ts', 'mint', 'txid'} & set(df.columns)
    X = df.drop(columns=list(drop_cols))
    feature_names = list(X.columns)
    return X, label_fill, label_slip, label_ttl, feature_names


def get_alpha_dataset(days: int = 14) -> Tuple[pd.DataFrame, pd.Series, pd.Series, List[str]]:
    start, end = time_bounds(days)
    with _connect() as conn:
        df = _read_query(
            conn,
            """
            SELECT * FROM alpha_training_view
            WHERE ts BETWEEN ? AND ?
            """,
            (start, end),
        )
    if df.empty:
        return pd.DataFrame(), pd.Series(dtype=float), pd.Series(dtype=float), []
    y10 = df.get('y_payoff_10m', pd.Series(dtype=float))
    y60 = df.get('y_payoff_60m', pd.Series(dtype=float))
    drop_cols = {'y_payoff_10m', 'y_payoff_60m', 'ts', 'mint'} & set(df.columns)
    X = df.drop(columns=list(drop_cols))
    return X, y10, y60, list(X.columns)


def get_rugguard_dataset(days: int = 14) -> Tuple[pd.DataFrame, pd.Series, List[str]]:
    start, end = time_bounds(days)
    with _connect() as conn:
        df = _read_query(
            conn,
            """
            SELECT * FROM rug_training_view
            WHERE ts BETWEEN ? AND ?
            """,
            (start, end),
        )
    if df.empty:
        return pd.DataFrame(), pd.Series(dtype=float), []
    y = df.get('label_rug', pd.Series(dtype=float))
    drop_cols = {'label_rug', 'ts', 'mint'} & set(df.columns)
    X = df.drop(columns=list(drop_cols))
    return X, y, list(X.columns)


def get_survival_dataset(days: int = 14) -> pd.DataFrame:
    start, end = time_bounds(days)
    with _connect() as conn:
        df = _read_query(
            conn,
            """
            SELECT * FROM survival_training_view
            WHERE ts BETWEEN ? AND ?
            """,
            (start, end),
        )
    return df

