import { STATUSES, getStatus } from "./statuses.js";
import { iconElement } from "./icons.js";
import { $, makeField, resizeNotes } from "./dom.js";
import { state } from "./state.js";
import {
  findNode,
  findParent,
  isIncomplete,
  recapFor,
  siblingsFor,
  subprojectCount,
} from "./tree.js";

/** Interpolate project colors based on nested sub-project depth. */
function gradientFor(node) {
  const ratio = subprojectCount(node) / (subprojectCount(node) + 1);
  const purple = [99, 102, 241];
  const blue = [125, 211, 252];
  const color = blue.map((value, index) =>
    Math.round(value + (purple[index] - value) * ratio)
  );
  return `rgb(${color.join(", ")})`;
}

/** Create a status icon from the central status catalog. */
function statusIconElement(statusName) {
  const status = getStatus(statusName);
  const image = document.createElement("span");
  image.className = "status-icon";
  image.style.maskImage = `url("/assets/icons/${status.icon}")`;
  image.style.webkitMaskImage = image.style.maskImage;
  image.setAttribute("aria-label", status.name);
  return image;
}

/** Create an editable row and wire its local interactions. */
function createRow(node, level, actions) {
  const collapsed = state.collapsed.has(node.id);
  const row = document.createElement("tr");
  row.className = `node-row node-${node.type} ${
    collapsed ? "collapsed" : ""
  } ${node.id === state.selectedId ? "selected" : ""}`;
  row.onclick = () => actions.selectRow(node.id, row);

  const reorderCell = document.createElement("td");
  const reorderControls = document.createElement("div");
  reorderControls.className = "reorder-cell";
  const siblings = siblingsFor(node.id);
  const nodeIndex = siblings.findIndex((sibling) => sibling.id === node.id);
  [
    ["arrowUp", nodeIndex <= 0, "Move up", -1],
    ["arrowDown", nodeIndex >= siblings.length - 1, "Move down", 1],
  ].forEach(([direction, disabled, label, offset]) => {
    const button = document.createElement("button");
    button.className = "reorder-button";
    button.type = "button";
    button.disabled = disabled;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.append(iconElement(direction, label));
    button.onclick = (event) => {
      event.stopPropagation();
      actions.selectRow(node.id, row);
      actions.moveNode(node.id, offset);
    };
    reorderControls.append(button);
  });
  reorderCell.append(reorderControls);
  row.append(reorderCell);

  const nameCell = document.createElement("td");
  const name = document.createElement("div");
  name.className = "node-name";
  name.style.setProperty("--indent", `${level * 24}px`);
  name.append(document.createElement("span"));
  name.lastChild.className = "indent";
  const toggle = document.createElement("button");
  toggle.className = "tree-toggle";
  toggle.type = "button";
  toggle.title = collapsed ? "Expand row" : "Collapse row";
  toggle.append(
    iconElement(
      collapsed ? "chevronRight" : "chevronDown",
      collapsed ? "Expand" : "Collapse"
    )
  );
  toggle.onclick = (event) => {
    event.stopPropagation();
    actions.selectRow(node.id, row);
    if (collapsed) {
      state.collapsed.delete(node.id);
      state.expanded.add(node.id);
    } else {
      state.collapsed.add(node.id);
      state.expanded.delete(node.id);
    }
    actions.render();
  };
  name.append(toggle);

  const nodeIcon = document.createElement("span");
  nodeIcon.className = "node-icon";
  const nodeColor = node.type === "item" ? "" : gradientFor(node);
  if (nodeColor) {
    row.style.setProperty("--node-color", nodeColor);
    nodeIcon.style.setProperty("--node-color", nodeColor);
  }
  const iconName =
    node.type === "item"
      ? "task"
      : subprojectCount(node) > 0
        ? "folderTree"
        : "folder";
  nodeIcon.append(iconElement(iconName, iconName));
  name.append(nodeIcon);

  const title = makeField(
    "input",
    node.title,
    "Name",
    (value) => actions.updateNode(node.id, "title", value)
  );
  title.className = "title-field";
  title.onclick = () => actions.selectRow(node.id, row);
  name.append(title);
  nameCell.append(name);
  row.append(nameCell);

  const contentCell = document.createElement("td");
  const notes = makeField(
    "textarea",
    node.content,
    "Add detailed notes…",
    (value) => actions.updateNode(node.id, "content", value)
  );
  notes.className = "notes-field";
  notes.rows = 1;
  notes.onclick = () => actions.selectRow(node.id, row);
  notes.oninput = () => resizeNotes(notes, collapsed);
  contentCell.append(notes);
  const recapText = recapFor(node);
  if (state.showRecap && recapText) {
    const recap = document.createElement("div");
    recap.className = "recap-line";
    recap.textContent = `↳ ${recapText}`;
    contentCell.append(recap);
  }
  row.append(contentCell);

  const dateCell = document.createElement("td");
  const date = makeField(
    "input",
    node.date,
    "",
    (value) => actions.updateNode(node.id, "date", value)
  );
  date.type = "date";
  date.className = "date-field";
  date.onclick = () => actions.selectRow(node.id, row);
  dateCell.append(date);
  row.append(dateCell);

  const statusCell = document.createElement("td");
  const status = getStatus(node.status);
  const statusControl = document.createElement("div");
  statusControl.className = `status-cell status-${status.className}`;
  statusControl.append(statusIconElement(node.status));
  const select = document.createElement("select");
  STATUSES.forEach((option) =>
    select.append(new Option(option.name, option.name, false, node.status === option.name))
  );
  select.onchange = () => actions.updateNode(node.id, "status", select.value);
  select.onclick = () => actions.selectRow(node.id, row);
  statusControl.append(select);
  statusCell.append(statusControl);
  row.append(statusCell);
  resizeNotes(notes, collapsed);
  return row;
}

