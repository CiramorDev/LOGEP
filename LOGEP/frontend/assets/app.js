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
  viewMode: ["all", "incomplete", "collapsed"].includes(savedViewMode) ? savedViewMode : "all",
  showRecap: savedShowRecap === null ? true : savedShowRecap === "true"
};
const $ = (selector) => document.querySelector(selector);
const flatten = (nodes, result = []) => { nodes.forEach((node) => { result.push(node); flatten(node.children || [], result); }); return result; };
const findNode = (id, nodes = state.tree) => { for (const node of nodes) { if (node.id === id) return node; const found = findNode(id, node.children || []); if (found) return found; } return null; };
const findParent = (id, nodes = state.tree, parent = null) => { for (const node of nodes) { if (node.id === id) return parent; const found = findParent(id, node.children || [], node); if (found !== undefined) return found; } return undefined; };
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
const resizeNotes = (field) => { field.style.height = "auto"; field.style.height = `${Math.max(34, field.scrollHeight)}px`; };
const isIncomplete = (node) => node.type === "item" ? !["Done", "Canceled"].includes(node.status) : (node.children || []).some(isIncomplete);
const expandAll = (nodes) => nodes.forEach((node) => { if (node.children?.length) { state.expanded.add(node.id); expandAll(node.children); } });
const applySavedView = () => {
  if (state.viewMode === "collapsed") state.expanded.clear();
  else expandAll(state.tree);
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
    const row = document.createElement("tr"); row.className = `node-row node-${node.type} ${node.id === state.selectedId ? "selected" : ""}`;
    row.onclick = () => { state.selectedId = node.id; render(); };

    const nameCell = document.createElement("td"); const name = document.createElement("div"); name.className = "node-name"; name.style.setProperty("--indent", `${level * 24}px`);
    const indent = document.createElement("span"); indent.className = "indent"; name.append(indent);
    if (node.type !== "item") { const toggle = document.createElement("button"); toggle.className = "tree-toggle"; toggle.type = "button"; toggle.title = state.expanded.has(node.id) ? "Collapse" : "Expand"; toggle.append(iconElement(state.expanded.has(node.id) ? "chevronDown" : "chevronRight", state.expanded.has(node.id) ? "⌄" : "›")); toggle.onclick = (event) => { event.stopPropagation(); state.expanded.has(node.id) ? state.expanded.delete(node.id) : state.expanded.add(node.id); render(); }; name.append(toggle); } else { const spacer = document.createElement("span"); spacer.className = "tree-toggle-spacer"; name.append(spacer); }
    const nodeIcon = document.createElement("span"); nodeIcon.className = "node-icon"; nodeIcon.append(iconElement(node.type === "project" ? "folder" : node.type === "subproject" ? "folderTree" : "task", icon(node.type === "project" ? "folder" : node.type === "subproject" ? "tree" : "task"))); name.append(nodeIcon);
    const title = makeField("input", node.title, "Name", (value) => updateNode(node.id, "title", value)); title.className = "title-field"; title.onclick = (event) => event.stopPropagation(); name.append(title);
    nameCell.append(name); row.append(nameCell);

    const contentCell = document.createElement("td"); const notes = makeField("textarea", node.content, "Add detailed notes…", (value) => updateNode(node.id, "content", value)); notes.className = "notes-field"; notes.rows = 1; notes.onclick = (event) => event.stopPropagation(); notes.oninput = () => resizeNotes(notes); contentCell.append(notes);
    const recapText = recapFor(node); if (state.showRecap && recapText) { const recap = document.createElement("div"); recap.className = "recap-line"; recap.textContent = `↳ ${recapText}`; contentCell.append(recap); } row.append(contentCell);

    const dateCell = document.createElement("td"); const date = makeField("input", node.date, "", (value) => updateNode(node.id, "date", value)); date.type = "date"; date.className = "date-field"; date.onclick = (event) => event.stopPropagation(); dateCell.append(date); row.append(dateCell);
    const statusCell = document.createElement("td"); const status = document.createElement("div"); status.className = `status-cell status-${(node.status || "To Do").toLowerCase().replaceAll(" ", "-")}`;
    status.append(statusIconElement(node.status));
    const select = document.createElement("select"); STATUS_OPTIONS.forEach((option) => select.append(new Option(option, option, false, node.status === option))); select.onchange = () => updateNode(node.id, "status", select.value); select.onclick = (event) => event.stopPropagation(); status.append(select); statusCell.append(status); row.append(statusCell);
    body.append(row); resizeNotes(notes);
    if (node.children?.length && state.expanded.has(node.id)) visit(node.children, level + 1);
  });
  visit(state.tree); $("#empty-state").hidden = body.children.length > 0; $("#project-count").textContent = projects; $("#task-count").textContent = tasks; $("#pending-count").textContent = pending; $("#view-mode").value = state.viewMode; $("#recap-toggle").textContent = state.showRecap ? "Hide recap" : "Show recap"; $("#recap-toggle").setAttribute("aria-label", state.showRecap ? "Hide recaps" : "Show recaps"); updateActions();
}

function updateActions() {
  const selected = findNode(state.selectedId);
  $("#add-subproject").disabled = !selected || selected.type !== "project";
  $("#add-item").disabled = !selected || selected.type === "item";
  $("#delete-selected").disabled = !selected;
}
function updateNode(id, key, value) { const node = findNode(id); if (node) { node[key] = value; queueSave(); render(); } }
function queueSave() { if (!state.file) return; setStatus("Saving…"); clearTimeout(queueSave.timer); queueSave.timer = setTimeout(save, 700); }
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
function addItem() { const parent = findNode(state.selectedId); const node = { id: crypto.randomUUID(), type: state.editType, title: $("#item-title").value.trim(), content: $("#item-content").value, date: $("#item-date").value, status: $("#item-status").value, expanded: true, children: [] }; if (!node.title) return; if (parent) { parent.children = parent.children || []; parent.children.push(node); state.expanded.add(parent.id); } else state.tree.push(node); state.expanded.add(node.id); $("#edit-dialog").close(); render(); queueSave(); }
$("#open-file").onclick = () => openFile(); $("#add-project").onclick = () => openEditor("project"); $("#add-subproject").onclick = () => openEditor("subproject"); $("#add-item").onclick = () => openEditor("item"); $("#edit-form").onsubmit = (event) => { event.preventDefault(); addItem(); }; $("#search").oninput = render;
$("#view-mode").onchange = () => {
  state.viewMode = $("#view-mode").value;
  localStorage.setItem("logep.viewMode", state.viewMode);
  if (state.viewMode === "collapsed") state.expanded.clear();
  else expandAll(state.tree);
  render();
};
$("#recap-toggle").onclick = () => { state.showRecap = !state.showRecap; localStorage.setItem("logep.showRecap", String(state.showRecap)); render(); };
$("#delete-selected").onclick = () => { const parent = findParent(state.selectedId); const collection = parent ? parent.children : state.tree; const index = collection.findIndex((node) => node.id === state.selectedId); if (index >= 0 && confirm("Delete the selected item and its children?")) { collection.splice(index, 1); state.selectedId = null; render(); queueSave(); } };
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
