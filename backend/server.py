"""Local-only LOGEP server.

The server deliberately uses only Python's standard library. It binds to
127.0.0.1 and never exposes the selected file outside the local process.
"""

from __future__ import annotations

import json
import threading
import tkinter as tk
from dataclasses import dataclass, field
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tkinter import filedialog
from urllib.parse import parse_qs, unquote, urlparse

from .storage import atomic_write, backup_file, read_file

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
CONFIGURATION_DIRECTORY = ROOT / ".local"
CACHED_FILE_PATH = CONFIGURATION_DIRECTORY / "selected-file.txt"
@dataclass
class ServerState:
    """Mutable file session state shared by request handlers."""

    lock: threading.Lock = field(default_factory=threading.Lock)
    selected_file: Path | None = None
    selected_mtime_ns: int | None = None


class LogepServer(ThreadingHTTPServer):
    """HTTP server carrying isolated application state for each instance."""

    def __init__(self, address: tuple[str, int], handler: type[BaseHTTPRequestHandler]):
        super().__init__(address, handler)
        self.state = ServerState()


def _read_file(path: Path) -> list[dict]:
    return read_file(path)


def _backup_file(path: Path) -> None:
    backup_file(path)


def _atomic_write(path: Path, payload: list[dict]) -> None:
    atomic_write(path, payload)


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
            with self.server.state.lock:
                selected = self.server.state.selected_file
                mtime = self.server.state.selected_mtime_ns
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
                with self.server.state.lock:
                    if self.server.state.selected_file:
                        _backup_file(self.server.state.selected_file)
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
        try:
            selected = requested or choose_file()
            if selected is None:
                _json_response(self, HTTPStatus.OK, {"cancelled": True})
                return
            if requested and not selected.is_file():
                _json_response(self, HTTPStatus.NOT_FOUND, {"error": "The cached project file is no longer available."})
                return
            payload = _read_file(selected) if selected.exists() and selected.stat().st_size else []
            with self.server.state.lock:
                self.server.state.selected_file = selected
                self.server.state.selected_mtime_ns = selected.stat().st_mtime_ns if selected.exists() else None
            _cache_path(selected)
            _backup_file(selected)
            _json_response(
                self,
                HTTPStatus.OK,
                {
                    "file": str(selected),
                    "mtime_ns": self.server.state.selected_mtime_ns,
                    "data": payload,
                },
            )
        except (json.JSONDecodeError, ValueError) as error:
            _json_response(self, HTTPStatus.UNPROCESSABLE_ENTITY, {"error": f"Invalid LOGEP JSON: {error}"})
        except OSError as error:
            _json_response(self, HTTPStatus.INTERNAL_SERVER_ERROR, {"error": f"Could not open file: {error}"})

    def _save_file(self, payload: object) -> None:
        with self.server.state.lock:
            if self.server.state.selected_file is None:
                raise ValueError("Choose a project file before saving.")
            selected = self.server.state.selected_file
            if selected.exists() and self.server.state.selected_mtime_ns != selected.stat().st_mtime_ns:
                raise FileExistsError("The file changed outside LOGEP. Reload it before saving.")
            _atomic_write(selected, payload)
            self.server.state.selected_mtime_ns = selected.stat().st_mtime_ns
            mtime = self.server.state.selected_mtime_ns
        _json_response(self, HTTPStatus.OK, {"ok": True, "mtime_ns": mtime})

    def _serve_file(self, path: Path, content_type: str) -> None:
        data = path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def run(port: int = 8765) -> None:
    server = LogepServer(("127.0.0.1", port), Handler)
    print(f"LOGEP running at http://127.0.0.1:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nLOGEP stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    run()
