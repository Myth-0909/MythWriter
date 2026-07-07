import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_FONT_FAMILY_KEY,
  FONT_FAMILY_KEYS,
  normalizeFontFamilyKey,
} from "./fontPreferences";

describe("font preferences", () => {
  it("accepts only known project font keys", () => {
    assert.equal(DEFAULT_FONT_FAMILY_KEY, "current");
    assert.ok(FONT_FAMILY_KEYS.includes("current"));
    assert.ok(FONT_FAMILY_KEYS.includes("source-han-serif-sc"));
    assert.ok(FONT_FAMILY_KEYS.includes("pingfang-sc"));

    assert.equal(normalizeFontFamilyKey("source-han-serif-sc"), "source-han-serif-sc");
    assert.equal(normalizeFontFamilyKey("pingfang-sc"), "pingfang-sc");
    assert.equal(normalizeFontFamilyKey("current"), "current");
  });

  it("rejects arbitrary font CSS values", () => {
    assert.equal(normalizeFontFamilyKey(""), null);
    assert.equal(normalizeFontFamilyKey("Inter, sans-serif"), null);
    assert.equal(normalizeFontFamilyKey("url(https://example.com/font.woff2)"), null);
  });
});
