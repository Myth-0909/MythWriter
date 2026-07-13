import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("sidebar document groups", () => {
  it("keeps document groups reachable when the sidebar is collapsed", () => {
    const source = readFileSync(new URL("../src/components/SideNavBar.tsx", import.meta.url), "utf8");

    assert.doesNotMatch(source, /item\.id === "documents" && !collapsed/);
    assert.match(source, /collapsedGroupPanel/);
    assert.match(source, /group\.title/);
  });
});
