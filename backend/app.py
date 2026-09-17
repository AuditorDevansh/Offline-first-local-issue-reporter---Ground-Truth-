"""Local production-shaped API exposing the same contract through Flask and FastAPI."""
from flask import Flask, jsonify, request
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.wsgi import WSGIMiddleware
from pydantic import BaseModel, Field

from src.store import get_issue, nearby_issues, update_issue, upsert_issue


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


flask_app = Flask(__name__)


@flask_app.get("/healthz")
def flask_health():
    return jsonify(status="ok", service="groundtruth-api")


@flask_app.post("/sync/batch")
def flask_sync():
    payload = request.get_json(silent=True)
    if not isinstance(payload, list):
        return jsonify(error="Body must be a JSON array of issues"), 400
    return jsonify(results=[upsert_issue(item) or {"id": item.get("id"), "status": "rejected"} for item in payload])


@flask_app.get("/issues/<issue_id>")
def flask_detail(issue_id):
    issue = get_issue(issue_id)
    if not issue:
        return jsonify(error="Issue not found"), 404
    return jsonify(issue)


@flask_app.get("/issues/nearby")
def flask_nearby():
    try:
        lat = float(request.args["lat"])
        lng = float(request.args["lng"])
        radius = float(request.args.get("radius", 1000))
        if radius <= 0:
            raise ValueError
    except (KeyError, TypeError, ValueError):
        return jsonify(error="lat, lng, and radius must be valid"), 400
    return jsonify(center={"lat": lat, "lng": lng}, radius=radius, issues=nearby_issues(lat, lng, radius))


@flask_app.patch("/issues/<issue_id>")
def flask_update(issue_id):
    if not get_issue(issue_id):
        return jsonify(error="Issue not found"), 404
    return jsonify(update_issue(issue_id, request.get_json(silent=True) or {}))


@flask_app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


api = FastAPI(title="GroundTruth API", version="1.0.0")
api.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@api.get("/healthz")
def fastapi_health():
    return {"status": "ok", "service": "groundtruth-api"}


@api.post("/sync/batch")
def fastapi_sync(issues: list[Issue]):
    return {"results": [upsert_issue(item.model_dump()) for item in issues]}


@api.get("/issues/nearby")
def fastapi_nearby(lat: float, lng: float, radius: float = Query(1000, gt=0, le=100000)):
    return {"center": {"lat": lat, "lng": lng}, "radius": radius, "issues": nearby_issues(lat, lng, radius)}


@api.get("/issues/{issue_id}")
def fastapi_detail(issue_id: str):
    issue = get_issue(issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    return issue


@api.patch("/issues/{issue_id}")
def fastapi_update(issue_id: str, changes: dict):
    if not get_issue(issue_id):
        raise HTTPException(status_code=404, detail="Issue not found")
    return update_issue(issue_id, changes)


api.mount("/flask", WSGIMiddleware(flask_app))
