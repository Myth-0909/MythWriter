import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("theme-aware button states", () => {
  it("uses brand colors for default, focused, and highlighted button variants", () => {
    const buttonSource = readFileSync(new URL("../src/components/ui/button.tsx", import.meta.url), "utf8");

    assert.match(buttonSource, /focus-visible:ring-brand-300/);
    assert.match(buttonSource, /dark:focus-visible:ring-brand-500\/65/);
    assert.match(buttonSource, /bg-brand-500 text-white/);
    assert.match(buttonSource, /hover:bg-brand-600/);
    assert.match(buttonSource, /dark:bg-brand-400 dark:text-surface-950/);
    assert.match(buttonSource, /secondary:[\s\S]*bg-brand-50 text-brand-700/);
    assert.match(buttonSource, /dark:bg-brand-500\/12 dark:text-brand-200/);
  });

  it("keeps theme switchers and segmented tabs aligned with brand highlight colors", () => {
    const topBarSource = readFileSync(new URL("../src/components/TopAppBar.tsx", import.meta.url), "utf8");
    const settingsSource = readFileSync(new URL("../src/pages/SettingsPage.tsx", import.meta.url), "utf8");
    const tabGroupSource = readFileSync(new URL("../src/components/ui/tab-group.tsx", import.meta.url), "utf8");

    for (const source of [topBarSource, settingsSource, tabGroupSource]) {
      assert.match(source, /bg-brand-50/);
      assert.match(source, /ring-brand-200/);
      assert.match(source, /dark:bg-brand-500\/15/);
      assert.match(source, /text-brand-700/);
      assert.match(source, /dark:text-brand-200/);
    }

    assert.doesNotMatch(topBarSource, /text-amber-500/);
    assert.doesNotMatch(settingsSource, /text-amber-500/);
  });

  it("shows spreadsheet toolbar active buttons as brand highlights", () => {
    const toolbarSource = readFileSync(new URL("../src/components/spreadsheet/SpreadsheetToolbar.tsx", import.meta.url), "utf8");

    assert.match(toolbarSource, /variant=\{active \? "secondary" : "ghost"\}/);
    assert.match(toolbarSource, /ring-brand-200/);
    assert.match(toolbarSource, /dark:ring-brand-400\/25/);
    assert.match(toolbarSource, /variant=\{isFindReplaceOpen \? "secondary" : "outline"\}/);
  });
});
