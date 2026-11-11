import { $, setStatus } from "./dom.js";
import { state } from "./state.js";
import { applySavedView, flatten } from "./tree.js";

/** Save the current tree through the backend API. */
export async function save() {
  try {
    const response = await fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.tree),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    state.mtimeNs = result.mtime_ns;
    setStatus("Saved", "ok");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

/** Debounce autosaves after an editable tree change. */
export function queueSave() {
  if (!state.file) return;
  setStatus("Saving…");
  clearTimeout(queueSave.timer);
  queueSave.timer = setTimeout(save, 700);
}

/** Apply an opened API response to the workspace state. */
function applyOpenedFile(result, render) {
  state.tree = result.data;
  state.file = result.file;
  state.mtimeNs = result.mtime_ns;
  localStorage.setItem("logep.selectedFile", state.file);
  state.expanded = new Set(
    flatten(state.tree)
      .filter((node) => node.expanded !== false && node.type !== "item")
      .map((node) => node.id)
  );
  state.collapsed = new Set(
    flatten(state.tree)
      .filter((node) => node.expanded === false)
      .map((node) => node.id)
  );
  applySavedView();
  $("#file-name").textContent = state.file;
  setStatus("Loaded", "ok");
  render();
}

/** Open a chosen or cached project file. */
export async function openFile(path, render) {
  try {
    setStatus(path ? "Restoring file…" : "Choose a file…");
    const response = await fetch(
      path ? `/api/open?path=${encodeURIComponent(path)}` : "/api/open"
    );
    const result = await response.json();
    if (result.cancelled) {
      setStatus("Not connected");
      return false;
    }
    if (!response.ok) throw new Error(result.error);
    applyOpenedFile(result, render);
    return true;
  } catch (error) {
    setStatus(path ? "Cached file unavailable; choose a file." : error.message, "error");
    return false;
  }
}

/** Restore the backend's cached file when it is still available. */
export async function openCachedFile(render) {
  try {
    const response = await fetch("/api/open-cached");
    if (!response.ok) return false;
    const result = await response.json();
    if (!result.file) return false;
    applyOpenedFile(result, render);
    return true;
  } catch {
    return false;
  }
}

/** Ask the backend to create the scheduled hourly backup. */
export async function hourlyBackup() {
  if (!state.file) return;
  try {
    const response = await fetch("/api/backup", { method: "POST" });
    if (!response.ok) {
      throw new Error((await response.json()).error);
    }
  } catch (error) {
    setStatus(`Backup failed: ${error.message}`, "error");
  }
}
