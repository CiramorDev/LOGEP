import { STATUS_OPTIONS } from "./statuses.js";
import { $, setStatus } from "./dom.js";
import { state } from "./state.js";
import { findNode, findParent, siblingsFor } from "./tree.js";
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
export function selectRow(id, row, updateActions) {
  state.selectedId = id;
  document
    .querySelectorAll(".node-row.selected")
    .forEach((selectedRow) => selectedRow.classList.remove("selected"));
  row.classList.add("selected");
  updateActions();
}

/** Update toolbar buttons according to the selected node type. */
export function updateActions() {
  const selected = findNode(state.selectedId);
  $("#add-subproject").disabled =
    !selected || !["project", "subproject"].includes(selected.type);
  $("#add-item").disabled = !selected || selected.type === "item";
  $("#delete-selected").disabled = !selected;
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

/** Delete the selected node after explicit user confirmation. */
export function deleteSelected(render) {
  const parent = findParent(state.selectedId);
  const collection = parent ? parent.children : state.tree;
  const index = collection.findIndex((node) => node.id === state.selectedId);
  if (index >= 0 && confirm("Delete the selected item and its children?")) {
    collection.splice(index, 1);
    state.selectedId = null;
    render();
    queueSave();
  }
}
