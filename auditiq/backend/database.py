from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

# This creates a file called auditiq.db in your backend folder
# SQLite = a simple database that lives in one file, no setup needed
DATABASE_URL = "sqlite:///./auditiq.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ── TABLE 1: Every uploaded transaction lives here ──────────────────────────
class Transaction(Base):
    __tablename__ = "transactions"

    id               = Column(Integer, primary_key=True, index=True)
    
    # Who uploaded this batch and when
    uploaded_by      = Column(String, default="Unknown")
    upload_batch_id  = Column(String)          # groups transactions from same upload
    uploaded_at      = Column(DateTime, default=datetime.utcnow)
    
    # Core transaction fields
    transaction_id   = Column(String, index=True)
    vendor_name      = Column(String)
    vendor_id        = Column(String)
    employee_id      = Column(String)          # who created/approved the transaction
    approver_id      = Column(String)          # who approved it
    department       = Column(String)
    amount           = Column(Float)
    currency         = Column(String, default="INR")
    transaction_date = Column(String)
    posting_date     = Column(String)
    gl_account       = Column(String)
    description      = Column(Text)
    invoice_number   = Column(String)
    
    # Risk scoring results (filled after analysis)
    risk_score       = Column(Float, default=0.0)   # 0.0 to 1.0
    risk_tier        = Column(String, default="PENDING")  # HIGH / MEDIUM / LOW / PENDING
    
    # Which rules fired
    flags            = Column(Text, default="[]")   # JSON list of flag names
    flag_details     = Column(Text, default="{}")   # JSON dict with explanations
    
    # Auditor actions
    audit_status     = Column(String, default="PENDING")  # PENDING / APPROVED / ESCALATED / DISMISSED
    auditor_note     = Column(Text, default="")
    reviewed_by      = Column(String, default="")
    reviewed_at      = Column(DateTime, nullable=True)


# ── TABLE 2: Every upload event is logged here ───────────────────────────────
class UploadLog(Base):
    __tablename__ = "upload_logs"

    id               = Column(Integer, primary_key=True, index=True)
    batch_id         = Column(String, unique=True)
    uploaded_by      = Column(String)
    filename         = Column(String)
    row_count        = Column(Integer)
    uploaded_at      = Column(DateTime, default=datetime.utcnow)
    status           = Column(String, default="PROCESSING")  # PROCESSING / DONE / FAILED


# ── TABLE 3: Auditor action trail (tamper-evident log) ───────────────────────
class AuditLog(Base):
    __tablename__ = "audit_logs"

    id               = Column(Integer, primary_key=True, index=True)
    transaction_id   = Column(Integer)         # FK to transactions.id
    action           = Column(String)          # APPROVED / ESCALATED / DISMISSED / VIEWED
    performed_by     = Column(String)
    note             = Column(Text, default="")
    performed_at     = Column(DateTime, default=datetime.utcnow)
    entry_hash       = Column(String)          # SHA-256 of this record (tamper detection)


# ── Creates all tables if they don't exist ───────────────────────────────────
def init_db():
    Base.metadata.create_all(bind=engine)


# ── Dependency injection for FastAPI routes ──────────────────────────────────
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()