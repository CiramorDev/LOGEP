import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from . import server
from .server import _atomic_write, _backup_file, _read_file


class StorageTests(unittest.TestCase):
    def test_atomic_write_round_trip(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "projects.json"
            payload = [{"id": "p1", "type": "project", "children": []}]
            _atomic_write(path, payload)
            self.assertEqual(_read_file(path), payload)

    def test_backup_rotation_keeps_five(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "projects.json"
            path.write_text("[]", encoding="utf-8")
            with patch.object(server, "_utc_stamp", side_effect=[f"20260101T00000{i}Z" for i in range(7)]):
                for _ in range(7):
                    _backup_file(path)
            self.assertEqual(len(list((Path(directory) / ".logep-backups").glob("*.json"))), 5)

    def test_invalid_root_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "projects.json"
            path.write_text(json.dumps({"projects": []}), encoding="utf-8")
            with self.assertRaises(ValueError):
                _read_file(path)


if __name__ == "__main__":
    unittest.main()
