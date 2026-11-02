const STATUS_OPTIONS = ["To Do", "Waiting for Approval", "Waiting for Reply", "Frozen", "Done", "Canceled"];
const STATUS_ICONS = {
  "To Do": "circle-regular-full.svg",
  "Waiting for Approval": "clock-rotate-left-solid-full.svg",
  "Waiting for Reply": "hourglass-half-solid-full.svg",
  Frozen: "snowflake-regular-full.svg",
  Done: "circle-check-solid-full.svg",
  Canceled: "circle-exclamation-solid-full.svg"
};
const ICONS = {
  chevronRight: "chevron-right-solid-full.svg",
  chevronDown: "chevron-down-solid-full.svg",
  arrowUp: "arrow-up-solid-full.svg",
  arrowDown: "arrow-down-solid-full.svg",
  folder: "folder-solid-full.svg",
  folderTree: "folder-tree-solid-full.svg",
  task: "list-check-solid-full.svg"
};
const savedViewMode = localStorage.getItem("logep.viewMode");
const savedShowRecap = localStorage.getItem("logep.showRecap");
const state = {
  tree: [],
  selectedId: null,
  file: null,
  mtimeNs: null,
  editType: null,
  expanded: new Set(),
  collapsed: new Set(),
  viewMode: ["all", "incomplete", "collapsed"].includes(savedViewMode) ? savedViewMode : "all",
  showRecap: savedShowRecap === null ? true : savedShowRecap === "true"
};
const $ = (selector) => document.querySelector(selector);
const flatten = (nodes, result = []) => { nodes.forEach((node) => { result.push(node); flatten(node.children || [], result); }); return result; };
const findNode = (id, nodes = state.tree) => { for (const node of nodes) { if (node.id === id) return node; const found = findNode(id, node.children || []); if (found) return found; } return null; };
const findParent = (id, nodes = state.tree, parent = null) => { for (const node of nodes) { if (node.id === id) return parent; const found = findParent(id, node.children || [], node); if (found !== undefined) return found; } return undefined; };
const siblingsFor = (id) => { const parent = findParent(id); return parent ? parent.children || [] : state.tree; };
const subprojectCount = (node) => (node.children || []).reduce((count, child) => count + (child.type === "subproject" ? 1 + subprojectCount(child) : 0), 0);
const gradientFor = (node) => {
  const stages = subprojectCount(node);
  const ratio = stages / (stages + 1);
  const purple = [99, 102, 241];
  const blue = [125, 211, 252];
  const color = blue.map((value, index) => Math.round(value + (purple[index] - value) * ratio));
  return `rgb(${color.join(", ")})`;
};
const setStatus = (text, kind = "") => { $("#save-status").textContent = text; $("#save-status").className = `status-dot ${kind}`; };
const icon = (name) => ({ folder: "▰", tree: "⌘", task: "☷" }[name] || "•");
const iconElement = (name, fallback) => {
  const image = document.createElement("span");
  image.className = "ui-icon";
  image.style.maskImage = `url("/assets/icons/${ICONS[name] || name}")`;
  image.style.webkitMaskImage = `url("/assets/icons/${ICONS[name] || name}")`;
  image.setAttribute("aria-label", fallback);
  return image;
};
const statusIconElement = (status) => {
  const image = document.createElement("span");
  image.className = "status-icon";
  image.style.maskImage = `url("/assets/icons/${STATUS_ICONS[status] || STATUS_ICONS["To Do"]}")`;
  image.style.webkitMaskImage = `url("/assets/icons/${STATUS_ICONS[status] || STATUS_ICONS["To Do"]}")`;
  image.setAttribute("aria-label", status || "To Do");
  return image;
};
const makeField = (tag, value, placeholder, onChange) => { const field = document.createElement(tag); field.value = value || ""; field.placeholder = placeholder; field.onchange = () => onChange(field.value); return field; };
const resizeNotes = (field, collapsed = false) => { field.style.height = "auto"; field.style.height = `${collapsed ? 34 : Math.max(34, field.scrollHeight)}px`; };
const isIncomplete = (node) => node.type === "item" ? !["Done", "Canceled"].includes(node.status) : (node.children || []).some(isIncomplete);
const expandAll = (nodes) => nodes.forEach((node) => { if (node.children?.length) { state.expanded.add(node.id); expandAll(node.children); } });
const collapseAll = (nodes) => nodes.forEach((node) => { state.collapsed.add(node.id); collapseAll(node.children || []); });
const applySavedView = () => {
  if (state.viewMode === "collapsed") {
    state.expanded.clear();
    collapseAll(state.tree);
  } else {
    expandAll(state.tree);
    state.collapsed.clear();
  }
};
const recapFor = (node) => {
  const entries = [];
  const collect = (current) => {
    if (current.content || current.date) entries.push(`${current.title}${current.date ? ` (${current.date})` : ""}${current.content ? `: ${current.content}` : ""}`);
    (current.children || []).forEach(collect);
  };
  collect(node);
  return entries.join(" • ");
};
const selectRow = (id, row) => {
  state.selectedId = id;
  document.querySelectorAll(".node-row.selected").forEach((selectedRow) => selectedRow.classList.remove("selected"));
  row.classList.add("selected");
  updateActions();
};

