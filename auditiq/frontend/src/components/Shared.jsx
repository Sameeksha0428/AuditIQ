import { useState, useEffect } from "react";

// ── Risk Badge ───────────────────────────────────────────────────────────────
export function RiskBadge({ tier }) {
  const dot = { HIGH: "🔴", MEDIUM: "🟡", LOW: "🟢", PENDING: "⚪" }[tier] || "⚪";
  return <span className={`risk-badge risk-${tier}`}>{dot} {tier}</span>;
}

// ── Status Badge ─────────────────────────────────────────────────────────────
export function StatusBadge({ status }) {
  return <span className={`status-badge status-${status}`}>{status}</span>;
}

// ── Score Bar ────────────────────────────────────────────────────────────────
export function ScoreBar({ score }) {
  const pct = Math.round(score * 100);
  const color = score >= 0.55 ? "#ef4444" : score >= 0.30 ? "#f59e0b" : "#22c55e";
  return (
    <div className="score-bar-wrap">
      <div className="score-bar-bg">
        <div className="score-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 600, minWidth: 30 }}>{pct}%</span>
    </div>
  );
}

// ── Flag Tags ────────────────────────────────────────────────────────────────
const FLAG_LABELS = {
  SELF_APPROVAL:      "Self Approval",
  ROUND_NUMBER:       "Round Number",
  BELOW_THRESHOLD:    "Below Threshold",
  WEEKEND_POSTING:    "Weekend Post",
  VENDOR_AMOUNT_SPIKE:"Amount Spike",
  MONTH_END_POSTING:  "Month End",
  HIGH_VALUE:         "High Value",
  DUPLICATE_INVOICE:  "Duplicate",
};

export function FlagTags({ flags }) {
  if (!flags || flags.length === 0) return <span style={{ color: "var(--text3)", fontSize: 11 }}>—</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
      {flags.map(f => (
        <span key={f} className="flag-tag">{FLAG_LABELS[f] || f}</span>
      ))}
    </div>
  );
}

// ── Currency formatter ───────────────────────────────────────────────────────
export function formatAmount(amount, currency = "INR") {
  if (!amount && amount !== 0) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency, maximumFractionDigits: 0
  }).format(amount);
}

// ── Date formatter ────────────────────────────────────────────────────────────
export function formatDate(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return d; }
}

// ── Relative time ─────────────────────────────────────────────────────────────
export function timeAgo(d) {
  if (!d) return "";
  const diff = Date.now() - new Date(d);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
export function Toast({ message, type = "success", onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className={`toast ${type}`}>
      <span style={{ marginRight: 8 }}>{type === "success" ? "✓" : "✗"}</span>
      {message}
    </div>
  );
}

// ── Loading state ─────────────────────────────────────────────────────────────
export function Loading({ text = "Loading..." }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "40px 0", color: "var(--text3)" }}>
      <div className="spinner" />
      {text}
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────
export function Empty({ icon = "📭", text = "No data found" }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <div className="empty-text">{text}</div>
    </div>
  );
}
