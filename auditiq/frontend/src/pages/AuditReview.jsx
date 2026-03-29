import { useState, useEffect } from "react";
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
  SELF_APPROVAL:       "ISA 315",
  ROUND_NUMBER:        "ISA 240",
  BELOW_THRESHOLD:     "ISA 240",
  WEEKEND_POSTING:     "ISA 315",
  VENDOR_AMOUNT_SPIKE: "ISA 240",
  MONTH_END_POSTING:   "ISA 240",
  HIGH_VALUE:          "ISA 240",
  DUPLICATE_INVOICE:   "ISA 505",
};

export default function AuditReview() {
  const [queue, setQueue]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState("high");
  const [selected, setSelected] = useState(null);
  const [actionModal, setActionModal] = useState(null);  // { txn, action }
  const [toast, setToast]       = useState(null);

  const load = () => {
    setLoading(true);
    api.getAuditQueue()
      .then(d => { setQueue(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const txnList = queue
    ? (tab === "high" ? queue.high_risk : queue.medium_risk)
    : [];

  const selectedTxn = txnList.find(t => t.id === selected);

  const doAction = async (txnId, action, performedBy, note) => {
    try {
      await api.auditAction(txnId, action, performedBy, note);
      setToast({ message: `Transaction ${action.toLowerCase()} successfully.`, type: "success" });
      setActionModal(null);
      setSelected(null);
      load();
    } catch (e) {
      setToast({ message: e.message || "Action failed.", type: "error" });
    }
  };

  if (loading) return <Loading text="Loading audit queue..." />;

  return (
    <div style={{ display: "flex", gap: 0, height: "calc(100vh - 56px)", overflow: "hidden" }}>

      {/* Left: triage queue */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div className="page-header" style={{ marginBottom: 16 }}>
          <div>
            <div className="page-title">Audit Review</div>
            <div className="page-subtitle">Triage flagged transactions · every action is logged with a tamper-evident hash</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs">
          <button className={`tab ${tab === "high" ? "active" : ""}`} onClick={() => { setTab("high"); setSelected(null); }}>
            🔴 High Risk ({queue?.high_risk?.length || 0})
          </button>
          <button className={`tab ${tab === "medium" ? "active" : ""}`} onClick={() => { setTab("medium"); setSelected(null); }}>
            🟡 Medium Risk ({queue?.medium_risk?.length || 0})
          </button>
          <button className={`tab ${tab === "low" ? "active" : ""}`} onClick={() => setTab("low")}>
            🟢 Low Risk — Safe to Skip
          </button>
        </div>

        {/* Low risk safe-to-skip certificate */}
        {tab === "low" ? (
          <SafeToSkipCertificate data={queue?.low_risk_summary} />
        ) : txnList.length === 0 ? (
          <div className="table-card">
            <Empty icon="✅" text={`No pending ${tab}-risk transactions. Queue is clear.`} />
          </div>
        ) : (
          <div className="table-card">
            <div className="table-header">
              <span className="table-header-title">
                {tab === "high" ? "⚠ High Risk Queue" : "◎ Medium Risk Queue"}
                <span style={{ fontSize: 10, color: "var(--text3)", fontWeight: 400, marginLeft: 8 }}>
                  — click a row to review, then approve / escalate / dismiss
                </span>
              </span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th>Employee → Approver</th>
                  <th>Risk Score</th>
                  <th>Flags</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {txnList.map(t => (
                  <tr
                    key={t.id}
                    onClick={() => setSelected(t.id === selected ? null : t.id)}
                    style={{
                      cursor: "pointer",
                      background: selected === t.id ? "rgba(134,188,37,0.04)" : undefined,
                      borderLeft: selected === t.id ? "2px solid var(--green)" : "2px solid transparent",
                    }}
                  >
                    <td>
                      <div style={{ color: "var(--text)", fontWeight: 500 }}>{t.vendor_name}</div>
                      <div style={{ fontSize: 10, color: "var(--text3)" }}>{t.transaction_id}</div>
                    </td>
                    <td style={{ color: "var(--text)", fontWeight: 600 }}>{formatAmount(t.amount)}</td>
                    <td style={{ fontSize: 11, color: "var(--text3)" }}>{formatDate(t.transaction_date)}</td>
                    <td style={{ fontSize: 11 }}>
                      <span style={{ color: "var(--blue)" }}>{t.employee_id}</span>
                      <span style={{ color: "var(--text3)" }}> → </span>
                      <span style={{ color: t.employee_id === t.approver_id ? "var(--red)" : "var(--text2)" }}>
                        {t.approver_id}
                        {t.employee_id === t.approver_id && " ⚠"}
                      </span>
                    </td>
                    <td style={{ minWidth: 110 }}><ScoreBar score={t.risk_score} /></td>
                    <td><FlagTags flags={t.flags} /></td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="action-row">
                        <button className="btn btn-success btn-sm"
                          onClick={() => setActionModal({ txn: t, action: "APPROVED" })}>✓</button>
                        <button className="btn btn-danger btn-sm"
                          onClick={() => setActionModal({ txn: t, action: "ESCALATED" })}>↑</button>
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => setActionModal({ txn: t, action: "DISMISSED" })}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Right: detail panel */}
      {selectedTxn && (
        <div className="detail-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ fontFamily: "var(--font-head)", fontSize: 15, fontWeight: 800 }}>Audit Review</div>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>✕</button>
          </div>

          {/* Risk score */}
          <div style={{ background: "var(--bg3)", borderRadius: "var(--radius-lg)", padding: 16, marginBottom: 16, textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "var(--text3)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Composite Risk Score</div>
            <div style={{
              fontSize: 52, fontWeight: 800, fontFamily: "var(--font-head)",
              color: selectedTxn.risk_score >= 0.55 ? "var(--red)" : selectedTxn.risk_score >= 0.30 ? "var(--amber)" : "var(--green)"
            }}>
              {Math.round(selectedTxn.risk_score * 100)}
            </div>
            <RiskBadge tier={selectedTxn.risk_tier} />
          </div>

          {/* Quick facts */}
          <div style={{ marginBottom: 16 }}>
            {[
              ["Vendor", selectedTxn.vendor_name],
              ["Amount", formatAmount(selectedTxn.amount)],
              ["Date", formatDate(selectedTxn.transaction_date)],
              ["Invoice", selectedTxn.invoice_number || "—"],
              ["Department", selectedTxn.department],
              ["Uploaded by", selectedTxn.uploaded_by],
            ].map(([k, v]) => (
              <div key={k} className="detail-row">
                <span className="detail-key">{k}</span>
                <span className="detail-val">{v}</span>
              </div>
            ))}
            <div className="detail-row">
              <span className="detail-key">Employee → Approver</span>
              <span className="detail-val" style={{ color: selectedTxn.employee_id === selectedTxn.approver_id ? "var(--red)" : undefined }}>
                {selectedTxn.employee_id} → {selectedTxn.approver_id}
                {selectedTxn.employee_id === selectedTxn.approver_id && " ⚠ SELF"}
              </span>
            </div>
          </div>

          {/* Flags with ISA */}
          {selectedTxn.flags?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: "var(--text3)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
                Risk Flags — Audit Standards
              </div>
              {selectedTxn.flags.map(flag => (
                <div key={flag} style={{
                  background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)",
                  borderRadius: "var(--radius)", padding: "9px 12px", marginBottom: 6
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span className="flag-tag">{FLAG_LABELS[flag] || flag}</span>
                    <span style={{ fontSize: 9, color: "var(--amber)", fontWeight: 600 }}>{ISA_REFS[flag]}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ fontSize: 10, color: "var(--text3)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>
            Auditor Action
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button className="btn btn-success" onClick={() => setActionModal({ txn: selectedTxn, action: "APPROVED" })}>
              ✓ Approve — no further action needed
            </button>
            <button className="btn btn-danger" onClick={() => setActionModal({ txn: selectedTxn, action: "ESCALATED" })}>
              ↑ Escalate — requires senior review
            </button>
            <button className="btn btn-ghost" onClick={() => setActionModal({ txn: selectedTxn, action: "DISMISSED" })}>
              ✕ Dismiss — false positive
            </button>
          </div>
        </div>
      )}

      {/* Action confirmation modal */}
      {actionModal && (
        <ActionModal
          txn={actionModal.txn}
          action={actionModal.action}
          onConfirm={doAction}
          onClose={() => setActionModal(null)}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ── Action confirmation modal ──────────────────────────────────────────────
function ActionModal({ txn, action, onConfirm, onClose }) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const config = {
    APPROVED:  { label: "Approve",  color: "#22c55e", icon: "✓", desc: "Mark as reviewed — no further action required." },
    ESCALATED: { label: "Escalate", color: "var(--red)", icon: "↑", desc: "Flag for senior partner review and potential investigation." },
    DISMISSED: { label: "Dismiss",  color: "var(--text3)", icon: "✕", desc: "Mark as false positive — system will learn to deprioritize similar patterns." },
  }[action];

  const handle = async () => {
    if (!name.trim()) return;
    setLoading(true);
    await onConfirm(txn.id, action, name.trim(), note.trim());
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 20, color: config.color }}>{config.icon}</span>
          <div className="modal-title">{config.label} Transaction</div>
        </div>
        <div className="modal-sub">{config.desc}</div>

        {/* Transaction summary */}
        <div style={{ background: "var(--bg3)", borderRadius: "var(--radius)", padding: "12px 14px", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: "var(--text)", fontWeight: 600 }}>{txn.vendor_name}</span>
            <span style={{ fontSize: 12, color: "var(--text)", fontWeight: 600 }}>{formatAmount(txn.amount)}</span>
          </div>
          <div style={{ fontSize: 10, color: "var(--text3)" }}>
            {txn.transaction_id} · {formatDate(txn.transaction_date)} · Risk: {Math.round(txn.risk_score * 100)}%
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "var(--text3)", marginBottom: 5 }}>Your name (required for audit trail)</div>
          <input className="input" placeholder="e.g. Sarah Johnson" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: "var(--text3)", marginBottom: 5 }}>Note (optional)</div>
          <textarea className="input" rows={3} placeholder="Add context, reasoning, or reference..."
            value={note} onChange={e => setNote(e.target.value)}
            style={{ resize: "vertical", minHeight: 60 }} />
        </div>

        <div style={{ fontSize: 9, color: "var(--text3)", marginBottom: 16, fontStyle: "italic" }}>
          ⚑ This action will be SHA-256 hashed and stored in the immutable audit trail.
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn"
            style={{ background: config.color, color: action === "DISMISSED" ? "var(--text)" : "#000" }}
            onClick={handle}
            disabled={loading || !name.trim()}
          >
            {loading ? <><span className="spinner" /> Processing...</> : `${config.icon} Confirm ${config.label}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Safe-to-Skip Certificate ───────────────────────────────────────────────
function SafeToSkipCertificate({ data }) {
  if (!data) return null;
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(34,197,94,0.06), rgba(134,188,37,0.04))",
      border: "1px solid rgba(134,188,37,0.25)",
      borderRadius: "var(--radius-lg)",
      padding: 28,
      maxWidth: 700,
    }}>
      {/* Certificate header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "var(--font-head)", fontSize: 20, fontWeight: 800, color: "var(--green)", marginBottom: 4 }}>
            Safe-to-Skip Certificate
          </div>
          <div style={{ fontSize: 11, color: "var(--text3)" }}>
            AuditIQ · Auto-generated · {today}
          </div>
        </div>
        <div style={{
          background: "rgba(134,188,37,0.12)", border: "1px solid var(--green)",
          borderRadius: "var(--radius)", padding: "6px 14px",
          fontSize: 11, fontWeight: 700, color: "var(--green)"
        }}>
          ✓ LOW RISK CLEARED
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Transactions Assessed", val: data.count?.toLocaleString() || "0" },
          { label: "Total Value", val: formatAmount(data.total_amount || 0) },
          { label: "Recommended Sample", val: "0%" },
        ].map(s => (
          <div key={s.label} style={{ background: "var(--bg3)", borderRadius: "var(--radius)", padding: "12px 14px" }}>
            <div style={{ fontSize: 9, color: "var(--text3)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--green)", fontFamily: "var(--font-head)" }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Justification text */}
      <div style={{ background: "var(--bg3)", borderRadius: "var(--radius)", padding: "14px 16px", marginBottom: 20, fontSize: 11, color: "var(--text2)", lineHeight: 1.8 }}>
        <strong style={{ color: "var(--text)", display: "block", marginBottom: 6 }}>Automated Audit Justification</strong>
        The above {data.count?.toLocaleString()} transactions were assessed as LOW RISK based on the following criteria:
        <ul style={{ paddingLeft: 16, marginTop: 8, color: "var(--text3)" }}>
          <li>All amounts conform to Benford's Law (first-digit distribution within expected range)</li>
          <li>No duplicate invoice patterns detected (ISA 505)</li>
          <li>All transactions processed within normal business hours and working days</li>
          <li>No segregation-of-duties violations (ISA 315)</li>
          <li>Amounts within ±2σ of historical vendor range</li>
          <li>No split-invoice patterns below approval threshold (ISA 240)</li>
        </ul>
      </div>

      <div style={{ fontSize: 10, color: "var(--text3)", fontStyle: "italic" }}>
        Per ISA 315 and ISA 240, this certificate constitutes documentation of the basis for reduced testing.
        Auditor sign-off is required before this certificate becomes effective.
        Generated by AuditIQ Risk Engine v1.0 — Team IntelliShe.
      </div>
    </div>
  );
}
