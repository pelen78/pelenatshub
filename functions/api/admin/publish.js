import { json } from '../../../server/auth.js';
import { github } from '../../../server/repository.js';
import { preparePublication, readInput } from '../../../server/publish.js';

export async function onRequestPost({ request, env }) {
  try {
    const input = await readInput(request);
    const repo = github(env);
    const state = await repo.snapshot();
    // Recover safely after a lost response without creating a duplicate entry.
    const marker = state.files.find(f => f.path === 'publication.json' && f.type === 'blob');
    if (marker) {
      const blob = await repo.call(`/git/blobs/${marker.sha}`);
      const value = JSON.parse(atob(blob.content.replace(/\s/g, '')));
      if (value.requestId === input.requestId) return json({ sha: state.revision, requestId: input.requestId, link: value.link, title: value.title, recovered: true });
    }
    const publication = preparePublication(state, input);
    const result = await repo.commitFiles(state, publication.files, publication.message);
    return json({ ...result, requestId: input.requestId, link: publication.entry.link, title: publication.entry.title }, 201);
  } catch (error) { return json({ error: error.status ? error.message : 'La conexión se interrumpió. Reintenta para comprobar si GitHub recibió la publicación.' }, error.status || 502); }
}
