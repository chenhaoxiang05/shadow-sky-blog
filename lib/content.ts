import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

export async function renderSafeMarkdown(markdown: string) {
  const html = await marked.parse(markdown, { gfm: true, breaks: false });
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "h1", "h2", "h3", "h4", "strong", "em", "del", "blockquote", "ul", "ol", "li", "pre", "code", "a", "img", "hr", "table", "thead", "tbody", "tr", "th", "td"],
    allowedAttributes: { a: ["href", "title", "target", "rel"], img: ["src", "alt", "title", "width", "height"], code: ["class"] },
    allowedSchemes: ["https", "http", "mailto"], allowedSchemesByTag: { img: ["https"] },
    transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "nofollow noopener noreferrer", target: "_blank" }, true) },
    disallowedTagsMode: "discard",
  });
}

export function slugify(input: string) {
  const normalized = input.normalize("NFKC").toLowerCase().trim().replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 100);
  if (!normalized) throw new Error("INVALID_SLUG");
  return normalized;
}
