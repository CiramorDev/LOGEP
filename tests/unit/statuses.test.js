import { describe, expect, it } from "vitest";
import { STATUSES, STATUS_OPTIONS, getStatus } from "../../frontend/scripts/statuses.js";

describe("status catalog", () => {
  it("keeps status options aligned with the catalog", () => {
    expect(STATUS_OPTIONS).toEqual(STATUSES.map((status) => status.name));
    expect(new Set(STATUS_OPTIONS).size).toBe(STATUS_OPTIONS.length);
  });

  it("returns the requested status or the default status", () => {
    expect(getStatus("Done")).toMatchObject({ name: "Done", className: "done" });
    expect(getStatus("Unknown")).toBe(STATUSES[0]);
  });
});
