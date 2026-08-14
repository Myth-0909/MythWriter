/**
 * Guards outbound requests that use user-controlled base URLs (AI provider
 * endpoints). Prevents SSRF against localhost / private networks / cloud
 * metadata endpoints. Only http(s) URLs pointing at public hosts are allowed.
 */

export class UnsafeOutboundUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeOutboundUrlError";
  }
}

function ipv4ToLong(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const num = Number(part);
    if (num > 255) return null;
    value = value * 256 + num;
  }
  return value >>> 0;
}

function isPrivateIpv4(ip: string): boolean {
  const long = ipv4ToLong(ip);
  if (long === null) return false;
  const inRange = (start: string, prefix: number) => {
    const base = ipv4ToLong(start)!;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (long & mask) === (base & mask);
  };
  return (
    inRange("0.0.0.0", 8) ||        // "this" network
    inRange("10.0.0.0", 8) ||       // private
    inRange("100.64.0.0", 10) ||    // carrier-grade NAT
    inRange("127.0.0.0", 8) ||      // loopback
    inRange("169.254.0.0", 16) ||   // link-local incl. cloud metadata
    inRange("172.16.0.0", 12) ||    // private
    inRange("192.168.0.0", 16) ||   // private
    inRange("192.0.0.0", 24) ||     // IETF protocol assignments
    inRange("198.18.0.0", 15) ||    // benchmarking
    inRange("224.0.0.0", 4) ||      // multicast
    inRange("240.0.0.0", 4)         // reserved
  );
}

function normalizeIpv6(host: string): string {
  return host.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
}

function isPrivateIpv6(host: string): boolean {
  const ip = normalizeIpv6(host);
  if (ip === "::1" || ip === "::") return true;
  if (ip.startsWith("fe80") || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  // IPv4-mapped IPv6 (::ffff:a.b.c.d)
  const mapped = ip.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}

export function isBlockedOutboundHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  // Cloud metadata hostnames.
  if (host === "metadata" || host === "metadata.google.internal") return true;
  if (host.includes(":")) return isPrivateIpv6(host);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return isPrivateIpv4(host);
  return false;
}

/**
 * Validates a user-supplied outbound base URL. Throws UnsafeOutboundUrlError
 * when the scheme is not http(s) or the host resolves to a private/reserved
 * address literal.
 */
export function assertPublicHttpUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(String(rawUrl).trim());
  } catch {
    throw new UnsafeOutboundUrlError("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeOutboundUrlError("Only http(s) URLs are allowed");
  }
  if (isBlockedOutboundHost(url.hostname)) {
    throw new UnsafeOutboundUrlError("URL host is not allowed");
  }
  return url;
}

export function isPublicHttpUrl(rawUrl: string): boolean {
  try {
    assertPublicHttpUrl(rawUrl);
    return true;
  } catch {
    return false;
  }
}

/**
 * AI providers are often hosted on the user's own machine or LAN (Ollama,
 * vLLM, LM Studio, etc.). Those addresses are valid explicit destinations in
 * this desktop app, but cloud metadata and non-routable special addresses must
 * remain blocked.
 */
function isBlockedAiProviderHost(hostname: string): boolean {
  const host = normalizeIpv6(hostname.trim().toLowerCase());
  if (!host) return true;
  if (host === "metadata" || host === "metadata.google.internal") return true;
  if (host === "169.254.169.254" || host === "100.100.100.200") return true;
  if (host.includes(":") && host.startsWith("fe80")) return true;

  const mapped = host.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  const ipv4 = mapped?.[1] || (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) ? host : "");
  if (!ipv4) return false;
  const long = ipv4ToLong(ipv4);
  if (long === null) return true;
  const inRange = (start: string, prefix: number) => {
    const base = ipv4ToLong(start)!;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (long & mask) === (base & mask);
  };
  return (
    inRange("0.0.0.0", 8) ||
    inRange("169.254.0.0", 16) ||
    inRange("192.0.0.0", 24) ||
    inRange("224.0.0.0", 4) ||
    inRange("240.0.0.0", 4)
  );
}

export function assertAiProviderHttpUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(String(rawUrl).trim());
  } catch {
    throw new UnsafeOutboundUrlError("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeOutboundUrlError("Only http(s) URLs are allowed");
  }
  if (url.username || url.password) {
    throw new UnsafeOutboundUrlError("Credentials in URLs are not allowed");
  }
  if (isBlockedAiProviderHost(url.hostname)) {
    throw new UnsafeOutboundUrlError("URL host is not allowed");
  }
  return url;
}

export function isAiProviderHttpUrl(rawUrl: string): boolean {
  try {
    assertAiProviderHttpUrl(rawUrl);
    return true;
  } catch {
    return false;
  }
}
