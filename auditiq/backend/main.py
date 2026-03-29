from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import pandas as pd
import numpy as np
import json, uuid, hashlib, io
from datetime import datetime
from typing import Optional
from collections import defaultdict

from database import init_db, get_db, Transaction, UploadLog, AuditLog
from scorer import score_transactions, get_benford_chart_data

# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(title="AURA API — by IntelliShe", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://*.vercel.app", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    init_db()
    _seed_demo_data()

# ─────────────────────────────────────────────────────────────────────────────
# ROUTE 1: Health check
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "AURA API is running", "version": "2.0.0"}


# ─────────────────────────────────────────────────────────────────────────────
# ROUTE 2: Upload file
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...),
    uploaded_by: str = Form(default="Anonymous"),
    db: Session = Depends(get_db)
):
    if not (file.filename.endswith(".csv") or file.filename.endswith(".xlsx") or file.filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Only CSV and Excel files are supported.")

    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents)) if file.filename.endswith(".csv") else pd.read_excel(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {str(e)}")

    if len(df) == 0:
        raise HTTPException(status_code=400, detail="File is empty.")

    batch_id = str(uuid.uuid4())[:8].upper()
    upload_log = UploadLog(batch_id=batch_id, uploaded_by=uploaded_by,
                           filename=file.filename, row_count=len(df), status="PROCESSING")
    db.add(upload_log)
    db.commit()

    try:
        scored_df = score_transactions(df)
    except Exception as e:
        upload_log.status = "FAILED"
        db.commit()
        raise HTTPException(status_code=500, detail=f"Scoring failed: {str(e)}")

    saved_count = 0
    for _, row in scored_df.iterrows():
        txn = Transaction(
            uploaded_by=uploaded_by, upload_batch_id=batch_id,
            transaction_id=str(row.get("transaction_id", "")),
            vendor_name=str(row.get("vendor_name", ""))[:200],
            vendor_id=str(row.get("vendor_id", ""))[:50],
            employee_id=str(row.get("employee_id", ""))[:50],
            approver_id=str(row.get("approver_id", ""))[:50],
            department=str(row.get("department", ""))[:100],
            amount=float(row.get("amount", 0)),
            currency=str(row.get("currency", "INR"))[:10],
            transaction_date=str(row.get("transaction_date", ""))[:20],
            invoice_number=str(row.get("invoice_number", ""))[:100],
            description=str(row.get("description", ""))[:500],
            gl_account=str(row.get("gl_account", ""))[:50],
            risk_score=float(row.get("risk_score", 0)),
            risk_tier=str(row.get("risk_tier", "LOW")),
            flags=str(row.get("flags", "[]")),
            flag_details=str(row.get("flag_details", "{}")),
        )
        db.add(txn)
        saved_count += 1

    upload_log.status = "DONE"
    upload_log.row_count = saved_count
    db.commit()

    tier_counts = scored_df["risk_tier"].value_counts().to_dict()
    return {
        "success": True, "batch_id": batch_id,
        "rows_processed": saved_count,
        "high_risk": tier_counts.get("HIGH", 0),
        "medium_risk": tier_counts.get("MEDIUM", 0),
        "low_risk": tier_counts.get("LOW", 0),
        "message": f"Successfully analyzed {saved_count} transactions."
    }


# ─────────────────────────────────────────────────────────────────────────────
# ROUTE 3: Dashboard summary data
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/dashboard")
def get_dashboard(db: Session = Depends(get_db)):
    all_txns = db.query(Transaction).all()
    if not all_txns:
        return _empty_dashboard()

    total = len(all_txns)
    high_txns   = [t for t in all_txns if t.risk_tier == "HIGH"]
    medium_txns = [t for t in all_txns if t.risk_tier == "MEDIUM"]
    low_txns    = [t for t in all_txns if t.risk_tier == "LOW"]

    high  = len(high_txns)
    med   = len(medium_txns)
    low   = len(low_txns)

    total_amount  = sum(t.amount for t in all_txns)
    high_amount   = sum(t.amount for t in high_txns)
    medium_amount = sum(t.amount for t in medium_txns)
    low_amount    = sum(t.amount for t in low_txns)

    # Risk tier cards — amount + percentage of total
    tier_cards = [
        {
            "tier": "HIGH",
            "count": high,
            "amount": round(high_amount, 2),
            "pct_of_total": round(high / total * 100, 1) if total else 0,
            "amount_pct": round(high_amount / total_amount * 100, 1) if total_amount else 0,
        },
        {
            "tier": "MEDIUM",
            "count": med,
            "amount": round(medium_amount, 2),
            "pct_of_total": round(med / total * 100, 1) if total else 0,
            "amount_pct": round(medium_amount / total_amount * 100, 1) if total_amount else 0,
        },
        {
            "tier": "LOW",
            "count": low,
            "amount": round(low_amount, 2),
            "pct_of_total": round(low / total * 100, 1) if total else 0,
            "amount_pct": round(low_amount / total_amount * 100, 1) if total_amount else 0,
        },
    ]

    # Risk distribution donut
    risk_distribution = [
        {"name": "High Risk",   "value": high, "color": "#d92d20"},
        {"name": "Medium Risk", "value": med,  "color": "#b54708"},
        {"name": "Low Risk",    "value": low,  "color": "#6a9e0f"},
    ]

    # Monthly transactions stacked bar (HIGH / MEDIUM / LOW counts per month)
    month_map = defaultdict(lambda: {"month": "", "HIGH": 0, "MEDIUM": 0, "LOW": 0, "total": 0})
    MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
    for t in all_txns:
        try:
            date_str = str(t.transaction_date or "")
            parts = date_str.split("-")
            if len(parts) >= 2:
                month_num = int(parts[1])
                key = f"{parts[0]}-{parts[1]}"
                month_map[key]["month"] = MONTH_NAMES[month_num - 1]
                month_map[key][t.risk_tier] += 1
                month_map[key]["total"] += 1
        except Exception:
            pass

    monthly_chart = []
    for key in sorted(month_map.keys()):
        d = month_map[key]
        monthly_chart.append({
            "month": d["month"],
            "HIGH": d["HIGH"],
            "MEDIUM": d["MEDIUM"],
            "LOW": d["LOW"],
            "total": d["total"],
        })

    # Top 5 recent HIGH risk transactions (for right panel)
    recent_high = sorted(high_txns, key=lambda x: x.risk_score, reverse=True)[:5]
    recent_high_list = [_txn_to_dict(t) for t in recent_high]

    # Flag frequency
    flag_counts = {}
    for t in all_txns:
        try:
            flags = json.loads(t.flags or "[]")
            for flag in flags:
                flag_counts[flag] = flag_counts.get(flag, 0) + 1
        except Exception:
            pass
    flag_chart = [{"flag": k, "count": v} for k, v in sorted(flag_counts.items(), key=lambda x: -x[1])[:8]]

    # Benford's Law
    df = pd.DataFrame([{"amount": t.amount, "vendor_name": t.vendor_name,
                         "transaction_date": t.transaction_date} for t in all_txns])
    benford_data = get_benford_chart_data(df)

    # Recent uploads
    uploads = db.query(UploadLog).order_by(UploadLog.uploaded_at.desc()).limit(5).all()
    recent_uploads = [
        {"batch_id": u.batch_id, "uploaded_by": u.uploaded_by, "filename": u.filename,
         "row_count": u.row_count, "uploaded_at": u.uploaded_at.isoformat() if u.uploaded_at else "", "status": u.status}
        for u in uploads
    ]

    return {
        "summary": {
            "total_transactions": total,
            "high_risk": high,
            "medium_risk": med,
            "low_risk": low,
            "total_amount": round(total_amount, 2),
            "high_risk_amount": round(high_amount, 2),
            "coverage_pct": 100,
        },
        "tier_cards": tier_cards,
        "risk_distribution": risk_distribution,
        "monthly_chart": monthly_chart,
        "recent_high_risk": recent_high_list,
        "flag_chart": flag_chart,
        "benford_data": benford_data,
        "recent_uploads": recent_uploads,
    }


# ─────────────────────────────────────────────────────────────────────────────
# ROUTE 4: All transactions (paginated, filterable)
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/transactions")
def get_transactions(
    page: int = 1, limit: int = 50,
    risk_tier: Optional[str] = None,
    vendor: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Transaction)
    if risk_tier and risk_tier != "ALL":
        query = query.filter(Transaction.risk_tier == risk_tier.upper())
    if vendor:
        query = query.filter(Transaction.vendor_name.contains(vendor))
    if search:
        query = query.filter(
            Transaction.vendor_name.contains(search) |
            Transaction.transaction_id.contains(search) |
            Transaction.invoice_number.contains(search)
        )
    total = query.count()
    txns = query.order_by(Transaction.risk_score.desc()).offset((page-1)*limit).limit(limit).all()
    return {"total": total, "page": page, "limit": limit, "transactions": [_txn_to_dict(t) for t in txns]}


# ─────────────────────────────────────────────────────────────────────────────
# ROUTE 5: Single transaction detail
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/transactions/{txn_id}")
def get_transaction(txn_id: int, db: Session = Depends(get_db)):
    txn = db.query(Transaction).filter(Transaction.id == txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return _txn_to_dict(txn, detailed=True)


# ─────────────────────────────────────────────────────────────────────────────
# ROUTE 6: Audit review queue
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/audit-queue")
def get_audit_queue(db: Session = Depends(get_db)):
    high = db.query(Transaction).filter(
        Transaction.risk_tier == "HIGH", Transaction.audit_status == "PENDING"
    ).order_by(Transaction.risk_score.desc()).all()

    medium = db.query(Transaction).filter(
        Transaction.risk_tier == "MEDIUM", Transaction.audit_status == "PENDING"
    ).order_by(Transaction.risk_score.desc()).limit(50).all()

    low_all = db.query(Transaction).filter(Transaction.risk_tier == "LOW").all()
    low_total = sum(t.amount for t in low_all)

    return {
        "high_risk": [_txn_to_dict(t) for t in high],
        "medium_risk": [_txn_to_dict(t) for t in medium],
        "low_risk_summary": {
            "count": len(low_all),
            "total_amount": round(low_total, 2),
            "message": "These transactions passed all risk checks. Safe to skip with justification."
        }
    }


# ─────────────────────────────────────────────────────────────────────────────
# ROUTE 7: Audit action
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/api/audit-action/{txn_id}")
def audit_action(
    txn_id: int,
    action: str = Form(...),
    performed_by: str = Form(default="Auditor"),
    note: str = Form(default=""),
    db: Session = Depends(get_db)
):
    txn = db.query(Transaction).filter(Transaction.id == txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    valid_actions = ["APPROVED", "ESCALATED", "DISMISSED"]
    if action.upper() not in valid_actions:
        raise HTTPException(status_code=400, detail=f"Action must be one of {valid_actions}")

    txn.audit_status = action.upper()
    txn.reviewed_by = performed_by
    txn.reviewed_at = datetime.utcnow()
    txn.auditor_note = note

    log_content = f"{txn_id}|{action}|{performed_by}|{datetime.utcnow().isoformat()}"
    entry_hash = hashlib.sha256(log_content.encode()).hexdigest()
    audit_log = AuditLog(transaction_id=txn_id, action=action.upper(),
                         performed_by=performed_by, note=note, entry_hash=entry_hash)
    db.add(audit_log)
    db.commit()
    return {"success": True, "message": f"Transaction {action.lower()}.", "hash": entry_hash}


# ─────────────────────────────────────────────────────────────────────────────
# ROUTE 8: Explainability + Counterfactuals (NEW)
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/explain/{transaction_id}")
def explain_transaction_route(transaction_id: str, db: Session = Depends(get_db)):
    """
    Returns SHAP-based feature attribution + counterfactual scenarios for one transaction.
    Requires AuditExplainer to be trained on all transactions in the DB.
    """
    try:
        from explainer import explain_transaction
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Explainer module not available: {e}")

    all_txns = db.query(Transaction).all()
    if not all_txns:
        raise HTTPException(status_code=404, detail="No transactions in database.")

    # Build a DataFrame from DB rows (must include all scorer feature columns)
    rows = []
    for t in all_txns:
        try:
            flags = json.loads(t.flags or "[]")
            flag_details = json.loads(t.flag_details or "{}")
        except Exception:
            flags, flag_details = [], {}

        rows.append({
            "transaction_id": t.transaction_id,
            "vendor_name":    t.vendor_name,
            "employee_id":    t.employee_id,
            "approver_id":    t.approver_id,
            "amount":         t.amount,
            "transaction_date": t.transaction_date,
            "risk_score":     t.risk_score,
            "risk_tier":      t.risk_tier,
            "flags":          json.dumps(flags),
            "flag_details":   json.dumps(flag_details),
        })

    scored_df = pd.DataFrame(rows)

    # Check the requested transaction exists
    if transaction_id not in scored_df["transaction_id"].values:
        raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found.")

    # Re-run feature engineering so SHAP features are present
    try:
        from scorer import score_transactions as _score
        raw_cols = ["transaction_id", "vendor_name", "employee_id", "approver_id",
                    "amount", "transaction_date"]
        raw_df = scored_df[raw_cols].copy()
        re_scored = _score(raw_df)

        # Restore original risk scores from DB (don't overwrite with re-scored)
        re_scored["risk_score"] = re_scored["transaction_id"].map(
            dict(zip(scored_df["transaction_id"], scored_df["risk_score"]))
        ).fillna(re_scored["risk_score"])
        re_scored["risk_tier"] = re_scored["transaction_id"].map(
            dict(zip(scored_df["transaction_id"], scored_df["risk_tier"]))
        ).fillna(re_scored["risk_tier"])
        re_scored["flags"]        = re_scored["transaction_id"].map(
            dict(zip(scored_df["transaction_id"], scored_df["flags"]))
        ).fillna("[]")
        re_scored["flag_details"] = re_scored["transaction_id"].map(
            dict(zip(scored_df["transaction_id"], scored_df["flag_details"]))
        ).fillna("{}")

        result = explain_transaction(re_scored, transaction_id)
        return result

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Explanation failed: {str(e)}")


# ─────────────────────────────────────────────────────────────────────────────
# ROUTE 9: Vendor stats
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/stats/vendors")
def get_vendor_stats(db: Session = Depends(get_db)):
    txns = db.query(Transaction).all()
    if not txns:
        return []
    vendor_map = {}
    for t in txns:
        v = t.vendor_name or "Unknown"
        if v not in vendor_map:
            vendor_map[v] = {"vendor": v, "count": 0, "total_amount": 0, "high_risk": 0}
        vendor_map[v]["count"] += 1
        vendor_map[v]["total_amount"] += t.amount
        if t.risk_tier == "HIGH":
            vendor_map[v]["high_risk"] += 1
    return sorted(vendor_map.values(), key=lambda x: x["total_amount"], reverse=True)[:10]


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _txn_to_dict(t: Transaction, detailed: bool = False) -> dict:
    base = {
        "id": t.id, "transaction_id": t.transaction_id,
        "vendor_name": t.vendor_name, "employee_id": t.employee_id,
        "approver_id": t.approver_id, "department": t.department,
        "amount": t.amount, "currency": t.currency,
        "transaction_date": t.transaction_date, "invoice_number": t.invoice_number,
        "risk_score": t.risk_score, "risk_tier": t.risk_tier,
        "flags": json.loads(t.flags or "[]"),
        "audit_status": t.audit_status,
        "uploaded_by": t.uploaded_by,
        "uploaded_at": t.uploaded_at.isoformat() if t.uploaded_at else "",
        "upload_batch_id": t.upload_batch_id,
    }
    if detailed:
        base["flag_details"] = json.loads(t.flag_details or "{}")
        base["description"]  = t.description
        base["gl_account"]   = t.gl_account
        base["auditor_note"] = t.auditor_note
        base["reviewed_by"]  = t.reviewed_by
    return base


def _empty_dashboard():
    return {
        "summary": {"total_transactions": 0, "high_risk": 0, "medium_risk": 0,
                    "low_risk": 0, "total_amount": 0, "high_risk_amount": 0, "coverage_pct": 100},
        "tier_cards": [],
        "risk_distribution": [],
        "monthly_chart": [],
        "recent_high_risk": [],
        "flag_chart": [],
        "benford_data": {"digits": [], "observed": [], "expected": []},
        "recent_uploads": [],
    }


def _seed_demo_data():
    from database import SessionLocal
    db = SessionLocal()
    try:
        if db.query(Transaction).count() > 0:
            return

        import random
        random.seed(42)

        vendors = ["Tata Consultancy", "Infosys Ltd", "Wipro Services", "HCL Technologies",
                   "Reliance Industries", "HDFC Securities", "ICICI Ventures", "Ghost Vendor Co",
                   "Shell Corp Pvt Ltd", "Mahindra Tech"]
        departments = ["IT", "Finance", "Operations", "HR", "Marketing", "Admin"]
        employees   = ["EMP001", "EMP002", "EMP003", "EMP004", "EMP005"]

        batch_id = "DEMO01"
        db.add(UploadLog(batch_id=batch_id, uploaded_by="System",
                         filename="demo_data.csv", row_count=200, status="DONE"))
        db.commit()

        rows = []
        for i in range(200):
            vendor   = random.choice(vendors)
            emp      = random.choice(employees)
            is_fraud = vendor in ["Ghost Vendor Co", "Shell Corp Pvt Ltd"] or random.random() < 0.05
            amount   = random.choice([49800, 49900, 50000, 100000, 150000]) if is_fraud else round(random.uniform(5000, 200000), 2)
            approver = emp if (is_fraud and random.random() < 0.5) else random.choice(employees)

            rows.append({
                "transaction_id": f"TXN{str(i+1).zfill(5)}",
                "vendor_name": vendor,
                "vendor_id":   f"V{vendors.index(vendor)+1:03d}",
                "employee_id": emp, "approver_id": approver,
                "department":  random.choice(departments),
                "amount": amount, "currency": "INR",
                "transaction_date": f"2024-{random.randint(1,12):02d}-{random.randint(1,28):02d}",
                "invoice_number": f"INV-{random.randint(10000,99999)}",
                "description": "Services rendered",
                "gl_account":  f"GL{random.randint(1000,9999)}",
            })

        df = pd.DataFrame(rows)
        scored = score_transactions(df)

        for _, row in scored.iterrows():
            txn = Transaction(
                uploaded_by="System", upload_batch_id=batch_id,
                transaction_id=str(row["transaction_id"]),
                vendor_name=str(row["vendor_name"]), vendor_id=str(row["vendor_id"]),
                employee_id=str(row["employee_id"]), approver_id=str(row["approver_id"]),
                department=str(row["department"]), amount=float(row["amount"]),
                currency="INR", transaction_date=str(row["transaction_date"]),
                invoice_number=str(row["invoice_number"]),
                description="Services rendered", gl_account=str(row["gl_account"]),
                risk_score=float(row["risk_score"]), risk_tier=str(row["risk_tier"]),
                flags=str(row["flags"]), flag_details=str(row["flag_details"]),
            )
            db.add(txn)
        db.commit()
    except Exception as e:
        print(f"Demo data seed failed: {e}")
    finally:
        db.close()
