// src/admin/IssueTable.jsx
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchIssues, bulkUpdateStatus } from "./lib/adminApi";
import IssueModal from "./IssueModal";
import "./admin.css";

const PAGE_SIZE = 25;

const CATEGORIES = ["pothole", "lighting", "sanitation", "signage", "other"];

const STATUS_COLORS = {
  queued:       { color: "#b6741a", bg: "#fdf3dc" },
  synced:       { color: "#0b7669", bg: "#dce9e3" },
  acknowledged: { color: "#2563eb", bg: "#dbeafe" },
  in_progress:  { color: "#7c3aed", bg: "#ede9fe" },
  resolved:     { color: "#16a34a", bg: "#dcfce7" },
  rejected:     { color: "#dc2626", bg: "#fee2e2" },
};

function StatusBadge({ status }) {
  const meta = STATUS_COLORS[status] || { color: "#68736f", bg: "#e5e7eb" };
  return (
    <span
      className="adm-badge"
      style={{ color: meta.color, background: meta.bg }}
    >
      {status?.replace("_", " ")}
    </span>
  );
}

export default function IssueTable({ statusFilter, onStatusFilterChange }) {
  const [issues, setIssues] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [activeIssue, setActiveIssue] = useState(null);
  const searchTimer = useRef(null);

  // Reset pagination when filters change
  useEffect(() => { setOffset(0); }, [statusFilter, categoryFilter, search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchIssues({
        status: statusFilter || undefined,
        category: categoryFilter || undefined,
        search: search || undefined,
        limit: PAGE_SIZE,
        offset,
      });
      setIssues(data.issues);
      setTotal(data.total);
      setSelected(new Set());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter, search, offset]);

  useEffect(() => { load(); }, [load]);

  // Debounce search input
  function handleSearchChange(e) {
    setSearchInput(e.target.value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(e.target.value.trim());
    }, 350);
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === issues.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(issues.map((i) => i.id)));
    }
  }

  async function handleBulkUpdate() {
    if (!bulkStatus || selected.size === 0) return;
    setBulkLoading(true);
    setError("");
    try {
      await bulkUpdateStatus([...selected], bulkStatus);
      await load();
      setBulkStatus("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkLoading(false);
    }
  }

  function handleIssueUpdated(updated) {
    setIssues((prev) =>
      prev.map((i) => (i.id === updated.id ? { ...i, ...updated } : i))
    );
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <section className="adm-table-section" aria-label="Issues table">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="adm-toolbar">
        <div className="adm-toolbar-filters">
          <input
            className="adm-input adm-search"
            type="search"
            placeholder="Search title or description…"
            value={searchInput}
            onChange={handleSearchChange}
            aria-label="Search issues"
          />

          <select
            className="adm-input adm-select adm-filter-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            className="adm-input adm-select adm-filter-select"
            value={statusFilter || ""}
            onChange={(e) => onStatusFilterChange(e.target.value || null)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {Object.keys(STATUS_COLORS).map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>

          {(statusFilter || categoryFilter || search) && (
            <button
              className="adm-btn adm-btn-ghost adm-btn-sm"
              onClick={() => {
                onStatusFilterChange(null);
                setCategoryFilter("");
                setSearch("");
                setSearchInput("");
              }}
            >
              ✕ Clear filters
            </button>
          )}
        </div>

        <div className="adm-toolbar-right">
          <span className="adm-count">
            {loading ? "Loading…" : `${total} issue${total !== 1 ? "s" : ""}`}
          </span>
          <button
            className="adm-btn adm-btn-ghost adm-btn-sm"
            onClick={load}
            disabled={loading}
            aria-label="Refresh table"
          >
            ↻
          </button>
        </div>
      </div>

      {/* ── Bulk action bar ───────────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="adm-bulk-bar" role="status">
          <span><strong>{selected.size}</strong> selected</span>
          <select
            className="adm-input adm-select adm-bulk-select"
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            aria-label="Bulk status"
          >
            <option value="">Set status…</option>
            {Object.keys(STATUS_COLORS).map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>
          <button
            className="adm-btn adm-btn-primary adm-btn-sm"
            onClick={handleBulkUpdate}
            disabled={!bulkStatus || bulkLoading}
          >
            {bulkLoading ? "Updating…" : "Apply"}
          </button>
          <button
            className="adm-btn adm-btn-ghost adm-btn-sm"
            onClick={() => setSelected(new Set())}
          >
            Deselect all
          </button>
        </div>
      )}

      {error && <p className="adm-error-banner" role="alert">{error}</p>}

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="adm-table-wrap">
        <table className="adm-table" aria-label="Issues">
          <thead>
            <tr>
              <th className="adm-th adm-th-check">
                <input
                  type="checkbox"
                  checked={selected.size === issues.length && issues.length > 0}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              <th className="adm-th">Title</th>
              <th className="adm-th">Category</th>
              <th className="adm-th">Status</th>
              <th className="adm-th">Location</th>
              <th className="adm-th">Reported</th>
              <th className="adm-th adm-th-action">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {!loading && issues.length === 0 && (
              <tr>
                <td colSpan={7} className="adm-empty-row">
                  No issues match the current filters.
                </td>
              </tr>
            )}
            {issues.map((issue) => (
              <tr
                key={issue.id}
                className={`adm-tr${selected.has(issue.id) ? " is-selected" : ""}`}
              >
                <td className="adm-td adm-td-check">
                  <input
                    type="checkbox"
                    checked={selected.has(issue.id)}
                    onChange={() => toggleSelect(issue.id)}
                    aria-label={`Select ${issue.title}`}
                  />
                </td>
                <td className="adm-td adm-td-title">
                  <button
                    className="adm-title-btn"
                    onClick={() => setActiveIssue(issue)}
                  >
                    {issue.title}
                  </button>
                  {issue.description && (
                    <p className="adm-td-desc">{issue.description}</p>
                  )}
                </td>
                <td className="adm-td">
                  <span className="adm-category">{issue.category}</span>
                </td>
                <td className="adm-td">
                  <StatusBadge status={issue.status} />
                </td>
                <td className="adm-td adm-td-location">
                  {issue.lat != null ? (
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${issue.lat}&mlon=${issue.lng}&zoom=17`}
                      target="_blank"
                      rel="noreferrer"
                      className="adm-map-link"
                      title={`${issue.lat}, ${issue.lng}`}
                    >
                      📍 map ↗
                    </a>
                  ) : (
                    <span className="adm-muted">—</span>
                  )}
                </td>
                <td className="adm-td adm-td-date">
                  {new Date(issue.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </td>
                <td className="adm-td adm-td-action">
                  <button
                    className="adm-btn adm-btn-ghost adm-btn-sm"
                    onClick={() => setActiveIssue(issue)}
                    aria-label={`Edit ${issue.title}`}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="adm-pagination" aria-label="Pagination">
          <button
            className="adm-btn adm-btn-ghost adm-btn-sm"
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0 || loading}
          >
            ← Previous
          </button>
          <span className="adm-page-info">
            Page {currentPage} of {totalPages}
          </span>
          <button
            className="adm-btn adm-btn-ghost adm-btn-sm"
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={offset + PAGE_SIZE >= total || loading}
          >
            Next →
          </button>
        </div>
      )}

      {/* ── Issue detail modal ────────────────────────────────────────────── */}
      {activeIssue && (
        <IssueModal
          issue={activeIssue}
          onClose={() => setActiveIssue(null)}
          onUpdated={handleIssueUpdated}
        />
      )}
    </section>
  );
}
