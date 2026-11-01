"""Local-only LOGEP server.

The server deliberately uses only Python's standard library. It binds to
127.0.0.1 and never exposes the selected file outside the local process.
"""

from __future__ import annotations

import json
import os
import shutil
import tempfile
import threading
import tkinter as tk
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tkinter import filedialog
from urllib.parse import parse_qs, unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
CONFIGURATION_DIRECTORY = ROOT / ".local"
CACHED_FILE_PATH = CONFIGURATION_DIRECTORY / "selected-file.txt"
BACKUP_DIRECTORY_NAME = ".logep-backups"
MAX_BACKUPS = 5
_state_lock = threading.Lock()
_selected_file: Path | None = None
_selected_mtime_ns: int | None = None


def _utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _validate_payload(payload: object) -> list[dict]:
    if not isinstance(payload, list):
        raise ValueError("The LOGEP data must be a JSON array.")
    for node in payload:
        if not isinstance(node, dict):
            raise ValueError("Every project entry must be an object.")
        if not isinstance(node.get("id"), str) or not node["id"]:
            raise ValueError("Every entry must have a non-empty string id.")
        if node.get("type") not in {"project", "subproject", "item"}:
            raise ValueError("Every entry must have a supported type.")
        if not isinstance(node.get("children", []), list):
            raise ValueError("Every entry's children must be an array.")
    return payload


def _read_file(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8") as handle:
        return _validate_payload(json.load(handle))


def _backup_file(path: Path) -> None:
    if not path.exists():
        return
    directory = path.parent / BACKUP_DIRECTORY_NAME
    directory.mkdir(exist_ok=True)
    destination = directory / f"{path.stem}.{_utc_stamp()}{path.suffix}"
    shutil.copy2(path, destination)
    backups = sorted(directory.glob(f"{path.stem}.*{path.suffix}"), key=lambda item: item.stat().st_mtime_ns, reverse=True)
    for old_backup in backups[MAX_BACKUPS:]:
        old_backup.unlink()


def _atomic_write(path: Path, payload: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(_validate_payload(payload), indent=2, ensure_ascii=False) + "\n"
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_name, path)
    except Exception:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


def choose_file() -> Path | None:
    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    try:
        selected = filedialog.askopenfilename(
            title="Open LOGEP project file",
            filetypes=[("LOGEP JSON", "*.json"), ("All files", "*.*")],
        )
    finally:
        root.destroy()
    return Path(selected).resolve() if selected else None


def _read_cached_path() -> Path | None:
    try:
        cached = CACHED_FILE_PATH.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return None
    return Path(cached).resolve() if cached else None


def _cache_path(path: Path) -> None:
    CONFIGURATION_DIRECTORY.mkdir(parents=True, exist_ok=True)
    CACHED_FILE_PATH.write_text(str(path), encoding="utf-8")


def _json_response(handler: BaseHTTPRequestHandler, status: int, payload: object) -> None:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(data)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(data)


class Handler(BaseHTTPRequestHandler):
    server_version = "LOGEP/1.0"

    def log_message(self, format: str, *args: object) -> None:
        return

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/state":
            with _state_lock:
                selected = _selected_file
                mtime = _selected_mtime_ns
            _json_response(self, HTTPStatus.OK, {"file": str(selected) if selected else None, "mtime_ns": mtime})
            return
        if path == "/api/open":
            requested_path = parse_qs(urlparse(self.path).query).get("path", [None])[0]
            self._open_file(Path(unquote(requested_path)).resolve() if requested_path else None)
            return
        if path == "/api/open-cached":
            cached = _read_cached_path()
            if cached is None:
                _json_response(self, HTTPStatus.NOT_FOUND, {"error": "No cached project file."})
            else:
                self._open_file(cached)
            return
        if path == "/":
            self._serve_file(FRONTEND / "index.html", "text/html; charset=utf-8")
            return
        if path.startswith("/assets/"):
            candidate = (FRONTEND / path.removeprefix("/")).resolve()
            if FRONTEND.resolve() not in candidate.parents or not candidate.is_file():
                _json_response(self, HTTPStatus.NOT_FOUND, {"error": "Asset not found."})
                return
            content_types = {
                ".css": "text/css; charset=utf-8",
                ".js": "text/javascript; charset=utf-8",
                ".svg": "image/svg+xml",
            }
            content_type = content_types.get(candidate.suffix, "application/octet-stream")
            self._serve_file(candidate, content_type)
            return
        _json_response(self, HTTPStatus.NOT_FOUND, {"error": "Route not found."})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path not in {"/api/save", "/api/backup"}:
            _json_response(self, HTTPStatus.NOT_FOUND, {"error": "Route not found."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length))
            if path == "/api/backup":
                with _state_lock:
                    if _selected_file:
                        _backup_file(_selected_file)
                _json_response(self, HTTPStatus.OK, {"ok": True})
                return
            self._save_file(payload)
        except json.JSONDecodeError:
            _json_response(self, HTTPStatus.BAD_REQUEST, {"error": "Request body is not valid JSON."})
        except ValueError as error:
            _json_response(self, HTTPStatus.BAD_REQUEST, {"error": str(error)})
        except FileExistsError as error:
            _json_response(self, HTTPStatus.CONFLICT, {"error": str(error)})
        except OSError as error:
            _json_response(self, HTTPStatus.INTERNAL_SERVER_ERROR, {"error": f"File operation failed: {error}"})

    def _open_file(self, requested: Path | None = None) -> None:
        global _selected_file, _selected_mtime_ns
        try:
            selected = requested or choose_file()
            if selected is None:
                _json_response(self, HTTPStatus.OK, {"cancelled": True})
                return
            if requested and not selected.is_file():
                _json_response(self, HTTPStatus.NOT_FOUND, {"error": "The cached project file is no longer available."})
                return
            payload = _read_file(selected) if selected.exists() and selected.stat().st_size else []
            with _state_lock:
                _selected_file = selected
                _selected_mtime_ns = selected.stat().st_mtime_ns if selected.exists() else None
            _cache_path(selected)
            _backup_file(selected)
            _json_response(self, HTTPStatus.OK, {"file": str(selected), "mtime_ns": _selected_mtime_ns, "data": payload})
        except (json.JSONDecodeError, ValueError) as error:
            _json_response(self, HTTPStatus.UNPROCESSABLE_ENTITY, {"error": f"Invalid LOGEP JSON: {error}"})
        except OSError as error:
            _json_response(self, HTTPStatus.INTERNAL_SERVER_ERROR, {"error": f"Could not open file: {error}"})

    def _save_file(self, payload: object) -> None:
        global _selected_mtime_ns
        with _state_lock:
            if _selected_file is None:
                raise ValueError("Choose a project file before saving.")
            if _selected_file.exists() and _selected_mtime_ns != _selected_file.stat().st_mtime_ns:
                raise FileExistsError("The file changed outside LOGEP. Reload it before saving.")
            _atomic_write(_selected_file, payload)
            _selected_mtime_ns = _selected_file.stat().st_mtime_ns
        _json_response(self, HTTPStatus.OK, {"ok": True, "mtime_ns": _selected_mtime_ns})

    def _serve_file(self, path: Path, content_type: str) -> None:
        data = path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def run(port: int = 8765) -> None:
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"LOGEP running at http://127.0.0.1:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nLOGEP stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    run()
