# LOGEP

LOGEP (Liste Organisée de Gestion de Projets) is a local-only project workspace developed on personal time by Ciramor.

## Run

Use Python 3.11+ and run `run_logep.bat`, then open <http://127.0.0.1:8765>. The server binds only to localhost and uses no internet services or third-party runtime packages.

For development, install the test extra and run the complete backend suite:

```powershell
python -m pip install -e ".[test]"
python -m pytest
```

The suite includes storage unit tests and HTTP-level functional tests against the
real threaded server. The standard-library fallback is also available when
pytest is not installed:

```powershell
python -m unittest discover -s . -p "test_*.py"
```

Choose a JSON file with **Open JSON file**. LOGEP creates a `.logep-backups` directory beside it, makes a backup on open, and exposes the backup endpoint for hourly scheduling. The frontend autosaves 700 ms after edits. External changes are detected and autosave is paused with an error.

## Structure

- `backend/server.py`: local HTTP server bootstrap and request handler.
- `backend/configuration.py`: frontend and local configuration paths.
- `backend/state.py`: per-server selected-file state.
- `backend/routes.py`: grouped GET and POST route actions.
- `backend/file_actions.py`: native picker, cache, open, save, and backup actions.
- `backend/http_actions.py`: JSON and static-file response helpers.
- `backend/storage.py`: recursive project-tree validation, atomic writes, and backup rotation.
- `frontend/index.html`: semantic application shell.
- `frontend/scripts/`: application JavaScript modules grouped by responsibility.
- `frontend/styles/`: stylesheet entry point and focused style layers.
- `frontend/assets/`: images, logos, and icons only.

The LLM integration is intentionally not implemented yet. Future adapters should be added behind a backend allowlist rather than exposing credentials in the browser.

## License

MIT. Redistribution, including commercial resale, is permitted under the selected open-source license. Attribution to Ciramor and this notice should be retained.
