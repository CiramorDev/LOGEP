"""Small HTTP response and static-file actions."""

import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler
from pathlib import Path


def send_json(
    handler: BaseHTTPRequestHandler,
    status: int | HTTPStatus,
    payload: object,
) -> None:
    """Serialize a JSON response with safe, non-cached headers."""
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(data)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(data)


def send_file(
    handler: BaseHTTPRequestHandler,
    path: Path,
    content_type: str,
) -> None:
    """Serve one already-validated frontend asset."""
    data = path.read_bytes()
    handler.send_response(HTTPStatus.OK)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)
