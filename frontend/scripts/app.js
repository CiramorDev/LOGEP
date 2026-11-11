import { $, setStatus } from "./dom.js";
import { state } from "./state.js";
import { render } from "./rendering.js";
import {
  hourlyBackup,
  openCachedFile,
  openFile,
} from "./file-actions.js";
import {
  addItem,
  deleteSelected,
  moveNode,
  openEditor,
  selectRow,
  updateActions,
  updateNode,
} from "./editing-actions.js";
import { applySavedView } from "./tree.js";

/** Render with all action dependencies bound to the current workspace. */
function renderWorkspace() {
  render({
    render: renderWorkspace,
    selectRow: (id, row, event) => selectRow(id, row, event, updateActions),
    moveNode: (id, offset) => moveNode(id, offset, renderWorkspace),
    updateNode: (id, key, value) => updateNode(id, key, value, renderWorkspace),
    updateActions,
  });
}

/** Apply and persist the selected visual theme. */
function applyTheme(theme) {
  const normalizedTheme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = normalizedTheme;
  localStorage.setItem("logep.theme", normalizedTheme);
  $("#theme-toggle").textContent =
    normalizedTheme === "light" ? "Dark mode" : "Light mode";
}

/** Register application controls and start cached-file restoration. */
function initialize() {
  $("#open-file").onclick = () => openFile(null, renderWorkspace);
  $("#add-project").onclick = () => openEditor("project");
  $("#add-subproject").onclick = () => openEditor("subproject");
  $("#add-item").onclick = () => openEditor("item");
  $("#edit-form").onsubmit = (event) => {
    event.preventDefault();
    if (event.submitter?.value === "cancel") {
      $("#edit-dialog").close();
      return;
    }
    addItem(renderWorkspace);
  };
  $("#search").oninput = renderWorkspace;
  $("#view-mode").onchange = () => {
    state.viewMode = $("#view-mode").value;
    localStorage.setItem("logep.viewMode", state.viewMode);
    applySavedView();
    renderWorkspace();
  };
  $("#recap-toggle").onclick = () => {
    state.showRecap = !state.showRecap;
    localStorage.setItem("logep.showRecap", String(state.showRecap));
    renderWorkspace();
  };
  $("#delete-selected").onclick = () => deleteSelected(renderWorkspace);
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest("#edit-dialog")) return;
    const clickedRow = target instanceof Element && target.closest(".node-row");
    const clickedTable = target instanceof Element && target.closest("table");
    const clickedButton = target instanceof Element && target.closest("button");
    if (
      !clickedRow &&
      !clickedTable &&
      !clickedButton &&
      state.selectedIds.size > 0
    ) {
      state.selectedIds.clear();
      state.selectedId = null;
      renderWorkspace();
    }
  });
  applyTheme(localStorage.getItem("logep.theme") || document.documentElement.dataset.theme);
  $("#theme-toggle").onclick = () =>
    applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
  setInterval(hourlyBackup, 60 * 60 * 1000);
  const cachedFile = localStorage.getItem("logep.selectedFile");
  const restore = cachedFile
    ? openFile(cachedFile, renderWorkspace).then((loaded) =>
        loaded
          ? true
          : openCachedFile(renderWorkspace)
      )
    : openCachedFile(renderWorkspace);
  restore.then((loaded) => {
    if (!loaded) {
      setStatus("Not connected");
      renderWorkspace();
    }
  });
}

initialize();
