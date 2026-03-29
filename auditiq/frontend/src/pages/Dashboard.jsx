import { useEffect, useState } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";
import { api } from "../api";

// ── Palette — muted, professional, Deloitte-aligned ──────────────────────────
const C = {
  high:       "#c0392b",   // muted red
  highBg:     "#fdf2f1",
  highBorder: "#f5c6c2",
  med:        "#b7770d",   // muted amber
  medBg:      "#fef9ee",
  medBorder:  "#f9e1a0",
  low:        "#2e7d32",   // muted green (not Deloitte lime — that's for accents)
  lowBg:      "#f2f7f1",
  lowBorder:  "#b8d9ba",
  accent:     "#5b8c00",   // Deloitte green, toned down
  accentBg:   "#f0f5e6",
  accentBorder:"#c5db8a",
  // Bar chart — solid but not neon
  barHigh:    "#c0392b",
  barMed:     "#d4870a",
  barLow:     "#4a7c59",
};

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt = (n) =>
  n >= 1_00_00_000 ? `₹${(n / 1_00_00_000).toFixed(1)}Cr`
  : n >= 1_00_000  ? `₹${(n / 1_00_000).toFixed(1)}L`
  : n >= 1_000     ? `₹${(n / 1_000).toFixed(1)}K`
  : `₹${Number(n).toFixed(0)}`;

const fmtFull = (n) =>
  `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

// ── Score pill ────────────────────────────────────────────────────────────────
function ScorePill({ score }) {
  const pct   = Math.round((score || 0) * 100);
  const color = pct >= 55 ? C.high : pct >= 30 ? C.med : C.low;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5,
      fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 12.5, color }}>
      <span style={{ width: 38, height: 4, background: "#e4e7ec", borderRadius: 2,
        display: "inline-block", overflow: "hidden" }}>
        <span style={{ display: "block", width: `${pct}%`, height: "100%",
          background: color, borderRadius: 2 }} />
      </span>
      {pct}
    </span>
  );
}

// ── SHAP waterfall bar ────────────────────────────────────────────────────────
function ShapBar({ contributions = [] }) {
  const maxAbs = Math.max(...contributions.map(c => Math.abs(c.shap_value)), 0.001);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {contributions.slice(0, 6).map((c, i) => {
        const w = (Math.abs(c.shap_value) / maxAbs) * 100;
        const isRisk = c.direction === "risk";
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 165, fontSize: 11.5, color: "var(--text3)",
              textAlign: "right", flexShrink: 0 }}>{c.label}</div>
            <div style={{ flex: 1, height: 14, background: "var(--bg3)",
              borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${w}%`, height: "100%", borderRadius: 3,
                background: isRisk ? "#e8a09a" : "#9ec49f", transition: "width 0.4s" }} />
            </div>
            <div style={{ width: 44, fontSize: 11, fontFamily: "var(--font-mono)",
              fontWeight: 600, color: isRisk ? C.high : C.low, textAlign: "right" }}>
              {isRisk ? "+" : ""}{c.shap_value.toFixed(3)}
            </div>
            <div style={{ width: 88, fontSize: 10.5, color: "var(--text4)",
              textAlign: "right" }}>{c.value}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Explain Modal ─────────────────────────────────────────────────────────────