function render() {
  const query = $("#search").value.trim().toLowerCase();
  const incomplete = state.viewMode === "incomplete";
  const body = $("#project-table"); body.replaceChildren();
  let projects = 0, tasks = 0, pending = 0;
  const hasMatch = (node) => !query || [node.title, node.content, node.recap].some((value) => String(value || "").toLowerCase().includes(query)) || (node.children || []).some(hasMatch);
  const visit = (nodes, level = 0) => nodes.forEach((node) => {
    if (node.type === "project") projects += 1;
    if (node.type === "item") { tasks += 1; if (!["Done", "Canceled"].includes(node.status)) pending += 1; }
    if (!hasMatch(node) || (incomplete && !isIncomplete(node))) return;
    const collapsed = state.collapsed.has(node.id);
    const row = document.createElement("tr"); row.className = `node-row node-${node.type} ${collapsed ? "collapsed" : ""} ${node.id === state.selectedId ? "selected" : ""}`;
    row.onclick = () => selectRow(node.id, row);

    const reorderCell = document.createElement("td");
    const reorderControls = document.createElement("div"); reorderControls.className = "reorder-cell";
    const siblings = siblingsFor(node.id); const nodeIndex = siblings.findIndex((sibling) => sibling.id === node.id);
    [["arrowUp", nodeIndex <= 0, "Move up", -1], ["arrowDown", nodeIndex >= siblings.length - 1, "Move down", 1]].forEach(([direction, disabled, label, offset]) => {
      const button = document.createElement("button"); button.className = "reorder-button"; button.type = "button"; button.disabled = disabled; button.title = label; button.setAttribute("aria-label", label); button.append(iconElement(direction, label)); button.onclick = (event) => { event.stopPropagation(); selectRow(node.id, row); moveNode(node.id, offset); }; reorderControls.append(button);
    });
    reorderCell.append(reorderControls); row.append(reorderCell);

    const nameCell = document.createElement("td"); const name = document.createElement("div"); name.className = "node-name"; name.style.setProperty("--indent", `${level * 24}px`);
    const indent = document.createElement("span"); indent.className = "indent"; name.append(indent);
    if (node.type !== "item") {
      const toggle = document.createElement("button"); toggle.className = "tree-toggle"; toggle.type = "button";
      toggle.title = collapsed ? "Expand row" : "Collapse row";
      toggle.append(iconElement(collapsed ? "chevronRight" : "chevronDown", collapsed ? "›" : "⌄"));
      toggle.onclick = (event) => {
        event.stopPropagation(); selectRow(node.id, row);
        if (collapsed) {
          state.collapsed.delete(node.id);
          state.expanded.add(node.id);
        } else {
          state.collapsed.add(node.id);
          state.expanded.delete(node.id);
        }
        render();
      };
      name.append(toggle);
    } else {
      const toggle = document.createElement("button"); toggle.className = "tree-toggle"; toggle.type = "button";
      toggle.title = collapsed ? "Expand row" : "Collapse row";
      toggle.append(iconElement(collapsed ? "chevronRight" : "chevronDown", collapsed ? "›" : "⌄"));
      toggle.onclick = (event) => { event.stopPropagation(); selectRow(node.id, row); collapsed ? state.collapsed.delete(node.id) : state.collapsed.add(node.id); render(); };
      name.append(toggle);
    }
    const nodeIcon = document.createElement("span"); nodeIcon.className = "node-icon";
    const nodeColor = node.type === "item" ? "" : gradientFor(node);
    if (nodeColor) {
      row.style.setProperty("--node-color", nodeColor);
      nodeIcon.style.setProperty("--node-color", nodeColor);
    }
    const folderIcon = subprojectCount(node) > 0 ? "folderTree" : "folder";
    const nodeIconElement = iconElement(node.type === "item" ? "task" : folderIcon, icon(node.type === "item" ? "task" : folderIcon));
    if (nodeColor) nodeIconElement.style.background = `linear-gradient(135deg, #6366f1, ${nodeColor})`;
    nodeIcon.append(nodeIconElement); name.append(nodeIcon);
    const title = makeField("input", node.title, "Name", (value) => updateNode(node.id, "title", value)); title.className = "title-field"; title.onclick = () => selectRow(node.id, row); name.append(title);
    nameCell.append(name); row.append(nameCell);

    const contentCell = document.createElement("td"); const notes = makeField("textarea", node.content, "Add detailed notes…", (value) => updateNode(node.id, "content", value)); notes.className = "notes-field"; notes.rows = 1; notes.onclick = () => selectRow(node.id, row); notes.oninput = () => resizeNotes(notes, state.collapsed.has(node.id)); contentCell.append(notes);
    const recapText = recapFor(node); if (state.showRecap && recapText) { const recap = document.createElement("div"); recap.className = "recap-line"; recap.textContent = `↳ ${recapText}`; contentCell.append(recap); } row.append(contentCell);

    const dateCell = document.createElement("td"); const date = makeField("input", node.date, "", (value) => updateNode(node.id, "date", value)); date.type = "date"; date.className = "date-field"; date.onclick = () => selectRow(node.id, row); dateCell.append(date); row.append(dateCell);
    const statusCell = document.createElement("td"); const status = document.createElement("div"); status.className = `status-cell status-${(node.status || "To Do").toLowerCase().replaceAll(" ", "-")}`;
    status.append(statusIconElement(node.status));
    const select = document.createElement("select"); STATUS_OPTIONS.forEach((option) => select.append(new Option(option, option, false, node.status === option))); select.onchange = () => updateNode(node.id, "status", select.value); select.onclick = () => selectRow(node.id, row); status.append(select); statusCell.append(status); row.append(statusCell);
    body.append(row); resizeNotes(notes, collapsed);
    if (node.children?.length && state.expanded.has(node.id)) visit(node.children, level + 1);
  });
  visit(state.tree); $("#empty-state").hidden = body.children.length > 0; $("#project-count").textContent = projects; $("#task-count").textContent = tasks; $("#pending-count").textContent = pending; $("#view-mode").value = state.viewMode; $("#recap-toggle").textContent = state.showRecap ? "Hide recap" : "Show recap"; $("#recap-toggle").setAttribute("aria-label", state.showRecap ? "Hide recaps" : "Show recaps"); updateActions();
}

