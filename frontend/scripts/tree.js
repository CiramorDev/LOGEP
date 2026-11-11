import { state } from "./state.js";

/** Flatten a project tree into depth-first node order. */
export function flatten(nodes, result = []) {
  nodes.forEach((node) => {
    result.push(node);
    flatten(node.children || [], result);
  });
  return result;
}

/** Find one node by its stable identifier. */
export function findNode(id, nodes = state.tree) {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    const found = findNode(id, node.children || []);
    if (found) {
      return found;
    }
  }
  return null;
}

/** Find a node's parent, or undefined when the identifier is not present. */
export function findParent(id, nodes = state.tree, parent = null) {
  for (const node of nodes) {
    if (node.id === id) {
      return parent;
    }
    const found = findParent(id, node.children || [], node);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/** Return the sibling collection used to reorder a node. */
export function siblingsFor(id) {
  const parent = findParent(id);
  return parent ? parent.children || [] : state.tree;
}

/** Count nested sub-projects for the project color gradient. */
export function subprojectCount(node) {
  return (node.children || []).reduce(
    (count, child) =>
      count + (child.type === "subproject" ? 1 + subprojectCount(child) : 0),
    0
  );
}

/** Determine whether a node or any descendant still needs work. */
export function isIncomplete(node) {
  return node.type === "item"
    ? !["Done", "Canceled"].includes(node.status)
    : (node.children || []).some(isIncomplete);
}

/** Mark every branch expanded. */
export function expandAll(nodes) {
  nodes.forEach((node) => {
    if (node.children?.length) {
      state.expanded.add(node.id);
      expandAll(node.children);
    }
  });
}

/** Mark every branch collapsed. */
export function collapseAll(nodes) {
  nodes.forEach((node) => {
    state.collapsed.add(node.id);
    collapseAll(node.children || []);
  });
}

/** Apply the selected saved view mode to the tree. */
export function applySavedView() {
  if (state.viewMode === "collapsed") {
    state.expanded.clear();
    collapseAll(state.tree);
  } else {
    expandAll(state.tree);
    state.collapsed.clear();
  }
}

/** Build the descendant recap shown below a node's notes. */
export function recapFor(node) {
  const entries = [];
  const collect = (current) => {
    if (current.content || current.date) {
      entries.push(
        `${current.title}${current.date ? ` (${current.date})` : ""}${
          current.content ? `: ${current.content}` : ""
        }`
      );
    }
    (current.children || []).forEach(collect);
  };
  collect(node);
  return entries.join(" • ");
}