/** Render the complete project tree and update its summary counters. */
export function render(actions) {
  const tableWrap = $(".table-wrap");
  const tableScrollTop = tableWrap?.scrollTop || 0;
  const tableScrollLeft = tableWrap?.scrollLeft || 0;
  const windowScrollX = window.scrollX;
  const windowScrollY = window.scrollY;
  const query = $("#search").value.trim().toLowerCase();
  const body = $("#project-table");
  body.replaceChildren();
  let projects = 0;
  let tasks = 0;
  let pending = 0;

  const hasMatch = (node) =>
    !query ||
    [node.title, node.content, node.recap].some((value) =>
      String(value || "").toLowerCase().includes(query)
    ) ||
    (node.children || []).some(hasMatch);

  const visit = (nodes, level = 0) => {
    nodes.forEach((node) => {
      if (node.type === "project") projects += 1;
      if (node.type === "item") {
        tasks += 1;
        if (!["Done", "Canceled"].includes(node.status)) pending += 1;
      }
      if (!hasMatch(node) || (state.viewMode === "incomplete" && !isIncomplete(node))) {
        return;
      }
      body.append(createRow(node, level, actions));
      if (node.children?.length && state.expanded.has(node.id)) {
        visit(node.children, level + 1);
      }
    });
  };
  visit(state.tree);
  $("#empty-state").hidden = body.children.length > 0;
  $("#project-count").textContent = projects;
  $("#task-count").textContent = tasks;
  $("#pending-count").textContent = pending;
  $("#view-mode").value = state.viewMode;
  $("#recap-toggle").textContent = state.showRecap ? "Hide recap" : "Show recap";
  $("#recap-toggle").setAttribute(
    "aria-label",
    state.showRecap ? "Hide recaps" : "Show recaps"
  );
  actions.updateActions();
  if (tableWrap) {
    tableWrap.scrollTop = tableScrollTop;
    tableWrap.scrollLeft = tableScrollLeft;
  }
  window.scrollTo(windowScrollX, windowScrollY);
}
