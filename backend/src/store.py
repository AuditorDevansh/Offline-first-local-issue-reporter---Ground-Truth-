"""
Persistence layer — DynamoDB (production) with SQLite fallback (local dev).

DynamoDB table layout
─────────────────────
Table name  : ${ISSUES_TABLE}  (default: groundtruth-issues)
Partition key : id (S)
GSI-1  : StatusCreatedAtIndex   — pk: status,  sk: created_at  (for admin filter)
GSI-2  : CategoryCreatedAtIndex — pk: category, sk: created_at  (for admin filter)

All timestamps are stored as ISO-8601 strings so they sort lexicographically.
Numeric lat/lng are stored as Decimal (DynamoDB requirement).
"""
import json
import os
import time
from decimal import Decimal
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────
ISSUES_TABLE  = os.getenv("ISSUES_TABLE", "groundtruth-issues")
PHOTOS_BUCKET = os.getenv("PHOTOS_BUCKET", "")
USE_DYNAMO    = os.getenv("USE_DYNAMO", "true").lower() != "false"

# SQLite fallback path (local dev when USE_DYNAMO=false)
DB_PATH = Path(os.getenv("GROUNDTRUTH_DB",
               Path(__file__).resolve().parents[1] / "groundtruth.db"))

ALLOWED_STATUSES = {
    "queued", "synced", "acknowledged",
    "in_progress", "resolved", "rejected",
}

# ── DynamoDB helpers ──────────────────────────────────────────────────────────

def _dynamo():
    import boto3
    return boto3.resource("dynamodb").Table(ISSUES_TABLE)


def _to_dynamo(record: dict) -> dict:
    """Convert a plain dict to DynamoDB-safe types."""
    item = dict(record)
    for key in ("lat", "lng"):
        if item.get(key) is not None:
            item[key] = Decimal(str(item[key]))
    return item


def _from_dynamo(item: dict) -> dict:
    """Convert DynamoDB item back to plain Python types."""
    result = dict(item)
    for key in ("lat", "lng"):
        if result.get(key) is not None:
            result[key] = float(result[key])
    return result


# ── SQLite fallback ───────────────────────────────────────────────────────────

def _sqlite_conn():
    import sqlite3
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("""CREATE TABLE IF NOT EXISTS issues (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '', lat REAL, lng REAL,
        photo_ref TEXT, status TEXT NOT NULL DEFAULT 'queued',
        created_at INTEGER NOT NULL, device_id TEXT,
        sync_version INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL
    )""")
    return conn


# ── Public API ────────────────────────────────────────────────────────────────

def upsert_issue(issue: dict):
    """Idempotent upsert keyed on issue['id']. Returns {id, status} or None."""
    required = ("id", "title", "category", "createdAt")
    if not isinstance(issue, dict) or any(not issue.get(k) for k in required):
        return None

    record = {
        "id":           str(issue["id"]),
        "title":        str(issue["title"]).strip()[:160],
        "category":     str(issue["category"]).strip()[:40],
        "description":  str(issue.get("description") or "").strip()[:2000],
        "lat":          issue.get("lat"),
        "lng":          issue.get("lng"),
        "photo_ref":    issue.get("photoRef"),
        "status":       "synced",
        "created_at":   int(issue["createdAt"]),
        "device_id":    issue.get("deviceId"),
        "sync_version": int(issue.get("syncVersion") or 1),
        "updated_at":   int(issue.get("updatedAt") or issue["createdAt"]),
    }

    if USE_DYNAMO:
        table = _dynamo()
        table.put_item(Item=_to_dynamo(record))
    else:
        with _sqlite_conn() as conn:
            conn.execute("""
                INSERT INTO issues
                  (id,title,category,description,lat,lng,photo_ref,status,
                   created_at,device_id,sync_version,updated_at)
                VALUES
                  (:id,:title,:category,:description,:lat,:lng,:photo_ref,
                   :status,:created_at,:device_id,:sync_version,:updated_at)
                ON CONFLICT(id) DO UPDATE SET
                  title=excluded.title, category=excluded.category,
                  description=excluded.description, lat=excluded.lat,
                  lng=excluded.lng, photo_ref=excluded.photo_ref,
                  status=excluded.status, sync_version=excluded.sync_version,
                  updated_at=excluded.updated_at
            """, record)

    return {"id": record["id"], "status": "synced"}


def get_issue(issue_id: str):
    if USE_DYNAMO:
        response = _dynamo().get_item(Key={"id": issue_id})
        item = response.get("Item")
        return _serialize_dynamo(_from_dynamo(item)) if item else None
    else:
        with _sqlite_conn() as conn:
            row = conn.execute(
                "SELECT * FROM issues WHERE id = ?", (issue_id,)
            ).fetchone()
        return _serialize_sqlite(row) if row else None


