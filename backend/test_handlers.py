import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from src.handlers import health, sync_batch, nearby_issues, issue_detail


def test_health():
    res = health.handler({}, None)
    assert res["statusCode"] == 200
    assert json.loads(res["body"])["status"] == "ok"


def test_sync_batch_requires_array():
    event = {"body": json.dumps({"not": "a list"})}
    res = sync_batch.handler(event, None)
    assert res["statusCode"] == 400


def test_sync_batch_echoes_status():
    event = {"body": json.dumps([{"id": "abc-123"}])}
    res = sync_batch.handler(event, None)
    assert res["statusCode"] == 200
    assert json.loads(res["body"])["results"] == [{"id": "abc-123", "status": "synced"}]


def test_nearby_requires_coordinates():
    event = {"queryStringParameters": None}
    res = nearby_issues.handler(event, None)
    assert res["statusCode"] == 400


def test_nearby_accepts_coordinates():
    event = {"queryStringParameters": {"lat": "12.9", "lng": "77.6", "radius": "1000"}}
    res = nearby_issues.handler(event, None)
    assert res["statusCode"] == 200
    assert json.loads(res["body"])["center"] == {"lat": 12.9, "lng": 77.6}


def test_issue_detail_get():
    event = {"pathParameters": {"id": "xyz"}, "httpMethod": "GET"}
    res = issue_detail.handler(event, None)
    assert res["statusCode"] == 200
    assert json.loads(res["body"])["id"] == "xyz"


def test_issue_detail_patch():
    event = {
        "pathParameters": {"id": "xyz"},
        "httpMethod": "PATCH",
        "body": json.dumps({"status": "resolved"}),
    }
    res = issue_detail.handler(event, None)
    body = json.loads(res["body"])
    assert body["status"] == "resolved"
    assert body["updated"] is True
