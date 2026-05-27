/**
 * Minimal markdown-to-HTML converter.
 * Handles: headings, bold, italic, strikethrough, links, images,
 * unordered/ordered lists, code blocks, inline code, horizontal rules, blockquotes.
 */
export function markdownToHtml(md: string): string {
  if (!md) return "";

  let html = md;

  // Fenced code blocks (must be before paragraph processing)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, _lang, code) => {
    const escaped = code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `<pre><code>${escaped.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Headings (must be before bold/italic to not conflict with ** in headings)
  html = html.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Horizontal rule
  html = html.replace(/^---$/gm, "<hr>");

  // Blockquote
  html = html.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>");

  // Bold + Italic (***)
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  // Bold (**)
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic (*)
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Strikethrough (~~)
  html = html.replace(/~~(.+?)~~/g, "<del>$1</del>");

  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Unordered lists: group consecutive "- " lines
  html = html.replace(/((?:^- .+\n?)+)/gm, (match: string) => {
    const items = match
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => `<li>${line.replace(/^- /, "").trim()}</li>`)
      .join("");
    return `<ul>${items}</ul>`;
  });

  // Ordered lists: group consecutive "1. " "2. " lines
  html = html.replace(/((?:^\d+\. .+\n?)+)/gm, (match: string) => {
    const items = match
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => `<li>${line.replace(/^\d+\. /, "").trim()}</li>`)
      .join("");
    return `<ol>${items}</ol>`;
  });

  // Paragraphs: wrap remaining text blocks in <p>
  // Split by double newlines or after block-level elements
  const blocks = html.split(/\n\n+/);
  html = blocks
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      // Skip if already wrapped in a block-level tag
      if (/^<(h[1-6]|ul|ol|pre|blockquote|hr|li)/.test(trimmed)) return trimmed;
      // Convert single newlines within paragraphs to <br>
      return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");

  return html;
}
