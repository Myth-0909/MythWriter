function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeAiMarkdown(value: string): string {
  return value
    .replace(/\$\s*\\rightarrow\s*\$/g, "→")
    .replace(/\$\s*\\leftarrow\s*\$/g, "←")
    .replace(/\$\s*\\Rightarrow\s*\$/g, "⇒")
    .replace(/\$\s*\\Leftarrow\s*\$/g, "⇐")
    .replace(/\$\s*\\to\s*\$/g, "→")
    .replace(/\\rightarrow/g, "→")
    .replace(/\\leftarrow/g, "←")
    .replace(/\\Rightarrow/g, "⇒")
    .replace(/\\Leftarrow/g, "⇐")
    .replace(/\\to\b/g, "→");
}

function renderInline(value: string): string {
  const codeSpans: string[] = [];
  let html = escapeHtml(normalizeAiMarkdown(value));

  html = html.replace(/`([^`]+)`/g, (_match, code) => {
    const index = codeSpans.push(`<code>${code}</code>`) - 1;
    return `@@CODE_SPAN_${index}@@`;
  });

  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+|\/[^)\s]+|#[^)\s]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/~~([^~]+)~~/g, "<s>$1</s>");
  html = html.replace(/(^|[\s（(])\*([^*\n]+)\*(?=$|[\s），。,.;:!?])/g, "$1<em>$2</em>");

  codeSpans.forEach((code, index) => {
    html = html.replace(`@@CODE_SPAN_${index}@@`, code);
  });
  return html;
}

function parseTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isTableDivider(line: string): boolean {
  const cells = parseTableRow(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isTableRow(line: string): boolean {
  return /^\s*\|.+\|\s*$/.test(line);
}

function renderTableAsList(rows: string[]): string {
  if (rows.length < 3 || !isTableDivider(rows[1])) {
    return rows.map((line) => `<p>${renderInline(line)}</p>`).join("\n");
  }

  const headers = parseTableRow(rows[0]);
  const bodyRows = rows.slice(2).map(parseTableRow).filter((row) => row.some(Boolean));
  if (bodyRows.length === 0) return "";

  const items = bodyRows.map((row) => {
    const cells = headers.map((header, index) => {
      const value = row[index] || "";
      if (!header && !value) return "";
      return `<strong>${renderInline(header || `列 ${index + 1}`)}：</strong> ${renderInline(value)}`;
    }).filter(Boolean);
    return `<li>${cells.join("<br>")}</li>`;
  }).join("");

  return `<ul>${items}</ul>`;
}

function renderList(items: string[], ordered: boolean): string {
  const tag = ordered ? "ol" : "ul";
  return `<${tag}>${items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</${tag}>`;
}

export function markdownToBasicHtml(markdown: string): string {
  const lines = normalizeAiMarkdown(markdown).replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listOrdered = false;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    html.push(`<p>${renderInline(paragraph.join(" ").trim())}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    html.push(renderList(listItems, listOrdered));
    listItems = [];
  };

  const flushBlocks = () => {
    flushParagraph();
    flushList();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      flushBlocks();
      continue;
    }

    if (/^```/.test(trimmed)) {
      flushBlocks();
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        codeLines.push(lines[index]);
        index += 1;
      }
      html.push(`<pre><code>${escapeHtml(codeLines.join("\n").trim())}</code></pre>`);
      continue;
    }

    if (isTableRow(trimmed) && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      flushBlocks();
      const tableRows = [trimmed, lines[index + 1].trim()];
      index += 2;
      while (index < lines.length && isTableRow(lines[index].trim())) {
        tableRows.push(lines[index].trim());
        index += 1;
      }
      index -= 1;
      html.push(renderTableAsList(tableRows));
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushBlocks();
      const level = Math.min(3, heading[1].length);
      html.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      continue;
    }

    if (/^(---|\*\*\*|___)$/.test(trimmed)) {
      flushBlocks();
      html.push("<hr>");
      continue;
    }

    const unordered = trimmed.match(/^[-+*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (listItems.length > 0 && listOrdered) flushList();
      listOrdered = false;
      listItems.push(unordered[1]);
      continue;
    }

    const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (listItems.length > 0 && !listOrdered) flushList();
      listOrdered = true;
      listItems.push(ordered[1]);
      continue;
    }

    const quote = trimmed.match(/^>\s?(.+)$/);
    if (quote) {
      flushBlocks();
      html.push(`<blockquote>${renderInline(quote[1])}</blockquote>`);
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushBlocks();
  return html.filter(Boolean).join("\n");
}
