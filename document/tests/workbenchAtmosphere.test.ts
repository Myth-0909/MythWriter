import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("workbench atmosphere wiring", () => {
  it("keeps the workbench rotating text effect while respecting reduced motion", () => {
    const source = readFileSync(new URL("../src/pages/DocumentCenterPage.tsx", import.meta.url), "utf8");

    assert.doesNotMatch(source, /import\s+Shuffle\s+from\s+"@\/components\/Shuffle"/);
    assert.doesNotMatch(source, /<Shuffle\b/);
    assert.match(source, /<RotatingText\s+texts={greetingLines}[\s\S]*?respectReducedMotion(?:=\{true\})?/);
    assert.match(source, /<RotatingText\s+texts={greetingRotations}[\s\S]*?respectReducedMotion(?:=\{true\})?/);
  });

  it("lets workbench count-up metrics respect the Windows reduced-motion setting", () => {
    const source = readFileSync(new URL("../src/pages/DocumentCenterPage.tsx", import.meta.url), "utf8");
    const countUpSource = readFileSync(new URL("../src/components/CountUp.tsx", import.meta.url), "utf8");

    assert.match(countUpSource, /respectReducedMotion\?: boolean/);
    assert.match(countUpSource, /shouldReduceMotion\({ respectReducedMotion }\)/);
    assert.match(source, /<CountUp value={todayCreativeWords}[\s\S]*?respectReducedMotion(?:=\{true\})?/);
    assert.match(source, /<CountUp value={flow\.total}[\s\S]*?respectReducedMotion(?:=\{true\})?/);
  });
});
