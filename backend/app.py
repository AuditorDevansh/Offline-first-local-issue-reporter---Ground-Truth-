"""GroundTruth backend — Flask app.

Runs unchanged in two places:
  - Locally: `flask --app app run` or `python app.py`
  - On Lambda: packaged as a container image with the AWS Lambda Web
    Adapter (see Dockerfile), which proxies API Gateway events to this
    same Flask app over local HTTP. No Lambda-specific code in here.
"""
import os
import uuid
from flask import Flask, jsonify, request

app = Flask(__name__)

# TODO (Phase 3): replace with a real connection to Amazon RDS
# (PostgreSQL + PostGIS), e.g. via psycopg2 or SQLAlchemy + GeoAlchemy2.
DATABASE_URL = os.environ.get("DATABASE_URL", "")
PHOTOS_BUCKET = os.environ.get("PHOTOS_BUCKET", "")


@app.get("/healthz")
def healthz():
    return jsonify(status="ok", service="groundtruth-api")


@app.post("/sync/batch")
def sync_batch():
    """Idempotent upsert of the client's offline outbox.

    Each issue carries a client-generated UUID, so replaying the same
    batch after a dropped connection must never create duplicates.

    TODO: replace the stub below with a real upsert against RDS, keyed on
    `id`, that compares `sync_version` to resolve conflicts.
    """
    issues = request.get_json(silent=True)
    if not isinstance(issues, list):
        return jsonify(error="Expected a JSON array of issues"), 400

    results = [
        {"id": issue.get("id"), "status": "synced" if issue.get("id") else "rejected"}
        for issue in issues
    ]
    return jsonify(results=results)


@app.get("/issues/nearby")
def nearby_issues():
    """PostGIS radius query for the map view.

    TODO: replace with a real query, e.g.
      SELECT * FROM issues
      WHERE ST_DWithin(location, ST_MakePoint(%(lng)s, %(lat)s)::geography, %(radius)s)
    """
    lat = request.args.get("lat")
    lng = request.args.get("lng")
    radius = request.args.get("radius", 1000)

    if lat is None or lng is None:
        return jsonify(error="lat and lng query parameters are required"), 400

    return jsonify(
        center={"lat": float(lat), "lng": float(lng)},
        radius=float(radius),
        issues=[],
    )


@app.get("/issues/<issue_id>")
def get_issue(issue_id):
    # TODO: replace with a real RDS read.
    return jsonify(id=issue_id, status="queued", title="Stub issue — replace with a real RDS read")


@app.patch("/issues/<issue_id>")
def update_issue(issue_id):
    body = request.get_json(silent=True) or {}
    # TODO: replace with a real RDS write (e.g. staff status update).
    return jsonify(id=issue_id, **body, updated=True)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