def update_issue(issue_id: str, changes: dict):
    allowed = {"status", "title", "description", "category", "photo_ref"}
    updates = {k: v for k, v in changes.items() if k in allowed and v is not None}
    if "status" in updates and updates["status"] not in ALLOWED_STATUSES:
        updates.pop("status")
    if not updates:
        return get_issue(issue_id)

    updates["updated_at"] = int(time.time() * 1000)

    if USE_DYNAMO:
        expr   = "SET " + ", ".join(f"#{k} = :{k}" for k in updates)
        names  = {f"#{k}": k for k in updates}
        values = {f":{k}": (Decimal(str(v)) if isinstance(v, float) else v)
                  for k, v in updates.items()}
        _dynamo().update_item(
            Key={"id": issue_id},
            UpdateExpression=expr,
            ExpressionAttributeNames=names,
            ExpressionAttributeValues=values,
        )
    else:
        assignments = ", ".join(f"{k} = :{k}" for k in updates)
        with _sqlite_conn() as conn:
            conn.execute(
                f"UPDATE issues SET {assignments} WHERE id = :id",
                {**updates, "id": issue_id},
            )

    return get_issue(issue_id)


def nearby_issues(lat: float, lng: float, radius: float):
    """Return issues within `radius` metres of (lat, lng)."""
    deg2 = (radius / 111_000) ** 2   # radius in degrees squared

    if USE_DYNAMO:
        # Full scan with client-side filter — acceptable at civic-app scale.
        # For large datasets replace with a geohash GSI or ElasticSearch.
        response = _dynamo().scan(
            FilterExpression="attribute_exists(lat) AND attribute_exists(lng)"
        )
        items = [_from_dynamo(i) for i in response.get("Items", [])]
        # Paginate through all pages
        while "LastEvaluatedKey" in response:
            response = _dynamo().scan(
                FilterExpression="attribute_exists(lat) AND attribute_exists(lng)",
                ExclusiveStartKey=response["LastEvaluatedKey"],
            )
            items.extend(_from_dynamo(i) for i in response.get("Items", []))

        results = []
        for item in items:
            dlat = (float(item["lat"]) - lat)
            dlng = (float(item["lng"]) - lng)
            if dlat * dlat + dlng * dlng <= deg2:
                results.append(_serialize_dynamo(item))
        results.sort(key=lambda x: x["createdAt"], reverse=True)
        return results
    else:
        with _sqlite_conn() as conn:
            rows = conn.execute(
                """SELECT * FROM issues
                   WHERE lat IS NOT NULL AND lng IS NOT NULL
                   AND ((lat-?)*(lat-?)+(lng-?)*(lng-?)) <= ?
                   ORDER BY created_at DESC""",
                (lat, lat, lng, lng, deg2),
            ).fetchall()
        return [_serialize_sqlite(r) for r in rows]


def list_issues(status=None, category=None, limit=50, offset=0, search=None):
    """Paginated list for the admin panel."""
    limit  = min(int(limit  or 50),  200)
    offset = int(offset or 0)

    if USE_DYNAMO:
        # Scan with optional filter — fine for admin use
        filter_parts, expr_values, expr_names = [], {}, {}

        if status:
            filter_parts.append("#st = :status")
            expr_names[":status"]  = status  # boto3 quirk — value not name
            expr_names["#st"]      = "status"
            expr_values[":status"] = status

        if category:
            filter_parts.append("category = :category")
            expr_values[":category"] = category

        if search:
            filter_parts.append(
                "(contains(title, :search) OR contains(description, :search))"
            )
            expr_values[":search"] = search

        kwargs = {}
        if filter_parts:
            kwargs["FilterExpression"] = " AND ".join(filter_parts)
            kwargs["ExpressionAttributeValues"] = expr_values
            if expr_names:
                kwargs["ExpressionAttributeNames"] = {"#st": "status"}

        items = []
        response = _dynamo().scan(**kwargs)
        items.extend(_from_dynamo(i) for i in response.get("Items", []))
        while "LastEvaluatedKey" in response:
            response = _dynamo().scan(
                **kwargs, ExclusiveStartKey=response["LastEvaluatedKey"]
            )
            items.extend(_from_dynamo(i) for i in response.get("Items", []))

        items.sort(key=lambda x: int(x.get("created_at", 0)), reverse=True)
        total = len(items)
        page  = items[offset: offset + limit]
        return {
            "issues": [_serialize_dynamo(i) for i in page],
            "total":  total,
            "limit":  limit,
            "offset": offset,
        }
    else:
        conditions, params = [], []
        if status:
            conditions.append("status = ?"); params.append(status)
        if category:
            conditions.append("category = ?"); params.append(category)
        if search:
            conditions.append("(title LIKE ? OR description LIKE ?)")
            params.extend([f"%{search}%", f"%{search}%"])

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        with _sqlite_conn() as conn:
            total = dict(conn.execute(
                f"SELECT COUNT(*) as cnt FROM issues {where}", params
            ).fetchone())["cnt"]
            rows = conn.execute(
                f"SELECT * FROM issues {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
                params + [limit, offset],
            ).fetchall()
        return {
            "issues": [_serialize_sqlite(r) for r in rows],
            "total":  total, "limit": limit, "offset": offset,
        }


