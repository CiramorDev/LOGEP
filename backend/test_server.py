import json
import tempfile
import threading
import time
import unittest
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch
from urllib.parse import quote

from . import server, storage
from .server import _atomic_write, _backup_file, _read_file
from .storage import _validate_payload


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
            with patch.object(storage, "_utc_stamp", side_effect=[f"20260101T00000{i}Z" for i in range(7)]):
                for _ in range(7):
                    _backup_file(path)
            self.assertEqual(len(list((Path(directory) / ".logep-backups").glob("*.json"))), 5)

    def test_invalid_root_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "projects.json"
            path.write_text(json.dumps({"projects": []}), encoding="utf-8")
            with self.assertRaises(ValueError):
                _read_file(path)

    def test_nested_duplicate_ids_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "unique"):
            _validate_payload(
                [
                    {
                        "id": "p1",
                        "type": "project",
                        "children": [{"id": "p1", "type": "item", "children": []}],
                    }
                ]
            )

    def test_nested_invalid_children_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "object"):
            _validate_payload(
                [{"id": "p1", "type": "project", "children": ["invalid"]}]
            )


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        cls.project_path = Path(cls.directory.name) / "projects.json"
        cls.project_path.write_text("[]\n", encoding="utf-8")
        cls.httpd = server.LogepServer(("127.0.0.1", 0), server.Handler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.httpd.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=2)
        cls.directory.cleanup()

    def setUp(self):
        with self.httpd.state.lock:
            self.httpd.state.selected_file = None
            self.httpd.state.selected_mtime_ns = None

    def request(self, method, path, body=None):
        connection = HTTPConnection("127.0.0.1", self.port, timeout=3)
        encoded = None if body is None else json.dumps(body).encode("utf-8")
        headers = {} if encoded is None else {"Content-Type": "application/json"}
        connection.request(method, path, encoded, headers)
        response = connection.getresponse()
        content = response.read()
        connection.close()
        return response.status, json.loads(content) if content else None

    def test_static_index_is_served(self):
        connection = HTTPConnection("127.0.0.1", self.port, timeout=3)
        connection.request("GET", "/")
        response = connection.getresponse()
        content = response.read()
        connection.close()
        self.assertEqual(response.status, 200)
        self.assertIn(b"LOGEP", content)

    def test_open_and_save_round_trip(self):
        status, opened = self.request(
            "GET", f"/api/open?path={quote(str(self.project_path))}"
        )
        self.assertEqual(status, 200)
        self.assertEqual(opened["data"], [])

        payload = [{"id": "p1", "type": "project", "children": []}]
        status, saved = self.request("POST", "/api/save", payload)
        self.assertEqual(status, 200)
        self.assertIsInstance(saved["mtime_ns"], int)
        self.assertEqual(json.loads(self.project_path.read_text()), payload)

    def test_invalid_save_returns_bad_request(self):
        self.request("GET", f"/api/open?path={quote(str(self.project_path))}")
        status, response = self.request("POST", "/api/save", {"projects": []})
        self.assertEqual(status, 400)
        self.assertIn("array", response["error"])

    def test_malformed_json_returns_bad_request(self):
        connection = HTTPConnection("127.0.0.1", self.port, timeout=3)
        connection.request(
            "POST",
            "/api/save",
            b"{not-json",
            {"Content-Type": "application/json"},
        )
        response = connection.getresponse()
        content = json.loads(response.read())
        connection.close()
        self.assertEqual(response.status, 400)
        self.assertIn("valid JSON", content["error"])

    def test_state_reports_selected_file(self):
        self.request("GET", f"/api/open?path={quote(str(self.project_path))}")
        status, response = self.request("GET", "/api/state")
        self.assertEqual(status, 200)
        self.assertEqual(response["file"], str(self.project_path))
        self.assertIsInstance(response["mtime_ns"], int)

    def test_backup_without_selected_file_is_safe(self):
        status, response = self.request("POST", "/api/backup", [])
        self.assertEqual(status, 200)
        self.assertEqual(response, {"ok": True})

    def test_external_change_returns_conflict(self):
        self.request("GET", f"/api/open?path={quote(str(self.project_path))}")
        time.sleep(0.01)
        self.project_path.write_text("[]\n", encoding="utf-8")
        status, response = self.request("POST", "/api/save", [])
        self.assertEqual(status, 409)
        self.assertIn("changed outside", response["error"])

    def test_unknown_route_returns_not_found(self):
        status, response = self.request("GET", "/api/unknown")
        self.assertEqual(status, 404)
        self.assertIn("Route", response["error"])


if __name__ == "__main__":
    unittest.main()
