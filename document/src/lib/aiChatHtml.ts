import { sanitizeHtml } from "./html.ts";
import { markdownToHtml } from "./markdown.ts";

const directHtmlTags = new Set([
  "a", "b", "blockquote", "br", "code", "div", "em", "h1", "h2", "h3", "h4", "h5", "h6",
  "hr", "i", "img", "li", "mark", "ol", "p", "pre", "s", "span", "strong", "sub", "sup", "table",
  "tbody", "td", "th", "thead", "tr", "u", "ul",
]);

const voidTags = new Set(["br", "hr", "img"]);
const blockedTags = new Set(["base", "button", "embed", "form", "iframe", "input", "link", "math", "meta", "object", "script", "select", "style", "svg", "textarea"]);
const genericAttributes = new Set(["title"]);
const tableAttributes = new Set(["colspan", "rowspan"]);

function hasDirectHtml(value: string): boolean {
  return /<\/?([a-z][\w-]*)\b[^>]*>/i.test(value) && Array.from(value.matchAll(/<\/?([a-z][\w-]*)\b[^>]*>/gi))
    .some((match) => directHtmlTags.has(match[1].toLowerCase()));
}

function isSafeUrl(value: string): boolean {
  const trimmed = value.trim().replace(/[\u0000-\u001F\u007F\s]+/g, "");
  if (!trimmed) return true;
  if (/^(#|\/(?!\/)|\.{0,2}\/)/.test(trimmed)) return true;
  if (/^data:image\/(?:png|jpeg|jpg|gif|webp);base64,/i.test(trimmed)) return true;
  try {
    const url = new URL(trimmed, "https://znwriter.local");
    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function allowedAttribute(tagName: string, name: string, value: string): boolean {
  if (name.startsWith("on") || name === "style" || name === "class" || name === "id" || name === "srcdoc") return false;
  if (genericAttributes.has(name)) return true;
  if ((tagName === "td" || tagName === "th") && tableAttributes.has(name)) return true;
  if (tagName === "a" && name === "href") return isSafeUrl(value);
  if (tagName === "img" && (name === "alt" || name === "src")) return name === "alt" || isSafeUrl(value);
  return false;
}

function stripUnsafeChatAttributesBrowser(value: string): string {
  if (typeof document === "undefined") return value;
  const template = document.createElement("template");
  template.innerHTML = value;

  for (const element of Array.from(template.content.querySelectorAll("*"))) {
    const tagName = element.tagName.toLowerCase();
    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase();
      if (!allowedAttribute(tagName, name, attr.value)) {
        element.removeAttribute(attr.name);
      }
    }
    if (tagName === "a" && element.getAttribute("href")) {
      element.setAttribute("rel", "noopener noreferrer");
      element.setAttribute("target", "_blank");
    }
  }

  return template.innerHTML;
}

function sanitizeAttributesFallback(tagName: string, attrs: string): string {
  const kept: string[] = [];
  for (const match of attrs.matchAll(/([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (!allowedAttribute(tagName, name, value)) continue;
    kept.push(`${name}="${value.replace(/"/g, "&quot;")}"`);
  }
  if (tagName === "a" && kept.some((attr) => attr.startsWith("href="))) {
    kept.push('rel="noopener noreferrer"', 'target="_blank"');
  }
  return kept.length > 0 ? ` ${kept.join(" ")}` : "";
}

function sanitizeChatHtmlFallback(value: string): string {
  let html = value;
  for (const tag of blockedTags) {
    html = html.replace(new RegExp(`<\\s*${tag}\\b[\\s\\S]*?<\\s*\\/\\s*${tag}\\s*>`, "gi"), "");
    html = html.replace(new RegExp(`<\\s*${tag}\\b[^>]*\\/?>`, "gi"), "");
  }

  return html.replace(/<\s*(\/?)\s*([A-Za-z][\w-]*)([^>]*)>/g, (_match, closing: string, rawTag: string, attrs: string) => {
    const tagName = rawTag.toLowerCase();
    if (!directHtmlTags.has(tagName)) return "";
    if (closing) return voidTags.has(tagName) ? "" : `</${tagName}>`;
    const selfClosing = voidTags.has(tagName) ? " /" : "";
    return `<${tagName}${sanitizeAttributesFallback(tagName, attrs)}${selfClosing}>`;
  });
}

function sanitizeChatHtml(value: string): string {
  const sanitized = sanitizeHtml(value);
  if (typeof document === "undefined") return sanitizeChatHtmlFallback(sanitized);
  return stripUnsafeChatAttributesBrowser(sanitized);
}

export function renderAiChatHtml(content: string): string {
  const raw = content.trim();
  if (!raw) return "";
  const html = hasDirectHtml(raw) ? raw : markdownToHtml(raw);
  return sanitizeChatHtml(html);
}
