import test from "node:test";
import assert from "node:assert/strict";
import { shouldReduceMotion } from "../src/lib/motionPreference.ts";

test("respects reduced motion by default", () => {
  const matchMedia = () => ({ matches: true });

  assert.equal(shouldReduceMotion({ matchMedia }), true);
});

test("allows decorative login effects to opt out of reduced motion", () => {
  const matchMedia = () => ({ matches: true });

  assert.equal(shouldReduceMotion({ matchMedia, respectReducedMotion: false }), false);
});

test("keeps motion enabled when matchMedia is unavailable", () => {
  assert.equal(shouldReduceMotion({ matchMedia: undefined }), false);
});
