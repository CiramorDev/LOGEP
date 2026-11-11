/** Persisted and runtime state for the workspace. */
export const state = {
  tree: [],
  selectedId: null,
  file: null,
  mtimeNs: null,
  editType: null,
  expanded: new Set(),
  collapsed: new Set(),
  viewMode: ["all", "incomplete", "collapsed"].includes(
    localStorage.getItem("logep.viewMode")
  )
    ? localStorage.getItem("logep.viewMode")
    : "all",
  showRecap: localStorage.getItem("logep.showRecap") !== "false",
};
