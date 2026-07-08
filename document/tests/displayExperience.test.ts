import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getLoadingPresentation,
  getPageTransitionProfile,
  getWorkbenchLayoutClasses,
} from "../src/lib/displayExperience";

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

  it("uses explicit workbench width thresholds instead of the default xl breakpoint", () => {
    const layout = getWorkbenchLayoutClasses();

    assert.match(layout.shell, /min-\[1180px\]:grid-cols/);
    assert.match(layout.hero, /min-\[1120px\]:grid-cols/);
    assert.doesNotMatch(layout.shell, /\bxl:grid-cols/);
    assert.doesNotMatch(layout.hero, /\blg:grid-cols/);
  });
});
