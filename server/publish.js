import { HubError, writeGroups } from './repository.js';

const ROOTS = ['assignments', 'comp-apps', 'makerspace', 'ap-cs-principles', 'games', 'resources'];
export function safeLink(value) {
  if (!value) return '';
  if (typeof value !== 'string' || value.length > 2000 || /[\x00-\x20\\<>"']/.test(value)) throw new HubError('El enlace contiene caracteres no válidos. Usa %20 para espacios.');
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (url.username || url.password) throw new HubError('Usa un enlace sin credenciales.');
    return value;
  }
  if (/^[\w.-]+(?:\/[\w.%~-]+)*(?:[?#][^\s]*)?$/.test(value) && !value.split(/[/?#]/).some(p => p === '..' || p === '.')) return value;
  throw new HubError('Usa un enlace https:// o una ruta del hub.');
}
function text(value, name, max, required = false) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw new HubError(`Revisa el campo ${name}.`);
  return value.trim();
}
function uploadPath(link) {
  return typeof link === 'string' && ROOTS.includes(link.split('/')[0]) && /^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+\.html?$/.test(link) && !link.split('/').some(p => p === '..' || p === '.');
}
export function preparePublication(state, input) {
  if (!input || !/^[a-f0-9]{40}$/.test(input.revision || '') || !/^[a-f0-9-]{36}$/.test(input.requestId || '')) throw new HubError('Solicitud de publicación inválida.');
  if (input.revision !== state.revision) throw new HubError('La lista cambió en GitHub. Recárgala antes de publicar; tu formulario se conserva.', 409);
  if (!['save', 'remove'].includes(input.action)) throw new HubError('Acción no válida.');
  const groups = structuredClone(state.groups);
  let previous, originalGroup, originalIndex;
  if (input.id) {
    for (const [name, group] of Object.entries(groups)) {
      const index = group.activities.findIndex(a => a.id === input.id);
      if (index >= 0) { previous = group.activities[index]; originalGroup = name; originalIndex = index; break; }
    }
    if (!previous) throw new HubError('La actividad ya no existe. Recarga la lista.', 409);
  }
  const files = [];
  let entry, groupName = originalGroup;
  if (input.action === 'remove') {
    if (!previous) throw new HubError('Selecciona la actividad que quieres retirar.');
    groups[originalGroup].activities.splice(originalIndex, 1);
    entry = previous; // Keep the HTML available at its old URL.
  } else {
    if (!Object.hasOwn(groups, input.group)) throw new HubError('Selecciona una materia válida.');
    groupName = input.group;
    if (!input.entry || !['now', 'soon', 'done'].includes(input.entry.status)) throw new HubError('Selecciona un estado válido.');
    entry = { ...previous, id: previous?.id || crypto.randomUUID(),
      title: text(input.entry.title, 'título', 180, true),
      description: text(input.entry.description, 'descripción', 2500),
      date: text(input.entry.date, 'fecha', 120) || 'TBA',
      status: input.entry.status,
      link: safeLink(input.entry.link),
      pinned: Boolean(input.entry.pinned)
    };
    if (input.html !== undefined && input.html !== null) {
      if (typeof input.html !== 'string' || !input.html.trim() || new TextEncoder().encode(input.html).length > 5 * 1024 * 1024 || !/<(?:!doctype\s+html|html|body)\b/i.test(input.html)) throw new HubError('Selecciona un documento HTML válido de hasta 5 MB.');
      if (previous && uploadPath(previous.link)) {
        const existing = state.files.find(f => f.path === previous.link);
        if (!existing || existing.type !== 'blob' || existing.mode !== '100644') throw new HubError('El archivo original cambió o no está disponible. Revisa su enlace.', 409);
        entry.link = previous.link;
      } else {
        entry.link = `assignments/${entry.id}/index.html`;
        if (state.files.some(f => f.path === entry.link)) throw new HubError('El destino ya existe. Recarga e intenta de nuevo.', 409);
      }
      files.push({ path: entry.link, content: input.html });
    }
    if (!Array.isArray(input.assets || [])) throw new HubError('Archivos adjuntos no válidos.');
    const assets = input.assets || [];
    if (assets.length > 30) throw new HubError('Adjunta como máximo 30 archivos de apoyo.');
    if (assets.length && (!input.html || !entry.link.startsWith('assignments/'))) throw new HubError('Los archivos de apoyo se pueden subir junto con un HTML de una actividad creada en este panel.');
    let total = new TextEncoder().encode(input.html || '').length;
    const seen = new Set(['index.html']);
    for (const asset of assets) {
      if (typeof asset.path !== 'string' || !/^[a-zA-Z0-9_-][a-zA-Z0-9_. -]*(?:\/[a-zA-Z0-9_-][a-zA-Z0-9_. -]*)*\.(?:png|jpe?g|gif|webp|svg|ico|css|js|json|pdf|mp3|mp4|woff2?|txt)$/i.test(asset.path) || asset.path.split('/').some(p => p === '..' || p === '.' || p.endsWith('.')) || seen.has(asset.path.toLowerCase())) throw new HubError('Hay un archivo de apoyo con nombre o formato no permitido.');
      if (typeof asset.content !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(asset.content)) throw new HubError('Un archivo adjunto está dañado.');
      total += asset.content.length * 3 / 4;
      if (total > 20 * 1024 * 1024) throw new HubError('El HTML y sus archivos no deben superar 20 MB.');
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
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new HubError('Formato de solicitud no válido.', 415);
  const max = 29 * 1024 * 1024;
  if (Number(request.headers.get('Content-Length') || 0) > max) throw new HubError('La carga es demasiado grande.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new HubError('Falta el formulario.');
  const chunks = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel(); throw new HubError('La carga es demasiado grande.', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new HubError('El formulario no se pudo leer.'); }
}