function ExplainModal({ txn, onClose }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [tab, setTab]         = useState("why");

  useEffect(() => {
    setLoading(true); setError(null);
    api.explainTransaction(txn.transaction_id)
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [txn.transaction_id]);

  const FEASIBILITY = {
    easy:                    { label: "Easy fix",      color: C.low,  bg: C.lowBg },
    moderate:                { label: "Moderate",      color: C.med,  bg: C.medBg },
    requires_process_change: { label: "Process change",color: C.high, bg: C.highBg },
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640, maxHeight: "88vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between",
          alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div className="modal-title" style={{ fontSize: 15.5 }}>
              AI Explanation — {txn.transaction_id}
            </div>
            <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
              {txn.vendor_name} · {fmtFull(txn.amount)}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text3)" }}>
            <div className="spinner" style={{ width: 20, height: 20, margin: "0 auto 12px" }} />
            <div style={{ fontSize: 13 }}>Training surrogate model & computing SHAP values…</div>
          </div>
        )}

        {error && (
          <div style={{ background: C.highBg, border: `1px solid ${C.highBorder}`,
            borderRadius: 8, padding: 14, color: C.high, fontSize: 13 }}>⚠ {error}</div>
        )}

        {data && !loading && (
          <>
            <div style={{ background: "var(--bg3)", border: "1px solid var(--border)",
              borderRadius: 8, padding: 13, marginBottom: 16,
              fontSize: 13, color: "var(--text2)", lineHeight: 1.65 }}>
              {data.plain_english}
            </div>

            <div className="tabs" style={{ marginBottom: 14 }}>
              {[["why","Why flagged"],["cf","How to clear"]].map(([k,l]) => (
                <button key={k} className={`tab${tab===k?" active":""}`}
                  onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>

            {tab === "why" && (
              <>
                {/* Score breakdown */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10.5, color: "var(--text4)", letterSpacing: "0.6px",
                    textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>Score Breakdown</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {Object.entries(data.score_breakdown || {})
                      .filter(([k]) => k !== "weights_used")
                      .map(([key, val]) => (
                        <div key={key} style={{ background: "var(--bg3)", border: "1px solid var(--border)",
                          borderRadius: 6, padding: "8px 12px" }}>
                          <div style={{ fontSize: 10.5, color: "var(--text4)", textTransform: "capitalize" }}>
                            {key.replace(/_component/,"").replace(/_/g," ")}
                          </div>
                          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700,
                            fontSize: 16, color: "var(--text)", marginTop: 2 }}>
                            {(val * 100).toFixed(1)}
                            <span style={{ fontWeight: 400, fontSize: 10.5,
                              color: "var(--text4)" }}> / 100</span>
                          </div>
                        </div>
                    ))}
                  </div>
                </div>

                {/* SHAP */}
                {data.ml_contributions?.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10.5, color: "var(--text4)", letterSpacing: "0.6px",
                      textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>
                      ML Feature Attribution (SHAP)
                    </div>
                    <ShapBar contributions={data.ml_contributions} />
                  </div>
                )}

                {/* Rule flags */}
                {Object.keys(data.rule_contributions || {}).length > 0 && (
                  <div>
                    <div style={{ fontSize: 10.5, color: "var(--text4)", letterSpacing: "0.6px",
                      textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>Rule Flags</div>
                    {Object.entries(data.rule_contributions).map(([flag, info]) => (
                      <div key={flag} style={{ display: "flex", justifyContent: "space-between",
                        alignItems: "flex-start", padding: "8px 0",
                        borderBottom: "1px solid var(--border)", fontSize: 12.5 }}>
                        <div>
                          <span className="flag-tag">{flag.replace(/_/g," ")}</span>
                          {info.detail && (
                            <div style={{ color: "var(--text3)", fontSize: 11.5, marginTop: 4 }}>
                              {info.detail}
                            </div>
                          )}
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11.5,
                          color: C.high, fontWeight: 600, flexShrink: 0, marginLeft: 12 }}>
                          +{(info.contribution_to_final_score * 100).toFixed(1)}pts
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {tab === "cf" && (
              <>
                <div style={{ fontSize: 12.5, color: "var(--text3)", marginBottom: 14,
                  padding: "10px 12px", background: "var(--bg3)", borderRadius: 8,
                  border: "1px solid var(--border)" }}>
                  {data.remediation_note}
                </div>
                {(!data.counterfactuals || data.counterfactuals.length === 0) ? (
                  <div className="empty-state" style={{ padding: "24px 0" }}>
                    <div className="empty-icon">✓</div>
                    <div className="empty-text">No counterfactuals — not HIGH risk.</div>
                  </div>
                ) : (
                  data.counterfactuals.map((cf) => {
                    const fm = FEASIBILITY[cf.feasibility] || FEASIBILITY.moderate;
                    return (
                      <div key={cf.scenario_id} style={{ border: "1px solid var(--border)",
                        borderRadius: 10, padding: 14, marginBottom: 12,
                        background: "var(--bg3)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between",
                          alignItems: "center", marginBottom: 8 }}>
                          <div style={{ fontWeight: 600, fontSize: 13,
                            color: "var(--text)" }}>Scenario {cf.scenario_id}</div>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20,
                              background: fm.bg, color: fm.color, fontWeight: 600 }}>
                              {fm.label}
                            </span>
                            <span style={{ fontSize: 12, fontFamily: "var(--font-mono)",
                              fontWeight: 600,
                              color: cf.new_risk_tier === "HIGH" ? C.high : C.low }}>
                              → {cf.new_risk_tier} ({Math.round(cf.new_risk_score * 100)})
                            </span>
                          </div>
                        </div>
                        <div style={{ fontSize: 12.5, color: "var(--text2)",
                          marginBottom: 10 }}>{cf.plain_english}</div>
                        {Object.entries(cf.changes).map(([label, change]) => (
                          <div key={label} style={{ fontSize: 12, background: "var(--bg2)",
                            borderRadius: 6, padding: "7px 10px",
                            border: "1px solid var(--border)", marginBottom: 6,
                            display: "flex", justifyContent: "space-between", gap: 8 }}>
                            <span style={{ color: "var(--text3)" }}>{label}</span>
                            <span>
                              <span style={{ color: C.high, fontFamily: "var(--font-mono)",
                                fontSize: 11.5 }}>{change.from}</span>
                              <span style={{ color: "var(--text4)", margin: "0 6px" }}>→</span>
                              <span style={{ color: C.low, fontFamily: "var(--font-mono)",
                                fontSize: 11.5 }}>{change.to}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [explainTxn, setExplainTxn] = useState(null);

  useEffect(() => {
    api.getDashboard()
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
        height: "60vh", gap: 12, color: "var(--text3)" }}>
        <div className="spinner" style={{ width: 20, height: 20 }} />
        Loading AURA dashboard…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="empty-state">
        <div className="empty-icon">⚠</div>
        <div className="empty-text">Could not load dashboard. Is the backend running?</div>
      </div>
    );
  }

  const {
    summary = {}, tier_cards = [], risk_distribution = [],
    monthly_chart = [], recent_high_risk = [],
    flag_chart = [], benford_data = {},
  } = data;

  const totalAmt = summary.total_amount || 0;

  // Donut colours remapped to muted palette
  const donutColors = [C.high, C.med, C.low];

  return (
    <div>
      {/* ── Page header ── */}
      <div className="page-header">
        <div>
          <div className="page-title">AURA</div>
          <div className="page-subtitle">
            Audit & Risk Analytics · {(summary.total_transactions || 0).toLocaleString()} transactions · 100% coverage
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "var(--text4)", textTransform: "uppercase",
            letterSpacing: "0.4px", fontWeight: 600 }}>Total Portfolio</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700,
            color: "var(--text)", letterSpacing: -0.5, marginTop: 2 }}>
            {fmt(totalAmt)}
          </div>
          <div style={{ fontSize: 11, color: "var(--text4)", marginTop: 1 }}>
            {fmtFull(totalAmt)}
          </div>
        </div>
      </div>

      {/* ── Row 1: 3 horizontal tier cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
        gap: 14, marginBottom: 16 }}>
        {[
          { key: "HIGH",   label: "High Risk",   icon: "⚠",
            color: C.high, bg: C.highBg, border: C.highBorder, count: summary.high_risk },
          { key: "MEDIUM", label: "Medium Risk", icon: "◑",
            color: C.med,  bg: C.medBg,  border: C.medBorder,  count: summary.medium_risk },
          { key: "LOW",    label: "Low Risk",    icon: "✓",
            color: C.low,  bg: C.lowBg,  border: C.lowBorder,  count: summary.low_risk },
        ].map(tier => {
          const card = tier_cards.find(c => c.tier === tier.key) || {};
          return (
            <div key={tier.key} style={{ background: tier.bg, border: `1px solid ${tier.border}`,
              borderRadius: "var(--radius-lg)", padding: "20px 22px",
              boxShadow: "var(--shadow)", position: "relative", overflow: "hidden" }}>
              {/* Left accent bar */}
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4,
                background: tier.color,
                borderRadius: "var(--radius-lg) 0 0 var(--radius-lg)" }} />
              <div style={{ paddingLeft: 10 }}>
                {/* Label row */}
                <div style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: tier.color,
                    textTransform: "uppercase", letterSpacing: "0.4px" }}>
                    {tier.icon} {tier.label}
                  </span>
                  <span style={{ fontSize: 11.5, color: tier.color, opacity: 0.85,
                    fontWeight: 600 }}>
                    {(tier.count || 0).toLocaleString()} txns
                  </span>
                </div>
                {/* Amount — big */}
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 700,
                  color: tier.color, letterSpacing: -0.5, lineHeight: 1 }}>
                  {fmt(card.amount || 0)}
                </div>
                {/* Sub label */}
                <div style={{ fontSize: 11.5, color: tier.color, opacity: 0.75,
                  marginTop: 7 }}>
                  {card.pct_of_total || 0}% of transactions
                  <span style={{ marginLeft: 6, opacity: 0.7 }}>·</span>
                  <span style={{ marginLeft: 6 }}>{card.amount_pct || 0}% of value</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Row 2: Monthly bar chart (full width) ── */}
      <div className="chart-card" style={{ marginBottom: 16 }}>
        <div className="chart-title">Transactions by Month</div>
        <div className="chart-subtitle">Monthly volume split by risk tier</div>
        {monthly_chart.length === 0 ? (
          <div className="empty-state" style={{ padding: "28px 0" }}>
            <div className="empty-icon">📊</div>
            <div className="empty-text">No monthly data yet</div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={monthly_chart} barSize={26}
              margin={{ top: 4, right: 16, left: -4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month"
                tick={{ fontSize: 11.5, fill: "var(--text3)" }}
                axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--text4)" }}
                axisLine={false} tickLine={false} width={28} />
              <Tooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)",
                  borderRadius: 8, fontSize: 12, boxShadow: "var(--shadow-md)" }}
                cursor={{ fill: "rgba(0,0,0,0.025)" }}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
              <Bar dataKey="LOW"    stackId="a" name="Low"    fill={C.barLow}  radius={[0,0,0,0]} />
              <Bar dataKey="MEDIUM" stackId="a" name="Medium" fill={C.barMed}  radius={[0,0,0,0]} />
              <Bar dataKey="HIGH"   stackId="a" name="High"   fill={C.barHigh} radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Row 3: Donut + Recent high risk ── */}
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr",
        gap: 16, marginBottom: 16 }}>

        {/* Donut */}
        <div className="chart-card">
          <div className="chart-title">Risk Distribution</div>
          <div className="chart-subtitle" style={{ marginBottom: 8 }}>By transaction count</div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={risk_distribution} cx="50%" cy="50%"
                innerRadius={44} outerRadius={66}
                paddingAngle={3} dataKey="value" startAngle={90} endAngle={-270}>
                {risk_distribution.map((_, i) => (
                  <Cell key={i} fill={donutColors[i]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)",
                  borderRadius: 8, fontSize: 12 }}
                formatter={v => [`${v} txns`, ""]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
            {risk_distribution.map((d, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between",
                alignItems: "center", fontSize: 12 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%",
                    background: donutColors[i], display: "inline-block", flexShrink: 0 }} />
                  <span style={{ color: "var(--text3)" }}>{d.name}</span>
                </span>
                <span style={{ fontWeight: 600, color: "var(--text2)",
                  fontFamily: "var(--font-mono)", fontSize: 12 }}>{d.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent high risk table */}
        <div className="chart-card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)",
            display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div className="chart-title">Recent High Risk Transactions</div>
              <div className="chart-subtitle" style={{ marginBottom: 0 }}>
                Click any row for AI explanation & counterfactuals
              </div>
            </div>
            <span style={{ background: C.highBg, color: C.high,
              border: `1px solid ${C.highBorder}`,
              borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>
              {summary.high_risk || 0} flagged
            </span>
          </div>

          {recent_high_risk.length === 0 ? (
            <div className="empty-state" style={{ padding: "32px 0" }}>
              <div className="empty-icon">✓</div>
              <div className="empty-text">No high risk transactions</div>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg3)" }}>
                  {["Transaction", "Vendor", "Amount", "Score", "Flags"].map(h => (
                    <th key={h} style={{ padding: "9px 14px", textAlign: "left",
                      fontSize: 10.5, fontWeight: 600, color: "var(--text4)",
                      letterSpacing: "0.5px", textTransform: "uppercase",
                      borderBottom: "1px solid var(--border)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent_high_risk.map(t => (
                  <tr key={t.id}
                    style={{ cursor: "pointer", transition: "background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--bg3)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    onClick={() => setExplainTxn(t)}>
                    <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12,
                        color: "var(--text2)" }}>{t.transaction_id}</span>
                    </td>
                    <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)",
                      fontSize: 13, color: "var(--text)" }}>{t.vendor_name}</td>
                    <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)",
                      fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 600,
                      color: "var(--text)", whiteSpace: "nowrap" }}>{fmt(t.amount)}</td>
                    <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)" }}>
                      <ScorePill score={t.risk_score} />
                    </td>
                    <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                        {(t.flags || []).slice(0, 2).map(f => (
                          <span key={f} className="flag-tag"
                            style={{ fontSize: 9.5 }}>{f.replace(/_/g," ")}</span>
                        ))}
                        {(t.flags || []).length > 2 && (
                          <span style={{ fontSize: 10.5, color: "var(--text4)",
                            alignSelf: "center" }}>+{t.flags.length - 2}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Row 4: Flag frequency + Benford ── */}
      <div className="charts-grid" style={{ marginBottom: 0 }}>
        {/* Flag frequency */}
        <div className="chart-card">
          <div className="chart-title">Flag Frequency</div>
          <div className="chart-subtitle">Most triggered rule checks</div>
          {flag_chart.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 4 }}>
              {flag_chart.slice(0, 7).map((f, i) => {
                const max = flag_chart[0]?.count || 1;
                const pct = (f.count / max) * 100;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 138, fontSize: 11.5, color: "var(--text3)",
                      textAlign: "right", flexShrink: 0 }}>
                      {f.flag.replace(/_/g, " ")}
                    </div>
                    <div style={{ flex: 1, height: 13, background: "var(--bg3)",
                      borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%",
                        background: C.accent, borderRadius: 3, transition: "width 0.4s" }} />
                    </div>
                    <div style={{ width: 26, fontSize: 11.5, color: "var(--text2)",
                      fontWeight: 600, fontFamily: "var(--font-mono)" }}>
                      {f.count}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: "24px 0" }}>
              <div className="empty-icon">🚩</div>
              <div className="empty-text">No flags yet</div>
            </div>
          )}
        </div>

        {/* Benford */}
        <div className="chart-card">
          <div className="chart-title">Benford's Law Analysis</div>
          <div className="chart-subtitle">Observed vs expected first-digit distribution</div>
          {benford_data?.digits?.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={benford_data.digits.map((d, i) => ({
                  digit: d,
                  Observed: Math.round((benford_data.observed[i] || 0) * 100),
                  Expected: Math.round((benford_data.expected[i] || 0) * 100),
                }))}
                margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="digit"
                  tick={{ fontSize: 11, fill: "var(--text3)" }}
                  axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "var(--text4)" }}
                  axisLine={false} tickLine={false} unit="%" />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)",
                    borderRadius: 8, fontSize: 12 }}
                  formatter={v => [`${v}%`, ""]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Observed" fill={C.accent} radius={[3,3,0,0]} barSize={14} />
                <Bar dataKey="Expected" fill="#d0d5dd" radius={[3,3,0,0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state" style={{ padding: "24px 0" }}>
              <div className="empty-icon">📊</div>
              <div className="empty-text">No data</div>
            </div>
          )}
        </div>
      </div>

      {explainTxn && <ExplainModal txn={explainTxn} onClose={() => setExplainTxn(null)} />}
    </div>
  );
}
