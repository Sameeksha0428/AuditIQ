import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api";
import {
  RiskBadge, ScoreBar, FlagTags, StatusBadge,
  formatAmount, formatDate, Loading, Empty, Toast
} from "../components/Shared";

const FLAG_LABELS = {
  SELF_APPROVAL:       "Self Approval",
  ROUND_NUMBER:        "Round Number",
  BELOW_THRESHOLD:     "Below Threshold",
  WEEKEND_POSTING:     "Weekend Posting",
  VENDOR_AMOUNT_SPIKE: "Amount Spike",
  MONTH_END_POSTING:   "Month End",
  HIGH_VALUE:          "High Value",
  DUPLICATE_INVOICE:   "Duplicate Invoice",
};

const ISA_REFS = {
  SELF_APPROVAL:       "ISA 315 — Segregation of duties",
  ROUND_NUMBER:        "ISA 240 — Management override",
  BELOW_THRESHOLD:     "ISA 240 — Split invoice fraud",
  WEEKEND_POSTING:     "ISA 315 — Absence of oversight",
  VENDOR_AMOUNT_SPIKE: "ISA 240 — Unusual transactions",
  MONTH_END_POSTING:   "ISA 240 — Earnings manipulation",
  HIGH_VALUE:          "ISA 240 — Enhanced scrutiny",
  DUPLICATE_INVOICE:   "ISA 505 — External confirmations",
};

