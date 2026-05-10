// Pure rendering: takes a template type, a string-vars bag, and an
// optional operator override; returns the final {subject, bodyHtml,
// bodyText}. The override path uses operator-edited subject + plain-text
// body and auto-derives HTML; the default path uses our hardcoded
// markup so layout-rich content (tables, links) survives.

import { TEMPLATE_DEFAULTS } from "./defaults";
import type { CustomizableTemplateType } from "./variables";

const PLACEHOLDER = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

/**
 * Replace `{{var}}` occurrences with values from `vars`. Missing keys
 * become "" so a typo'd or unknown variable in an operator's draft
 * doesn't blow up rendering — it just disappears.
 */
export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(PLACEHOLDER, (_m, key: string) => vars[key] ?? "");
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Convert a plain-text email body (as an operator types it) into safe HTML:
 * - blank lines split paragraphs (wrapped in <p>)
 * - line breaks within a paragraph become <br>
 * - everything is HTML-escaped first
 * - bare URLs are linkified so the operator doesn't have to write anchors
 *
 * Intentionally minimal — no markdown — to keep the surface predictable.
 */
export function textToHtml(text: string): string {
  const escaped = escapeHtml(text);
  const paragraphs = escaped.split(/\n\s*\n/);
  return paragraphs
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => {
      const linkified = p.replace(
        /(https?:\/\/[^\s<]+)/g,
        (url) => `<a href="${url}">${url}</a>`,
      );
      const withBreaks = linkified.replace(/\n/g, "<br>");
      return `<p>${withBreaks}</p>`;
    })
    .join("\n");
}

export type EmailContent = {
  subject: string;
  bodyHtml: string;
  bodyText: string;
};

export type TemplateOverride = {
  subject: string;
  bodyText: string;
  /** Persisted but not editable in the operator UI; auto-derived from
   *  bodyText on save. We render whichever the override carries. */
  bodyHtml: string;
};

/**
 * Render an email for the given type. If the operator has saved a custom
 * template (override), it wins; otherwise the hardcoded default applies.
 *
 * The same vars bag drives both paths so the operator's draft can use
 * any documented variable for its type and get the same data the
 * defaults would produce.
 */
export function renderEmailTemplate(
  type: CustomizableTemplateType,
  vars: Record<string, string>,
  override?: TemplateOverride | null,
): EmailContent {
  const tpl = override ?? TEMPLATE_DEFAULTS[type];
  return {
    subject: fill(tpl.subject, vars),
    bodyText: fill(tpl.bodyText, vars),
    bodyHtml: fill(tpl.bodyHtml, vars),
  };
}
