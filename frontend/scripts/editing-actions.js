import { STATUS_OPTIONS } from "./statuses.js";
import { $, setStatus } from "./dom.js";
import { state } from "./state.js";
import { findNode, siblingsFor } from "./tree.js";
import { queueSave } from "./file-actions.js";

/** Update one node field and schedule persistence. */
export function updateNode(id, key, value, render) {
  const node = findNode(id);
  if (!node) return;
  node[key] = value;
  queueSave();
  render();
}

/** Move a node one position within its sibling collection. */
export function moveNode(id, offset, render) {
  const siblings = siblingsFor(id);
  const index = siblings.findIndex((node) => node.id === id);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= siblings.length) return;
  [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
  render();
  queueSave();
}

/** Select a row and synchronize toolbar action availability. */
export function selectRow(id, row, event, updateActions) {
  const isMultiSelect = event?.ctrlKey || event?.metaKey;
  const rows = [...document.querySelectorAll(".node-row")];
  const clickedIndex = rows.indexOf(row);

  if (event?.shiftKey && state.selectedId && clickedIndex >= 0) {
    const anchorRow = rows.find(
      (candidate) => candidate.dataset.nodeId === state.selectedId
    );
    const anchorIndex = rows.indexOf(anchorRow);
    if (anchorIndex >= 0) {
      const start = Math.min(anchorIndex, clickedIndex);
      const end = Math.max(anchorIndex, clickedIndex);
      state.selectedIds = new Set(
        rows.slice(start, end + 1).map((candidate) => candidate.dataset.nodeId)
      );
    }
  } else if (isMultiSelect) {
    state.selectedIds.add(id);
  } else {
    state.selectedIds = new Set([id]);
  }
  state.selectedId = id;
  document
    .querySelectorAll(".node-row.selected")
    .forEach((selectedRow) => selectedRow.classList.remove("selected"));
  document.querySelectorAll(".node-row").forEach((candidate) => {
    if (state.selectedIds.has(candidate.dataset.nodeId)) {
      candidate.classList.add("selected");
    }
  });
  updateActions();
}

/** Update toolbar buttons according to the selected node type. */
export function updateActions() {
  const selected = findNode(state.selectedId);
  const hasMultipleSelections = state.selectedIds.size > 1;
  $("#add-subproject").disabled =
    hasMultipleSelections ||
    !selected ||
    !["project", "subproject"].includes(selected.type);
  $("#add-item").disabled =
    hasMultipleSelections || !selected || selected.type === "item";
  $("#delete-selected").disabled = state.selectedIds.size === 0;
}

/** Open the add-item dialog for a project, sub-project, or task. */
export function openEditor(type) {
  state.editType = type;
  $("#dialog-title").textContent = `Add ${
    type === "item" ? "task / meeting" : type
  }`;
  $("#item-title").value = "";
  $("#item-content").value = "";
  $("#item-date").value = "";
  $("#item-status").replaceChildren(
    ...STATUS_OPTIONS.map((status) => new Option(status, status))
  );
  $("#edit-dialog").showModal();
}

/** Add the dialog's new node at the selected tree location. */
export function addItem(render) {
  if (state.selectedIds.size > 1) return;
  const parent = findNode(state.selectedId);
  const node = {
    id: crypto.randomUUID(),
    type: state.editType,
    title: $("#item-title").value.trim(),
    content: $("#item-content").value,
    date: $("#item-date").value,
    status: $("#item-status").value,
    expanded: true,
    children: [],
  };
  if (!node.title) return;
  if (node.type === "project") {
    state.tree.push(node);
  } else if (parent && ["project", "subproject"].includes(parent.type)) {
    parent.children = parent.children || [];
    parent.children.push(node);
    state.expanded.add(parent.id);
  } else {
    return;
  }
  state.expanded.add(node.id);
  $("#edit-dialog").close();
  render();
  queueSave();
}

/** Delete all selected nodes and their children after explicit confirmation. */
export function deleteSelected(render) {
  const selectedIds = new Set(state.selectedIds);
  if (
    selectedIds.size > 0 &&
    confirm(
      selectedIds.size === 1
        ? "Delete the selected item and its children?"
        : "Delete all selected items and their children?"
    )
  ) {
    const removeSelected = (nodes) => {
      for (let index = nodes.length - 1; index >= 0; index -= 1) {
        const node = nodes[index];
        if (selectedIds.has(node.id)) {
          nodes.splice(index, 1);
          continue;
        }
        if (node.children?.length) removeSelected(node.children);
      }
    };
    removeSelected(state.tree);
    state.selectedIds.clear();
    state.selectedId = null;
    render();
    queueSave();
  }
}
