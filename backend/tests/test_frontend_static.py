"""/app 靜態前端。不碰資料庫。

前端由本服務一併提供（見 main.py 結尾的 app.mount），目的是讓瀏覽器端與
/api/* 同源，省掉 CORS，也不必另外起一個靜態伺服器。
"""

from __future__ import annotations

from fastapi.testclient import TestClient

import main


def test_app_root_serves_login_page():
    """/app/ 應吐 frontend/index.html（html=True 的效果）。"""
    with TestClient(main.app) as client:
        response = client.get("/app/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "<title>" in response.text


def test_game_lobby_is_served():
    with TestClient(main.app) as client:
        lobby = client.get("/app/games.html")
    assert lobby.status_code == 200


def test_js_module_gets_javascript_content_type():
    """ES module 必須以 JavaScript 的 content-type 提供，否則瀏覽器拒絕載入。

    用 frontend/js/api.js（一定存在）驗證，不假設任何特定遊戲資料夾已經在
    frontend/ 底下——各遊戲的資料夾由各自的 PR 加入，加入時可以照這個模式
    多補一條指到自己 js 模組的斷言。
    """
    with TestClient(main.app) as client:
        module = client.get("/app/js/api.js")
    assert module.status_code == 200
    assert "javascript" in module.headers["content-type"]


def test_dccs_game_is_served():
    """frontend/dccs/ 是目前唯一已經搬進 main 的實際遊戲，順便驗證它的入口
    與 ES module 都能透過 /app 正確拿到。"""
    with TestClient(main.app) as client:
        game = client.get("/app/dccs/index.html")
        module = client.get("/app/dccs/js/dccs.js")
    assert game.status_code == 200
    assert module.status_code == 200
    assert "javascript" in module.headers["content-type"]


def test_api_routes_are_not_shadowed_by_the_mount():
    """掛載點是 /app，不得影響既有路由。"""
    with TestClient(main.app) as client:
        root = client.get("/")
        health = client.get("/health")
        games = client.get("/api/games")
    assert root.status_code == 200
    assert root.json()["status"] == "ok"
    assert health.status_code == 200
    assert games.status_code == 200


def test_backend_source_is_not_reachable_through_the_mount():
    """只掛 frontend/，後端原始碼與 .env 不在其中，任何寫法都拿不到。"""
    with TestClient(main.app) as client:
        for path in (
            "/app/../backend/main.py",
            "/app/../backend/.env",
            "/app/%2e%2e/backend/db.py",
            "/app/../.env",
        ):
            response = client.get(path)
            assert response.status_code in (403, 404), (path, response.status_code)
            assert "DB_PASSWORD" not in response.text
