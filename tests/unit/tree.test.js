import { beforeEach, describe, expect, it } from "vitest";
import { state } from "../../frontend/scripts/state.js";
import {
  applySavedView,
  collapseAll,
  expandAll,
  findNode,
  findParent,
  flatten,
  isIncomplete,
  recapFor,
  siblingsFor,
  subprojectCount,
} from "../../frontend/scripts/tree.js";

const tree = [
  {
    id: "project",
    type: "project",
    title: "Project",
    children: [
      {
        id: "subproject",
        type: "subproject",
        title: "Sub-project",
        children: [
          {
            id: "task",
            type: "item",
            title: "Task",
            status: "To Do",
            content: "Details",
            date: "2026-11-11",
            children: [],
          },
        ],
      },
    ],
  },
];

beforeEach(() => {
  state.tree = structuredClone(tree);
  state.expanded = new Set();
  state.collapsed = new Set();
  state.viewMode = "all";
});

describe("tree helpers", () => {
  it("flattens and locates nested nodes", () => {
    expect(flatten(state.tree).map((node) => node.id)).toEqual([
      "project",
      "subproject",
      "task",
    ]);
    expect(findNode("task")).toBe(state.tree[0].children[0].children[0]);
    expect(findParent("task")).toBe(state.tree[0].children[0]);
    expect(findParent("missing")).toBeUndefined();
  });

  it("returns the correct sibling collection and sub-project count", () => {
    expect(siblingsFor("subproject")).toBe(state.tree[0].children);
    expect(siblingsFor("project")).toBe(state.tree);
    expect(subprojectCount(state.tree[0])).toBe(1);
  });

  it("identifies incomplete branches and builds a recap", () => {
    expect(isIncomplete(state.tree[0])).toBe(true);
    expect(recapFor(state.tree[0])).toBe(
      "Task (2026-11-11): Details"
    );
    state.tree[0].children[0].children[0].status = "Done";
    expect(isIncomplete(state.tree[0])).toBe(false);
  });

  it("expands and collapses every branch", () => {
    expandAll(state.tree);
    expect([...state.expanded]).toEqual(["project", "subproject"]);
    collapseAll(state.tree);
    expect([...state.collapsed]).toEqual(["project", "subproject", "task"]);
  });

  it("applies the saved collapsed view", () => {
    state.viewMode = "collapsed";
    state.expanded.add("project");
    applySavedView();
    expect(state.expanded).toHaveLength(0);
    expect([...state.collapsed]).toEqual(["project", "subproject", "task"]);
  });
});
