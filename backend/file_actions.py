"""File-picker, cache, open, backup, and save actions."""

import tkinter as tk
from pathlib import Path
from tkinter import filedialog

from .configuration import CACHED_FILE_PATH, CONFIGURATION_DIRECTORY
from .storage import ProjectTree, atomic_write, backup_file, read_file


def choose_file() -> Path | None:
    """Open the native file picker and return the selected absolute path."""
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


def read_cached_path() -> Path | None:
    """Read the last selected path, returning None when no cache exists."""
    try:
        cached = CACHED_FILE_PATH.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return None
    return Path(cached).resolve() if cached else None


def cache_path(path: Path) -> None:
    """Persist the selected path for the next application launch."""
    CONFIGURATION_DIRECTORY.mkdir(parents=True, exist_ok=True)
    CACHED_FILE_PATH.write_text(str(path), encoding="utf-8")


def open_project(path: Path) -> ProjectTree:
    """Read a project file, treating an empty file as an empty project."""
    return read_file(path) if path.exists() and path.stat().st_size else []


def save_project(path: Path, payload: object) -> None:
    """Validate and atomically save a project tree."""
    atomic_write(path, payload)


def create_backup(path: Path) -> None:
    """Create a rotated backup when the selected project exists."""
    backup_file(path)