function updateActions() {
  const selected = findNode(state.selectedId);
  $("#add-subproject").disabled = !selected || !["project", "subproject"].includes(selected.type);
  $("#add-item").disabled = !selected || selected.type === "item";
  $("#delete-selected").disabled = !selected;
}
function updateNode(id, key, value) { const node = findNode(id); if (node) { node[key] = value; queueSave(); render(); } }
function queueSave() { if (!state.file) return; setStatus("Saving…"); clearTimeout(queueSave.timer); queueSave.timer = setTimeout(save, 700); }
function moveNode(id, offset) {
  const siblings = siblingsFor(id);
  const index = siblings.findIndex((node) => node.id === id);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= siblings.length) return;
  [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
  render();
  queueSave();
}
async function save() { try { const response = await fetch("/api/save", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(state.tree) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); state.mtimeNs = result.mtime_ns; setStatus("Saved", "ok"); } catch (error) { setStatus(error.message, "error"); } }
async function openFile(path = null) {
  try {
    setStatus(path ? "Restoring file…" : "Choose a file…");
    const response = await fetch(path ? `/api/open?path=${encodeURIComponent(path)}` : "/api/open");
    const result = await response.json();
    if (result.cancelled) { setStatus("Not connected"); return false; }
    if (!response.ok) throw new Error(result.error);
    state.tree = result.data;
    state.file = result.file;
    state.mtimeNs = result.mtime_ns;
    localStorage.setItem("logep.selectedFile", state.file);
    state.expanded = new Set(flatten(state.tree).filter((node) => node.expanded !== false && node.type !== "item").map((node) => node.id));
    state.collapsed = new Set(flatten(state.tree).filter((node) => node.expanded === false).map((node) => node.id));
    applySavedView();
    $("#file-name").textContent = state.file;
    setStatus("Loaded", "ok");
    render();
    return true;
  } catch (error) {
    setStatus(path ? "Cached file unavailable; choose a file." : error.message, "error");
    return false;
  }
}
async function openCachedFile() {
  try {
    const response = await fetch("/api/open-cached");
    if (!response.ok) return false;
    const result = await response.json();
    if (!result.file) return false;
    state.tree = result.data;
    state.file = result.file;
    state.mtimeNs = result.mtime_ns;
    localStorage.setItem("logep.selectedFile", state.file);
    state.expanded = new Set(flatten(state.tree).filter((node) => node.expanded !== false && node.type !== "item").map((node) => node.id));
    state.collapsed = new Set(flatten(state.tree).filter((node) => node.expanded === false).map((node) => node.id));
    applySavedView();
    $("#file-name").textContent = state.file;
    setStatus("Loaded", "ok");
    render();
    return true;
  } catch {
    return false;
  }
}
async function hourlyBackup() { if (!state.file) return; try { const response = await fetch("/api/backup", { method: "POST" }); if (!response.ok) throw new Error((await response.json()).error); } catch (error) { setStatus(`Backup failed: ${error.message}`, "error"); } }
function openEditor(type) { state.editType = type; $("#dialog-title").textContent = `Add ${type === "item" ? "task / meeting" : type}`; $("#item-title").value = ""; $("#item-content").value = ""; $("#item-date").value = ""; $("#item-status").replaceChildren(...STATUS_OPTIONS.map((status) => new Option(status, status))); $("#edit-dialog").showModal(); }
function addItem() {
  const parent = findNode(state.selectedId);
  const node = { id: crypto.randomUUID(), type: state.editType, title: $("#item-title").value.trim(), content: $("#item-content").value, date: $("#item-date").value, status: $("#item-status").value, expanded: true, children: [] };
  if (!node.title) return;
  if (node.type === "project") state.tree.push(node);
  else if (parent && ["project", "subproject"].includes(parent.type)) {
    parent.children = parent.children || [];
    parent.children.push(node);
    state.expanded.add(parent.id);
  } else return;
  state.expanded.add(node.id);
  $("#edit-dialog").close();
  render();
  queueSave();
}
$("#open-file").onclick = () => openFile(); $("#add-project").onclick = () => openEditor("project"); $("#add-subproject").onclick = () => openEditor("subproject"); $("#add-item").onclick = () => openEditor("item"); $("#edit-form").onsubmit = (event) => { event.preventDefault(); addItem(); }; $("#search").oninput = render;
$("#view-mode").onchange = () => {
  state.viewMode = $("#view-mode").value;
  localStorage.setItem("logep.viewMode", state.viewMode);
  applySavedView();
  render();
};
$("#recap-toggle").onclick = () => { state.showRecap = !state.showRecap; localStorage.setItem("logep.showRecap", String(state.showRecap)); render(); };
$("#delete-selected").onclick = () => { const parent = findParent(state.selectedId); const collection = parent ? parent.children : state.tree; const index = collection.findIndex((node) => node.id === state.selectedId); if (index >= 0 && confirm("Delete the selected item and its children?")) { collection.splice(index, 1); state.selectedId = null; render(); queueSave(); } };
document.addEventListener("click", (event) => {
  const target = event.target;
  const clickedRow = target instanceof Element && target.closest(".node-row");
  const clickedTable = target instanceof Element && target.closest("table");
  const clickedButton = target instanceof Element && target.closest("button");
  if (!clickedRow && !clickedTable && !clickedButton && state.selectedId) {
    state.selectedId = null;
    render();
  }
});
const applyTheme = (theme) => {
  const normalizedTheme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = normalizedTheme;
  localStorage.setItem("logep.theme", normalizedTheme);
  $("#theme-toggle").textContent = normalizedTheme === "light" ? "Dark mode" : "Light mode";
};
applyTheme(localStorage.getItem("logep.theme") || document.documentElement.dataset.theme);
$("#theme-toggle").onclick = () => applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
setInterval(hourlyBackup, 60 * 60 * 1000);
const cachedFile = localStorage.getItem("logep.selectedFile");
if (cachedFile) {
  openFile(cachedFile).then((loaded) => { if (!loaded) openCachedFile().then((cachedLoaded) => { if (!cachedLoaded) render(); }); });
} else {
  openCachedFile().then((loaded) => { if (!loaded) render(); });
}
