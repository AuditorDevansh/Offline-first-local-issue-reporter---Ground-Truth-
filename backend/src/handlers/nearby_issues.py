"""GET /issues/nearby?lat=&lng=&radius=

Returns synced issues within `radius` meters of (lat, lng), for the map view.

TODO: replace with a real PostGIS query, e.g.
  SELECT * FROM issues
  WHERE ST_DWithin(location, ST_MakePoint(%(lng)s, %(lat)s)::geography, %(radius)s)
"""
import json


def handler(event, context):
    params = event.get("queryStringParameters") or {}
    lat = params.get("lat")
    lng = params.get("lng")
    radius = params.get("radius", 1000)

    if lat is None or lng is None:
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "lat and lng query parameters are required"}),
        }

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(
            {
                "center": {"lat": float(lat), "lng": float(lng)},
                "radius": float(radius),
                "issues": [],
            }
        ),
    }
