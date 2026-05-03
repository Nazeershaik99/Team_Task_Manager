from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.db import init_db
from backend.router import api

app = FastAPI(title="Team Task Manager")
app.include_router(api, prefix="/api")


@app.on_event("startup")
def _startup() -> None:
    init_db()


ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIST = ROOT / "frontend" / "dist"

# Prod: serve built React frontend (frontend/dist) from FastAPI.
# Dev: run Vite separately; it proxies /api to this backend.
if FRONTEND_DIST.exists():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str) -> FileResponse:
        return FileResponse(str(FRONTEND_DIST / "index.html"))
