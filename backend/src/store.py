"""Persistence layer supporting local SQLite and deployed PostgreSQL."""
import json
import os
import time
from pathlib import Path

DB_PATH = Path(os.getenv("GROUNDTRUTH_DB", Path(__file__).resolve().parents[1] / "groundtruth.db"))
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

ALLOWED_STATUSES = {"queued", "synced", "acknowledged", "in_progress", "resolved", "rejected"}


def _connection():
    if DATABASE_URL:
        import psycopg
        from psycopg.rows import dict_row

        connection = psycopg.connect(DATABASE_URL, row_factory=dict_row)
        connection.execute(
            """CREATE TABLE IF NOT EXISTS issues (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '', lat DOUBLE PRECISION, lng DOUBLE PRECISION,
                photo_ref TEXT, status TEXT NOT NULL DEFAULT 'queued',
                created_at BIGINT NOT NULL, device_id TEXT, sync_version INTEGER NOT NULL DEFAULT 1,
                updated_at BIGINT NOT NULL
            )"""
        )
        connection.commit()
        return connection

    connection = __import__("sqlite3").connect(DB_PATH)
    connection.row_factory = __import__("sqlite3").Row
    connection.execute(
        """CREATE TABLE IF NOT EXISTS issues (
            id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '', lat REAL, lng REAL,
            photo_ref TEXT, status TEXT NOT NULL DEFAULT 'queued',
            created_at INTEGER NOT NULL, device_id TEXT, sync_version INTEGER NOT NULL DEFAULT 1,
            updated_at INTEGER NOT NULL
        )"""
    )
    return connection


def upsert_issue(issue):
    required = ("id", "title", "category", "createdAt")
    if not isinstance(issue, dict) or any(not issue.get(key) for key in required):
        return None
    record = {
        "id": str(issue["id"]),
        "title": str(issue["title"]).strip()[:160],
        "category": str(issue["category"]).strip()[:40],
        "description": str(issue.get("description") or "").strip()[:2000],
        "lat": issue.get("lat"),
        "lng": issue.get("lng"),
        "photo_ref": issue.get("photoRef"),
        "status": "synced",
        "created_at": int(issue["createdAt"]),
        "device_id": issue.get("deviceId"),
        "sync_version": int(issue.get("syncVersion") or 1),
        "updated_at": int(issue.get("updatedAt") or issue["createdAt"]),
    }
    with _connection() as connection:
        if DATABASE_URL:
            connection.execute(
                """INSERT INTO issues (id,title,category,description,lat,lng,photo_ref,status,
                   created_at,device_id,sync_version,updated_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                   ON CONFLICT(id) DO UPDATE SET
                   title=excluded.title, category=excluded.category, description=excluded.description,
                   lat=excluded.lat, lng=excluded.lng, photo_ref=excluded.photo_ref,
                   status=excluded.status, sync_version=excluded.sync_version, updated_at=excluded.updated_at""",
                tuple(record.values()),
            )
        else:
            connection.execute(
                """INSERT INTO issues (id,title,category,description,lat,lng,photo_ref,status,
                   created_at,device_id,sync_version,updated_at)
                   VALUES (:id,:title,:category,:description,:lat,:lng,:photo_ref,:status,
                   :created_at,:device_id,:sync_version,:updated_at)
                   ON CONFLICT(id) DO UPDATE SET
                   title=excluded.title, category=excluded.category, description=excluded.description,
                   lat=excluded.lat, lng=excluded.lng, photo_ref=excluded.photo_ref,
                   status=excluded.status, sync_version=excluded.sync_version, updated_at=excluded.updated_at""",
                record,
            )
    return {"id": record["id"], "status": "synced"}


def get_issue(issue_id):
    with _connection() as connection:
        placeholder = "%s" if DATABASE_URL else "?"
        row = connection.execute(
            f"SELECT * FROM issues WHERE id = {placeholder}", (issue_id,)
        ).fetchone()
    return _serialize(row) if row else None


def update_issue(issue_id, changes):
    allowed = {"status", "title", "description", "category"}
    updates = {key: value for key, value in changes.items() if key in allowed and value is not None}

    # Validate status if provided
    if "status" in updates and updates["status"] not in ALLOWED_STATUSES:
        updates.pop("status")

    if not updates:
        return get_issue(issue_id)

    updates["updated_at"] = int(time.time() * 1000)
    assignments = ", ".join(
        f"{key} = %s" if DATABASE_URL else f"{key} = :{key}" for key in updates
    )
    with _connection() as connection:
        if DATABASE_URL:
            connection.execute(
                f"UPDATE issues SET {assignments} WHERE id = %s",
                (*updates.values(), issue_id),
            )
        else:
            connection.execute(
                f"UPDATE issues SET {assignments} WHERE id = :id",
                {**updates, "id": issue_id},
            )
    return get_issue(issue_id)


