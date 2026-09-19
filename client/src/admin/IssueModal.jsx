// src/admin/IssueModal.jsx
import { useEffect, useRef, useState } from "react";
import { updateIssue } from "./lib/adminApi";
import "./admin.css";

const ALLOWED = ["queued", "synced", "acknowledged", "in_progress", "resolved", "rejected"];

const STATUS_LABELS = {
  queued:       "Queued",
  synced:       "Synced",
  acknowledged: "Acknowledged",
  in_progress:  "In Progress",
  resolved:     "Resolved",
  rejected:     "Rejected",
};

export default function IssueModal({ issue, onClose, onUpdated }) {
  const [status, setStatus] = useState(issue.status);
  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(issue.description || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef(null);

  // Trap focus and handle Escape
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    el.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const updated = await updateIssue(issue.id, {
        status,
        title: title.trim(),
        description: description.trim(),
      });
      onUpdated(updated);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const coords =
    issue.lat != null && issue.lng != null
      ? `${Number(issue.lat).toFixed(5)}, ${Number(issue.lng).toFixed(5)}`
      : "No location";

  const reportedAt = new Date(issue.createdAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div
      className="adm-modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`Issue: ${issue.title}`}
    >
      <div
        className="adm-modal"
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="adm-modal-header">
          <div>
            <p className="adm-kicker">{issue.category}</p>
            <h2 className="adm-modal-title">{issue.title}</h2>
          </div>
          <button
            className="adm-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <dl className="adm-modal-meta">
          <div>
            <dt>Reported</dt>
            <dd>{reportedAt}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>
              {issue.lat != null ? (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${issue.lat}&mlon=${issue.lng}&zoom=17`}
                  target="_blank"
                  rel="noreferrer"
                  className="adm-map-link"
                >
                  📍 {coords} ↗
                </a>
              ) : (
                "No location"
              )}
            </dd>
          </div>
          <div>
            <dt>Device ID</dt>
            <dd className="adm-mono">{issue.deviceId || "—"}</dd>
          </div>
          <div>
            <dt>Issue ID</dt>
            <dd className="adm-mono adm-id">{issue.id}</dd>
          </div>
        </dl>

        {issue.photoRef && (
          <div className="adm-modal-photo">
            <img
              src={
                issue.photoRef.startsWith("photos/")
                  ? `https://${import.meta.env.VITE_PHOTOS_CDN || ""}/${issue.photoRef}`
                  : issue.photoRef
              }
              alt={`Photo for: ${issue.title}`}
              loading="lazy"
            />
          </div>
        )}

        <form onSubmit={handleSave} className="adm-modal-form">
          <label className="adm-field-label" htmlFor="modal-title">
            TITLE
          </label>
          <input
            id="modal-title"
            className="adm-input"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={160}
            required
          />

          <label className="adm-field-label" htmlFor="modal-desc">
            DESCRIPTION
          </label>
          <textarea
            id="modal-desc"
            className="adm-input adm-textarea"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
          />

          <label className="adm-field-label" htmlFor="modal-status">
            STATUS
          </label>
          <select
            id="modal-status"
            className="adm-input adm-select"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {ALLOWED.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>

          {error && <p className="adm-error-banner" role="alert">{error}</p>}

          <div className="adm-modal-actions">
            <button
              type="button"
              className="adm-btn adm-btn-ghost"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="adm-btn adm-btn-primary"
              disabled={saving}
            >
              {saving ? "Saving…" : "Save changes →"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
