// src/admin/AdminDashboard.jsx
import { useCallback, useEffect, useState } from "react";
import { fetchStats } from "./lib/adminApi";
import "./admin.css";

const STATUS_META = {
  queued:       { label: "Queued",      color: "#d49b2e", bg: "#fdf3dc" },
  synced:       { label: "Synced",      color: "#0b7669", bg: "#dce9e3" },
  acknowledged: { label: "Acknowledged",color: "#2563eb", bg: "#dbeafe" },
  in_progress:  { label: "In progress", color: "#7c3aed", bg: "#ede9fe" },
  resolved:     { label: "Resolved",    color: "#16a34a", bg: "#dcfce7" },
  rejected:     { label: "Rejected",    color: "#dc2626", bg: "#fee2e2" },
};

function StatCard({ label, value, color, bg, onClick, active }) {
  return (
    <button
      className={`adm-stat-card${active ? " is-active" : ""}`}
      style={{ "--stat-color": color, "--stat-bg": bg }}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className="adm-stat-value">{value ?? "—"}</span>
      <span className="adm-stat-label">{label}</span>
    </button>
  );
}

export default function AdminDashboard({ activeStatus, onFilterByStatus }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchStats();
      setStats(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Refresh every 60 s
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <section className="adm-dashboard" aria-label="Dashboard statistics">
      <div className="adm-section-header">
        <div>
          <p className="adm-kicker">OVERVIEW</p>
          <h2 className="adm-section-title">
            Issue queue
            {stats && (
              <span className="adm-total-badge">{stats.total}</span>
            )}
          </h2>
        </div>
        <div className="adm-dashboard-meta">
          {stats && (
            <span className="adm-24h">
              <strong>{stats.last_24h}</strong> in last 24 h
            </span>
          )}
          <button
            className="adm-btn adm-btn-ghost adm-btn-sm"
            onClick={load}
            disabled={loading}
            aria-label="Refresh statistics"
          >
            {loading ? "↻ Loading…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <p className="adm-error-banner" role="alert">{error}</p>
      )}

      <div className="adm-stat-grid">
        <StatCard
          label="All issues"
          value={stats?.total}
          color="#256b5b"
          bg="#dce9e3"
          onClick={() => onFilterByStatus(null)}
          active={activeStatus === null}
        />
        {Object.entries(STATUS_META).map(([key, meta]) => (
          <StatCard
            key={key}
            label={meta.label}
            value={stats?.by_status?.[key] ?? 0}
            color={meta.color}
            bg={meta.bg}
            onClick={() => onFilterByStatus(key === activeStatus ? null : key)}
            active={activeStatus === key}
          />
        ))}
      </div>
    </section>
  );
}
