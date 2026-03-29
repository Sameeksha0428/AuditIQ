import { NavLink, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { api } from "../api";

export default function Sidebar() {
  const [highCount, setHighCount] = useState(0);
  const location = useLocation();

  useEffect(() => {
    api.getAuditQueue().then(d => {
      setHighCount(d.high_risk?.length || 0);
    }).catch(() => {});
  }, [location.pathname]);

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="logo-icon">A</div>
        <div>
          <div className="logo-brand">AURA</div>
          <div className="logo-sub">Audit Analytics Platform</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        <div className="nav-section-label">Analytics</div>

        <NavLink to="/dashboard" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <span className="nav-icon">▦</span>
          Dashboard
        </NavLink>

        <NavLink to="/transactions" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <span className="nav-icon">≡</span>
          Transactions
        </NavLink>


        <div className="nav-section-label" style={{ marginTop: 8 }}>Audit</div>

        <NavLink to="/review" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <span className="nav-icon">✦</span>
          Audit Review
          {highCount > 0 && <span className="nav-badge">{highCount}</span>}
        </NavLink>

        <NavLink to="/upload" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <span className="nav-icon">↑</span>
          Upload Data
        </NavLink>
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <strong>Team Sameeksha Rawat</strong>
        ET Hackathon 2026
      </div>
    </aside>
  );
}
