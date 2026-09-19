"""Admin-only endpoints (all require x-api-key header validated by API Gateway).

GET  /admin/issues          — paginated list with optional status/category/search filters
GET  /admin/stats           — aggregate counts by status for the dashboard
POST /admin/issues/bulk     — bulk status update: { "ids": [...], "status": "resolved" }
GET  /admin/issues/{id}/photo-upload — generate S3 presigned upload URL
"""
import json
import os
from src.store import list_issues, get_stats, bulk_update_status, get_issue, generate_photo_upload_url


def handler(event, context):
    path = event.get("path", "")
    method = event.get("httpMethod", "GET")
    params = event.get("queryStringParameters") or {}
    path_params = event.get("pathParameters") or {}

    # Route: GET /admin/stats
    if path.endswith("/stats") and method == "GET":
        return _ok(get_stats())

    # Route: POST /admin/issues/bulk
    if path.endswith("/bulk") and method == "POST":
        try:
            body = json.loads(event.get("body") or "{}")
        except (TypeError, ValueError):
            return _error(400, "Invalid JSON body")
        ids = body.get("ids", [])
        new_status = body.get("status")
        if not ids or not new_status:
            return _error(400, "ids (array) and status are required")
        result = bulk_update_status(ids, new_status)
        return _ok(result)

    # Route: GET /admin/issues/{id}/photo-upload
    issue_id = path_params.get("id")
    if issue_id and path.endswith("/photo-upload") and method == "GET":
        issue = get_issue(issue_id)
        if not issue:
            return _error(404, "Issue not found")
        content_type = params.get("contentType", "image/jpeg")
        result = generate_photo_upload_url(issue_id, content_type)
        if not result:
            return _error(503, "Photo storage not configured")
        return _ok(result)

    # Route: GET /admin/issues
    status_filter = params.get("status")
    category_filter = params.get("category")
    search = params.get("search")
    limit = params.get("limit", 50)
    offset = params.get("offset", 0)

    result = list_issues(
        status=status_filter,
        category=category_filter,
        limit=limit,
        offset=offset,
        search=search,
    )
    return _ok(result)


def _ok(data):
    return {
        "statusCode": 200,
        "headers": _cors_headers(),
        "body": json.dumps(data),
    }


def _error(status, message):
    return {
        "statusCode": status,
        "headers": _cors_headers(),
        "body": json.dumps({"error": message}),
    }


def _cors_headers():
    # Admin CORS: only allow the Amplify app origin.  In SAM the actual origin is
    # injected via the ALLOWED_ORIGIN env var; fall back to wildcard for local dev.
    origin = os.getenv("ALLOWED_ORIGIN", "*")
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "Content-Type,X-Api-Key,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    }
