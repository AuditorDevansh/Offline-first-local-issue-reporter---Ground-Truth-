"""Handler unit tests.

These tests run against the real store (SQLite in a temp file) so they verify
the full request/response cycle without needing a live PostgreSQL database.
"""
import json
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

# Point the store at a fresh temp database for each test module run.
_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ["GROUNDTRUTH_DB"] = _tmp.name
os.environ.setdefault("DATABASE_URL", "")

from src.handlers import health, sync_batch, nearby_issues, issue_detail


# ── /healthz ──────────────────────────────────────────────────────────────────

def test_health():
    res = health.handler({}, None)
    assert res["statusCode"] == 200
    body = json.loads(res["body"])
    assert body["status"] == "ok"
    assert body["service"] == "groundtruth-api"


# ── /sync/batch ───────────────────────────────────────────────────────────────

def test_sync_batch_requires_array():
    event = {"body": json.dumps({"not": "a list"})}
    res = sync_batch.handler(event, None)
    assert res["statusCode"] == 400


def test_sync_batch_rejects_item_missing_required_fields():
    """An item with only an id and no title should come back as 'rejected'."""
    event = {"body": json.dumps([{"id": "abc-123"}])}
    res = sync_batch.handler(event, None)
    assert res["statusCode"] == 200
    results = json.loads(res["body"])["results"]
    assert results[0]["id"] == "abc-123"
    assert results[0]["status"] == "rejected"


def test_sync_batch_accepts_valid_issue():
    """A well-formed issue should be upserted and come back as 'synced'."""
    issue = {
        "id": "test-uuid-1",
        "title": "Pothole on Main St",
        "category": "pothole",
        "description": "Big one.",
        "lat": 12.9,
        "lng": 77.6,
        "createdAt": 1_700_000_000_000,
        "deviceId": "dev-1",
        "syncVersion": 1,
    }
    event = {"body": json.dumps([issue])}
    res = sync_batch.handler(event, None)
    assert res["statusCode"] == 200
    results = json.loads(res["body"])["results"]
    assert results[0]["id"] == "test-uuid-1"
    assert results[0]["status"] == "synced"


# ── /issues/nearby ────────────────────────────────────────────────────────────

def test_nearby_requires_coordinates():
    event = {"queryStringParameters": None}
    res = nearby_issues.handler(event, None)
    assert res["statusCode"] == 400


def test_nearby_accepts_coordinates():
    event = {"queryStringParameters": {"lat": "12.9", "lng": "77.6", "radius": "1000"}}
    res = nearby_issues.handler(event, None)
    assert res["statusCode"] == 200
    body = json.loads(res["body"])
    assert body["center"] == {"lat": 12.9, "lng": 77.6}
    assert isinstance(body["issues"], list)


def test_nearby_rejects_invalid_lat():
    event = {"queryStringParameters": {"lat": "999", "lng": "77.6"}}
    res = nearby_issues.handler(event, None)
    assert res["statusCode"] == 400


# ── /issues/{id} ──────────────────────────────────────────────────────────────

def test_issue_detail_get_missing():
    """GET for a non-existent id should return 404 (fixed from old stub)."""
    event = {"pathParameters": {"id": "does-not-exist"}, "httpMethod": "GET"}
    res = issue_detail.handler(event, None)
    assert res["statusCode"] == 404


def test_issue_detail_patch_missing():
    """PATCH on a non-existent id should return 404 (fixed from old stub)."""
    event = {
        "pathParameters": {"id": "does-not-exist"},
        "httpMethod": "PATCH",
        "body": json.dumps({"status": "resolved"}),
    }
    res = issue_detail.handler(event, None)
    assert res["statusCode"] == 404


def test_issue_detail_roundtrip():
    """Sync an issue, then GET it, then PATCH its status."""
    # 1. Upsert via sync/batch
    issue = {
        "id": "roundtrip-uuid",
        "title": "Broken streetlight",
        "category": "lighting",
        "createdAt": 1_700_000_001_000,
        "deviceId": "dev-rt",
        "syncVersion": 1,
    }
    sync_event = {"body": json.dumps([issue])}
    sync_res = sync_batch.handler(sync_event, None)
    assert json.loads(sync_res["body"])["results"][0]["status"] == "synced"

    # 2. GET it
    get_event = {"pathParameters": {"id": "roundtrip-uuid"}, "httpMethod": "GET"}
    get_res = issue_detail.handler(get_event, None)
    assert get_res["statusCode"] == 200
    body = json.loads(get_res["body"])
    assert body["id"] == "roundtrip-uuid"
    assert body["status"] == "synced"

    # 3. PATCH status
    patch_event = {
        "pathParameters": {"id": "roundtrip-uuid"},
        "httpMethod": "PATCH",
        "body": json.dumps({"status": "acknowledged"}),
    }
    patch_res = issue_detail.handler(patch_event, None)
    assert patch_res["statusCode"] == 200
    patch_body = json.loads(patch_res["body"])
    assert patch_body["status"] == "acknowledged"
    assert patch_body["updated"] is True


def test_issue_detail_patch_invalid_status():
    """PATCH with an invalid status value should return 400."""
    # First create the issue
    issue = {
        "id": "status-test-uuid",
        "title": "Test",
        "category": "other",
        "createdAt": 1_700_000_002_000,
        "syncVersion": 1,
    }
    sync_batch.handler({"body": json.dumps([issue])}, None)

    event = {
        "pathParameters": {"id": "status-test-uuid"},
        "httpMethod": "PATCH",
        "body": json.dumps({"status": "not_a_real_status"}),
    }
    res = issue_detail.handler(event, None)
    assert res["statusCode"] == 400


def test_issue_detail_missing_id():
    event = {"pathParameters": {}, "httpMethod": "GET"}
    res = issue_detail.handler(event, None)
    assert res["statusCode"] == 400
