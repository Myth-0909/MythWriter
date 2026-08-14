import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertAiProviderHttpUrl,
  assertPublicHttpUrl,
  isAiProviderHttpUrl,
  isBlockedOutboundHost,
  isPublicHttpUrl,
  UnsafeOutboundUrlError,
} from "./safeOutboundUrl";

describe("safe outbound url guard", () => {
  it("allows public https provider endpoints", () => {
    assert.equal(isPublicHttpUrl("https://api.deepseek.com/v1"), true);
    assert.equal(isPublicHttpUrl("https://api.openai.com/v1/"), true);
    assert.equal(isPublicHttpUrl("http://93.184.216.34/v1"), true);
  });

  it("blocks localhost and loopback", () => {
    assert.equal(isPublicHttpUrl("http://localhost:3000/v1"), false);
    assert.equal(isPublicHttpUrl("http://127.0.0.1/v1"), false);
    assert.equal(isPublicHttpUrl("http://127.5.5.5/v1"), false);
    assert.equal(isPublicHttpUrl("http://[::1]/v1"), false);
  });

  it("blocks private and link-local ranges incl. cloud metadata", () => {
    assert.equal(isPublicHttpUrl("http://10.0.0.5/v1"), false);
    assert.equal(isPublicHttpUrl("http://172.16.9.9/v1"), false);
    assert.equal(isPublicHttpUrl("http://192.168.1.1/v1"), false);
    assert.equal(isPublicHttpUrl("http://169.254.169.254/latest/meta-data"), false);
    assert.equal(isPublicHttpUrl("http://100.100.100.200/v1"), false);
    assert.equal(isBlockedOutboundHost("metadata.google.internal"), true);
  });

  it("blocks non-http(s) schemes", () => {
    assert.equal(isPublicHttpUrl("file:///etc/passwd"), false);
    assert.equal(isPublicHttpUrl("gopher://example.com"), false);
    assert.equal(isPublicHttpUrl("ftp://example.com"), false);
  });

  it("blocks *.local / *.internal hostnames", () => {
    assert.equal(isBlockedOutboundHost("router.local"), true);
    assert.equal(isBlockedOutboundHost("db.internal"), true);
    assert.equal(isBlockedOutboundHost("api.example.com"), false);
  });

  it("blocks IPv4-mapped IPv6 private addresses", () => {
    assert.equal(isBlockedOutboundHost("::ffff:127.0.0.1"), true);
    assert.equal(isBlockedOutboundHost("fd00::1"), true);
  });

  it("throws UnsafeOutboundUrlError with a helpful message", () => {
    assert.throws(() => assertPublicHttpUrl("http://169.254.169.254"), UnsafeOutboundUrlError);
    assert.throws(() => assertPublicHttpUrl("not a url"), UnsafeOutboundUrlError);
  });
});

describe("AI provider url guard", () => {
  it("allows explicitly configured localhost and LAN model endpoints", () => {
    assert.equal(isAiProviderHttpUrl("http://localhost:11434/v1"), true);
    assert.equal(isAiProviderHttpUrl("http://127.0.0.1:1234/v1"), true);
    assert.equal(isAiProviderHttpUrl("http://10.0.0.5:8000/v1"), true);
    assert.equal(isAiProviderHttpUrl("http://172.16.76.112:8000/v1"), true);
    assert.equal(isAiProviderHttpUrl("http://192.168.1.20:8000/v1"), true);
    assert.equal(isAiProviderHttpUrl("http://model-server.local:8000/v1"), true);
    assert.equal(isAiProviderHttpUrl("http://[::1]:11434/v1"), true);
    assert.equal(isAiProviderHttpUrl("http://[fd00::20]:8000/v1"), true);
  });

  it("still blocks metadata, link-local, special targets, and embedded credentials", () => {
    assert.equal(isAiProviderHttpUrl("http://169.254.169.254/latest/meta-data"), false);
    assert.equal(isAiProviderHttpUrl("http://100.100.100.200/latest/meta-data"), false);
    assert.equal(isAiProviderHttpUrl("http://metadata.google.internal/computeMetadata/v1"), false);
    assert.equal(isAiProviderHttpUrl("http://[fe80::1]/v1"), false);
    assert.equal(isAiProviderHttpUrl("http://0.0.0.0:8000/v1"), false);
    assert.equal(isAiProviderHttpUrl("http://user:pass@example.com/v1"), false);
    assert.equal(isAiProviderHttpUrl("file:///etc/passwd"), false);
    assert.throws(() => assertAiProviderHttpUrl("gopher://example.com"), UnsafeOutboundUrlError);
  });
});
