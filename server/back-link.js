// Student assignments in these subjects must not link back to the full hub.
const studentGroups = new Set(['Comp Apps', 'MakerSpace', 'AP CS Principles']);
const slug = s => s.toLowerCase().replace(/·/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export function removeBackLink(html) {
  return html
    .replace(/<a\b[^>]*\sdata-hub-back(?=[\s=>])[^>]*>[\s\S]*?<\/a>/gi, '')
    .replace(/<style>\s*@media print\s*\{\s*\[data-hub-back\]\s*\{\s*display:\s*none\s*!important\s*\}\s*\}\s*<\/style>/gi, '');
}

export function hubHref(link, group) {
  const up = '../'.repeat(link.split('/').length - 1);
  // Opens the full hub with this subject's tab selected.
  return `${up}index.html#${slug(group)}`;
}

export function addBackLink(html, link, group) {
  if (studentGroups.has(group)) return removeBackLink(html);
  if (html.includes('data-hub-back')) return html;
  const button = `<a data-hub-back href="${hubHref(link, group)}" style="position:fixed;top:12px;left:12px;z-index:2147483000;display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:999px;background:#12275C;color:#fff;font:600 14px/1.2 system-ui,-apple-system,'Segoe UI',sans-serif;text-decoration:none;box-shadow:0 2px 10px rgba(11,23,64,.3);border:1.5px solid #F3B700">← Pelen Hub</a><style>@media print{[data-hub-back]{display:none!important}}</style>`;
  const body = html.match(/<body\b[^>]*>/i);
  return body ? html.replace(body[0], `${body[0]}\n${button}`) : html.replace(/<\/html>/i, `${button}</html>`);
}
