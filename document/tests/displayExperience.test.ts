import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getLoadingPresentation,
  getPageTransitionProfile,
  getWorkbenchLayoutClasses,
} from "../src/lib/displayExperience.ts";

describe("display experience helpers", () => {
  it("uses distinct page motion profiles for different product areas", () => {
    const editor = getPageTransitionProfile("editor");
    const brain = getPageTransitionProfile("brain");
    const settings = getPageTransitionProfile("settings");

    assert.equal(editor.className, "page-transition-editor");
    assert.equal(brain.className, "page-transition-brain");
    assert.equal(settings.className, "page-transition-settings");
    assert.ok(brain.durationMs > editor.durationMs);
  });

  it("maps contextual loading tones to suitable loader presentations", () => {
    assert.equal(getLoadingPresentation("document").variant, "manuscript");
    assert.equal(getLoadingPresentation("ai").variant, "ai");
    assert.equal(getLoadingPresentation("settings").variant, "cursor");
    assert.equal(getLoadingPresentation("brain").accentClassName.includes("accent"), true);
  });

  it("defines small/medium/large workbench layouts with flexible viewport breakpoints", () => {
    const layout = getWorkbenchLayoutClasses();

    assert.match(layout.shell, /\bxl:grid-cols-/);
    assert.match(layout.shell, /\b2xl:grid-cols-/);
    assert.match(layout.hero, /\bsm:grid-cols-/);
    assert.match(layout.hero, /\bxl:grid-cols-/);
    assert.match(layout.focusMeta, /\bgrid-cols-2\b/);
    assert.match(layout.focusActions, /\bgrid-cols-2\b/);
    assert.match(layout.charts, /\bgrid-cols-2\b/);
    assert.match(layout.charts, /\bxl:grid-cols-1\b/);
    assert.doesNotMatch(layout.shell, /@container/);
    assert.doesNotMatch(layout.hero, /@container/);
    assert.doesNotMatch(layout.hero, /minmax\(300px/);
  });
});
