import { sanitizeHtml } from "@/lib/html";

function decodeHtml(value: string) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

export async function htmlToMarkdown(html: string): Promise<string> {
  const { default: TurndownService } = await import("turndown");
  const service = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    strongDelimiter: "**",
  });
  service.keep(["u"]);
  return decodeHtml(service.turndown(sanitizeHtml(html))).trim();
}

async function imageData(src: string): Promise<{
  data: Uint8Array;
  type: "png" | "jpg" | "gif" | "bmp";
} | null> {
  try {
    const response = await fetch(src);
    if (!response.ok) return null;
    const mime = response.headers.get("content-type") || src.match(/^data:([^;,]+)/)?.[1] || "";
    const type = mime.includes("png") ? "png"
      : mime.includes("jpeg") || mime.includes("jpg") ? "jpg"
      : mime.includes("gif") ? "gif"
      : mime.includes("bmp") ? "bmp"
      : null;
    if (!type) return null;
    return { data: new Uint8Array(await response.arrayBuffer()), type };
  } catch {
    return null;
  }
}

export async function htmlToDocxBlob(params: {
  title: string;
  meta: string;
  html: string;
}): Promise<Blob> {
  const docx = await import("docx");
  const root = new DOMParser().parseFromString(`<body>${sanitizeHtml(params.html)}</body>`, "text/html").body;

  const inlineChildren = (node: Node, inherited: Record<string, unknown> = {}): InstanceType<typeof docx.TextRun>[] => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      return text ? [new docx.TextRun({ text, ...inherited })] : [];
    }
    if (!(node instanceof HTMLElement)) return [];
    if (node.tagName === "BR") return [new docx.TextRun({ break: 1, ...inherited })];
    const next = { ...inherited } as Record<string, unknown>;
    if (node.matches("strong,b")) next.bold = true;
    if (node.matches("em,i")) next.italics = true;
    if (node.matches("u")) next.underline = {};
    if (node.matches("s,strike,del")) next.strike = true;
    if (node.matches("code")) next.font = "Consolas";
    return Array.from(node.childNodes).flatMap((child) => inlineChildren(child, next));
  };

  const paragraphs: Array<InstanceType<typeof docx.Paragraph> | InstanceType<typeof docx.Table>> = [];
  let imageIndex = 0;
  for (const element of Array.from(root.children)) {
    const tag = element.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      const heading = Number(tag.slice(1));
      const headingLevel = [
        docx.HeadingLevel.HEADING_1,
        docx.HeadingLevel.HEADING_2,
        docx.HeadingLevel.HEADING_3,
        docx.HeadingLevel.HEADING_4,
        docx.HeadingLevel.HEADING_5,
        docx.HeadingLevel.HEADING_6,
      ][heading - 1];
      paragraphs.push(new docx.Paragraph({ heading: headingLevel, children: inlineChildren(element) }));
      continue;
    }
    if (tag === "ul" || tag === "ol") {
      for (const item of Array.from(element.children).filter((child) => child.tagName === "LI")) {
        paragraphs.push(new docx.Paragraph({
          children: inlineChildren(item),
          ...(tag === "ul"
            ? { bullet: { level: 0 } }
            : { numbering: { reference: "znwriter-numbering", level: 0 } }),
        }));
      }
      continue;
    }
    if (tag === "blockquote") {
      paragraphs.push(new docx.Paragraph({
        children: inlineChildren(element, { italics: true, color: "52606D" }),
        indent: { left: 480 },
        border: { left: { color: "94A3B8", size: 12, style: docx.BorderStyle.SINGLE } },
      }));
      continue;
    }
    if (tag === "pre") {
      paragraphs.push(new docx.Paragraph({
        children: [new docx.TextRun({ text: element.textContent || "", font: "Consolas" })],
        shading: { fill: "F1F5F9" },
      }));
      continue;
    }
    if (tag === "table") {
      const rows = Array.from(element.querySelectorAll(":scope > thead > tr, :scope > tbody > tr, :scope > tr"));
      paragraphs.push(new docx.Table({
        width: { size: 100, type: docx.WidthType.PERCENTAGE },
        rows: rows.map((row) => new docx.TableRow({
          children: Array.from(row.children).map((cell) => new docx.TableCell({
            children: [new docx.Paragraph({ children: inlineChildren(cell) })],
            shading: cell.tagName === "TH" ? { fill: "E2E8F0" } : undefined,
          })),
        })),
      }));
      continue;
    }

    const images = Array.from(element.querySelectorAll("img"));
    if (element.tagName === "IMG") images.unshift(element as HTMLImageElement);
    for (const image of images) {
      const result = await imageData(image.getAttribute("src") || "");
      if (!result) continue;
      const naturalWidth = Number(image.getAttribute("width")) || 640;
      const naturalHeight = Number(image.getAttribute("height")) || 360;
      const width = Math.min(640, naturalWidth);
      const height = Math.max(1, Math.round(naturalHeight * (width / naturalWidth)));
      paragraphs.push(new docx.Paragraph({
        children: [new docx.ImageRun({
          data: result.data,
          type: result.type,
          transformation: { width, height },
          altText: {
            title: image.getAttribute("alt") || `image-${++imageIndex}`,
            description: image.getAttribute("alt") || "",
            name: `image-${imageIndex}`,
          },
        })],
      }));
    }

    const textRuns = inlineChildren(element);
    if (textRuns.length > 0) paragraphs.push(new docx.Paragraph({ children: textRuns }));
  }

  const output = new docx.Document({
    numbering: {
      config: [{
        reference: "znwriter-numbering",
        levels: [{
          level: 0,
          format: docx.LevelFormat.DECIMAL,
          text: "%1.",
          alignment: docx.AlignmentType.START,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      }],
    },
    sections: [{
      properties: {},
      children: [
        new docx.Paragraph({ text: params.title, heading: docx.HeadingLevel.TITLE }),
        new docx.Paragraph({
          children: [new docx.TextRun({ text: params.meta, color: "64748B", size: 18 })],
          spacing: { after: 320 },
        }),
        ...paragraphs,
      ],
    }],
  });
  return docx.Packer.toBlob(output);
}
