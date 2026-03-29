import { useState, useRef } from "react";
import { api } from "../api";
import { Toast } from "../components/Shared";

// Sample CSV content — users can download this to see the expected format
const SAMPLE_CSV = `transaction_id,vendor_name,vendor_id,employee_id,approver_id,department,amount,currency,transaction_date,invoice_number,description,gl_account
TXN00001,Tata Consultancy,V001,EMP001,EMP002,IT,85000,INR,2024-03-15,INV-10001,Software services,GL4001
TXN00002,Infosys Ltd,V002,EMP002,EMP003,Finance,49800,INR,2024-03-16,INV-10002,Consulting fees,GL4002
TXN00003,Ghost Vendor Co,V003,EMP001,EMP001,IT,100000,INR,2024-03-17,INV-10003,Services rendered,GL4003
TXN00004,Wipro Services,V004,EMP003,EMP004,Operations,25000,INR,2024-03-23,INV-10004,Maintenance,GL4001
TXN00005,HCL Technologies,V005,EMP002,EMP003,IT,150000,INR,2024-03-30,INV-10005,Development work,GL4002
TXN00006,Reliance Industries,V006,EMP004,EMP005,Marketing,500000,INR,2024-04-06,INV-10006,Campaign costs,GL5001
TXN00007,Infosys Ltd,V002,EMP002,EMP003,Finance,49900,INR,2024-04-07,INV-10007,Consulting fees,GL4002
TXN00008,Shell Corp Pvt Ltd,V007,EMP003,EMP003,Admin,75000,INR,2024-04-13,INV-10008,Admin services,GL6001
TXN00009,Tata Consultancy,V001,EMP001,EMP002,IT,82000,INR,2024-04-15,INV-10009,Software license,GL4001
TXN00010,HDFC Securities,V008,EMP005,EMP001,Finance,30000,INR,2024-04-20,INV-10010,Investment advice,GL4003`;

