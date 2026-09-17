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
      <div className="section-heading queue-heading">
        <div><p className="kicker">YOUR ACTIVITY</p><h1>Report <em>history.</em></h1></div>
        <span className="step-count">{issues.length.toString().padStart(2, "0")}</span>
      </div>
      <div className="queue-summary"><strong>{pendingCount}</strong><span>waiting to sync</span><span className="summary-arrow">↗</span></div>

      {issues.length === 0 &&       <p className="empty">Nothing here yet. Your first report can make a real difference.</p>}

      {issues.map((issue) => (
        <div className="issue-row" key={issue.id}>
          <div>
            <p className="issue-title">{issue.title}</p>
            <p className="issue-meta">
              {issue.category} · {new Date(issue.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </p>
          </div>
          <span className={`badge badge-${issue.status}`}>
            {BADGE_LABEL[issue.status]}
          </span>
        </div>
      ))}

      <button onClick={handleSyncNow} disabled={syncing || pendingCount === 0}>
        {syncing ? "Syncing…" : `↻ Sync ${pendingCount ? `pending reports` : "complete"}`}
      </button>
    </div>
  );
}
