"""Application paths and server configuration."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
CONFIGURATION_DIRECTORY = ROOT / ".local"
CACHED_FILE_PATH = CONFIGURATION_DIRECTORY / "selected-file.txt"
