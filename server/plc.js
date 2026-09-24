import { normalizeEntry } from '../admin/plc/model.js';
import { HubError } from './repository.js';

export const MAX_PLC_BYTES = 250000;
export async function readPLCInput(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new HubError('Use JSON for PLC requests.', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new HubError('Missing PLC entry.');
  const chunks = []; let size = 0;
  for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > MAX_PLC_BYTES) { await reader.cancel(); throw new HubError('This PLC is too large. Use links for evidence.', 413); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new HubError('Invalid JSON.'); }
}
export function plcStore(db) {
  if (!db) throw new HubError('Private cloud storage is not configured yet. Your browser drafts remain available. Connect the PLC_DB database to enable cloud saving.', 503);
  return {
    async list(owner) {
      const { results } = await db.prepare('SELECT data, revision FROM plc_entries WHERE owner = ?1 ORDER BY updated_at DESC').bind(owner).all();
      return results.map(row => ({ entry: JSON.parse(row.data), revision: row.revision }));
    },
    async save(owner, input) {
      if (!Number.isSafeInteger(input?.revision) || input.revision < 0) throw new HubError('Invalid entry revision.');
      let entry;
      try { entry = normalizeEntry(input.entry); } catch (error) { throw new HubError(error.message); }
      const serialized = JSON.stringify(entry);
      if (new TextEncoder().encode(serialized).length > MAX_PLC_BYTES) throw new HubError('This PLC is too large.', 413);
      const now = Date.now(); entry.updatedAt = now;
      const data = JSON.stringify(entry);
      const result = input.revision === 0
        ? await db.prepare('INSERT INTO plc_entries (owner, id, revision, data, updated_at) VALUES (?1, ?2, 1, ?3, ?4) ON CONFLICT(owner, id) DO NOTHING').bind(owner, entry.id, data, now).run()
        : await db.prepare('UPDATE plc_entries SET data = ?1, revision = revision + 1, updated_at = ?2 WHERE owner = ?3 AND id = ?4 AND revision = ?5').bind(data, now, owner, entry.id, input.revision).run();
      if (result.meta.changes !== 1) throw new HubError('This PLC changed in another tab or device. Your draft was kept. Review the cloud version before continuing.', 409);
      return { entry, revision: input.revision + 1 };
    }
  };
}
