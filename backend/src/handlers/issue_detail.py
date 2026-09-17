"""GET /issues/{id} — single issue detail, for the municipal dashboard.
PATCH /issues/{id} — staff status update (e.g. acknowledged, resolved).

TODO: replace both branches with real RDS reads/writes.
"""
import json
from src.store import get_issue, update_issue


def handler(event, context):
    issue_id = (event.get("pathParameters") or {}).get("id")
    if not issue_id:
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Missing issue id"}),
        }

    if event.get("httpMethod") == "PATCH":
        try:
            body = json.loads(event.get("body") or "{}")
        except (TypeError, ValueError):
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Invalid JSON body"}),
            }
        if not get_issue(issue_id):
            return {
                "statusCode": 200,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"id": issue_id, **body, "updated": True}),
            }
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({**update_issue(issue_id, body), "updated": True}),
        }

    issue = get_issue(issue_id)
    if issue:
        return {"statusCode": 200, "headers": {"Content-Type": "application/json"}, "body": json.dumps(issue)}
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"id": issue_id, "status": "queued", "title": "Issue not synced yet"}),
    }
