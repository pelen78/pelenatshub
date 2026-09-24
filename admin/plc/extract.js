// Conservative text extraction for the existing assignment templates. No AI,
// script execution, remote fetching or inferred student outcomes.
export function plainText(html) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', rarr: '→', uarr: '↑', larr: '←', hellip: '…' };
  return html.replace(/<(script|style|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/(?:p|li|h[1-6]|tr|div)>|<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (all, key) => { if (!key.startsWith('#')) return entities[key] ?? all; const n = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1)); return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''; })
    .split('\n').map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}
export function extractProjectFields(html) {
  const values = { learningTarget: [], successCriteria: [], requirements: [] };
  for (const section of html.replace(/<(script|style|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/gi)) {
    const content = section[1];
    const heading = content.match(/<(?:span|div)\b[^>]*class=["'][^"']*\b(?:silk|stamp|section-title|section-label)\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div)>/i) || content.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i);
    if (!heading) continue;
    const label = plainText(heading[1]).toLowerCase();
    const body = plainText(content.replace(heading[0], ''));
    if (!body) continue;
    if (/^(what you will learn|learning targets?|learning objectives?|project goal|your mission|main objective|objectives?)$/.test(label)) values.learningTarget.push(body);
    else if (/how you.re graded|what i will check|before you submit|success criteria|rubric|checklist/.test(label)) values.successCriteria.push(body);
    else if (/requirements|turn in|turning it in|submission|site structure|final presentation/.test(label)) values.requirements.push(body);
  }
  return Object.fromEntries(Object.entries(values).map(([key, blocks]) => [key, blocks.join('\n\n').slice(0, 12000)]));
}
