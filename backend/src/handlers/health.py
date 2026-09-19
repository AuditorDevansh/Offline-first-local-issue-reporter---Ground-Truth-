"""GET /healthz — cheap liveness check."""
import json
import os


def handler(event, context):
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps({
            "status": "ok",
            "service": "groundtruth-api",
            "version": os.getenv("APP_VERSION", "1.0.0"),
        }),
    }
