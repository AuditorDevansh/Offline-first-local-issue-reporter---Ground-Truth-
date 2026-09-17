"""GET /healthz — cheap liveness check for the deploy target and demo prep."""
import json


def handler(event, context):
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"status": "ok", "service": "groundtruth-api"}),
    }
