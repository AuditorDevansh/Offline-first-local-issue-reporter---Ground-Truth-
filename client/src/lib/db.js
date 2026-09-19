// src/lib/db.js
// Local-first store. Every capture lands here before any network attempt —
// this table IS the outbox, not just a cache of it.
//
// v2 adds a `photos` object store so photo blobs survive page reloads.
// The `photoBlob` field on an issue record holds the Blob key (= issue id);
// `photoRef` is updated to the S3 key after a successful upload.
import Dexie from "dexie";

export const db = new Dexie("groundtruth");

db.version(1).stores({
  issues: "id, status, createdAt",
});

// v2: add photos object store (key = issue id, value = Blob)
db.version(2).stores({
  issues: "id, status, createdAt",
  photos: "id",
});

export const ISSUE_STATUS = {
  DRAFT:    "draft",
  QUEUED:   "queued",
  SYNCED:   "synced",
  CONFLICT: "conflict",
};

export function newIssueId() {
  return crypto.randomUUID();
}

/**
 * Save a captured issue straight to the local store and mark it queued.
 * If a photo file is provided it is stored as a Blob in IndexedDB so it
 * survives page reloads.  The in-memory object URL is used for preview only.
 */
export async function saveIssueOffline(issue) {
  const id = newIssueId();
  const record = {
    id,
    title:        issue.title,
    category:     issue.category,
    description:  issue.description,
    lat:          issue.lat  ?? null,
    lng:          issue.lng  ?? null,
    photoRef:     null,        // set to S3 key after upload
    hasLocalPhoto: issue.photoBlob ? true : false,
    status:       ISSUE_STATUS.QUEUED,
    createdAt:    Date.now(),
    deviceId:     getDeviceId(),
    syncVersion:  1,
  };

  await db.transaction("rw", db.issues, db.photos, async () => {
    await db.issues.add(record);
    if (issue.photoBlob instanceof Blob) {
      await db.photos.put({ id, blob: issue.photoBlob });
    }
  });

  window.dispatchEvent(new CustomEvent("groundtruth:issues-changed"));
  return record;
}

export async function listIssues() {
  return db.issues.orderBy("createdAt").reverse().toArray();
}

export async function queuedIssues() {
  return db.issues.where("status").equals(ISSUE_STATUS.QUEUED).toArray();
}

export async function getPhotoBlob(issueId) {
  const row = await db.photos.get(issueId);
  return row?.blob ?? null;
}

export async function deletePhotoBlob(issueId) {
  await db.photos.delete(issueId);
}

export async function markSynced(id) {
  await db.issues.update(id, { status: ISSUE_STATUS.SYNCED });
}

export async function markConflict(id) {
  await db.issues.update(id, { status: ISSUE_STATUS.CONFLICT });
}

export async function updatePhotoRef(id, photoRef) {
  await db.issues.update(id, { photoRef, hasLocalPhoto: false });
  await deletePhotoBlob(id);
}

// Anonymous per-install identifier, persisted in localStorage so it survives
// even if the issues table is cleared.
function getDeviceId() {
  const key = "groundtruth-device-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}
