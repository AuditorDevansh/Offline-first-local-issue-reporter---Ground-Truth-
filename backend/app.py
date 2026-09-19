"""
Local development server — exposes the same contract as the Lambda deployment.

By default uses SQLite (USE_DYNAMO=false).
Set USE_DYNAMO=true + AWS_PROFILE/credentials to test against real DynamoDB.

Run:
    uvicorn app:api --reload --port 8000
"""
import os
os.environ.setdefault("USE_DYNAMO", "false")   # SQLite by default locally

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from src.store import (
    get_issue, nearby_issues, update_issue, upsert_issue,
    list_issues, get_stats, bulk_update_status, ALLOWED_STATUSES,
)


class Issue(BaseModel):
    id: str
    title: str = Field(min_length=1, max_length=160)
    category: str = Field(min_length=1, max_length=40)
    description: str = ""
    lat: float | None = None
    lng: float | None = None
    photoRef: str | None = None
    createdAt: int
    deviceId: str | None = None
    syncVersion: int = 1


api = FastAPI(title="GroundTruth API", version="1.0.0")
api.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@api.get("/healthz")
def health():
    return {"status": "ok", "service": "groundtruth-api",
            "version": os.getenv("APP_VERSION", "dev")}


@api.post("/sync/batch")
def sync_batch(issues: list[Issue]):
    results = []
    for item in issues:
        r = upsert_issue(item.model_dump(by_alias=False))
        results.append(r or {"id": item.id, "status": "rejected"})
    return {"results": results}


@api.get("/issues/nearby")
def nearby(lat: float, lng: float,
           radius: float = Query(1000, gt=0, le=100_000)):
    return {"center": {"lat": lat, "lng": lng}, "radius": radius,
            "issues": nearby_issues(lat, lng, radius)}


@api.get("/issues/{issue_id}")
def detail(issue_id: str):
    issue = get_issue(issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    return issue


@api.patch("/issues/{issue_id}")
def update(issue_id: str, changes: dict):
    if not get_issue(issue_id):
        raise HTTPException(status_code=404, detail="Issue not found")
    if "status" in changes and changes["status"] not in ALLOWED_STATUSES:
        raise HTTPException(status_code=400,
                            detail=f"Invalid status. Allowed: {sorted(ALLOWED_STATUSES)}")
    return update_issue(issue_id, changes)


@api.post("/issues/{issue_id}/photo")
def photo_upload(issue_id: str, contentType: str = "image/jpeg"):
    from src.store import generate_photo_upload_url
    issue = get_issue(issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    result = generate_photo_upload_url(issue_id, contentType)
    if not result:
        raise HTTPException(status_code=503,
                            detail="Photo storage not configured")
    update_issue(issue_id, {"photo_ref": result["photoRef"]})
    return result


# ── Admin routes (local dev has no API key enforcement) ───────────────────────

@api.get("/admin/issues")
def admin_list(status: str | None = None, category: str | None = None,
               search: str | None = None, limit: int = 50, offset: int = 0):
    return list_issues(status=status, category=category,
                       search=search, limit=limit, offset=offset)


@api.get("/admin/stats")
def admin_stats():
    return get_stats()


@api.post("/admin/issues/bulk")
def admin_bulk(body: dict):
    ids        = body.get("ids", [])
    new_status = body.get("status")
    if not ids or not new_status:
        raise HTTPException(status_code=400,
                            detail="ids (array) and status are required")
    return bulk_update_status(ids, new_status)
