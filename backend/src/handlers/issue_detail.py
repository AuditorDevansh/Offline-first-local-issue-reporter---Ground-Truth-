"""GET /issues/{id}  — single issue detail.
PATCH /issues/{id} — staff status update (acknowledged, in_progress, resolved, etc.).
"""
import json
from src.store import get_issue, update_issue, ALLOWED_STATUSES


def handler(event, context):
    issue_id = (event.get("pathParameters") or {}).get("id")
    if not issue_id:
        return _error(400, "Missing issue id")

    if event.get("httpMethod") == "PATCH":
        try:
            body = json.loads(event.get("body") or "{}")
        except (TypeError, ValueError):
            return _error(400, "Invalid JSON body")

        issue = get_issue(issue_id)
        if not issue:
            return _error(404, "Issue not found")

        # Validate status if provided
        if "status" in body and body["status"] not in ALLOWED_STATUSES:
            return _error(400, f"Invalid status. Allowed: {sorted(ALLOWED_STATUSES)}")

        updated = update_issue(issue_id, body)
        return {
            "statusCode": 200,
            "headers": _cors_headers(),
            "body": json.dumps({**updated, "updated": True}),
        }

    # GET
    issue = get_issue(issue_id)
    if not issue:
        return _error(404, "Issue not found")

    return {
        "statusCode": 200,
        "headers": _cors_headers(),
        "body": json.dumps(issue),
    }


def _cors_headers():
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,X-Api-Key,Authorization",
    }


def _error(status, message):
    return {
        "statusCode": status,
        "headers": _cors_headers(),
        "body": json.dumps({"error": message}),
    }
