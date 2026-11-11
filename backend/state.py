"""Mutable state shared by LOGEP request handlers."""

import threading
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class ServerState:
    """Keep the selected file and its version for one server instance."""

    lock: threading.Lock = field(default_factory=threading.Lock)
    selected_file: Path | None = None
    selected_mtime_ns: int | None = None
