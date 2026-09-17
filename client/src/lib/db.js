// src/lib/db.js
// Local-first store. Every capture lands here before any network attempt —
// this table IS the outbox, not just a cache of it.
import Dexie from "dexie";

export const db = new Dexie("groundtruth");

db.version(1).stores({
  // `id` is the client-generated UUID — the primary key that makes
  // sync replay-safe. Indexes on status/createdAt for the queue screen.
  issues: "id, status, createdAt",
});

export const ISSUE_STATUS = {
  DRAFT: "draft",
  QUEUED: "queued",
  SYNCED: "synced",
  CONFLICT: "conflict",
};

export function newIssueId() {
  return crypto.randomUUID();
}

/**
 * Save a captured issue straight to the local store and mark it queued.
 * This resolves the instant the write lands on-device — no network wait.
 */
export async function saveIssueOffline(issue) {
  const record = {
    id: newIssueId(),
    title: issue.title,
    category: issue.category,
    description: issue.description,
    lat: issue.lat ?? null,
    lng: issue.lng ?? null,
    photoRef: issue.photoRef ?? null,
    status: ISSUE_STATUS.QUEUED,
    createdAt: Date.now(),
    deviceId: getDeviceId(),
    syncVersion: 1,
  };
  await db.issues.add(record);
  window.dispatchEvent(new CustomEvent("groundtruth:issues-changed"));
  return record;
}

export async function listIssues() {
  return db.issues.orderBy("createdAt").reverse().toArray();
}

export async function queuedIssues() {
  return db.issues.where("status").equals(ISSUE_STATUS.QUEUED).toArray();
}

export async function markSynced(id) {
  await db.issues.update(id, { status: ISSUE_STATUS.SYNCED });
}

export async function markConflict(id) {
  await db.issues.update(id, { status: ISSUE_STATUS.CONFLICT });
}

// Anonymous per-install identifier, persisted outside Dexie so it survives
// even if the issues table is ever cleared.
function getDeviceId() {
  const key = "groundtruth-device-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}
