// src/lib/sync.js
// Network gate + outbox drain.
//
// Flow per sync cycle:
//  1. POST /sync/batch  — upsert all queued issues (idempotent by UUID)
//  2. For each synced issue with a local photo blob:
//       POST /issues/{id}/photo  → get presigned S3 URL
//       PUT  <presigned URL>     → upload the blob directly to S3
//       update local photoRef to the S3 key, delete local blob
//
// The batch step is idempotent so a dropped connection can always retry.
import {
  queuedIssues, markSynced, markConflict,
  getPhotoBlob, updatePhotoRef,
} from "./db";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

let syncing = false;

export async function syncOutbox() {
  if (syncing || !navigator.onLine) return { synced: 0, skipped: true };
  syncing = true;

  try {
    const pending = await queuedIssues();
    if (pending.length === 0) return { synced: 0, skipped: false };

    // ── Step 1: batch upsert ───────────────────────────────────────────────
    // Strip local-only fields the server doesn't know about before sending.
    const payload = pending.map(({ hasLocalPhoto: _h, ...rest }) => rest);

    const res = await fetch(`${API_BASE}/sync/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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

    // ── Step 2: upload any pending photos ─────────────────────────────────
    const syncedIssues = pending.filter(
      (i) => i.hasLocalPhoto && results.find((r) => r.id === i.id && r.status === "synced")
    );

    for (const issue of syncedIssues) {
      try {
        await uploadPhoto(issue.id);
      } catch {
        // Photo upload failures are non-fatal: the issue is already synced.
        // The photo can be re-attempted on the next cycle.
      }
    }

    return { synced, skipped: false };
  } finally {
    syncing = false;
  }
}

/**
 * Upload the locally-stored photo for an issue to S3 via a presigned URL.
 * Updates the local record with the S3 key on success.
 */
async function uploadPhoto(issueId) {
  const blob = await getPhotoBlob(issueId);
  if (!blob) return;

  // Get a presigned upload URL from the backend.
  const urlRes = await fetch(`${API_BASE}/issues/${issueId}/photo?contentType=${encodeURIComponent(blob.type || "image/jpeg")}`, {
    method: "POST",
  });
  if (!urlRes.ok) throw new Error(`Failed to get upload URL: ${urlRes.status}`);

  const { uploadUrl, photoRef } = await urlRes.json();

  // PUT the blob directly to S3 — no server in the middle.
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": blob.type || "image/jpeg" },
    body: blob,
  });
  if (!uploadRes.ok) throw new Error(`S3 upload failed: ${uploadRes.status}`);

  // Persist the S3 key locally and drop the blob from IndexedDB.
  await updatePhotoRef(issueId, photoRef);
}

/**
 * Wire up the sync gate once (e.g. in App.jsx).
 * Attempts a sync on load, on reconnect, every 30 s, and on SW trigger.
 */
export function registerNetworkGate(onSyncResult) {
  const attempt = async () => {
    const result = await syncOutbox();
    onSyncResult?.(result);
  };

  window.addEventListener("online", attempt);
  const interval = setInterval(attempt, 30_000);

  // Try immediately in case we're already online at load.
  attempt();

  return () => {
    window.removeEventListener("online", attempt);
    clearInterval(interval);
  };
}
