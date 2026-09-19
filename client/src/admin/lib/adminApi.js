/**
 * Admin API client.
 *
 * All requests send the X-Api-Key header.  The key is held in sessionStorage
 * so it survives page refreshes within the same browser session but is
 * cleared when the tab closes — suitable for a shared municipal workstation.
 *
 * VITE_API_BASE_URL  — the API Gateway invoke URL (set in Amplify env vars)
 * VITE_ADMIN_API_KEY — the API Gateway API key (set in Amplify env vars)
 *
 * If VITE_ADMIN_API_KEY is set at build time the UI skips the login screen
 * entirely.  If it is absent the user must enter the key manually and it is
 * stored in sessionStorage for the duration of the session.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const BUILD_TIME_KEY = import.meta.env.VITE_ADMIN_API_KEY || "";

const SESSION_KEY = "groundtruth-admin-key";

// ── Key management ────────────────────────────────────────────────────────────

export function getAdminKey() {
  return BUILD_TIME_KEY || sessionStorage.getItem(SESSION_KEY) || "";
}

export function setAdminKey(key) {
  sessionStorage.setItem(SESSION_KEY, key);
}

export function clearAdminKey() {
  sessionStorage.removeItem(SESSION_KEY);
}

export function isAuthenticated() {
  return Boolean(getAdminKey());
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function request(path, options = {}) {
  const key = getAdminKey();
  if (!key) throw new AuthError("No API key — please log in.");

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": key,
      ...(options.headers || {}),
    },
  });

  if (res.status === 403 || res.status === 401) {
    throw new AuthError("Invalid or expired API key.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error || `HTTP ${res.status}`, res.status);
  }
  return res.json();
}

// ── Public API methods ────────────────────────────────────────────────────────

/** Test that the supplied key works before storing it. */
export async function testKey(key) {
  const res = await fetch(`${API_BASE}/admin/stats`, {
    headers: { "X-Api-Key": key },
  });
  if (res.status === 403 || res.status === 401) return false;
  return res.ok;
}

/** Dashboard stats: totals by status. */
export function fetchStats() {
  return request("/admin/stats");
}

/**
 * Paginated issue list with optional filters.
 * @param {object} params  { status, category, search, limit, offset }
 */
export function fetchIssues(params = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.category) qs.set("category", params.category);
  if (params.search) qs.set("search", params.search);
  if (params.limit != null) qs.set("limit", params.limit);
  if (params.offset != null) qs.set("offset", params.offset);
  const query = qs.toString();
  return request(`/admin/issues${query ? `?${query}` : ""}`);
}

/** Update a single issue (status, title, description, category). */
export function updateIssue(id, changes) {
  return request(`/issues/${id}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
}

/**
 * Bulk-update status for multiple issues.
 * @param {string[]} ids
 * @param {string} status
 */
export function bulkUpdateStatus(ids, status) {
  return request("/admin/issues/bulk", {
    method: "POST",
    body: JSON.stringify({ ids, status }),
  });
}

/** Get a presigned S3 upload URL for a photo. */
export function getPhotoUploadUrl(issueId, contentType = "image/jpeg") {
  return request(
    `/admin/issues/${issueId}/photo-upload?contentType=${encodeURIComponent(contentType)}`
  );
}

// ── Error types ───────────────────────────────────────────────────────────────

export class AuthError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthError";
  }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