def get_stats():
    """Aggregate counts by status for the admin dashboard."""
    cutoff = int((time.time() - 86400) * 1000)

    if USE_DYNAMO:
        response = _dynamo().scan(
            ProjectionExpression="#st, created_at",
            ExpressionAttributeNames={"#st": "status"},
        )
        items = list(response.get("Items", []))
        while "LastEvaluatedKey" in response:
            response = _dynamo().scan(
                ProjectionExpression="#st, created_at",
                ExpressionAttributeNames={"#st": "status"},
                ExclusiveStartKey=response["LastEvaluatedKey"],
            )
            items.extend(response.get("Items", []))

        by_status: dict = {}
        last_24h = 0
        for item in items:
            s = item.get("status", "unknown")
            by_status[s] = by_status.get(s, 0) + 1
            if int(item.get("created_at", 0)) > cutoff:
                last_24h += 1

        total = sum(by_status.values())
    else:
        with _sqlite_conn() as conn:
            rows = conn.execute(
                "SELECT status, COUNT(*) as cnt FROM issues GROUP BY status"
            ).fetchall()
            total_row = conn.execute(
                "SELECT COUNT(*) as cnt FROM issues"
            ).fetchone()
            recent_row = conn.execute(
                "SELECT COUNT(*) as cnt FROM issues WHERE created_at > ?",
                (cutoff,),
            ).fetchone()
        by_status = {dict(r)["status"]: dict(r)["cnt"] for r in rows}
        total    = dict(total_row)["cnt"]
        last_24h = dict(recent_row)["cnt"]

    return {
        "total":        total,
        "last_24h":     last_24h,
        "by_status":    by_status,
        "queued":       by_status.get("queued",       0),
        "synced":       by_status.get("synced",       0),
        "acknowledged": by_status.get("acknowledged", 0),
        "in_progress":  by_status.get("in_progress",  0),
        "resolved":     by_status.get("resolved",     0),
    }


def bulk_update_status(issue_ids: list, new_status: str):
    if not issue_ids or new_status not in ALLOWED_STATUSES:
        return {"updated": 0}
    now = int(time.time() * 1000)
    updated = 0
    if USE_DYNAMO:
        table = _dynamo()
        for iid in issue_ids:
            table.update_item(
                Key={"id": iid},
                UpdateExpression="SET #st = :s, updated_at = :u",
                ExpressionAttributeNames={"#st": "status"},
                ExpressionAttributeValues={":s": new_status, ":u": now},
            )
            updated += 1
    else:
        with _sqlite_conn() as conn:
            for iid in issue_ids:
                cur = conn.execute(
                    "UPDATE issues SET status=:s, updated_at=:u WHERE id=:id",
                    {"s": new_status, "u": now, "id": iid},
                )
                updated += cur.rowcount
    return {"updated": updated}


def generate_photo_upload_url(issue_id: str, content_type="image/jpeg"):
    if not PHOTOS_BUCKET:
        return None
    import boto3
    s3  = boto3.client("s3")
    key = f"photos/{issue_id}.jpg"
    url = s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": PHOTOS_BUCKET, "Key": key, "ContentType": content_type},
        ExpiresIn=300,
    )
    return {"uploadUrl": url, "photoRef": key}


# ── Serialisers ───────────────────────────────────────────────────────────────

def _serialize_dynamo(item: dict) -> dict:
    return {
        "id":          item.get("id"),
        "title":       item.get("title"),
        "category":    item.get("category"),
        "description": item.get("description", ""),
        "lat":         item.get("lat"),
        "lng":         item.get("lng"),
        "photoRef":    item.get("photo_ref"),
        "status":      item.get("status", "queued"),
        "createdAt":   int(item.get("created_at", 0)),
        "deviceId":    item.get("device_id"),
        "syncVersion": int(item.get("sync_version", 1)),
        "updatedAt":   int(item.get("updated_at", 0)),
    }


def _serialize_sqlite(row) -> dict:
    r = dict(row)
    r.pop("distance", None)
    return {
        "id":          r["id"],
        "title":       r["title"],
        "category":    r["category"],
        "description": r.get("description", ""),
        "lat":         r.get("lat"),
        "lng":         r.get("lng"),
        "photoRef":    r.get("photo_ref"),
        "status":      r.get("status", "queued"),
        "createdAt":   r["created_at"],
        "deviceId":    r.get("device_id"),
        "syncVersion": r.get("sync_version", 1),
        "updatedAt":   r.get("updated_at", 0),
    }


# convenience alias used by tests
def _serialize(row):
    if isinstance(row, dict):
        return _serialize_dynamo(row)
    return _serialize_sqlite(row)
