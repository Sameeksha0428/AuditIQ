import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.neighbors import LocalOutlierFactor
from sklearn.preprocessing import StandardScaler
from scipy import stats
import json
import re

# ─────────────────────────────────────────────────────────────────────────────
# RISK SCORING ENGINE
# This is the core of AuditIQ. It takes a DataFrame of transactions
# and returns the same DataFrame with risk_score, risk_tier, and flags added.
# ─────────────────────────────────────────────────────────────────────────────

def score_transactions(df: pd.DataFrame) -> pd.DataFrame:
    """
    Main entry point. Takes raw transaction DataFrame, returns it
    with risk columns added.
    """
    df = df.copy()
    df = _normalize_columns(df)
    df = _feature_engineering(df)
    df = _rule_based_scoring(df)
    df = _ml_scoring(df)
    df = _benford_scoring(df)
    df = _combine_scores(df)
    return df


# ─────────────────────────────────────────────────────────────────────────────
# STEP 1: Normalize column names
# Users may upload files with different column names — we standardize them
# ─────────────────────────────────────────────────────────────────────────────
COLUMN_ALIASES = {
    # amount variations
    "amount": "amount", "invoice_amount": "amount", "value": "amount",
    "total": "amount", "invoice_value": "amount", "transaction_amount": "amount",
    # vendor variations
    "vendor": "vendor_name", "vendor_name": "vendor_name", "supplier": "vendor_name",
    "payee": "vendor_name", "party_name": "vendor_name",
    # date variations
    "date": "transaction_date", "invoice_date": "transaction_date",
    "transaction_date": "transaction_date", "txn_date": "transaction_date",
    # employee/approver
    "employee": "employee_id", "employee_id": "employee_id", "created_by": "employee_id",
    "approver": "approver_id", "approved_by": "approver_id", "approver_id": "approver_id",
    # other
    "department": "department", "dept": "department",
    "invoice_no": "invoice_number", "invoice_number": "invoice_number", "inv_no": "invoice_number",
    "vendor_id": "vendor_id", "supplier_id": "vendor_id",
    "description": "description", "narration": "description", "remarks": "description",
    "gl_account": "gl_account", "account_code": "gl_account",
}

REQUIRED_COLS = ["amount", "vendor_name", "transaction_date"]

def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
    rename_map = {c: COLUMN_ALIASES[c] for c in df.columns if c in COLUMN_ALIASES}
    df = df.rename(columns=rename_map)

    # Add missing columns with defaults
    defaults = {
        "vendor_name": "Unknown Vendor", "vendor_id": "V000",
        "employee_id": "EMP000", "approver_id": "APR000",
        "department": "Unknown", "invoice_number": "",
        "description": "", "gl_account": "0000",
        "transaction_date": "2024-01-01", "posting_date": "",
        "currency": "INR"
    }
    for col, default in defaults.items():
        if col not in df.columns:
            df[col] = default

    # Ensure amount is numeric
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0)
    df = df[df["amount"] > 0].reset_index(drop=True)

    # Ensure transaction_id exists
    if "transaction_id" not in df.columns:
        df["transaction_id"] = ["TXN" + str(i+1).zfill(6) for i in range(len(df))]

    return df


# ─────────────────────────────────────────────────────────────────────────────
# STEP 2: Feature Engineering
# Create derived features that models and rules will use
# ─────────────────────────────────────────────────────────────────────────────
def _feature_engineering(df: pd.DataFrame) -> pd.DataFrame:
    # Parse dates
    df["_date"] = pd.to_datetime(df["transaction_date"], errors="coerce")
    df["_day_of_week"] = df["_date"].dt.dayofweek          # 0=Mon, 6=Sun
    df["_is_weekend"] = df["_day_of_week"].isin([5, 6]).astype(int)
    df["_month_end"] = (df["_date"].dt.day >= 25).astype(int)

    # Amount features
    df["_amount_log"] = np.log1p(df["amount"])
    df["_is_round_number"] = df["amount"].apply(
        lambda x: 1 if (x % 1000 == 0 or x % 500 == 0) and x > 0 else 0
    )

    # Per-vendor z-score (how unusual is this amount for this vendor?)
    vendor_stats = df.groupby("vendor_name")["amount"].agg(["mean", "std"]).rename(
        columns={"mean": "_vendor_mean", "std": "_vendor_std"}
    )
    vendor_stats["_vendor_std"] = vendor_stats["_vendor_std"].fillna(1).replace(0, 1)
    df = df.merge(vendor_stats, on="vendor_name", how="left")
    df["_vendor_zscore"] = abs((df["amount"] - df["_vendor_mean"]) / df["_vendor_std"])

    # Vendor transaction frequency this period
    vendor_freq = df.groupby("vendor_name").size().rename("_vendor_freq")
    df = df.merge(vendor_freq, on="vendor_name", how="left")

    # Self-approval flag
    df["_self_approval"] = (df["employee_id"] == df["approver_id"]).astype(int)

    # Benford first digit
    df["_first_digit"] = df["amount"].apply(
        lambda x: int(str(abs(x)).replace(".", "").lstrip("0")[0]) if x > 0 else 0
    )

    return df