def nearby_issues(lat, lng, radius):
    with _connection() as connection:
        placeholder = "%s" if DATABASE_URL else "?"
        rows = connection.execute(
            f"""SELECT *, ((lat - {placeholder}) * (lat - {placeholder}) + (lng - {placeholder}) * (lng - {placeholder})) AS distance
               FROM issues WHERE lat IS NOT NULL AND lng IS NOT NULL
               AND ((lat - {placeholder}) * (lat - {placeholder}) + (lng - {placeholder}) * (lng - {placeholder})) <= {placeholder}
               ORDER BY created_at DESC""",
            (lat, lat, lng, lng, lat, lat, lng, lng, (radius / 111_000) ** 2),
        ).fetchall()
    return [_serialize(row) for row in rows]


def list_issues(status=None, category=None, limit=50, offset=0, search=None):
    """List issues with optional filters — used by the admin panel."""
    limit = min(int(limit or 50), 200)
    offset = int(offset or 0)
    ph = "%s" if DATABASE_URL else "?"

    conditions = []
    params = []

    if status:
        conditions.append(f"status = {ph}")
        params.append(status)
    if category:
        conditions.append(f"category = {ph}")
        params.append(category)
    if search:
        if DATABASE_URL:
            conditions.append(f"(title ILIKE {ph} OR description ILIKE {ph})")
            params.extend([f"%{search}%", f"%{search}%"])
        else:
            conditions.append(f"(title LIKE {ph} OR description LIKE {ph})")
            params.extend([f"%{search}%", f"%{search}%"])

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    with _connection() as connection:
        total_row = connection.execute(
            f"SELECT COUNT(*) as cnt FROM issues {where}", params
        ).fetchone()
        total = dict(total_row)["cnt"] if total_row else 0

        rows = connection.execute(
            f"SELECT * FROM issues {where} ORDER BY created_at DESC LIMIT {ph} OFFSET {ph}",
            params + [limit, offset],
        ).fetchall()

    return {
        "issues": [_serialize(row) for row in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


def get_stats():
    """Return aggregate counts by status — for the admin dashboard."""
    with _connection() as connection:
        rows = connection.execute(
            "SELECT status, COUNT(*) as cnt FROM issues GROUP BY status"
        ).fetchall()
        total_row = connection.execute("SELECT COUNT(*) as cnt FROM issues").fetchone()
        recent_row = connection.execute(
            "SELECT COUNT(*) as cnt FROM issues WHERE created_at > ?",
            (int((time.time() - 86400) * 1000),),
        ).fetchone() if not DATABASE_URL else connection.execute(
            "SELECT COUNT(*) as cnt FROM issues WHERE created_at > %s",
            (int((time.time() - 86400) * 1000),),
        ).fetchone()

    by_status = {row["status"] if DATABASE_URL else dict(row)["status"]: (row["cnt"] if DATABASE_URL else dict(row)["cnt"]) for row in rows}
    total = dict(total_row)["cnt"] if total_row else 0
    last_24h = dict(recent_row)["cnt"] if recent_row else 0

    return {
        "total": total,
        "last_24h": last_24h,
        "by_status": by_status,
        "queued": by_status.get("queued", 0),
        "synced": by_status.get("synced", 0),
        "acknowledged": by_status.get("acknowledged", 0),
        "in_progress": by_status.get("in_progress", 0),
        "resolved": by_status.get("resolved", 0),
    }


def bulk_update_status(issue_ids, new_status):
    """Bulk-update status for a list of issue IDs — admin operation."""
    if not issue_ids or new_status not in ALLOWED_STATUSES:
        return {"updated": 0}
    now = int(time.time() * 1000)
    updated = 0
    with _connection() as connection:
        for issue_id in issue_ids:
            if DATABASE_URL:
                cur = connection.execute(
                    "UPDATE issues SET status = %s, updated_at = %s WHERE id = %s",
                    (new_status, now, issue_id),
                )
            else:
                cur = connection.execute(
                    "UPDATE issues SET status = :status, updated_at = :updated_at WHERE id = :id",
                    {"status": new_status, "updated_at": now, "id": issue_id},
                )
            updated += cur.rowcount if hasattr(cur, "rowcount") else 1
    return {"updated": updated}


def generate_photo_upload_url(issue_id, content_type="image/jpeg"):
    """Generate a presigned S3 URL for photo upload."""
    import boto3
    bucket = os.getenv("PHOTOS_BUCKET", "")
    if not bucket:
        return None
    s3 = boto3.client("s3")
    key = f"photos/{issue_id}.jpg"
    url = s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": bucket, "Key": key, "ContentType": content_type},
        ExpiresIn=300,
    )
    return {"uploadUrl": url, "photoRef": key}


def _serialize(row):
    result = dict(row)
    result.pop("distance", None)  # remove the computed distance column if present
    result["photoRef"] = result.pop("photo_ref")
    result["createdAt"] = result.pop("created_at")
    result["deviceId"] = result.pop("device_id")
    result["syncVersion"] = result.pop("sync_version")
    result["updatedAt"] = result.pop("updated_at")
    return result
