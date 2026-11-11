"""Validated JSON storage for LOGEP project files."""

from __future__ import annotations

import json
import os
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import TypeAlias

JsonObject: TypeAlias = dict[str, object]
ProjectTree: TypeAlias = list[JsonObject]

BACKUP_DIRECTORY_NAME = ".logep-backups"
MAX_BACKUPS = 5


def _utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _validate_payload(payload: object) -> ProjectTree:
    """Validate a project tree and return it without changing its shape."""
    if not isinstance(payload, list):
        raise ValueError("The LOGEP data must be a JSON array.")

    identifiers: set[str] = set()

    def validate_nodes(nodes: list[object]) -> None:
        for node in nodes:
            if not isinstance(node, dict):
                raise ValueError("Every project entry must be an object.")
            identifier = node.get("id")
            if not isinstance(identifier, str) or not identifier:
                raise ValueError("Every entry must have a non-empty string id.")
            if identifier in identifiers:
                raise ValueError(f"Every entry id must be unique: {identifier}.")
            identifiers.add(identifier)
            if node.get("type") not in {"project", "subproject", "item"}:
                raise ValueError("Every entry must have a supported type.")
            children = node.get("children", [])
            if not isinstance(children, list):
                raise ValueError("Every entry's children must be an array.")
            validate_nodes(children)

    validate_nodes(payload)
    return payload


def read_file(path: Path) -> ProjectTree:
    with path.open("r", encoding="utf-8") as handle:
        return _validate_payload(json.load(handle))


def backup_file(path: Path) -> None:
    if not path.exists():
        return
    directory = path.parent / BACKUP_DIRECTORY_NAME
    directory.mkdir(exist_ok=True)
    destination = directory / f"{path.stem}.{_utc_stamp()}{path.suffix}"
    shutil.copy2(path, destination)
    backups = sorted(
        directory.glob(f"{path.stem}.*{path.suffix}"),
        key=lambda item: item.stat().st_mtime_ns,
        reverse=True,
    )
    for old_backup in backups[MAX_BACKUPS:]:
        old_backup.unlink()


def atomic_write(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(_validate_payload(payload), indent=2, ensure_ascii=False) + "\n"
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
    )
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
