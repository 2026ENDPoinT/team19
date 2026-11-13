"""Two-laptop demo prerequisites that BE can check without a network: CORS preflight for the FE headers."""
from test_api import client  # noqa: F401

ALLOWED = "http://localhost:5173"


def preflight(client, origin, method="POST", headers="x-owner-id"):
    return client.options("/lectures", headers={"Origin": origin, "Access-Control-Request-Method": method,
                                                 "Access-Control-Request-Headers": headers})


def test_default_origin_may_send_owner_header_on_upload_and_list(client):
    for method in ("POST", "GET"):
        r = preflight(client, ALLOWED, method)
        assert r.status_code == 200 and r.headers["access-control-allow-origin"] == ALLOWED
        assert "x-owner-id" in r.headers["access-control-allow-headers"].lower()


def test_unlisted_origin_is_not_allowed(client):
    # e.g. a LAN address or github.io page until FRONTEND_ORIGINS lists it
    for origin in ("http://192.168.0.20:5173", "https://example.github.io"):
        r = preflight(client, origin)
        assert "access-control-allow-origin" not in r.headers


def test_range_headers_are_exposed_for_audio_and_health_reachable(client):
    r = client.get("/health", headers={"Origin": ALLOWED})
    assert r.json()["status"] == "ok"
    exposed = r.headers.get("access-control-expose-headers", "")
    assert "Content-Range" in exposed and "Accept-Ranges" in exposed


def test_frontend_origins_env_is_honored(client, monkeypatch, tmp_path):
    import importlib, sys
    from fastapi.testclient import TestClient
    monkeypatch.setenv("FRONTEND_ORIGINS", "https://team19.github.io,http://192.168.0.20:5173")
    module = importlib.reload(sys.modules["backend.app"])
    with TestClient(module.app) as c:
        assert preflight(c, "https://team19.github.io").headers["access-control-allow-origin"] == "https://team19.github.io"
        assert "access-control-allow-origin" not in preflight(c, ALLOWED).headers