export default function Upload() {
  const [file, setFile]       = useState(null);
  const [name, setName]       = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast]     = useState(null);
  const fileRef = useRef();

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) { setFile(f); setResult(null); }
  };

  const handleFile = (e) => {
    if (e.target.files[0]) { setFile(e.target.files[0]); setResult(null); }
  };

  const downloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = "auditiq_sample_data.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const submit = async () => {
    if (!file || !name.trim()) return;
    setLoading(true);
    try {
      const res = await api.uploadFile(file, name.trim());
      setResult(res);
      setFile(null);
      setToast({ message: `Analysis complete — ${res.rows_processed} transactions scored.`, type: "success" });
    } catch (e) {
      setToast({ message: e.message || "Upload failed.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="page-header">
        <div>
          <div className="page-title">Upload Data</div>
          <div className="page-subtitle">Upload a CSV or Excel file — AuditIQ will analyze every row automatically</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        {/* Upload card */}
        <div className="chart-card" style={{ gridColumn: "1 / -1" }}>
          <div className="chart-title">Upload Transaction File</div>
          <div className="chart-subtitle">Supported: .csv, .xlsx, .xls · Max file size: 10MB</div>

          <div
            className={`upload-zone ${dragging ? "dragging" : ""}`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current.click()}
          >
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls"
              style={{ display: "none" }} onChange={handleFile} />
            <div className="upload-zone-icon">{file ? "📄" : "☁"}</div>
            <div className="upload-zone-text" style={{ fontSize: 14, color: file ? "var(--green)" : undefined }}>
              {file ? file.name : "Drop your file here or click to browse"}
            </div>
            {file && (
              <div className="upload-zone-hint" style={{ color: "var(--text3)" }}>
                {(file.size / 1024).toFixed(1)} KB · {file.type || "spreadsheet"}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: "var(--text3)", marginBottom: 6 }}>
              Your name — saved in audit trail to track who submitted this data
            </div>
            <input
              className="input"
              placeholder="e.g. Sarah Johnson"
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ maxWidth: 320 }}
            />
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              className="btn btn-primary"
              onClick={submit}
              disabled={loading || !file || !name.trim()}
            >
              {loading
                ? <><span className="spinner" /> Analyzing all rows...</>
                : "↑ Upload & Analyze"
              }
            </button>
            <button className="btn btn-ghost" onClick={downloadSample}>
              ↓ Download Sample CSV
            </button>
          </div>
        </div>
      </div>

      {/* Result card */}
      {result && (
        <div style={{
          background: "linear-gradient(135deg, rgba(134,188,37,0.08), rgba(134,188,37,0.02))",
          border: "1px solid rgba(134,188,37,0.3)",
          borderRadius: "var(--radius-lg)",
          padding: 24,
          marginBottom: 20,
          animation: "slide-up 0.3s ease"
        }}>
          <div style={{ fontFamily: "var(--font-head)", fontSize: 18, fontWeight: 800, color: "var(--green)", marginBottom: 4 }}>
            ✓ Analysis Complete
          </div>
          <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 20 }}>
            Batch ID: {result.batch_id} · {result.rows_processed} transactions analyzed
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            {[
              { label: "High Risk",   val: result.high_risk,   color: "var(--red)" },
              { label: "Medium Risk", val: result.medium_risk, color: "var(--amber)" },
              { label: "Low Risk",    val: result.low_risk,    color: "var(--green)" },
            ].map(s => (
              <div key={s.label} style={{ background: "var(--bg3)", borderRadius: "var(--radius)", padding: "14px 16px" }}>
                <div style={{ fontSize: 9, color: "var(--text3)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--font-head)", color: s.color }}>{s.val}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
            <a href="/dashboard" className="btn btn-primary btn-sm">View Dashboard →</a>
            <a href="/review" className="btn btn-ghost btn-sm">Go to Audit Review →</a>
          </div>
        </div>
      )}

      {/* Column reference */}
      <div className="chart-card">
        <div className="chart-title">Column Reference</div>
        <div className="chart-subtitle">We auto-detect column names — these are the supported variations</div>
        <table style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Field</th>
              <th>Required</th>
              <th>Accepted Column Names</th>
              <th>Example Value</th>
            </tr>
          </thead>
          <tbody>
            {[
              { field: "Amount", req: true, names: "amount, invoice_amount, value, total", ex: "85000" },
              { field: "Vendor Name", req: true, names: "vendor_name, vendor, supplier, payee", ex: "Tata Consultancy" },
              { field: "Transaction Date", req: true, names: "transaction_date, date, invoice_date", ex: "2024-03-15" },
              { field: "Employee ID", req: false, names: "employee_id, employee, created_by", ex: "EMP001" },
              { field: "Approver ID", req: false, names: "approver_id, approver, approved_by", ex: "EMP002" },
              { field: "Department", req: false, names: "department, dept", ex: "Finance" },
              { field: "Invoice Number", req: false, names: "invoice_number, invoice_no, inv_no", ex: "INV-10001" },
              { field: "Description", req: false, names: "description, narration, remarks", ex: "Software services" },
              { field: "GL Account", req: false, names: "gl_account, account_code", ex: "GL4001" },
              { field: "Vendor ID", req: false, names: "vendor_id, supplier_id", ex: "V001" },
            ].map(r => (
              <tr key={r.field}>
                <td style={{ color: "var(--text)", fontWeight: 500 }}>{r.field}</td>
                <td>
                  <span style={{ fontSize: 10, fontWeight: 700, color: r.req ? "var(--green)" : "var(--text3)" }}>
                    {r.req ? "Yes" : "No"}
                  </span>
                </td>
                <td style={{ color: "var(--text3)", fontSize: 11 }}>{r.names}</td>
                <td style={{ color: "var(--blue)", fontSize: 11 }}>{r.ex}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
