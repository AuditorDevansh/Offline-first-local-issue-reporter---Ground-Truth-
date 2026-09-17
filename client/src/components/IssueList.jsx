// src/components/IssueList.jsx
import { useEffect, useState, useCallback } from "react";
import { listIssues } from "../lib/db";
import { syncOutbox } from "../lib/sync";

const BADGE_LABEL = {
  draft: "draft",
  queued: "queued",
  synced: "synced",
  conflict: "conflict",
};

export default function IssueList({ refreshKey }) {
  const [issues, setIssues] = useState([]);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    setIssues(await listIssues());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  async function handleSyncNow() {
    setSyncing(true);
    await syncOutbox();
    await refresh();
    setSyncing(false);
  }

  const pendingCount = issues.filter((i) => i.status === "queued").length;

  return (
    <div className="issue-list">
      <h2>My reports</h2>

      {issues.length === 0 && <p className="empty">No reports yet.</p>}

      {issues.map((issue) => (
        <div className="issue-row" key={issue.id}>
          <div>
            <p className="issue-title">{issue.title}</p>
            <p className="issue-meta">
              {issue.category} · {new Date(issue.createdAt).toLocaleTimeString()}
            </p>
          </div>
          <span className={`badge badge-${issue.status}`}>
            {BADGE_LABEL[issue.status]}
          </span>
        </div>
      ))}

      <button onClick={handleSyncNow} disabled={syncing || pendingCount === 0}>
        {syncing ? "Syncing…" : `↻ Sync now — ${pendingCount} pending`}
      </button>
    </div>
  );
}
