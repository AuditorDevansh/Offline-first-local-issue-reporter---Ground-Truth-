"""POST /issues/{id}/photo — generate a presigned S3 PUT URL for photo uploads.

The client calls this after syncing an issue, then PUTs the photo blob
directly to S3 using the returned URL.  The photo_ref stored in the DB is
the S3 object key returned here.
"""
import json
from src.store import get_issue, generate_photo_upload_url, update_issue


def handler(event, context):
    issue_id = (event.get("pathParameters") or {}).get("id")
    if not issue_id:
        return _error(400, "Missing issue id")

    params = event.get("queryStringParameters") or {}
    content_type = params.get("contentType", "image/jpeg")

    issue = get_issue(issue_id)
    if not issue:
        return _error(404, "Issue not found")

    result = generate_photo_upload_url(issue_id, content_type)
    if not result:
        return _error(503, "Photo storage not configured (PHOTOS_BUCKET not set)")

    # Persist the photo_ref so the record knows where the photo will live
    update_issue(issue_id, {"photo_ref": result["photoRef"]})

    return {
        "statusCode": 200,
        "headers": _cors_headers(),
        "body": json.dumps(result),
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