# ─────────────────────────────────────────────────────────────────────────────
# STEP 3: Rule-Based Checks
# Each rule fires or doesn't fire. Each has an ISA standard reference.
# ─────────────────────────────────────────────────────────────────────────────
APPROVAL_THRESHOLD = 50000   # ₹50,000 — adjust for your dataset

def _rule_based_scoring(df: pd.DataFrame) -> pd.DataFrame:
    df["_rule_score"] = 0.0
    df["_flags"] = [[] for _ in range(len(df))]
    df["_flag_details"] = [{} for _ in range(len(df))]

    for idx, row in df.iterrows():
        flags = []
        details = {}
        score = 0.0

        # Rule 1: Self-approval (segregation of duties violation)
        if row.get("_self_approval", 0) == 1 and row["employee_id"] != "EMP000":
            flags.append("SELF_APPROVAL")
            details["SELF_APPROVAL"] = f"Employee {row['employee_id']} both created and approved this transaction. Refer ISA 315 — Segregation of Duties."
            score += 0.35

        # Rule 2: Round number (Benford's Law / fabrication indicator)
        if row.get("_is_round_number", 0) == 1 and row["amount"] >= 10000:
            flags.append("ROUND_NUMBER")
            details["ROUND_NUMBER"] = f"Amount ₹{row['amount']:,.0f} is a suspicious round number. Refer ISA 240 — Management Override."
            score += 0.20

        # Rule 3: Just below approval threshold (split invoice fraud)
        if APPROVAL_THRESHOLD * 0.9 <= row["amount"] < APPROVAL_THRESHOLD:
            flags.append("BELOW_THRESHOLD")
            details["BELOW_THRESHOLD"] = f"Amount ₹{row['amount']:,.0f} is just below ₹{APPROVAL_THRESHOLD:,} approval threshold. Possible split invoice. Refer ISA 240."
            score += 0.30

        # Rule 4: Weekend posting
        if row.get("_is_weekend", 0) == 1:
            flags.append("WEEKEND_POSTING")
            details["WEEKEND_POSTING"] = f"Transaction posted on {'Saturday' if row['_day_of_week']==5 else 'Sunday'}. No oversight period. Refer ISA 315."
            score += 0.20

        # Rule 5: Large amount for this vendor (z-score > 3)
        if row.get("_vendor_zscore", 0) > 3:
            flags.append("VENDOR_AMOUNT_SPIKE")
            details["VENDOR_AMOUNT_SPIKE"] = f"Amount is {row['_vendor_zscore']:.1f}σ above vendor's normal range (avg: ₹{row.get('_vendor_mean',0):,.0f}). Refer ISA 240."
            score += 0.25

        # Rule 6: Month-end posting
        if row.get("_month_end", 0) == 1:
            flags.append("MONTH_END_POSTING")
            details["MONTH_END_POSTING"] = "Transaction posted in last 7 days of month. Common period for earnings manipulation. Refer ISA 240."
            score += 0.10

        # Rule 7: Very high single transaction
        if row["amount"] > 500000:
            flags.append("HIGH_VALUE")
            details["HIGH_VALUE"] = f"High-value transaction of ₹{row['amount']:,.0f}. Requires enhanced scrutiny. Refer ISA 240."
            score += 0.15

        df.at[idx, "_rule_score"] = min(score, 1.0)
        df.at[idx, "_flags"] = flags
        df.at[idx, "_flag_details"] = details

    # Check for duplicates across the whole dataset
    df = _check_duplicates(df)

    return df


