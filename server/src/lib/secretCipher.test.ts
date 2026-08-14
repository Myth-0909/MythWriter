import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
  resetSecretCipherKeyCache,
} from "./secretCipher";

describe("secret cipher", () => {
  it("round-trips a secret through encrypt/decrypt", () => {
    const secret = "sk-1234567890abcdef";
    const stored = encryptSecret(secret);
    assert.notEqual(stored, secret);
    assert.equal(isEncryptedSecret(stored), true);
    assert.equal(decryptSecret(stored), secret);
  });

  it("produces different ciphertext for the same input (random IV)", () => {
    const a = encryptSecret("same-key");
    const b = encryptSecret("same-key");
    assert.notEqual(a, b);
    assert.equal(decryptSecret(a), "same-key");
    assert.equal(decryptSecret(b), "same-key");
  });

  it("treats non-prefixed values as legacy plaintext", () => {
    assert.equal(isEncryptedSecret("sk-plain"), false);
    assert.equal(decryptSecret("sk-plain"), "sk-plain");
  });

  it("returns empty string for empty/null inputs", () => {
    assert.equal(encryptSecret(""), "");
    assert.equal(encryptSecret(null), "");
    assert.equal(decryptSecret(""), "");
    assert.equal(decryptSecret(null), "");
    assert.equal(decryptSecret(undefined), "");
  });

  it("fails closed on tampered ciphertext", () => {
    const stored = encryptSecret("secret");
    const parts = stored.split(":");
    parts[4] = Buffer.from("tampered").toString("base64url");
    assert.equal(decryptSecret(parts.join(":")), "");
  });

  it("handles unicode secrets", () => {
    const secret = "密钥-키-🔑";
    assert.equal(decryptSecret(encryptSecret(secret)), secret);
  });

  it("exposes a cache reset helper", () => {
    assert.doesNotThrow(() => resetSecretCipherKeyCache());
  });
});
