"""POST /sync/batch

Accepts an array of queued issues from the client's offline outbox.
Idempotent: each issue carries a client-generated UUID, so replaying the
same batch after a dropped connection must never create duplicates.

TODO: replace this stub with a real upsert against RDS (PostgreSQL +
PostGIS), keyed on `id`, that also compares `sync_version` to resolve
conflicts.
"""
import json
from src.store import upsert_issue


def handler(event, context):
    try:
        issues = json.loads(event.get("body") or "[]")
    except (TypeError, ValueError):
        return _error(400, "Body must be a JSON array of issues")

    if not isinstance(issues, list):
        return _error(400, "Expected an array of issues")

    results = [
        upsert_issue(issue) or (
            {"id": issue.get("id"), "status": "synced"}
            if issue.get("id") and not issue.get("title")
            else {"id": issue.get("id"), "status": "rejected"}
        )
        for issue in issues
    ]

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"results": results}),
    }


def _error(status, message):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"error": message}),
    }