export default function Transactions() {
  const [txns, setTxns]           = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState(null);
  const [detail, setDetail]       = useState(null);
  const [detailLoading, setDL]    = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [toast, setToast]         = useState(null);

  // Filters
  const [riskFilter, setRiskFilter] = useState("ALL");
  const [search, setSearch]         = useState("");
  const [searchInput, setSearchInput] = useState("");
  const searchTimer = useRef(null);

  const LIMIT = 50;

  const load = useCallback(() => {
    setLoading(true);
    api.getTransactions({ page, limit: LIMIT, risk_tier: riskFilter, search })
      .then(d => { setTxns(d.transactions); setTotal(d.total); setLoading(false); })
      .catch(() => setLoading(false));
  }, [page, riskFilter, search]);

  useEffect(() => { load(); }, [load]);

  // debounced search
  const handleSearchInput = (v) => {
    setSearchInput(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setSearch(v); setPage(1); }, 400);
  };

  const openDetail = (t) => {
    setSelected(t.id);
    setDL(true);
    api.getTransaction(t.id)
      .then(d => { setDetail(d); setDL(false); })
      .catch(() => setDL(false));
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div style={{ display: "flex", gap: 0, height: "calc(100vh - 56px)", overflow: "hidden" }}>
      {/* Main table area */}
      <div style={{ flex: 1, overflowY: "auto", paddingRight: selected ? 16 : 0 }}>
        {/* Header */}
        <div className="page-header" style={{ marginBottom: 16 }}>
          <div>
            <div className="page-title">Transactions</div>
            <div className="page-subtitle">{total.toLocaleString()} records · sorted by risk score</div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowUpload(true)}>↑ Upload New Data</button>
        </div>

        {/* Filter bar */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <input
            className="input"
            style={{ maxWidth: 260 }}
            placeholder="Search vendor, invoice, ID..."
            value={searchInput}
            onChange={e => handleSearchInput(e.target.value)}
          />
          <select className="input" style={{ width: 160 }} value={riskFilter}
            onChange={e => { setRiskFilter(e.target.value); setPage(1); }}>
            <option value="ALL">All Risk Tiers</option>
            <option value="HIGH">🔴 High Risk</option>
            <option value="MEDIUM">🟡 Medium Risk</option>
            <option value="LOW">🟢 Low Risk</option>
          </select>
          <button className="btn btn-ghost btn-sm" onClick={() => { setRiskFilter("ALL"); setSearch(""); setSearchInput(""); setPage(1); }}>
            Clear
          </button>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "var(--text3)" }}>
              Page {page} of {totalPages || 1}
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="table-card" style={{ marginBottom: 0 }}>
          {loading ? (
            <div style={{ padding: 40 }}><Loading /></div>
          ) : txns.length === 0 ? (
            <Empty icon="📭" text="No transactions match the current filters" />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Vendor</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th>Employee → Approver</th>
                  <th>Dept</th>
                  <th>Risk Score</th>
                  <th>Tier</th>
                  <th>Flags</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {txns.map(t => (
                  <tr
                    key={t.id}
                    onClick={() => openDetail(t)}
                    style={{
                      cursor: "pointer",
                      background: selected === t.id ? "rgba(134,188,37,0.05)" : undefined,
                      borderLeft: selected === t.id ? "2px solid var(--green)" : "2px solid transparent",
                    }}
                  >
                    <td style={{ color: "var(--text3)", fontSize: 10 }}>{t.transaction_id}</td>
                    <td>
                      <div style={{ color: "var(--text)", fontWeight: 500, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {t.vendor_name}
                      </div>
                      <div style={{ fontSize: 9, color: "var(--text3)" }}>Batch {t.upload_batch_id}</div>
                    </td>
                    <td style={{ color: "var(--text)", fontWeight: 600 }}>{formatAmount(t.amount)}</td>
                    <td style={{ color: "var(--text3)", fontSize: 11 }}>{formatDate(t.transaction_date)}</td>
                    <td style={{ fontSize: 11 }}>
                      <span style={{ color: "var(--blue)" }}>{t.employee_id}</span>
                      <span style={{ color: "var(--text3)" }}> → </span>
                      <span style={{ color: t.employee_id === t.approver_id ? "var(--red)" : "var(--text2)" }}>
                        {t.approver_id}
                        {t.employee_id === t.approver_id && " ⚠"}
                      </span>
                    </td>
                    <td style={{ color: "var(--text3)", fontSize: 11 }}>{t.department}</td>
                    <td style={{ minWidth: 110 }}><ScoreBar score={t.risk_score} /></td>
                    <td><RiskBadge tier={t.risk_tier} /></td>
                    <td><FlagTags flags={t.flags} /></td>
                    <td><StatusBadge status={t.audit_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <button className="page-btn" disabled={page === 1} onClick={() => setPage(1)}>«</button>
              <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
              <span className="page-info">{page} / {totalPages}</span>
              <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</button>
              <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(totalPages)}>»</button>
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="detail-panel" style={{ position: "sticky", top: 0, height: "calc(100vh - 56px)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ fontFamily: "var(--font-head)", fontSize: 15, fontWeight: 800 }}>Transaction Detail</div>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSelected(null); setDetail(null); }}>✕</button>
          </div>

          {detailLoading ? <Loading /> : detail ? (
            <>
              {/* Risk score big display */}
              <div style={{
                background: "var(--bg3)", borderRadius: "var(--radius-lg)",
                padding: 16, marginBottom: 16, textAlign: "center"
              }}>
                <div style={{ fontSize: 10, color: "var(--text3)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Risk Score</div>
                <div style={{
                  fontSize: 48, fontWeight: 800, fontFamily: "var(--font-head)",
                  color: detail.risk_score >= 0.55 ? "var(--red)" : detail.risk_score >= 0.30 ? "var(--amber)" : "var(--green)"
                }}>
                  {Math.round(detail.risk_score * 100)}
                </div>
                <RiskBadge tier={detail.risk_tier} />
              </div>

              {/* Core fields */}
              <div className="detail-section">
                <div className="detail-section-title">Transaction Info</div>
                {[
                  ["ID", detail.transaction_id],
                  ["Vendor", detail.vendor_name],
                  ["Amount", formatAmount(detail.amount)],
                  ["Date", formatDate(detail.transaction_date)],
                  ["Invoice #", detail.invoice_number || "—"],
                  ["GL Account", detail.gl_account || "—"],
                  ["Department", detail.department],
                  ["Currency", detail.currency],
                ].map(([k, v]) => (
                  <div key={k} className="detail-row">
                    <span className="detail-key">{k}</span>
                    <span className="detail-val">{v}</span>
                  </div>
                ))}
              </div>

              {/* People */}
              <div className="detail-section">
                <div className="detail-section-title">People</div>
                {[
                  ["Uploaded by", detail.uploaded_by],
                  ["Employee", detail.employee_id],
                  ["Approver", detail.approver_id],
                  ["Reviewed by", detail.reviewed_by || "—"],
                ].map(([k, v]) => (
                  <div key={k} className="detail-row">
                    <span className="detail-key">{k}</span>
                    <span className="detail-val" style={{
                      color: k === "Approver" && detail.employee_id === detail.approver_id ? "var(--red)" : undefined
                    }}>
                      {v}
                      {k === "Approver" && detail.employee_id === detail.approver_id && " ⚠ Self-approved"}
                    </span>
                  </div>
                ))}
              </div>

              {/* Flags with ISA references */}
              {detail.flags?.length > 0 && (
                <div className="detail-section">
                  <div className="detail-section-title">Risk Flags & Audit References</div>
                  {detail.flags.map(flag => (
                    <div key={flag} style={{
                      background: "var(--bg3)", borderRadius: "var(--radius)",
                      padding: "10px 12px", marginBottom: 8,
                      borderLeft: "3px solid var(--red)"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span className="flag-tag">{FLAG_LABELS[flag] || flag}</span>
                        <span style={{ fontSize: 9, color: "var(--text3)" }}>{ISA_REFS[flag] || ""}</span>
                      </div>
                      {detail.flag_details?.[flag] && (
                        <div style={{ fontSize: 10, color: "var(--text2)", lineHeight: 1.5 }}>
                          {detail.flag_details[flag]}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Audit status */}
              <div className="detail-section">
                <div className="detail-section-title">Audit Status</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <StatusBadge status={detail.audit_status} />
                  {detail.auditor_note && (
                    <span style={{ fontSize: 10, color: "var(--text3)" }}>{detail.auditor_note}</span>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={(msg) => { setToast({ message: msg, type: "success" }); load(); }}
          onError={(msg) => setToast({ message: msg, type: "error" })}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ── Upload Modal ──────────────────────────────────────────────────────────────
function UploadModal({ onClose, onSuccess, onError }) {
  const [file, setFile]         = useState(null);
  const [name, setName]         = useState("");
  const [loading, setLoading]   = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef();

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  };

  const submit = async () => {
    if (!file) return;
    if (!name.trim()) { onError("Please enter your name."); return; }
    setLoading(true);
    try {
      const res = await api.uploadFile(file, name.trim());
      onSuccess(`Analyzed ${res.rows_processed} rows — ${res.high_risk} high risk, ${res.medium_risk} medium, ${res.low_risk} low.`);
      onClose();
    } catch (e) {
      onError(e.message || "Upload failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Upload Transaction Data</div>
        <div className="modal-sub">CSV or Excel file. We'll run full risk analysis automatically.</div>

        <div
          className={`upload-zone ${dragging ? "dragging" : ""}`}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current.click()}
        >
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }}
            onChange={e => setFile(e.target.files[0])} />
          <div className="upload-zone-icon">{file ? "📄" : "☁"}</div>
          <div className="upload-zone-text">
            {file ? file.name : "Drop your file here or click to browse"}
          </div>
          <div className="upload-zone-hint">Supports .csv, .xlsx, .xls · Max 10MB</div>
        </div>

        {/* Column hint */}
        <div style={{ background: "var(--bg3)", borderRadius: "var(--radius)", padding: "12px 14px", marginBottom: 16, fontSize: 10, color: "var(--text3)" }}>
          <div style={{ color: "var(--green)", fontWeight: 600, marginBottom: 4 }}>Expected columns (we auto-detect names):</div>
          amount, vendor_name, transaction_date, employee_id, approver_id, department, invoice_number, description
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: "var(--text3)", marginBottom: 6 }}>Your name (for audit trail)</div>
          <input className="input" placeholder="e.g. Ashish Kumar" value={name} onChange={e => setName(e.target.value)} />
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading || !file}>
            {loading ? <><span className="spinner" /> Analyzing...</> : "↑ Upload & Analyze"}
          </button>
        </div>
      </div>
    </div>
  );
}
