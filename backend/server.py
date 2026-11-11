"""Local-only LOGEP HTTP server bootstrap."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .http_actions import send_file as _send_file
from .routes import handle_get, handle_post
from .state import ServerState


class LogepServer(ThreadingHTTPServer):
    """HTTP server carrying isolated application state for each instance."""

    def __init__(
        self,
        address: tuple[str, int],
        handler: type[BaseHTTPRequestHandler],
    ):
        super().__init__(address, handler)
        self.state = ServerState()


class Handler(BaseHTTPRequestHandler):
    """Route HTTP requests to the corresponding action group."""

    server_version = "LOGEP/1.0"

    def log_message(self, format: str, *args: object) -> None:
        """Keep the local application quiet unless it reports an error."""
        return

    def do_GET(self) -> None:
        """Handle read-only API and frontend requests."""
        handle_get(self)

    def do_POST(self) -> None:
        """Handle save and backup API requests."""
        handle_post(self)


def run(port: int = 8765) -> None:
    """Start LOGEP on localhost until interrupted."""
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


# Backward-compatible test seams for the storage actions.
from .file_actions import create_backup as _backup_file
from .file_actions import open_project as _read_file
from .file_actions import save_project as _atomic_write
