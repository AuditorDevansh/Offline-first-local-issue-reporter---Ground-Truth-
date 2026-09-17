// src/lib/sync.js
// Network gate + outbox drain. Pushes queued issues to the API in one
// idempotent batch, keyed by each issue's client-generated id, so a retried
// push after a dropped connection never creates duplicates server-side.
import { queuedIssues, markSynced, markConflict } from "./db";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

let syncing = false;

export async function syncOutbox() {
  if (syncing || !navigator.onLine) return { synced: 0, skipped: true };
  syncing = true;

  try {
    const pending = await queuedIssues();
    if (pending.length === 0) return { synced: 0, skipped: false };

    const res = await fetch(`${API_BASE}/sync/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pending),
    });

    if (!res.ok) throw new Error(`Sync batch failed: ${res.status}`);

    const { results } = await res.json();
    let synced = 0;
    for (const result of results) {
      if (result.status === "synced") {
        await markSynced(result.id);
        synced += 1;
      } else if (result.status === "conflict") {
        await markConflict(result.id);
      }
    }
    return { synced, skipped: false };
  } finally {
    syncing = false;
  }
}

/**
 * Wire this up once (e.g. in App.jsx) to attempt a sync whenever the
 * browser regains connectivity, plus a gentle interval as a backstop for
 * platforms that don't fire `online` reliably.
 */
export function registerNetworkGate(onSyncResult) {
  const attempt = async () => {
    const result = await syncOutbox();
    onSyncResult?.(result);
  };

  window.addEventListener("online", attempt);
  const interval = setInterval(attempt, 30_000);

  // Try once immediately in case we're already online at load.
  attempt();

  return () => {
    window.removeEventListener("online", attempt);
    clearInterval(interval);
  };
}
