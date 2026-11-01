# LOGEP

LOGEP (Liste Organisée de Gestion de Projets) is a local-only project workspace developed on personal time by Ciramor.

## Run

Use Python 3.11+ and run `run_logep.bat`, then open <http://127.0.0.1:8765>. The server binds only to localhost and uses no internet services or third-party runtime packages.

Choose a JSON file with **Open JSON file**. LOGEP creates a `.logep-backups` directory beside it, makes a backup on open, and exposes the backup endpoint for hourly scheduling. The frontend autosaves 700 ms after edits. External changes are detected and autosave is paused with an error.

## Structure

- `backend/server.py`: local HTTP server, native file picker, validation, atomic writes, conflict detection, and backup rotation.
- `frontend/index.html`: semantic application shell.
- `frontend/assets/app.js`: state, rendering, editing, search, filters, and autosave.
- `frontend/assets/styles.css`: responsive grayscale/blue light and dark themes.

The LLM integration is intentionally not implemented yet. Future adapters should be added behind a backend allowlist rather than exposing credentials in the browser.

## License

MIT. Redistribution, including commercial resale, is permitted under the selected open-source license. Attribution to Ciramor and this notice should be retained.
