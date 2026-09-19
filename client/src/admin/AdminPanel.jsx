// src/admin/AdminPanel.jsx
// Root component for the municipal staff admin panel.
// Handles the auth gate, top-level layout, and logout.
import { useCallback, useState } from "react";
import { isAuthenticated, clearAdminKey } from "./lib/adminApi";
import AdminLogin from "./AdminLogin";
import AdminDashboard from "./AdminDashboard";
import IssueTable from "./IssueTable";
import "./admin.css";

export default function AdminPanel({ onExit }) {
  const [authed, setAuthed] = useState(() => isAuthenticated());
  const [statusFilter, setStatusFilter] = useState(null);

  function handleLogout() {
    clearAdminKey();
    setAuthed(false);
  }

  const handleAuth = useCallback(() => setAuthed(true), []);

  if (!authed) {
    return (
      <div className="adm-root">
        <AdminLogin onAuthenticated={handleAuth} />
        <button className="adm-back-btn" onClick={onExit}>
          ← Back to reporter
        </button>
      </div>
    );
  }

  return (
    <div className="adm-root">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="adm-topbar">
        <div className="adm-topbar-brand">
          <span className="adm-brand-mark">G</span>
          <span className="adm-topbar-name">GroundTruth</span>
          <span className="adm-topbar-badge">Admin</span>
        </div>
        <nav className="adm-topbar-nav" aria-label="Admin navigation">
          <span className="adm-topbar-section">Issue management</span>
        </nav>
        <div className="adm-topbar-actions">
          <button className="adm-btn adm-btn-ghost adm-btn-sm" onClick={onExit}>
            ← Reporter
          </button>
          <button
            className="adm-btn adm-btn-ghost adm-btn-sm adm-logout"
            onClick={handleLogout}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="adm-main">
        <AdminDashboard
          activeStatus={statusFilter}
          onFilterByStatus={setStatusFilter}
        />
        <IssueTable
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
        />
      </main>

      <footer className="adm-footer">
        <span>GroundTruth Admin</span>
        <span className="adm-footer-sep">·</span>
        <span>Municipal staff dashboard</span>
        <span className="adm-footer-sep">·</span>
        <span>© 2026 Devansh Mishra</span>
      </footer>
    </div>
  );
}
