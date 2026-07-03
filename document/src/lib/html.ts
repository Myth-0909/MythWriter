const allowedTags = new Set([
  "a", "b", "blockquote", "br", "code", "div", "em", "h1", "h2", "h3", "h4", "h5", "h6",
  "hr", "i", "img", "li", "mark", "ol", "p", "pre", "s", "span", "strong", "sub", "sup", "table",
  "tbody", "td", "th", "thead", "tr", "u", "ul",
]);

const blockedTags = new Set(["base", "button", "embed", "form", "iframe", "input", "link", "math", "meta", "object", "script", "select", "style", "svg", "textarea"]);
const urlAttributes = new Set(["href", "src", "xlink:href"]);

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isSafeUrl(value: string): boolean {
  const trimmed = value.trim().replace(/[\u0000-\u001F\u007F\s]+/g, "");
  if (!trimmed) return true;
  if (/^(#|\/(?!\/)|\.{0,2}\/)/.test(trimmed)) return true;
  if (/^data:image\/(?:png|jpeg|jpg|gif|webp);base64,/i.test(trimmed)) return true;
  try {
    const url = new URL(trimmed, window.location.origin);
    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function unwrapElement(element: Element): void {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  parent.removeChild(element);
}

function cleanNode(node: Node): void {
  if (node.nodeType === Node.COMMENT_NODE) {
    node.parentNode?.removeChild(node);
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const element = node as Element;
  const tagName = element.tagName.toLowerCase();
  if (blockedTags.has(tagName)) {
    element.remove();
    return;
  }

  for (const child of Array.from(element.childNodes)) cleanNode(child);

  if (!allowedTags.has(tagName)) {
    unwrapElement(element);
    return;
  }

  for (const attr of Array.from(element.attributes)) {
    const name = attr.name.toLowerCase();
    const value = attr.value;
    if (name.startsWith("on") || name === "style" || name === "srcdoc" || urlAttributes.has(name) && !isSafeUrl(value)) {
      element.removeAttribute(attr.name);
    }
  }

  if (tagName === "a") {
    element.setAttribute("rel", "noopener noreferrer");
    element.setAttribute("target", "_blank");
  }
}

export function sanitizeHtml(value: string): string {
  if (typeof document === "undefined") return value;
  const template = document.createElement("template");
  template.innerHTML = value;
  for (const child of Array.from(template.content.childNodes)) cleanNode(child);
  return template.innerHTML;
}
