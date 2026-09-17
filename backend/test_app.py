from app import app


def client():
    return app.test_client()


def test_healthz():
    res = client().get("/healthz")
    assert res.status_code == 200
    assert res.get_json()["status"] == "ok"


def test_sync_batch_requires_array():
    res = client().post("/sync/batch", json={"not": "a list"})
    assert res.status_code == 400


def test_sync_batch_echoes_status():
    res = client().post("/sync/batch", json=[{"id": "abc-123"}])
    assert res.status_code == 200
    assert res.get_json()["results"] == [{"id": "abc-123", "status": "synced"}]


def test_nearby_requires_coordinates():
    res = client().get("/issues/nearby")
    assert res.status_code == 400
