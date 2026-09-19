"""POST /sync/batch

Accepts an array of queued issues from the client's offline outbox.
Idempotent: each issue carries a client-generated UUID, so replaying the
same batch after a dropped connection must never create duplicates.

Conflict resolution: last-write-wins keyed on sync_version.
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

    results = []
    for issue in issues:
        result = upsert_issue(issue)
        if result:
            results.append(result)
        elif issue.get("id"):
            # Item had an id but failed validation — mark rejected
            results.append({"id": issue.get("id"), "status": "rejected"})
        else:
            results.append({"id": None, "status": "rejected"})

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,X-Api-Key,Authorization",
        },
        "body": json.dumps({"results": results}),
    }


def _error(status, message):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps({"error": message}),
    }
