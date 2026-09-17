"""GET /issues/nearby?lat=&lng=&radius=

Returns synced issues within `radius` meters of (lat, lng), for the map view.

TODO: replace with a real PostGIS query, e.g.
  SELECT * FROM issues
  WHERE ST_DWithin(location, ST_MakePoint(%(lng)s, %(lat)s)::geography, %(radius)s)
"""
import json
from src.store import nearby_issues


def handler(event, context):
    params = event.get("queryStringParameters") or {}
    lat = params.get("lat")
    lng = params.get("lng")
    radius = params.get("radius", 1000)

    if lat is None or lng is None:
        return _error(400, "lat and lng query parameters are required")

    try:
        latitude, longitude, distance = float(lat), float(lng), float(radius)
        if not -90 <= latitude <= 90 or not -180 <= longitude <= 180 or distance <= 0:
            raise ValueError
    except (TypeError, ValueError):
        return _error(400, "lat, lng, and radius must be valid positive coordinates")

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(
            {
                "center": {"lat": latitude, "lng": longitude},
                "radius": distance,
                "issues": nearby_issues(latitude, longitude, distance),
            }
        ),
    }


def _error(status, message):
    return {"statusCode": status, "headers": {"Content-Type": "application/json"}, "body": json.dumps({"error": message})}
