import { HubError, writeGroups } from './repository.js';
import { addBackLink } from './back-link.js';

const ROOTS = ['assignments', 'comp-apps', 'makerspace', 'ap-cs-principles', 'games', 'resources'];
export function safeLink(value) {
  if (!value) return '';
  if (typeof value !== 'string' || value.length > 2000 || /[\x00-\x20\\<>"']/.test(value)) throw new HubError('The link contains invalid characters. Use %20 for spaces.');
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (url.username || url.password) throw new HubError('Use a link without embedded credentials.');
    return value;
  }
  if (/^[\w.-]+(?:\/[\w.%~-]+)*(?:[?#][^\s]*)?$/.test(value) && !value.split(/[/?#]/).some(p => p === '..' || p === '.')) return value;
  throw new HubError('Use an https:// link or a hub path.');
}
function text(value, name, max, required = false) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw new HubError(`Check the ${name} field.`);
  return value.trim();
}
function uploadPath(link) {
  return typeof link === 'string' && ROOTS.includes(link.split('/')[0]) && /^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+\.html?$/.test(link) && !link.split('/').some(p => p === '..' || p === '.');
}
export function preparePublication(state, input) {
  if (!input || !/^[a-f0-9]{40}$/.test(input.revision || '') || !/^[a-f0-9-]{36}$/.test(input.requestId || '')) throw new HubError('Invalid publication request.');
  if (input.revision !== state.revision) throw new HubError('The list changed on GitHub. Refresh it before publishing; your form entries will be kept.', 409);
  if (!['save', 'remove'].includes(input.action)) throw new HubError('Invalid action.');
  const groups = structuredClone(state.groups);
  let previous, originalGroup, originalIndex;
  if (input.id) {
    for (const [name, group] of Object.entries(groups)) {
      const index = group.activities.findIndex(a => a.id === input.id);
      if (index >= 0) { previous = group.activities[index]; originalGroup = name; originalIndex = index; break; }
    }
    if (!previous) throw new HubError('This assignment no longer exists. Refresh the list.', 409);
  }
  const files = [];
  let entry, groupName = originalGroup;
  if (input.action === 'remove') {
    if (!previous) throw new HubError('Select the assignment to remove.');
    groups[originalGroup].activities.splice(originalIndex, 1);
    entry = previous; // Keep the HTML available at its old URL.
  } else {
    if (!Object.hasOwn(groups, input.group)) throw new HubError('Select a valid subject.');
    groupName = input.group;
    if (!input.entry || !['now', 'soon', 'done'].includes(input.entry.status)) throw new HubError('Select a valid status.');
    entry = { ...previous, id: previous?.id || crypto.randomUUID(),
      title: text(input.entry.title, 'title', 180, true),
      description: text(input.entry.description, 'description', 2500),
      date: text(input.entry.date, 'date', 120) || 'TBA',
      status: input.entry.status,
      link: safeLink(input.entry.link),
      pinned: Boolean(input.entry.pinned)
    };
    if (input.entry.plc !== undefined) {
      if (!input.entry.plc || typeof input.entry.plc !== 'object' || Array.isArray(input.entry.plc)) throw new HubError('Invalid PLC project information.');
      entry.plc = Object.fromEntries(['unit', 'learningTarget', 'successCriteria', 'requirements'].map(key => [key, text(input.entry.plc[key] ?? '', 'PLC ' + key, 12000)]));
    }
    if (input.html !== undefined && input.html !== null) {
      if (typeof input.html !== 'string' || !input.html.trim() || new TextEncoder().encode(input.html).length > 5 * 1024 * 1024 || !/<(?:!doctype\s+html|html|body)\b/i.test(input.html)) throw new HubError('Choose a valid HTML document up to 5 MB.');
      if (previous && uploadPath(previous.link)) {
        const existing = state.files.find(f => f.path === previous.link);
        if (!existing || existing.type !== 'blob' || existing.mode !== '100644') throw new HubError('The original file changed or is unavailable. Check its link.', 409);
        entry.link = previous.link;
      } else {
        entry.link = `assignments/${entry.id}/index.html`;
        if (state.files.some(f => f.path === entry.link)) throw new HubError('The destination already exists. Refresh and try again.', 409);
      }
      files.push({ path: entry.link, content: addBackLink(input.html, entry.link, groupName) });
    }
    if (!Array.isArray(input.assets || [])) throw new HubError('Invalid attachments.');
    const assets = input.assets || [];
    if (assets.length > 30) throw new HubError('Attach no more than 30 supporting files.');
    if (assets.length && (!input.html || !entry.link.startsWith('assignments/'))) throw new HubError('Supporting files can be uploaded with HTML for an assignment created in this dashboard.');
    let total = new TextEncoder().encode(input.html || '').length;
    const seen = new Set(['index.html']);
    for (const asset of assets) {
      if (typeof asset.path !== 'string' || !/^[a-zA-Z0-9_-][a-zA-Z0-9_. -]*(?:\/[a-zA-Z0-9_-][a-zA-Z0-9_. -]*)*\.(?:png|jpe?g|gif|webp|svg|ico|css|js|json|pdf|mp3|mp4|woff2?|txt)$/i.test(asset.path) || asset.path.split('/').some(p => p === '..' || p === '.' || p.endsWith('.')) || seen.has(asset.path.toLowerCase())) throw new HubError('A supporting file has an unsupported name or format.');
      if (typeof asset.content !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(asset.content)) throw new HubError('An attachment is corrupted.');
      total += asset.content.length * 3 / 4;
      if (total > 20 * 1024 * 1024) throw new HubError('The HTML and its supporting files must not exceed 20 MB.');
      seen.add(asset.path.toLowerCase());
      files.push({ path: entry.link.slice(0, entry.link.lastIndexOf('/') + 1) + asset.path, content: asset.content, encoding: 'base64' });
    }
    if (previous) groups[originalGroup].activities.splice(originalIndex, 1);
    const position = previous && originalGroup === groupName ? originalIndex : 0;
    groups[groupName].activities.splice(position, 0, entry);
  }
  files.push({ path: 'index.html', content: writeGroups(state.source, groups) });
  files.push({ path: 'publication.json', content: JSON.stringify({ requestId: input.requestId, publishedAt: new Date().toISOString(), link: entry.link, title: entry.title, action: input.action }) + '\n' });
  return { files, entry, groups, message: `${input.action === 'remove' ? 'Retire' : previous ? 'Update' : 'Add'} assignment: ${entry.title}` };
}

export async function readInput(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new HubError('Invalid request format.', 415);
  const max = 29 * 1024 * 1024;
  if (Number(request.headers.get('Content-Length') || 0) > max) throw new HubError('The upload is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new HubError('The form is missing.');
  const chunks = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel(); throw new HubError('The upload is too large.', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new HubError('The form could not be read.'); }
}