def _check_duplicates(df: pd.DataFrame) -> pd.DataFrame:
    """Flag transactions that look like duplicates (same vendor + similar amount)"""
    df["_amount_bucket"] = (df["amount"] // 100) * 100  # bucket to nearest 100

    dup_counts = df.groupby(["vendor_name", "_amount_bucket"]).size().reset_index(name="_dup_count")
    df = df.merge(dup_counts, on=["vendor_name", "_amount_bucket"], how="left")

    for idx, row in df[df["_dup_count"] > 1].iterrows():
        if "DUPLICATE_INVOICE" not in df.at[idx, "_flags"]:
            df.at[idx, "_flags"] = df.at[idx, "_flags"] + ["DUPLICATE_INVOICE"]
            df.at[idx, "_flag_details"]["DUPLICATE_INVOICE"] = (
                f"Possible duplicate: {int(row['_dup_count'])} transactions from {row['vendor_name']} "
                f"with similar amount (±₹100). Refer ISA 505 — External Confirmations."
            )
            df.at[idx, "_rule_score"] = min(df.at[idx, "_rule_score"] + 0.30, 1.0)

    return df


# ─────────────────────────────────────────────────────────────────────────────
# STEP 4: ML Anomaly Detection
# Isolation Forest + Local Outlier Factor (both unsupervised — no labels needed)
# ─────────────────────────────────────────────────────────────────────────────
ML_FEATURES = ["_amount_log", "_vendor_zscore", "_is_weekend", "_is_round_number",
               "_month_end", "_self_approval", "_vendor_freq"]

def _ml_scoring(df: pd.DataFrame) -> pd.DataFrame:
    if len(df) < 10:
        df["_ml_score"] = 0.0
        return df

    feature_cols = [c for c in ML_FEATURES if c in df.columns]
    X = df[feature_cols].fillna(0).values

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Isolation Forest
    iso = IsolationForest(contamination=0.05, n_estimators=200, random_state=42)
    iso.fit(X_scaled)
    iso_scores = -iso.score_samples(X_scaled)

    # Local Outlier Factor
    lof = LocalOutlierFactor(n_neighbors=min(20, len(df)-1), contamination=0.05, novelty=False)
    lof_raw = lof.fit_predict(X_scaled)
    lof_scores = -lof.negative_outlier_factor_

    # Normalize both to 0-1
    def normalize(arr):
        mn, mx = arr.min(), arr.max()
        if mx == mn:
            return np.zeros_like(arr)
        return (arr - mn) / (mx - mn)

    iso_norm = normalize(iso_scores)
    lof_norm = normalize(lof_scores)

    # Combine: 60% IsoForest, 40% LOF
    df["_ml_score"] = iso_norm * 0.6 + lof_norm * 0.4
    return df


# ─────────────────────────────────────────────────────────────────────────────
# STEP 5: Benford's Law
# Checks first-digit distribution per vendor
# Returns a per-transaction score based on their vendor's Benford deviation
# ─────────────────────────────────────────────────────────────────────────────
BENFORD_EXPECTED = {1: 0.301, 2: 0.176, 3: 0.125, 4: 0.097,
                    5: 0.079, 6: 0.067, 7: 0.058, 8: 0.051, 9: 0.046}

def _benford_scoring(df: pd.DataFrame) -> pd.DataFrame:
    df["_benford_score"] = 0.0

    for vendor in df["vendor_name"].unique():
        vendor_mask = df["vendor_name"] == vendor
        vendor_df = df[vendor_mask]

        if len(vendor_df) < 10:
            continue

        # Get first digit distribution for this vendor
        first_digits = vendor_df["_first_digit"].value_counts(normalize=True)
        observed = [first_digits.get(d, 0) for d in range(1, 10)]
        expected = [BENFORD_EXPECTED[d] for d in range(1, 10)]

        # Chi-square test
        try:
            chi2, p_value = stats.chisquare(f_obs=observed, f_exp=expected)
            # Low p-value = distribution doesn't follow Benford = suspicious
            benford_score = max(0, 1 - p_value) * 0.5   # scale to 0-0.5 max
            df.loc[vendor_mask, "_benford_score"] = benford_score
        except Exception:
            pass

    return df


# ─────────────────────────────────────────────────────────────────────────────
# STEP 6: Combine all scores into final risk score
# Weights: Rules 40%, ML 35%, Benford 15%, Vendor spike bonus 10%
# ─────────────────────────────────────────────────────────────────────────────
def _combine_scores(df: pd.DataFrame) -> pd.DataFrame:
    rule_w    = 0.40
    ml_w      = 0.35
    benford_w = 0.15
    spike_w   = 0.10

    # Normalize vendor zscore to 0-1
    max_z = df["_vendor_zscore"].max() if df["_vendor_zscore"].max() > 0 else 1
    vendor_norm = (df["_vendor_zscore"] / max_z).clip(0, 1)

    df["risk_score"] = (
        df["_rule_score"]    * rule_w +
        df["_ml_score"]      * ml_w +
        df["_benford_score"] * benford_w +
        vendor_norm          * spike_w
    ).clip(0, 1).round(4)

    # Tier assignment
    def assign_tier(score):
        if score >= 0.55:   return "HIGH"
        elif score >= 0.30: return "MEDIUM"
        else:               return "LOW"

    df["risk_tier"] = df["risk_score"].apply(assign_tier)

    # Convert flags to JSON strings for database storage
    df["flags"]       = df["_flags"].apply(json.dumps)
    df["flag_details"] = df["_flag_details"].apply(json.dumps)

    return df


# ─────────────────────────────────────────────────────────────────────────────
# Utility: get Benford data for the chart (used by dashboard API)
# ─────────────────────────────────────────────────────────────────────────────
def get_benford_chart_data(df: pd.DataFrame) -> dict:
    if "_first_digit" not in df.columns:
        df = df.copy()
        df["_first_digit"] = df["amount"].apply(
            lambda x: int(str(abs(x)).replace(".", "").lstrip("0")[0]) if x > 0 else 0
        )

    observed = df["_first_digit"].value_counts(normalize=True).sort_index()
    return {
        "digits": list(range(1, 10)),
        "observed": [round(observed.get(d, 0) * 100, 2) for d in range(1, 10)],
        "expected": [round(BENFORD_EXPECTED[d] * 100, 2) for d in range(1, 10)]
    }