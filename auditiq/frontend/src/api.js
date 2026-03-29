const BASE = "";

async function request(path, options = {}) {
  const res = await fetch(BASE + path, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  getDashboard:    () => request("/api/dashboard"),
  getTransactions: (params = {}) => request(`/api/transactions?${new URLSearchParams(params)}`),
  getTransaction:  (id) => request(`/api/transactions/${id}`),
  uploadFile: (file, uploadedBy) => {
    const form = new FormData();
    form.append("file", file);
    form.append("uploaded_by", uploadedBy);
    return request("/api/upload", { method: "POST", body: form });
  },
  getAuditQueue: () => request("/api/audit-queue"),
  auditAction: (txnId, action, performedBy, note = "") => {
    const form = new FormData();
    form.append("action", action);
    form.append("performed_by", performedBy);
    form.append("note", note);
    return request(`/api/audit-action/${txnId}`, { method: "POST", body: form });
  },
  // Explainability + counterfactuals
  explainTransaction: (transactionId) => request(`/api/explain/${transactionId}`),
  getVendorStats: () => request("/api/stats/vendors"),
};
