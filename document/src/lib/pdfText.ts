function bytesToBinary(bytes: Uint8Array): string {
  let result = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    result += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return result;
}

async function inflate(bytes: Uint8Array): Promise<string | null> {
  if (typeof DecompressionStream === "undefined") return null;

  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
    const inflated = await new Response(stream).arrayBuffer();
    return bytesToBinary(new Uint8Array(inflated));
  } catch {
    return null;
  }
}

function findStreams(source: string): { dict: string; body: string }[] {
  const streams: { dict: string; body: string }[] = [];
  const streamPattern = /\bstream\r?\n/g;
  let match: RegExpExecArray | null;

  while ((match = streamPattern.exec(source))) {
    const bodyStart = match.index + match[0].length;
    const endIndex = source.indexOf("endstream", bodyStart);
    if (endIndex === -1) break;

    const dictStart = source.lastIndexOf("<<", match.index);
    const dictEnd = source.lastIndexOf(">>", match.index);
    const dict = dictStart !== -1 && dictEnd !== -1 && dictStart < dictEnd
      ? source.slice(dictStart, dictEnd + 2)
      : "";

    streams.push({ dict, body: source.slice(bodyStart, endIndex).replace(/\r?\n$/, "") });
    streamPattern.lastIndex = endIndex + "endstream".length;
  }

  return streams;
}

function decodeHexString(hex: string): string {
  const clean = hex.replace(/\s+/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(Number.parseInt(clean.slice(i, i + 2).padEnd(2, "0"), 16));
  }
  return decodeBytes(bytes);
}

function decodeLiteralString(value: string): string {
  const bytes: number[] = [];

  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch !== "\\") {
      bytes.push(ch.charCodeAt(0) & 0xff);
      continue;
    }

    const next = value[++i];
    if (!next) break;

    if (next === "n") bytes.push(10);
    else if (next === "r") bytes.push(13);
    else if (next === "t") bytes.push(9);
    else if (next === "b") bytes.push(8);
    else if (next === "f") bytes.push(12);
    else if (next === "\n" || next === "\r") {
      if (next === "\r" && value[i + 1] === "\n") i++;
    } else if (/[0-7]/.test(next)) {
      let octal = next;
      for (let j = 0; j < 2 && /[0-7]/.test(value[i + 1] || ""); j++) {
        octal += value[++i];
      }
      bytes.push(Number.parseInt(octal, 8));
    } else {
      bytes.push(next.charCodeAt(0) & 0xff);
    }
  }

  return decodeBytes(bytes);
}

function decodeBytes(bytes: number[]): string {
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let text = "";
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      text += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    }
    return text;
  }

  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes));
  } catch {
    return String.fromCharCode(...bytes);
  }
}

function extractTextOperators(content: string): string {
  const sections = content.match(/BT[\s\S]*?ET/g) || [content];
  const lines: string[] = [];

  for (const section of sections) {
    const textParts: string[] = [];
    const tokenPattern = /\((?:\\.|[^\\)])*\)\s*Tj|\[(?:\s*(?:\((?:\\.|[^\\)])*\)|<[\da-fA-F\s]+>|-?\d+(?:\.\d+)?)\s*)+\]\s*TJ|<([\da-fA-F\s]+)>\s*Tj|T\*|'|"/g;
    let match: RegExpExecArray | null;

    while ((match = tokenPattern.exec(section))) {
      const token = match[0];
      if (token === "T*" || token === "'" || token === "\"") {
        if (textParts.length) lines.push(textParts.join(""));
        textParts.length = 0;
        continue;
      }

      if (token.endsWith("TJ")) {
        const strings = token.match(/\((?:\\.|[^\\)])*\)|<[\da-fA-F\s]+>/g) || [];
        textParts.push(...strings.map((item) => (
          item.startsWith("<")
            ? decodeHexString(item.slice(1, -1))
            : decodeLiteralString(item.slice(1, -1))
        )));
      } else if (token.startsWith("<")) {
        const hex = token.match(/^<([\da-fA-F\s]+)>/)?.[1] || "";
        textParts.push(decodeHexString(hex));
      } else {
        const literal = token.match(/^\(([\s\S]*?)\)\s*Tj/)?.[1] || "";
        textParts.push(decodeLiteralString(literal));
      }
    }

    if (textParts.length) lines.push(textParts.join(""));
  }

  return lines
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export async function extractPdfText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const binary = bytesToBinary(bytes);
  const streams = findStreams(binary);
  const textParts: string[] = [];

  for (const stream of streams) {
    let body = stream.body;
    if (/\/FlateDecode\b/.test(stream.dict)) {
      const streamBytes = Uint8Array.from(body, (ch) => ch.charCodeAt(0) & 0xff);
      const inflated = await inflate(streamBytes);
      if (!inflated) continue;
      body = inflated;
    }

    const text = extractTextOperators(body);
    if (text) textParts.push(text);
  }

  if (textParts.length) return textParts.join("\n\n");

  const fallback = extractTextOperators(binary);
  if (fallback) return fallback;

  return "";
}
