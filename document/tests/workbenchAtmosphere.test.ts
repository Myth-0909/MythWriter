import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("workbench atmosphere wiring", () => {
  it("renders the animated creation weather component on the workbench", () => {
    const source = readFileSync(new URL("../src/pages/DocumentCenterPage.tsx", import.meta.url), "utf8");

    assert.match(
      source,
      /import\s*{[^}]*CreationWeather[^}]*}\s*from\s*"@\/components\/WorkbenchAtmosphere"/s
    );
    assert.match(source, /<CreationWeather\b/);
  });

  it("renders the animated text effect on the workbench hero", () => {
    const source = readFileSync(new URL("../src/pages/DocumentCenterPage.tsx", import.meta.url), "utf8");

    assert.match(source, /import\s+Shuffle\s+from\s+"@\/components\/Shuffle"/);
    assert.match(source, /<Shuffle\b/);
  });
});
