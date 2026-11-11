"""HTTP route groups for project files and frontend assets."""

import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from .configuration import FRONTEND
from .file_actions import (
    cache_path,
    choose_file,
    create_backup,
    open_project,
    read_cached_path,
    save_project,
)
from .http_actions import send_file, send_json


def handle_state(handler: BaseHTTPRequestHandler) -> None:
    """Return the selected file and its known modification time."""
    with handler.server.state.lock:
        selected = handler.server.state.selected_file
        mtime = handler.server.state.selected_mtime_ns
    send_json(
        handler,
        HTTPStatus.OK,
        {"file": str(selected) if selected else None, "mtime_ns": mtime},
    )


def handle_open(handler: BaseHTTPRequestHandler, requested: Path | None) -> None:
    """Open a selected or cached project and update server state."""
    try:
        selected = requested or choose_file()
        if selected is None:
            send_json(handler, HTTPStatus.OK, {"cancelled": True})
            return
        if requested and not selected.is_file():
            send_json(
                handler,
                HTTPStatus.NOT_FOUND,
                {"error": "The cached project file is no longer available."},
            )
            return
        payload = open_project(selected)
        mtime = selected.stat().st_mtime_ns if selected.exists() else None
        with handler.server.state.lock:
            handler.server.state.selected_file = selected
            handler.server.state.selected_mtime_ns = mtime
        cache_path(selected)
        create_backup(selected)
        send_json(
            handler,
            HTTPStatus.OK,
            {"file": str(selected), "mtime_ns": mtime, "data": payload},
        )
    except (json.JSONDecodeError, ValueError) as error:
        send_json(
            handler,
            HTTPStatus.UNPROCESSABLE_ENTITY,
            {"error": f"Invalid LOGEP JSON: {error}"},
        )
    except OSError as error:
        send_json(
            handler,
            HTTPStatus.INTERNAL_SERVER_ERROR,
            {"error": f"Could not open file: {error}"},
        )


def handle_get(handler: BaseHTTPRequestHandler) -> None:
    """Dispatch GET requests for state, files, and frontend assets."""
    parsed = urlparse(handler.path)
    if parsed.path == "/api/state":
        handle_state(handler)
        return
    if parsed.path == "/api/open":
        requested = parse_qs(parsed.query).get("path", [None])[0]
        handle_open(handler, Path(unquote(requested)).resolve() if requested else None)
        return
    if parsed.path == "/api/open-cached":
        cached = read_cached_path()
        if cached is None:
            send_json(handler, HTTPStatus.NOT_FOUND, {"error": "No cached project file."})
        else:
            handle_open(handler, cached)
        return
    if parsed.path == "/":
        send_file(handler, FRONTEND / "index.html", "text/html; charset=utf-8")
        return
    if parsed.path.startswith(("/assets/", "/scripts/", "/styles/")):
        candidate = (FRONTEND / parsed.path.removeprefix("/")).resolve()
        if FRONTEND.resolve() not in candidate.parents or not candidate.is_file():
            send_json(handler, HTTPStatus.NOT_FOUND, {"error": "Frontend file not found."})
            return
        content_types = {
            ".css": "text/css; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".svg": "image/svg+xml",
        }
        send_file(
            handler,
            candidate,
            content_types.get(candidate.suffix, "application/octet-stream"),
        )
        return
    send_json(handler, HTTPStatus.NOT_FOUND, {"error": "Route not found."})


def handle_save(handler: BaseHTTPRequestHandler, payload: object) -> None:
    """Save a project while rejecting edits based on an outdated file."""
    with handler.server.state.lock:
        selected = handler.server.state.selected_file
        if selected is None:
            raise ValueError("Choose a project file before saving.")
        if selected.exists() and handler.server.state.selected_mtime_ns != selected.stat().st_mtime_ns:
            raise FileExistsError("The file changed outside LOGEP. Reload it before saving.")
        save_project(selected, payload)
        handler.server.state.selected_mtime_ns = selected.stat().st_mtime_ns
        mtime = handler.server.state.selected_mtime_ns
    send_json(handler, HTTPStatus.OK, {"ok": True, "mtime_ns": mtime})


def handle_post(handler: BaseHTTPRequestHandler) -> None:
    """Dispatch save and backup requests with explicit client errors."""
    path = urlparse(handler.path).path
    if path not in {"/api/save", "/api/backup"}:
        send_json(handler, HTTPStatus.NOT_FOUND, {"error": "Route not found."})
        return
    try:
        length = int(handler.headers.get("Content-Length", "0"))
        payload = json.loads(handler.rfile.read(length))
        if path == "/api/backup":
            with handler.server.state.lock:
                if handler.server.state.selected_file:
                    create_backup(handler.server.state.selected_file)
            send_json(handler, HTTPStatus.OK, {"ok": True})
            return
        handle_save(handler, payload)
    except json.JSONDecodeError:
        send_json(handler, HTTPStatus.BAD_REQUEST, {"error": "Request body is not valid JSON."})
    except ValueError as error:
        send_json(handler, HTTPStatus.BAD_REQUEST, {"error": str(error)})
    except FileExistsError as error:
        send_json(handler, HTTPStatus.CONFLICT, {"error": str(error)})
    except OSError as error:
        send_json(handler, HTTPStatus.INTERNAL_SERVER_ERROR, {"error": f"File operation failed: {error}"})
