"""Persistence layer supporting local SQLite and deployed PostgreSQL."""
import json
import os
import sqlite3
from pathlib import Path


DB_PATH = Path(os.getenv("GROUNDTRUTH_DB", Path(__file__).resolve().parents[1] / "groundtruth.db"))
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()


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

    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
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
        row = connection.execute(f"SELECT * FROM issues WHERE id = {placeholder}", (issue_id,)).fetchone()
    return _serialize(row) if row else None


def update_issue(issue_id, changes):
    allowed = {"status", "title", "description", "category"}
    updates = {key: value for key, value in changes.items() if key in allowed and value is not None}
    if not updates:
        return get_issue(issue_id)
    updates["updated_at"] = int(__import__("time").time() * 1000)
    assignments = ", ".join(f"{key} = %s" if DATABASE_URL else f"{key} = :{key}" for key in updates)
    with _connection() as connection:
        if DATABASE_URL:
            connection.execute(
                f"UPDATE issues SET {assignments} WHERE id = %s",
                (*updates.values(), issue_id),
            )
        else:
            connection.execute(f"UPDATE issues SET {assignments} WHERE id = :id", {**updates, "id": issue_id})
    return get_issue(issue_id)


def nearby_issues(lat, lng, radius):
    # Equirectangular distance is sufficient for the local/demo API and avoids
    # requiring PostGIS while retaining a real radius filter.
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


def _serialize(row):
    result = dict(row)
    result["photoRef"] = result.pop("photo_ref")
    result["createdAt"] = result.pop("created_at")
    result["deviceId"] = result.pop("device_id")
    result["syncVersion"] = result.pop("sync_version")
    result["updatedAt"] = result.pop("updated_at")
    return result
